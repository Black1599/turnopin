-- 1. Break configuration per worker (opt-in, and whether breaks count as worked time)
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS break_tracking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_paid boolean NOT NULL DEFAULT false;

-- 2. Allow break marks in time entries
ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_type_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_type_check
  CHECK (type IN ('entry', 'exit', 'break_start', 'break_end'));

-- 3. Incidents (Pendiente / Resuelta)
CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  time_entry_id uuid REFERENCES public.time_entries(id),
  kind text NOT NULL DEFAULT 'missing_exit',
  status text NOT NULL DEFAULT 'pending',
  work_date date,
  worker_reported_time text,
  worker_no_recall boolean NOT NULL DEFAULT false,
  resolution_notes text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_status_check CHECK (status IN ('pending', 'resolved'))
);

GRANT SELECT, INSERT, UPDATE ON public.incidents TO authenticated;
GRANT ALL ON public.incidents TO service_role;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read incidents" ON public.incidents
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members update incidents" ON public.incidents
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id))
  WITH CHECK (public.is_company_member(company_id));

CREATE INDEX IF NOT EXISTS incidents_company_status_idx
  ON public.incidents (company_id, status, created_at DESC);

-- 4. Status helper aware of breaks
CREATE OR REPLACE FUNCTION public.worker_state(_worker_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE COALESCE((
    SELECT t.type FROM public.time_entries t
    WHERE t.worker_id = _worker_id
    ORDER BY t.server_timestamp DESC, t.created_at DESC LIMIT 1
  ), 'exit')
    WHEN 'entry' THEN 'working'
    WHEN 'break_end' THEN 'working'
    WHEN 'break_start' THEN 'break'
    ELSE 'out'
  END;
$$;

-- 5. Kiosk punch with breaks + incident capture
CREATE OR REPLACE FUNCTION public.kiosk_punch(
  p_company_id uuid,
  p_worker_id uuid,
  p_pin text,
  p_action text DEFAULT 'status',
  p_reported_time text DEFAULT NULL,
  p_no_recall boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker public.workers;
  v_fails int;
  v_state text;
  v_local timestamp;
  v_entry public.time_entries;
  v_open public.time_entries;
  v_entries jsonb;
  v_incidents jsonb;
  v_since text;
BEGIN
  SELECT * INTO v_worker FROM public.workers
  WHERE id = p_worker_id AND company_id = p_company_id AND status = 'active';

  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found');
  END IF;

  SELECT count(*) INTO v_fails FROM public.pin_attempts
  WHERE worker_id = p_worker_id AND success = false AND created_at > now() - interval '5 minutes';

  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  IF v_worker.pin_hash IS NULL OR extensions.crypt(p_pin, v_worker.pin_hash) <> v_worker.pin_hash THEN
    INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_company_id, p_worker_id, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pin');
  END IF;

  INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_company_id, p_worker_id, true);

  v_state := public.worker_state(p_worker_id);
  v_local := public.madrid_now();

  IF p_action IN ('break_start', 'break_end') AND NOT v_worker.break_tracking THEN
    RETURN jsonb_build_object('ok', false, 'error', 'breaks_disabled');
  END IF;

  IF p_action = 'entry' AND v_state IN ('working', 'break') THEN
    -- Previous shift was never closed: register an incident, keep the original
    -- record untouched and let the worker start a new shift.
    SELECT * INTO v_open FROM public.time_entries
    WHERE worker_id = p_worker_id AND type = 'entry'
    ORDER BY server_timestamp DESC LIMIT 1;

    INSERT INTO public.incidents (company_id, worker_id, time_entry_id, kind, work_date,
      worker_reported_time, worker_no_recall)
    VALUES (p_company_id, p_worker_id, v_open.id, 'missing_exit', v_open.work_date,
      CASE WHEN p_no_recall THEN NULL ELSE nullif(btrim(coalesce(p_reported_time, '')), '') END,
      COALESCE(p_no_recall, false));

    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_company_id, NULL, 'incident_missing_exit', 'time_entry', v_open.id,
      jsonb_build_object('worker_id', p_worker_id, 'reported_time', p_reported_time,
                         'no_recall', COALESCE(p_no_recall, false)));

    v_state := 'out';
  END IF;

  IF p_action = 'exit' AND v_state = 'break' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'on_break');
  END IF;

  IF p_action IN ('entry', 'exit', 'break_start', 'break_end') THEN
    IF p_action = 'entry' AND v_state <> 'out' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_working');
    END IF;
    IF p_action = 'exit' AND v_state <> 'working' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_working');
    END IF;
    IF p_action = 'break_start' AND v_state <> 'working' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_working');
    END IF;
    IF p_action = 'break_end' AND v_state <> 'break' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_on_break');
    END IF;

    INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type)
    VALUES (p_company_id, p_worker_id, v_local::date, to_char(v_local, 'HH24:MI'), p_action)
    RETURNING * INTO v_entry;

    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_company_id, NULL, 'kiosk_' || p_action, 'time_entry', v_entry.id,
            jsonb_build_object('worker_id', p_worker_id, 'local_time', v_entry.local_time));

    v_state := public.worker_state(p_worker_id);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'type', t.type, 'local_time', t.local_time,
           'corrected', t.corrected) ORDER BY t.server_timestamp), '[]'::jsonb)
  INTO v_entries
  FROM public.time_entries t
  WHERE t.worker_id = p_worker_id AND t.work_date = v_local::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'status', i.status, 'kind', i.kind,
           'work_date', i.work_date, 'reported_time', i.worker_reported_time,
           'no_recall', i.worker_no_recall, 'created_at', i.created_at)
           ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_incidents
  FROM public.incidents i
  WHERE i.worker_id = p_worker_id AND i.created_at > now() - interval '60 days';

  IF v_state IN ('working', 'break') THEN
    SELECT t.local_time INTO v_since FROM public.time_entries t
    WHERE t.worker_id = p_worker_id ORDER BY t.server_timestamp DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'worker', jsonb_build_object('id', v_worker.id, 'first_name', v_worker.first_name,
      'last_name', v_worker.last_name, 'break_tracking', v_worker.break_tracking),
    'status', v_state,
    'since', v_since,
    'server_time', to_char(v_local, 'HH24:MI'),
    'entries', v_entries,
    'incidents', v_incidents
  );
END;
$$;

-- 6. Worker self-service monthly records (read only, PIN protected)
CREATE OR REPLACE FUNCTION public.worker_month_records(
  p_company_id uuid,
  p_worker_id uuid,
  p_pin text,
  p_month text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_worker public.workers;
  v_company public.companies;
  v_fails int;
  v_start date;
  v_end date;
  v_entries jsonb;
BEGIN
  IF p_month !~ '^\d{4}-\d{2}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_month');
  END IF;

  SELECT * INTO v_worker FROM public.workers
  WHERE id = p_worker_id AND company_id = p_company_id AND status = 'active';
  IF v_worker.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found');
  END IF;

  SELECT count(*) INTO v_fails FROM public.pin_attempts
  WHERE worker_id = p_worker_id AND success = false AND created_at > now() - interval '5 minutes';
  IF v_fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  IF v_worker.pin_hash IS NULL OR extensions.crypt(p_pin, v_worker.pin_hash) <> v_worker.pin_hash THEN
    INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_company_id, p_worker_id, false);
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_pin');
  END IF;
  INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_company_id, p_worker_id, true);

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;

  v_start := (p_month || '-01')::date;
  v_end := (v_start + interval '1 month - 1 day')::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.id, 'work_date', t.work_date, 'local_time', t.local_time, 'type', t.type,
           'server_timestamp', t.server_timestamp, 'corrected', t.corrected,
           'original_local_time', t.original_local_time,
           'reason', (SELECT c.reason FROM public.corrections c
                      WHERE c.time_entry_id = t.id ORDER BY c.created_at DESC LIMIT 1)
         ) ORDER BY t.work_date, t.server_timestamp), '[]'::jsonb)
  INTO v_entries
  FROM public.time_entries t
  WHERE t.worker_id = p_worker_id AND t.work_date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object(
    'ok', true,
    'company', jsonb_build_object('legal_name', v_company.legal_name, 'tax_id', v_company.tax_id),
    'worker', jsonb_build_object('first_name', v_worker.first_name, 'last_name', v_worker.last_name,
      'second_last_name', v_worker.second_last_name, 'dni_nie', v_worker.dni_nie,
      'break_tracking', v_worker.break_tracking, 'break_paid', v_worker.break_paid),
    'month', p_month,
    'entries', v_entries
  );
END;
$$;

-- 7. Admin resolves an incident
CREATE OR REPLACE FUNCTION public.admin_resolve_incident(p_incident_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_incident public.incidents;
BEGIN
  SELECT * INTO v_incident FROM public.incidents WHERE id = p_incident_id;
  IF v_incident.id IS NULL OR NOT public.is_company_member(v_incident.company_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.incidents
    SET status = 'resolved', resolution_notes = p_notes, resolved_by = auth.uid(), resolved_at = now()
    WHERE id = p_incident_id;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_incident.company_id, auth.uid(), 'resolve_incident', 'incident', p_incident_id,
    jsonb_build_object('notes', p_notes));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.kiosk_punch(uuid, uuid, text, text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_month_records(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_state(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_incident(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.worker_status(uuid) IS 'DEPRECATED: replaced by public.worker_state, which also reports break state.';