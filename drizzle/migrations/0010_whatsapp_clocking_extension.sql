-- Worker WhatsApp config (optional channel)
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_link_status text NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS whatsapp_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_linked text,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code_hash text,
  ADD COLUMN IF NOT EXISTS whatsapp_link_code_expires_at timestamptz;
ALTER TABLE public.workers ADD CONSTRAINT workers_whatsapp_link_status_chk
  CHECK (whatsapp_link_status IN ('unlinked','pending','linked'));
CREATE UNIQUE INDEX IF NOT EXISTS workers_whatsapp_phone_linked_uq
  ON public.workers (whatsapp_phone_linked) WHERE whatsapp_phone_linked IS NOT NULL;
COMMENT ON COLUMN public.workers.whatsapp_link_code_hash IS 'Hidden from clients; one-time WhatsApp link code hash.';

GRANT SELECT (phone, whatsapp_enabled, whatsapp_link_status, whatsapp_linked_at) ON public.workers TO authenticated;
GRANT INSERT (phone, whatsapp_enabled) ON public.workers TO authenticated;
GRANT UPDATE (phone, whatsapp_enabled) ON public.workers TO authenticated;

-- Changing phone, disabling WhatsApp or archiving revokes the link immediately
CREATE OR REPLACE FUNCTION public.whatsapp_reset_link_on_change()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.whatsapp_enabled = false OR NEW.status <> 'active'
     OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.whatsapp_link_status := 'unlinked';
    NEW.whatsapp_linked_at := NULL;
    NEW.whatsapp_phone_linked := NULL;
    NEW.whatsapp_link_code_hash := NULL;
    NEW.whatsapp_link_code_expires_at := NULL;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS workers_whatsapp_reset ON public.workers;
CREATE TRIGGER workers_whatsapp_reset BEFORE UPDATE OF phone, whatsapp_enabled, status ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.whatsapp_reset_link_on_change();
REVOKE EXECUTE ON FUNCTION public.whatsapp_reset_link_on_change() FROM PUBLIC, anon, authenticated;

-- Source of each immutable event (kiosk / whatsapp / manual); null for historical rows
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS source text;

-- Shared punch core used by kiosk AND WhatsApp (single time-record system)
CREATE OR REPLACE FUNCTION public.punch_core(p_worker public.workers, p_location_id uuid, p_action text,
  p_reported_time text, p_no_recall boolean, p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_state text; v_open record; v_local timestamp := public.madrid_now(); v_entry public.time_entries;
  v_prefix text := CASE WHEN p_source = 'whatsapp' THEN 'whatsapp_' ELSE 'kiosk_' END;
BEGIN
  IF p_action NOT IN ('entry','exit','break_start','break_end') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;
  SELECT * INTO v_open FROM public.worker_open_event(p_worker.id);
  v_state := public.worker_state(p_worker.id);

  IF p_action IN ('break_start','break_end') AND NOT p_worker.break_tracking THEN
    RETURN jsonb_build_object('ok', false, 'error', 'breaks_disabled');
  END IF;
  IF p_action IN ('exit','break_start','break_end') AND v_state <> 'out'
     AND v_open.location_id IS DISTINCT FROM p_location_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_location');
  END IF;

  IF p_action = 'entry' AND v_state IN ('working','break') THEN
    IF NOT COALESCE(p_no_recall, false) AND nullif(btrim(coalesce(p_reported_time, '')), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_working');
    END IF;
    INSERT INTO public.incidents (company_id, worker_id, time_entry_id, location_id, kind, work_date,
      worker_reported_time, worker_no_recall)
    SELECT p_worker.company_id, p_worker.id, e.id, e.effective_location_id, 'missing_exit', e.effective_work_date,
      CASE WHEN p_no_recall THEN NULL ELSE nullif(btrim(coalesce(p_reported_time, '')), '') END,
      COALESCE(p_no_recall, false)
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker.id AND e.type = 'entry'
    ORDER BY e.effective_timestamp DESC LIMIT 1
    ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_worker.company_id, NULL, 'incident_missing_exit', 'worker', p_worker.id,
      jsonb_build_object('reported_time', p_reported_time, 'no_recall', COALESCE(p_no_recall, false), 'source', p_source));
    v_state := 'out';
  END IF;

  IF p_action = 'entry' AND v_state <> 'out' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_working'); END IF;
  IF p_action = 'exit' AND v_state = 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'on_break'); END IF;
  IF p_action = 'exit' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
  IF p_action = 'break_start' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
  IF p_action = 'break_end' AND v_state <> 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_on_break'); END IF;

  INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type, location_id, source)
  VALUES (p_worker.company_id, p_worker.id, v_local::date, to_char(v_local, 'HH24:MI'), p_action, p_location_id, p_source)
  RETURNING * INTO v_entry;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_worker.company_id, NULL, v_prefix || p_action, 'time_entry', v_entry.id,
    jsonb_build_object('worker_id', p_worker.id, 'location_id', p_location_id, 'local_time', v_entry.local_time, 'source', p_source));
  RETURN jsonb_build_object('ok', true, 'entry_id', v_entry.id, 'local_time', v_entry.local_time);
END; $$;
REVOKE EXECUTE ON FUNCTION public.punch_core(public.workers, uuid, text, text, boolean, text) FROM PUBLIC, anon, authenticated;

-- Kiosk now delegates punches to the shared core (identical behaviour)
CREATE OR REPLACE FUNCTION public.kiosk_action(p_token text, p_worker_id uuid, p_pin text, p_action text DEFAULT 'status'::text, p_reported_time text DEFAULT NULL::text, p_no_recall boolean DEFAULT false, p_new_pin text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_kiosk public.kiosks; v_worker public.workers; v_err text; v_state text; v_res jsonb;
  v_local timestamp := public.madrid_now(); v_open record;
  v_entries jsonb; v_incidents jsonb; v_open_json jsonb; v_loc_name text;
BEGIN
  SELECT * INTO v_kiosk FROM public.kiosks WHERE token = p_token AND active;
  IF v_kiosk.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'kiosk_not_found'); END IF;

  SELECT w.* INTO v_worker FROM public.workers w
  JOIN public.worker_locations wl ON wl.worker_id = w.id AND wl.location_id = v_kiosk.location_id
  WHERE w.id = p_worker_id AND w.company_id = v_kiosk.company_id AND w.status = 'active';
  IF v_worker.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'worker_not_found'); END IF;

  v_err := public.kiosk_check_pin(v_worker, p_pin);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;

  IF p_action = 'change_pin' THEN
    IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
    END IF;
    UPDATE public.workers SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')) WHERE id = p_worker_id;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'worker_change_pin', 'worker', p_worker_id, jsonb_build_object('location_id', v_kiosk.location_id));
    RETURN jsonb_build_object('ok', true, 'pin_changed', true);
  END IF;

  IF p_action IN ('entry', 'exit', 'break_start', 'break_end') THEN
    v_res := public.punch_core(v_worker, v_kiosk.location_id, p_action, p_reported_time, p_no_recall, 'kiosk');
    IF NOT (v_res->>'ok')::boolean THEN RETURN v_res; END IF;
  END IF;

  SELECT * INTO v_open FROM public.worker_open_event(p_worker_id);
  v_state := public.worker_state(p_worker_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'local_time', e.effective_local_time,
    'corrected', e.is_corrected, 'manual', e.is_manual) ORDER BY e.effective_timestamp), '[]'::jsonb)
  INTO v_entries FROM public.time_entries_effective e
  WHERE e.worker_id = p_worker_id AND e.effective_work_date = v_local::date;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'work_date', i.work_date, 'reported_time', i.worker_reported_time,
    'no_recall', i.worker_no_recall) ORDER BY i.created_at DESC), '[]'::jsonb)
  INTO v_incidents FROM public.incidents i WHERE i.worker_id = p_worker_id AND i.status = 'pending';

  IF v_state <> 'out' THEN
    SELECT name INTO v_loc_name FROM public.locations WHERE id = v_open.location_id;
    SELECT jsonb_build_object('local_time', e.effective_local_time, 'work_date', e.effective_work_date,
      'location_id', e.effective_location_id, 'location_name', v_loc_name,
      'same_location', e.effective_location_id = v_kiosk.location_id)
    INTO v_open_json
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker_id AND e.type = 'entry' ORDER BY e.effective_timestamp DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'worker', jsonb_build_object('id', v_worker.id, 'first_name', v_worker.first_name, 'last_name', v_worker.last_name,
      'break_tracking', v_worker.break_tracking),
    'status', v_state, 'open_shift', v_open_json, 'today', v_local::date,
    'server_time', to_char(v_local, 'HH24:MI'), 'entries', v_entries, 'incidents', v_incidents);
END; $function$;

-- Admin: generate a one-time 6-digit link code (shown once, stored hashed, 24h)
CREATE OR REPLACE FUNCTION public.admin_whatsapp_link_code(p_worker_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_w public.workers; v_code text;
BEGIN
  SELECT * INTO v_w FROM public.workers WHERE id = p_worker_id;
  IF v_w.id IS NULL OR NOT public.is_company_member(v_w.company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_w.status <> 'active' THEN RAISE EXCEPTION 'worker_archived'; END IF;
  IF NOT v_w.whatsapp_enabled OR nullif(btrim(coalesce(v_w.phone,'')),'') IS NULL THEN RAISE EXCEPTION 'whatsapp_not_enabled'; END IF;
  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  UPDATE public.workers SET whatsapp_link_code_hash = extensions.crypt(v_code, extensions.gen_salt('bf')),
    whatsapp_link_code_expires_at = now() + interval '24 hours',
    whatsapp_link_status = CASE WHEN whatsapp_link_status = 'linked' THEN 'linked' ELSE 'pending' END
  WHERE id = p_worker_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_w.company_id, auth.uid(), 'whatsapp_link_code_created', 'worker', p_worker_id, '{}'::jsonb);
  RETURN v_code;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_whatsapp_link_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_link_code(uuid) TO authenticated;

-- Admin: unlink explicitly
CREATE OR REPLACE FUNCTION public.admin_whatsapp_unlink(p_worker_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_w public.workers;
BEGIN
  SELECT * INTO v_w FROM public.workers WHERE id = p_worker_id;
  IF v_w.id IS NULL OR NOT public.is_company_member(v_w.company_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.workers SET whatsapp_link_status = 'unlinked', whatsapp_linked_at = NULL, whatsapp_phone_linked = NULL,
    whatsapp_link_code_hash = NULL, whatsapp_link_code_expires_at = NULL WHERE id = p_worker_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_w.company_id, auth.uid(), 'whatsapp_unlinked', 'worker', p_worker_id, jsonb_build_object('source','admin'));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_whatsapp_unlink(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_whatsapp_unlink(uuid) TO authenticated;

-- Server-only: link a WhatsApp number using one-time code (6 digits) or PIN (4 digits)
CREATE OR REPLACE FUNCTION public.whatsapp_link(p_phone text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g'); v_w public.workers; v_n int; v_err text;
BEGIN
  IF v_phone = '' OR p_secret !~ '^\d{4}$|^\d{6}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_format'); END IF;
  IF EXISTS (SELECT 1 FROM public.workers WHERE whatsapp_phone_linked = v_phone) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_linked');
  END IF;
  SELECT count(*) INTO v_n FROM public.workers
   WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone AND whatsapp_enabled AND status = 'active';
  IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF length(p_secret) = 6 THEN
    FOR v_w IN SELECT * FROM public.workers
      WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone AND whatsapp_enabled AND status = 'active'
        AND whatsapp_link_code_hash IS NOT NULL AND whatsapp_link_code_expires_at > now()
    LOOP
      IF (SELECT count(*) FROM public.pin_attempts WHERE worker_id = v_w.id AND NOT success
          AND created_at > now() - interval '5 minutes') >= 8 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
      END IF;
      IF extensions.crypt(p_secret, v_w.whatsapp_link_code_hash) = v_w.whatsapp_link_code_hash THEN
        EXIT;
      END IF;
      INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (v_w.company_id, v_w.id, false);
      v_w := NULL;
    END LOOP;
    IF v_w.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_code'); END IF;
  ELSE
    IF v_n > 1 THEN RETURN jsonb_build_object('ok', false, 'error', 'use_code'); END IF;
    SELECT * INTO v_w FROM public.workers
     WHERE regexp_replace(coalesce(phone,''), '\D', '', 'g') = v_phone AND whatsapp_enabled AND status = 'active';
    v_err := public.kiosk_check_pin(v_w, p_secret);
    IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;
  END IF;

  UPDATE public.workers SET whatsapp_link_status = 'linked', whatsapp_linked_at = now(), whatsapp_phone_linked = v_phone,
    whatsapp_link_code_hash = NULL, whatsapp_link_code_expires_at = NULL WHERE id = v_w.id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_w.company_id, NULL, 'whatsapp_linked', 'worker', v_w.id,
    jsonb_build_object('source','whatsapp','method', CASE WHEN length(p_secret) = 6 THEN 'code' ELSE 'pin' END));
  RETURN jsonb_build_object('ok', true, 'worker_id', v_w.id, 'company_id', v_w.company_id, 'first_name', v_w.first_name);
END; $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_link(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_link(text, text) TO service_role;

-- Server-only: status / punch for a linked number. Unlinked numbers never write.
CREATE OR REPLACE FUNCTION public.whatsapp_action(p_phone text, p_action text, p_reported_time text DEFAULT NULL,
  p_no_recall boolean DEFAULT false, p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_phone text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g'); v_w public.workers; v_open record;
  v_state text; v_loc uuid; v_locs jsonb; v_n int; v_res jsonb := NULL; v_pending int; v_open_json jsonb;
BEGIN
  IF v_phone = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_linked'); END IF;
  SELECT * INTO v_w FROM public.workers WHERE whatsapp_phone_linked = v_phone
    AND whatsapp_link_status = 'linked' AND whatsapp_enabled AND status = 'active';
  IF v_w.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_linked'); END IF;

  SELECT * INTO v_open FROM public.worker_open_event(v_w.id);
  v_state := public.worker_state(v_w.id);

  IF p_action <> 'status' THEN
    IF v_state <> 'out' AND p_action <> 'entry' THEN
      v_loc := v_open.location_id;                    -- continue at the open shift's location
    ELSE
      SELECT count(*), jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name))
        INTO v_n, v_locs
      FROM public.worker_locations wl JOIN public.locations l ON l.id = wl.location_id AND l.archived_at IS NULL
      WHERE wl.worker_id = v_w.id;
      IF v_n = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_location'); END IF;
      IF v_n = 1 THEN v_loc := (v_locs->0->>'id')::uuid;
      ELSIF p_location_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.worker_locations
            WHERE worker_id = v_w.id AND location_id = p_location_id) THEN v_loc := p_location_id;
      ELSE
        -- Extension point: caller may present a location picker and retry with p_location_id
        RETURN jsonb_build_object('ok', false, 'error', 'location_required', 'locations', v_locs);
      END IF;
    END IF;
    v_res := public.punch_core(v_w, v_loc, p_action, p_reported_time, p_no_recall, 'whatsapp');
    IF NOT (v_res->>'ok')::boolean THEN
      v_res := v_res || jsonb_build_object('status', v_state, 'break_tracking', v_w.break_tracking,
        'worker_id', v_w.id, 'company_id', v_w.company_id);
      RETURN v_res;
    END IF;
    SELECT * INTO v_open FROM public.worker_open_event(v_w.id);
    v_state := public.worker_state(v_w.id);
  END IF;

  SELECT count(*) INTO v_pending FROM public.incidents WHERE worker_id = v_w.id AND status = 'pending';
  IF v_state <> 'out' THEN
    SELECT jsonb_build_object('local_time', v_open.effective_local_time, 'work_date', v_open.effective_work_date,
      'location_name', (SELECT name FROM public.locations WHERE id = v_open.location_id)) INTO v_open_json;
  END IF;
  RETURN jsonb_build_object('ok', true, 'worker_id', v_w.id, 'company_id', v_w.company_id, 'first_name', v_w.first_name,
    'status', v_state, 'break_tracking', v_w.break_tracking, 'open_shift', v_open_json,
    'pending_incidents', v_pending, 'punched', v_res IS NOT NULL, 'server_time', to_char(public.madrid_now(), 'HH24:MI'));
END; $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_action(text, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_action(text, text, text, boolean, uuid) TO service_role;

-- Webhook inbox (idempotency) — server only
CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Usage telemetry for later cost estimation (no pricing decided)
CREATE TABLE public.whatsapp_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  worker_id uuid REFERENCES public.workers(id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  kind text NOT NULL,
  wa_message_id text,
  delivery_status text,
  billable boolean,
  pricing_category text,
  pricing_model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_usage_company_idx ON public.whatsapp_usage (company_id, created_at);
CREATE INDEX whatsapp_usage_msg_idx ON public.whatsapp_usage (wa_message_id);
GRANT SELECT ON public.whatsapp_usage TO authenticated;
GRANT ALL ON public.whatsapp_usage TO service_role;
ALTER TABLE public.whatsapp_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read whatsapp usage" ON public.whatsapp_usage FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_member(company_id));