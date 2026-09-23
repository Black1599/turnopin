-- ===== Company account fields =====
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS commercial_name text,
  ADD COLUMN IF NOT EXISTS fiscal_address text,
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'ES',
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_cycle_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_cycle_end timestamptz,
  ADD COLUMN IF NOT EXISTS is_pilot boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.companies.plan IS 'DEPRECATED: single per-worker pricing model, no plans.';

-- One trial per tax id
CREATE UNIQUE INDEX IF NOT EXISTS companies_tax_id_unique
  ON public.companies (upper(regexp_replace(tax_id, '[^A-Za-z0-9]', '', 'g')))
  WHERE tax_id IS NOT NULL AND is_demo = false;

-- One admin (owner) company per user in v1
CREATE UNIQUE INDEX IF NOT EXISTS company_members_one_company_per_user ON public.company_members (user_id);

-- ===== Locations =====
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read locations" ON public.locations FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members insert locations" ON public.locations FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "members update locations" ON public.locations FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

CREATE TABLE public.worker_locations (
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, location_id)
);
GRANT SELECT, INSERT, DELETE ON public.worker_locations TO authenticated;
GRANT ALL ON public.worker_locations TO service_role;
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read worker_locations" ON public.worker_locations FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members insert worker_locations" ON public.worker_locations FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "members delete worker_locations" ON public.worker_locations FOR DELETE TO authenticated USING (public.is_company_member(company_id));

CREATE TABLE public.kiosks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  location_id uuid NOT NULL REFERENCES public.locations(id),
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(12), 'hex'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX kiosks_one_active_per_location ON public.kiosks (location_id) WHERE active;
GRANT SELECT, INSERT, UPDATE ON public.kiosks TO authenticated;
GRANT ALL ON public.kiosks TO service_role;
ALTER TABLE public.kiosks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read kiosks" ON public.kiosks FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members insert kiosks" ON public.kiosks FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "members update kiosks" ON public.kiosks FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- ===== Workers =====
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS ended_at date,
  ADD COLUMN IF NOT EXISTS access_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS workers_access_token_unique ON public.workers (access_token);

-- ===== Time entries: immutable events =====
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_reason text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS incident_id uuid;
COMMENT ON COLUMN public.time_entries.corrected IS 'DEPRECATED: derived from corrections table (see time_entries_effective).';
COMMENT ON COLUMN public.time_entries.original_server_timestamp IS 'DEPRECATED: originals are never overwritten; restored into server_timestamp.';
COMMENT ON COLUMN public.time_entries.original_local_time IS 'DEPRECATED: see original_server_timestamp.';
COMMENT ON COLUMN public.time_entries.original_work_date IS 'DEPRECATED: see original_server_timestamp.';

-- Restore originals overwritten by the previous correction function
UPDATE public.time_entries
SET server_timestamp = original_server_timestamp,
    local_time = COALESCE(original_local_time, local_time),
    work_date = COALESCE(original_work_date, work_date)
WHERE original_server_timestamp IS NOT NULL;

-- Backfill a default location for every company with data
INSERT INTO public.locations (company_id, name, address)
SELECT c.id, COALESCE(c.commercial_name, c.legal_name), ''
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = c.id);

UPDATE public.time_entries t SET location_id = (
  SELECT l.id FROM public.locations l WHERE l.company_id = t.company_id ORDER BY l.created_at LIMIT 1)
WHERE t.location_id IS NULL;

INSERT INTO public.worker_locations (worker_id, location_id, company_id)
SELECT w.id, (SELECT l.id FROM public.locations l WHERE l.company_id = w.company_id ORDER BY l.created_at LIMIT 1), w.company_id
FROM public.workers w
ON CONFLICT DO NOTHING;

INSERT INTO public.kiosks (company_id, location_id, token)
SELECT l.company_id, l.id,
  CASE WHEN c.is_demo THEN 'demo' ELSE encode(extensions.gen_random_bytes(12), 'hex') END
FROM public.locations l JOIN public.companies c ON c.id = l.company_id
WHERE NOT EXISTS (SELECT 1 FROM public.kiosks k WHERE k.location_id = l.id);

-- Hard immutability: originals can never be changed or deleted
CREATE OR REPLACE FUNCTION public.prevent_time_entry_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'time_entries are immutable';
  END IF;
  IF NEW.server_timestamp IS DISTINCT FROM OLD.server_timestamp
     OR NEW.work_date IS DISTINCT FROM OLD.work_date
     OR NEW.local_time IS DISTINCT FROM OLD.local_time
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR (OLD.location_id IS NOT NULL AND NEW.location_id IS DISTINCT FROM OLD.location_id) THEN
    RAISE EXCEPTION 'time_entries are immutable';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS time_entries_immutable ON public.time_entries;
CREATE TRIGGER time_entries_immutable BEFORE UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_time_entry_mutation();

-- Corrections: append only, may also correct location
ALTER TABLE public.corrections
  ADD COLUMN IF NOT EXISTS corrected_location_id uuid REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS reason_code text;

CREATE OR REPLACE FUNCTION public.prevent_append_only_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$;
DROP TRIGGER IF EXISTS corrections_append_only ON public.corrections;
CREATE TRIGGER corrections_append_only BEFORE UPDATE OR DELETE ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();
DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Effective view (latest correction wins, original preserved)
CREATE OR REPLACE VIEW public.time_entries_effective WITH (security_invoker = on) AS
SELECT t.id, t.company_id, t.worker_id, t.type, t.is_manual, t.manual_reason, t.created_by, t.incident_id,
  t.server_timestamp AS original_timestamp,
  t.work_date AS original_work_date,
  t.local_time AS original_local_time,
  t.location_id AS original_location_id,
  COALESCE(c.corrected_timestamp, t.server_timestamp) AS effective_timestamp,
  (COALESCE(c.corrected_timestamp, t.server_timestamp) AT TIME ZONE 'Europe/Madrid')::date AS effective_work_date,
  to_char(COALESCE(c.corrected_timestamp, t.server_timestamp) AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS effective_local_time,
  COALESCE(c.corrected_location_id, t.location_id) AS effective_location_id,
  (c.id IS NOT NULL) AS is_corrected,
  c.reason AS correction_reason,
  c.reason_code AS correction_reason_code,
  c.created_at AS corrected_at,
  c.corrected_by_admin_id AS corrected_by,
  t.created_at
FROM public.time_entries t
LEFT JOIN LATERAL (
  SELECT * FROM public.corrections c WHERE c.time_entry_id = t.id ORDER BY c.created_at DESC LIMIT 1
) c ON true;
GRANT SELECT ON public.time_entries_effective TO authenticated;
GRANT SELECT ON public.time_entries_effective TO service_role;

-- State from effective event order
CREATE OR REPLACE FUNCTION public.worker_open_event(_worker_id uuid)
RETURNS TABLE(id uuid, type text, location_id uuid, effective_timestamp timestamptz, effective_local_time text, effective_work_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, e.type, e.effective_location_id, e.effective_timestamp, e.effective_local_time, e.effective_work_date
  FROM public.time_entries_effective e
  WHERE e.worker_id = _worker_id
  ORDER BY e.effective_timestamp DESC, e.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.worker_state(_worker_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE COALESCE((SELECT o.type FROM public.worker_open_event(_worker_id) o), 'exit')
    WHEN 'entry' THEN 'working' WHEN 'break_end' THEN 'working'
    WHEN 'break_start' THEN 'break' ELSE 'out' END;
$$;

-- ===== Incidents =====
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id),
  ADD COLUMN IF NOT EXISTS resolution_entry_id uuid REFERENCES public.time_entries(id);
CREATE UNIQUE INDEX IF NOT EXISTS incidents_one_per_entry ON public.incidents (time_entry_id) WHERE time_entry_id IS NOT NULL;

-- ===== Notifications outbox (provider-agnostic) =====
CREATE TABLE public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  kind text NOT NULL,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read outbox" ON public.notification_outbox FOR SELECT TO authenticated USING (public.is_company_member(company_id));

CREATE OR REPLACE FUNCTION public.enqueue_incident_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_email text;
BEGIN
  SELECT billing_email INTO v_email FROM public.companies WHERE id = NEW.company_id;
  INSERT INTO public.notification_outbox (company_id, kind, recipient, payload, dedupe_key)
  VALUES (NEW.company_id, 'incident_created', v_email,
    jsonb_build_object('incident_id', NEW.id, 'worker_id', NEW.worker_id, 'location_id', NEW.location_id,
      'path', '/panel/incidencias?id=' || NEW.id),
    'incident:' || NEW.id)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS incidents_enqueue_email ON public.incidents;
CREATE TRIGGER incidents_enqueue_email AFTER INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_incident_email();

CREATE OR REPLACE FUNCTION public.enqueue_weekly_summaries()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count int; v_week text := to_char(public.madrid_now(), 'IYYY-IW');
BEGIN
  INSERT INTO public.notification_outbox (company_id, kind, recipient, payload, dedupe_key)
  SELECT c.id, 'weekly_incident_summary', c.billing_email,
    jsonb_build_object(
      'week', v_week,
      'created', (SELECT count(*) FROM public.incidents i WHERE i.company_id = c.id AND i.created_at > now() - interval '7 days'),
      'resolved', (SELECT count(*) FROM public.incidents i WHERE i.company_id = c.id AND i.resolved_at > now() - interval '7 days'),
      'pending', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'worker', w.first_name || ' ' || w.last_name,
                   'location', l.name, 'work_date', i.work_date)), '[]'::jsonb)
                  FROM public.incidents i JOIN public.workers w ON w.id = i.worker_id
                  LEFT JOIN public.locations l ON l.id = i.location_id
                  WHERE i.company_id = c.id AND i.status = 'pending')),
    'weekly:' || c.id || ':' || v_week
  FROM public.companies c WHERE c.is_demo = false
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_weekly_summaries() FROM PUBLIC, anon, authenticated;

-- ===== Billing ledger (1 € per billable worker per cycle, dedup) =====
CREATE TABLE public.billable_worker_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  cycle_start date NOT NULL,
  reported_to_stripe_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, worker_id, cycle_start)
);
GRANT SELECT ON public.billable_worker_cycles TO authenticated;
GRANT ALL ON public.billable_worker_cycles TO service_role;
ALTER TABLE public.billable_worker_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read billing cycles" ON public.billable_worker_cycles FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- Self-service limit: 30 active workers (existing clock-ins never blocked)
CREATE OR REPLACE FUNCTION public.enforce_worker_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_active int;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    SELECT count(*) INTO v_active FROM public.workers WHERE company_id = NEW.company_id AND status = 'active' AND id <> NEW.id;
    IF v_active >= 30 THEN
      RAISE EXCEPTION 'worker_limit_reached';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS workers_limit ON public.workers;
CREATE TRIGGER workers_limit BEFORE INSERT OR UPDATE OF status ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_worker_limit();

-- ===== Kiosk RPCs (bound to kiosk token -> location) =====
CREATE OR REPLACE FUNCTION public.kiosk_info(p_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('company_name', COALESCE(c.commercial_name, c.legal_name),
    'location_name', l.name, 'is_demo', c.is_demo)
  FROM public.kiosks k JOIN public.companies c ON c.id = k.company_id JOIN public.locations l ON l.id = k.location_id
  WHERE k.token = p_token AND k.active AND l.archived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_list_workers(p_token text)
RETURNS TABLE(id uuid, first_name text, last_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT w.id, w.first_name, w.last_name
  FROM public.kiosks k
  JOIN public.worker_locations wl ON wl.location_id = k.location_id
  JOIN public.workers w ON w.id = wl.worker_id
  WHERE k.token = p_token AND k.active AND w.status = 'active' AND w.pin_hash IS NOT NULL
  ORDER BY w.first_name, w.last_name;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_check_pin(p_worker public.workers, p_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_fails int;
BEGIN
  SELECT count(*) INTO v_fails FROM public.pin_attempts
  WHERE worker_id = p_worker.id AND success = false AND created_at > now() - interval '5 minutes';
  IF v_fails >= 8 THEN RETURN 'rate_limited'; END IF;
  IF p_worker.pin_hash IS NULL OR extensions.crypt(p_pin, p_worker.pin_hash) <> p_worker.pin_hash THEN
    INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_worker.company_id, p_worker.id, false);
    RETURN 'invalid_pin';
  END IF;
  INSERT INTO public.pin_attempts (company_id, worker_id, success) VALUES (p_worker.company_id, p_worker.id, true);
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.kiosk_check_pin(public.workers, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kiosk_action(
  p_token text, p_worker_id uuid, p_pin text, p_action text DEFAULT 'status',
  p_reported_time text DEFAULT NULL, p_no_recall boolean DEFAULT false, p_new_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_kiosk public.kiosks; v_worker public.workers; v_err text; v_state text;
  v_local timestamp := public.madrid_now(); v_open record; v_entry public.time_entries;
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

  SELECT * INTO v_open FROM public.worker_open_event(p_worker_id);
  v_state := public.worker_state(p_worker_id);

  IF p_action = 'change_pin' THEN
    IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
    END IF;
    UPDATE public.workers SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')) WHERE id = p_worker_id;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'worker_change_pin', 'worker', p_worker_id, jsonb_build_object('location_id', v_kiosk.location_id));
    RETURN jsonb_build_object('ok', true, 'pin_changed', true);
  END IF;

  IF p_action IN ('break_start', 'break_end') AND NOT v_worker.break_tracking THEN
    RETURN jsonb_build_object('ok', false, 'error', 'breaks_disabled');
  END IF;

  -- Actions on an open shift must happen at the location where it began
  IF p_action IN ('exit', 'break_start', 'break_end') AND v_state <> 'out'
     AND v_open.location_id IS DISTINCT FROM v_kiosk.location_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_location');
  END IF;

  -- "Olvidé fichar la salida": register incident, keep open shift pending, allow new entry
  IF p_action = 'entry' AND v_state IN ('working', 'break') THEN
    INSERT INTO public.incidents (company_id, worker_id, time_entry_id, location_id, kind, work_date,
      worker_reported_time, worker_no_recall)
    SELECT v_worker.company_id, p_worker_id, e.id, e.effective_location_id, 'missing_exit', e.effective_work_date,
      CASE WHEN p_no_recall THEN NULL ELSE nullif(btrim(coalesce(p_reported_time, '')), '') END,
      COALESCE(p_no_recall, false)
    FROM public.time_entries_effective e
    WHERE e.worker_id = p_worker_id AND e.type = 'entry'
    ORDER BY e.effective_timestamp DESC LIMIT 1
    ON CONFLICT DO NOTHING;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'incident_missing_exit', 'worker', p_worker_id,
      jsonb_build_object('reported_time', p_reported_time, 'no_recall', COALESCE(p_no_recall, false)));
    v_state := 'out';
  END IF;

  IF p_action IN ('entry', 'exit', 'break_start', 'break_end') THEN
    IF p_action = 'entry' AND v_state <> 'out' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_working'); END IF;
    IF p_action = 'exit' AND v_state = 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'on_break'); END IF;
    IF p_action = 'exit' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
    IF p_action = 'break_start' AND v_state <> 'working' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_working'); END IF;
    IF p_action = 'break_end' AND v_state <> 'break' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_on_break'); END IF;

    INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type, location_id)
    VALUES (v_worker.company_id, p_worker_id, v_local::date, to_char(v_local, 'HH24:MI'), p_action, v_kiosk.location_id)
    RETURNING * INTO v_entry;
    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (v_worker.company_id, NULL, 'kiosk_' || p_action, 'time_entry', v_entry.id,
      jsonb_build_object('worker_id', p_worker_id, 'location_id', v_kiosk.location_id, 'local_time', v_entry.local_time));
    SELECT * INTO v_open FROM public.worker_open_event(p_worker_id);
    v_state := public.worker_state(p_worker_id);
  END IF;

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
END; $$;

GRANT EXECUTE ON FUNCTION public.kiosk_info(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_list_workers(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_action(text, uuid, text, text, text, boolean, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_open_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_open_event(uuid) TO authenticated;

-- Retire company-id kiosk functions (no location binding)
REVOKE EXECUTE ON FUNCTION public.kiosk_punch(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kiosk_punch(uuid, uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kiosk_workers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.kiosk_company(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_month_records(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.kiosk_punch(uuid, uuid, text, text, text, boolean) IS 'DEPRECATED: replaced by kiosk_action (location-bound).';
COMMENT ON FUNCTION public.kiosk_punch(uuid, uuid, text, text) IS 'DEPRECATED: replaced by kiosk_action.';
COMMENT ON FUNCTION public.kiosk_workers(uuid) IS 'DEPRECATED: replaced by kiosk_list_workers.';
COMMENT ON FUNCTION public.kiosk_company(uuid) IS 'DEPRECATED: replaced by kiosk_info.';
COMMENT ON FUNCTION public.worker_month_records(uuid, uuid, text, text) IS 'DEPRECATED: replaced by worker_portal.';

-- ===== Worker personal read-only portal =====
CREATE OR REPLACE FUNCTION public.worker_portal(p_access_token uuid, p_pin text, p_month text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_worker public.workers; v_company public.companies; v_err text; v_month text; v_start date; v_end date;
  v_entries jsonb; v_months jsonb;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE access_token = p_access_token AND status = 'active';
  IF v_worker.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'access_revoked'); END IF;
  v_err := public.kiosk_check_pin(v_worker, p_pin);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;

  v_month := COALESCE(p_month, to_char(public.madrid_now(), 'YYYY-MM'));
  IF v_month !~ '^\d{4}-\d{2}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_month'); END IF;
  v_start := (v_month || '-01')::date;
  v_end := (v_start + interval '1 month - 1 day')::date;
  SELECT * INTO v_company FROM public.companies WHERE id = v_worker.company_id;

  SELECT COALESCE(jsonb_agg(DISTINCT to_char(e.effective_work_date, 'YYYY-MM')), '[]'::jsonb) INTO v_months
  FROM public.time_entries_effective e WHERE e.worker_id = v_worker.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.type, 'work_date', e.effective_work_date,
    'local_time', e.effective_local_time, 'effective_timestamp', e.effective_timestamp,
    'original_local_time', e.original_local_time, 'corrected', e.is_corrected, 'manual', e.is_manual,
    'reason', COALESCE(e.correction_reason, e.manual_reason), 'location', l.name)
    ORDER BY e.effective_timestamp), '[]'::jsonb) INTO v_entries
  FROM public.time_entries_effective e LEFT JOIN public.locations l ON l.id = e.effective_location_id
  WHERE e.worker_id = v_worker.id AND e.effective_work_date BETWEEN v_start AND v_end;

  RETURN jsonb_build_object('ok', true, 'month', v_month, 'months', v_months,
    'worker', jsonb_build_object('first_name', v_worker.first_name, 'last_name', v_worker.last_name,
      'second_last_name', v_worker.second_last_name, 'dni_nie', v_worker.dni_nie, 'naf', v_worker.naf,
      'break_paid', v_worker.break_paid),
    'company', jsonb_build_object('legal_name', v_company.legal_name, 'tax_id', v_company.tax_id, 'ccc', v_company.ccc),
    'entries', v_entries);
END; $$;
GRANT EXECUTE ON FUNCTION public.worker_portal(uuid, text, text) TO anon, authenticated;

-- ===== Admin RPCs =====
CREATE OR REPLACE FUNCTION public.admin_correct_entry(p_entry_id uuid, p_corrected_timestamp timestamptz, p_reason text,
  p_internal_notes text DEFAULT NULL, p_reason_code text DEFAULT NULL, p_location_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_entry public.time_entries_effective; v_id uuid;
BEGIN
  SELECT * INTO v_entry FROM public.time_entries_effective WHERE id = p_entry_id;
  IF v_entry.id IS NULL OR NOT public.is_company_member(v_entry.company_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND company_id = v_entry.company_id) THEN
    RAISE EXCEPTION 'invalid_location';
  END IF;
  INSERT INTO public.corrections (company_id, time_entry_id, worker_id, original_timestamp, corrected_timestamp,
    reason, reason_code, internal_notes, corrected_by_admin_id, corrected_location_id)
  VALUES (v_entry.company_id, p_entry_id, v_entry.worker_id, v_entry.original_timestamp, p_corrected_timestamp,
    btrim(p_reason), p_reason_code, p_internal_notes, auth.uid(), COALESCE(p_location_id, v_entry.effective_location_id))
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_entry.company_id, auth.uid(), 'correct_entry', 'time_entry', p_entry_id,
    jsonb_build_object('correction_id', v_id, 'from', v_entry.effective_timestamp, 'to', p_corrected_timestamp,
      'reason', p_reason, 'reason_code', p_reason_code));
  RETURN jsonb_build_object('ok', true, 'correction_id', v_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_correct_entry(uuid, timestamptz, text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_correct_entry(uuid, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.admin_correct_entry(uuid, timestamptz, text, text) IS 'DEPRECATED: overwrote originals; replaced by 6-arg append-only version.';

CREATE OR REPLACE FUNCTION public.admin_add_manual_entry(p_worker_id uuid, p_location_id uuid, p_type text,
  p_timestamp timestamptz, p_reason text, p_reason_code text DEFAULT NULL, p_incident_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_worker public.workers; v_id uuid; v_local timestamp;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id;
  IF v_worker.id IS NULL OR NOT public.is_company_member(v_worker.company_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF p_type NOT IN ('entry', 'exit', 'break_start', 'break_end') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_timestamp > now() + interval '5 minutes' THEN RAISE EXCEPTION 'future_time'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE id = p_location_id AND company_id = v_worker.company_id) THEN
    RAISE EXCEPTION 'invalid_location';
  END IF;
  v_local := p_timestamp AT TIME ZONE 'Europe/Madrid';
  INSERT INTO public.time_entries (company_id, worker_id, work_date, server_timestamp, local_time, type, location_id,
    is_manual, manual_reason, created_by, incident_id)
  VALUES (v_worker.company_id, p_worker_id, v_local::date, p_timestamp, to_char(v_local, 'HH24:MI'), p_type, p_location_id,
    true, btrim(p_reason), auth.uid(), p_incident_id)
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_worker.company_id, auth.uid(), 'manual_entry', 'time_entry', v_id,
    jsonb_build_object('worker_id', p_worker_id, 'type', p_type, 'timestamp', p_timestamp, 'reason', p_reason,
      'reason_code', p_reason_code, 'incident_id', p_incident_id));
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_add_manual_entry(uuid, uuid, text, timestamptz, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_manual_shift(p_worker_id uuid, p_location_id uuid,
  p_start timestamptz, p_end timestamptz, p_reason text, p_reason_code text DEFAULT 'olvido_turno')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_a uuid; v_b uuid;
BEGIN
  IF p_end <= p_start THEN RAISE EXCEPTION 'end_before_start'; END IF;
  v_a := public.admin_add_manual_entry(p_worker_id, p_location_id, 'entry', p_start, p_reason, p_reason_code, NULL);
  v_b := public.admin_add_manual_entry(p_worker_id, p_location_id, 'exit', p_end, p_reason, p_reason_code, NULL);
  RETURN jsonb_build_object('ok', true, 'entry_id', v_a, 'exit_id', v_b);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_add_manual_shift(uuid, uuid, timestamptz, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_incident_v2(p_incident_id uuid, p_exit_timestamp timestamptz,
  p_reason text, p_reason_code text DEFAULT 'olvido_salida')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_inc public.incidents; v_open public.time_entries_effective; v_exit uuid;
BEGIN
  SELECT * INTO v_inc FROM public.incidents WHERE id = p_incident_id;
  IF v_inc.id IS NULL OR NOT public.is_company_member(v_inc.company_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  IF v_inc.status = 'resolved' THEN RAISE EXCEPTION 'already_resolved'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF p_exit_timestamp IS NOT NULL THEN
    SELECT * INTO v_open FROM public.time_entries_effective WHERE id = v_inc.time_entry_id;
    IF v_open.id IS NOT NULL AND p_exit_timestamp <= v_open.effective_timestamp THEN RAISE EXCEPTION 'exit_before_entry'; END IF;
    v_exit := public.admin_add_manual_entry(v_inc.worker_id, COALESCE(v_open.effective_location_id, v_inc.location_id),
      'exit', p_exit_timestamp, p_reason, p_reason_code, p_incident_id);
  END IF;
  UPDATE public.incidents SET status = 'resolved', resolution_notes = btrim(p_reason), resolved_by = auth.uid(),
    resolved_at = now(), resolution_entry_id = v_exit WHERE id = p_incident_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_inc.company_id, auth.uid(), 'resolve_incident', 'incident', p_incident_id,
    jsonb_build_object('exit_entry_id', v_exit, 'exit_timestamp', p_exit_timestamp, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'exit_entry_id', v_exit);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_incident_v2(uuid, timestamptz, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_incident(uuid, text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.admin_resolve_incident(uuid, text) IS 'DEPRECATED: replaced by admin_resolve_incident_v2.';

-- Admin can no longer update incidents directly (only via RPC)
DROP POLICY IF EXISTS "members update incidents" ON public.incidents;
REVOKE UPDATE, INSERT ON public.incidents FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_rotate_kiosk(p_location_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_loc public.locations; v_token text;
BEGIN
  SELECT * INTO v_loc FROM public.locations WHERE id = p_location_id;
  IF v_loc.id IS NULL OR NOT public.is_company_member(v_loc.company_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE public.kiosks SET active = false, revoked_at = now() WHERE location_id = p_location_id AND active;
  INSERT INTO public.kiosks (company_id, location_id) VALUES (v_loc.company_id, p_location_id) RETURNING token INTO v_token;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_loc.company_id, auth.uid(), 'rotate_kiosk', 'location', p_location_id, '{}'::jsonb);
  RETURN v_token;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_rotate_kiosk(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_rotate_worker_access(p_worker_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_worker public.workers; v_token uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE id = p_worker_id;
  IF v_worker.id IS NULL OR NOT public.is_company_member(v_worker.company_id) THEN RAISE EXCEPTION 'not_allowed'; END IF;
  UPDATE public.workers SET access_token = v_token WHERE id = p_worker_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_worker.company_id, auth.uid(), 'rotate_worker_access', 'worker', p_worker_id, '{}'::jsonb);
  RETURN v_token;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_rotate_worker_access(uuid) TO authenticated;

-- Admin never reads pin hashes from the client
REVOKE SELECT (pin_hash) ON public.workers FROM authenticated;
