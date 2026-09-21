-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- COMPANIES ----------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid,
  legal_name text NOT NULL,
  tax_id text,
  ccc text,
  plan text NOT NULL DEFAULT 'local',
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  subscription_status text NOT NULL DEFAULT 'trialing',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ---------- MEMBERSHIPS ----------
CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);

GRANT SELECT, INSERT ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

CREATE POLICY "members read own companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_company_member(id));
CREATE POLICY "owner creates company" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "members update own company" ON public.companies
  FOR UPDATE TO authenticated USING (public.is_company_member(id)) WITH CHECK (public.is_company_member(id));

CREATE POLICY "read own memberships" ON public.company_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "create own membership" ON public.company_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ---------- WORKERS ----------
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  second_last_name text,
  dni_nie text,
  naf text,
  pin_hash text,
  status text NOT NULL DEFAULT 'active',
  hired_at date,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workers_company_idx ON public.workers (company_id, status);

GRANT SELECT, INSERT, UPDATE ON public.workers TO authenticated;
GRANT ALL ON public.workers TO service_role;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workers" ON public.workers
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members insert workers" ON public.workers
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));
CREATE POLICY "members update workers" ON public.workers
  FOR UPDATE TO authenticated USING (public.is_company_member(company_id)) WITH CHECK (public.is_company_member(company_id));

-- ---------- TIME ENTRIES ----------
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  server_timestamp timestamptz NOT NULL DEFAULT now(),
  local_time text NOT NULL,
  type text NOT NULL CHECK (type IN ('entry','exit')),
  corrected boolean NOT NULL DEFAULT false,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_company_date_idx ON public.time_entries (company_id, work_date);
CREATE INDEX time_entries_worker_idx ON public.time_entries (worker_id, server_timestamp DESC);

GRANT SELECT ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read time entries" ON public.time_entries
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- ---------- CORRECTIONS ----------
CREATE TABLE public.corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE RESTRICT,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE RESTRICT,
  original_timestamp timestamptz NOT NULL,
  corrected_timestamp timestamptz NOT NULL,
  reason text NOT NULL,
  internal_notes text,
  corrected_by_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.corrections TO authenticated;
GRANT ALL ON public.corrections TO service_role;
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read corrections" ON public.corrections
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- ---------- AUDIT LOG ----------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_company_idx ON public.audit_logs (company_id, created_at DESC);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read audit" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));
CREATE POLICY "members insert audit" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id));

-- ---------- PIN ATTEMPTS (rate limiting) ----------
CREATE TABLE public.pin_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  worker_id uuid,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pin_attempts_worker_idx ON public.pin_attempts (worker_id, created_at DESC);

GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;

-- ---------- HELPERS ----------
CREATE OR REPLACE FUNCTION public.madrid_now()
RETURNS timestamp
LANGUAGE sql STABLE
AS $$ SELECT (now() AT TIME ZONE 'Europe/Madrid'); $$;

-- Worker current status derived from latest entry
CREATE OR REPLACE FUNCTION public.worker_status(_worker_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT t.type FROM public.time_entries t
    WHERE t.worker_id = _worker_id
    ORDER BY t.server_timestamp DESC, t.created_at DESC LIMIT 1
  ), 'exit');
$$;

-- ---------- KIOSK RPCs (public, security definer) ----------
CREATE OR REPLACE FUNCTION public.kiosk_company(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object('id', c.id, 'legal_name', c.legal_name, 'is_demo', c.is_demo)
  FROM public.companies c WHERE c.id = p_company_id;
$$;

CREATE OR REPLACE FUNCTION public.kiosk_workers(p_company_id uuid)
RETURNS TABLE (id uuid, first_name text, last_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT w.id, w.first_name, w.last_name
  FROM public.workers w
  WHERE w.company_id = p_company_id AND w.status = 'active' AND w.pin_hash IS NOT NULL
  ORDER BY w.first_name, w.last_name;
$$;

-- Validates PIN, applies rate limiting and (optionally) performs a clock action.
CREATE OR REPLACE FUNCTION public.kiosk_punch(
  p_company_id uuid,
  p_worker_id uuid,
  p_pin text,
  p_action text DEFAULT 'status'
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_worker public.workers;
  v_fails int;
  v_status text;
  v_local timestamp;
  v_entry public.time_entries;
  v_entries jsonb;
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

  v_status := public.worker_status(p_worker_id);
  v_local := public.madrid_now();

  IF p_action IN ('entry','exit') THEN
    IF p_action = 'entry' AND v_status = 'entry' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_working');
    END IF;
    IF p_action = 'exit' AND v_status <> 'entry' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_working');
    END IF;

    INSERT INTO public.time_entries (company_id, worker_id, work_date, local_time, type)
    VALUES (p_company_id, p_worker_id, v_local::date, to_char(v_local, 'HH24:MI'), p_action)
    RETURNING * INTO v_entry;

    INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (p_company_id, NULL, 'kiosk_' || p_action, 'time_entry', v_entry.id,
            jsonb_build_object('worker_id', p_worker_id, 'local_time', v_entry.local_time));

    v_status := p_action;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', t.id, 'type', t.type, 'local_time', t.local_time, 'corrected', t.corrected)
           ORDER BY t.server_timestamp), '[]'::jsonb)
  INTO v_entries
  FROM public.time_entries t
  WHERE t.worker_id = p_worker_id AND t.work_date = v_local::date;

  IF v_status = 'entry' THEN
    SELECT t.local_time INTO v_since FROM public.time_entries t
    WHERE t.worker_id = p_worker_id ORDER BY t.server_timestamp DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'worker', jsonb_build_object('id', v_worker.id, 'first_name', v_worker.first_name, 'last_name', v_worker.last_name),
    'status', CASE WHEN v_status = 'entry' THEN 'working' ELSE 'out' END,
    'since', v_since,
    'server_time', to_char(v_local, 'HH24:MI'),
    'entries', v_entries
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.kiosk_company(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_workers(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kiosk_punch(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_status(uuid) TO anon, authenticated;

-- ---------- ADMIN RPCs ----------
CREATE OR REPLACE FUNCTION public.admin_set_worker_pin(p_worker_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.workers WHERE id = p_worker_id;
  IF v_company IS NULL OR NOT public.is_company_member(v_company) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid_pin_format';
  END IF;
  UPDATE public.workers
    SET pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
    WHERE id = p_worker_id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_company, auth.uid(), 'set_worker_pin', 'worker', p_worker_id, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_worker_pin(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_correct_entry(
  p_entry_id uuid,
  p_corrected_timestamp timestamptz,
  p_reason text,
  p_internal_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_entry public.time_entries;
  v_local timestamp;
  v_correction_id uuid;
BEGIN
  SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id;
  IF v_entry.id IS NULL OR NOT public.is_company_member(v_entry.company_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  INSERT INTO public.corrections (company_id, time_entry_id, worker_id, original_timestamp,
    corrected_timestamp, reason, internal_notes, corrected_by_admin_id)
  VALUES (v_entry.company_id, v_entry.id, v_entry.worker_id, v_entry.server_timestamp,
    p_corrected_timestamp, p_reason, p_internal_notes, auth.uid())
  RETURNING id INTO v_correction_id;

  v_local := (p_corrected_timestamp AT TIME ZONE 'Europe/Madrid');

  UPDATE public.time_entries
    SET server_timestamp = p_corrected_timestamp,
        work_date = v_local::date,
        local_time = to_char(v_local, 'HH24:MI'),
        corrected = true,
        internal_notes = COALESCE(p_internal_notes, internal_notes)
    WHERE id = p_entry_id;

  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_entry.company_id, auth.uid(), 'correct_time_entry', 'time_entry', p_entry_id,
    jsonb_build_object('correction_id', v_correction_id, 'original', v_entry.server_timestamp,
                       'corrected', p_corrected_timestamp, 'reason', p_reason));

  RETURN jsonb_build_object('ok', true, 'correction_id', v_correction_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_correct_entry(uuid, timestamptz, text, text) TO authenticated;

-- ---------- DEMO DATA ----------
INSERT INTO public.companies (id, legal_name, tax_id, plan, is_demo, subscription_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'Bar Demo S.L.', 'B12345678', 'local', true, 'trialing');

INSERT INTO public.workers (id, company_id, first_name, last_name, second_last_name, hired_at, pin_hash)
VALUES
 ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Ana', 'Pérez', 'Gómez', '2024-03-01', extensions.crypt('2580', extensions.gen_salt('bf'))),
 ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Luis', 'García', NULL, '2023-11-15', extensions.crypt('1111', extensions.gen_salt('bf'))),
 ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Marta', 'Ruiz', 'Sanz', '2025-01-08', extensions.crypt('2222', extensions.gen_salt('bf')));

INSERT INTO public.time_entries (company_id, worker_id, work_date, server_timestamp, local_time, type)
VALUES
 ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  (public.madrid_now())::date, (public.madrid_now()::date + time '08:00') AT TIME ZONE 'Europe/Madrid', '08:00', 'entry'),
 ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  (public.madrid_now())::date, (public.madrid_now()::date + time '12:30') AT TIME ZONE 'Europe/Madrid', '12:30', 'exit'),
 ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222223',
  (public.madrid_now())::date, (public.madrid_now()::date + time '09:15') AT TIME ZONE 'Europe/Madrid', '09:15', 'entry');
