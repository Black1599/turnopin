ALTER FUNCTION public.madrid_now() SET search_path = public;

-- Worker limit: serialize per company so two concurrent inserts cannot create worker 31.
CREATE OR REPLACE FUNCTION public.enforce_worker_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active int;
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtext('worker_limit:' || NEW.company_id::text));
    SELECT count(*) INTO v_active FROM public.workers
      WHERE company_id = NEW.company_id AND status = 'active' AND id <> NEW.id;
    IF v_active >= 30 THEN
      RAISE EXCEPTION 'worker_limit_reached';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- One trial per NIF/CIF.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS trial_denied boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.normalize_tax_id(_t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(upper(regexp_replace(coalesce(_t, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

CREATE INDEX IF NOT EXISTS companies_tax_norm_idx ON public.companies (public.normalize_tax_id(tax_id));

CREATE OR REPLACE FUNCTION public.enforce_one_trial_per_tax_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm text := public.normalize_tax_id(NEW.tax_id);
BEGIN
  IF NEW.is_demo OR v_norm IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND public.normalize_tax_id(OLD.tax_id) IS NOT DISTINCT FROM v_norm THEN
    RETURN NEW;
  END IF;
  -- Only matters while the company is still on its free trial.
  IF NEW.subscription_status <> 'trialing' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('trial_tax:' || v_norm));
  IF EXISTS (
    SELECT 1 FROM public.companies c
    WHERE public.normalize_tax_id(c.tax_id) = v_norm AND c.id <> NEW.id AND NOT c.is_demo
  ) THEN
    NEW.trial_ends_at := LEAST(NEW.trial_ends_at, now());
    NEW.trial_denied := true;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.enforce_one_trial_per_tax_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_one_trial ON public.companies;
CREATE TRIGGER companies_one_trial BEFORE INSERT OR UPDATE OF tax_id ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.enforce_one_trial_per_tax_id();

-- Billing ledger: record active workers whenever a paid cycle starts (backup to webhook; deduplicated).
CREATE OR REPLACE FUNCTION public.on_company_cycle_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.subscription_status IN ('active', 'past_due') AND NEW.billing_cycle_start IS NOT NULL
     AND (OLD.billing_cycle_start IS DISTINCT FROM NEW.billing_cycle_start
          OR OLD.subscription_status IS DISTINCT FROM NEW.subscription_status) THEN
    PERFORM public.record_billable_workers(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.on_company_cycle_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS companies_cycle_billable ON public.companies;
CREATE TRIGGER companies_cycle_billable AFTER UPDATE OF subscription_status, billing_cycle_start ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.on_company_cycle_change();

REVOKE EXECUTE ON FUNCTION public.record_billable_workers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_writable(uuid) FROM PUBLIC, anon;