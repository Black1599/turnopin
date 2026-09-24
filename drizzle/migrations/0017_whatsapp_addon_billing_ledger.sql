CREATE TABLE public.whatsapp_billable_worker_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  worker_id uuid NOT NULL REFERENCES public.workers(id),
  cycle_start date NOT NULL,
  reported_to_stripe_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, worker_id, cycle_start)
);
GRANT SELECT ON public.whatsapp_billable_worker_cycles TO authenticated;
GRANT ALL ON public.whatsapp_billable_worker_cycles TO service_role;
ALTER TABLE public.whatsapp_billable_worker_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own whatsapp billing ledger" ON public.whatsapp_billable_worker_cycles
  FOR SELECT TO authenticated USING (public.is_company_member(company_id));

-- Records base units (active workers) and WhatsApp add-on units (active + whatsapp_enabled) once per cycle.
-- Never during trial, never for demo/pilot. Deduplicated by company+worker+cycle_start.
CREATE OR REPLACE FUNCTION public.record_billable_workers(_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_c public.companies; v_n int; v_w int; v_cycle date;
BEGIN
  SELECT * INTO v_c FROM public.companies WHERE id = _company_id;
  IF v_c.id IS NULL OR v_c.is_demo OR v_c.is_pilot OR v_c.subscription_status NOT IN ('active', 'past_due')
     OR v_c.billing_cycle_start IS NULL THEN
    RETURN 0;
  END IF;
  v_cycle := (v_c.billing_cycle_start AT TIME ZONE 'UTC')::date;
  INSERT INTO public.billable_worker_cycles (company_id, worker_id, cycle_start)
  SELECT _company_id, w.id, v_cycle FROM public.workers w
  WHERE w.company_id = _company_id AND w.status = 'active'
  ON CONFLICT (company_id, worker_id, cycle_start) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.whatsapp_billable_worker_cycles (company_id, worker_id, cycle_start)
  SELECT _company_id, w.id, v_cycle FROM public.workers w
  WHERE w.company_id = _company_id AND w.status = 'active' AND w.whatsapp_enabled
  ON CONFLICT (company_id, worker_id, cycle_start) DO NOTHING;
  GET DIAGNOSTICS v_w = ROW_COUNT;
  RETURN v_n + v_w;
END; $$;
REVOKE EXECUTE ON FUNCTION public.record_billable_workers(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_billable_workers(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.on_worker_activated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'active'
       OR (NEW.whatsapp_enabled AND NOT COALESCE(OLD.whatsapp_enabled, false))) THEN
    PERFORM public.record_billable_workers(NEW.company_id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.on_worker_activated() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS workers_billable ON public.workers;
CREATE TRIGGER workers_billable AFTER INSERT OR UPDATE OF status, whatsapp_enabled ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.on_worker_activated();