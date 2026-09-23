-- Tighten function exposure
ALTER FUNCTION public.prevent_time_entry_mutation() SET search_path TO 'public';
ALTER FUNCTION public.prevent_append_only_mutation() SET search_path TO 'public';
REVOKE EXECUTE ON FUNCTION public.worker_open_event(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.worker_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_incident_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_worker_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_company_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_worker_pin(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_correct_entry(uuid, timestamptz, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_manual_entry(uuid, uuid, text, timestamptz, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_manual_shift(uuid, uuid, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_incident_v2(uuid, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_rotate_kiosk(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_rotate_worker_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid) TO authenticated;

-- Subscription state
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
-- subscription_status values: trialing | active | past_due | canceled | read_only

-- Companies cannot edit their own billing/trial fields
REVOKE UPDATE ON public.companies FROM authenticated;
GRANT UPDATE (legal_name, commercial_name, tax_id, fiscal_address, country, billing_email, ccc) ON public.companies TO authenticated;
REVOKE INSERT ON public.companies FROM authenticated;
GRANT INSERT (owner_id, legal_name, commercial_name, tax_id, fiscal_address, country, billing_email, ccc) ON public.companies TO authenticated;

CREATE OR REPLACE FUNCTION public.company_writable(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT c.is_demo OR c.is_pilot
      OR (c.subscription_status = 'trialing' AND c.trial_ends_at > now())
      OR c.subscription_status IN ('active', 'past_due')
      OR (c.subscription_status = 'canceled' AND c.current_period_end > now())
    FROM public.companies c WHERE c.id = _company_id), false);
$$;
GRANT EXECUTE ON FUNCTION public.company_writable(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.company_writable(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.enforce_company_writable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.company_writable(NEW.company_id) THEN
    RAISE EXCEPTION 'company_read_only';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.enforce_company_writable() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['time_entries','corrections','workers','locations','worker_locations','kiosks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_writable ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_writable BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_company_writable()', t, t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS workers_writable_upd ON public.workers;
CREATE TRIGGER workers_writable_upd BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION public.enforce_company_writable();
DROP TRIGGER IF EXISTS locations_writable_upd ON public.locations;
CREATE TRIGGER locations_writable_upd BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.enforce_company_writable();

-- Billing ledger: record each active worker once per cycle (never during trial)
CREATE OR REPLACE FUNCTION public.record_billable_workers(_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c public.companies; v_n int;
BEGIN
  SELECT * INTO v_c FROM public.companies WHERE id = _company_id;
  IF v_c.id IS NULL OR v_c.is_demo OR v_c.is_pilot OR v_c.subscription_status NOT IN ('active', 'past_due')
     OR v_c.billing_cycle_start IS NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO public.billable_worker_cycles (company_id, worker_id, cycle_start)
  SELECT _company_id, w.id, (v_c.billing_cycle_start AT TIME ZONE 'UTC')::date
  FROM public.workers w WHERE w.company_id = _company_id AND w.status = 'active'
  ON CONFLICT (company_id, worker_id, cycle_start) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_billable_workers(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.on_worker_activated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    PERFORM public.record_billable_workers(NEW.company_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.on_worker_activated() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS workers_billable ON public.workers;
CREATE TRIGGER workers_billable AFTER INSERT OR UPDATE OF status ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.on_worker_activated();

-- Idempotent webhook log
CREATE TABLE public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  company_id uuid REFERENCES public.companies(id),
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_events TO service_role;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Worker changes own PIN from personal read-only area
CREATE OR REPLACE FUNCTION public.worker_portal_change_pin(p_access_token uuid, p_pin text, p_new_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_worker public.workers; v_err text;
BEGIN
  SELECT * INTO v_worker FROM public.workers WHERE access_token = p_access_token AND status = 'active';
  IF v_worker.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'access_revoked'); END IF;
  v_err := public.kiosk_check_pin(v_worker, p_pin);
  IF v_err IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', v_err); END IF;
  IF p_new_pin IS NULL OR p_new_pin !~ '^\d{4}$' THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_new_pin'); END IF;
  UPDATE public.workers SET pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')) WHERE id = v_worker.id;
  INSERT INTO public.audit_logs (company_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_worker.company_id, NULL, 'worker_change_pin', 'worker', v_worker.id, '{"source":"portal"}'::jsonb);
  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.worker_portal_change_pin(uuid, text, text) TO anon, authenticated;