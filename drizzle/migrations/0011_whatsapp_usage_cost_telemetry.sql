-- Platform (internal TurnoPIN staff) roles — separate table, never on profiles/companies
CREATE TYPE public.app_role AS ENUM ('platform_admin');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Market from normalized E.164 digits (for rate lookup only)
CREATE OR REPLACE FUNCTION public.whatsapp_market(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN d LIKE '34%' THEN 'ES' WHEN d LIKE '351%' THEN 'PT' WHEN d LIKE '33%' THEN 'FR'
    WHEN d LIKE '39%' THEN 'IT' WHEN d LIKE '49%' THEN 'DE' WHEN d LIKE '44%' THEN 'GB'
    WHEN d LIKE '1%' THEN 'US' ELSE 'OTHER' END
  FROM (SELECT regexp_replace(coalesce(p_phone,''), '\D', '', 'g') AS d) x
$$;

-- 1) Append-only message ledger (one row per provider message)
CREATE TABLE public.whatsapp_message_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta_whatsapp',
  provider_message_id text NOT NULL UNIQUE,
  company_id uuid REFERENCES public.companies(id),
  worker_id uuid REFERENCES public.workers(id),
  phone_number_id text,
  business_account_id text,
  counterpart_phone_hash text,
  market text NOT NULL DEFAULT 'OTHER',
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_kind text NOT NULL CHECK (event_kind IN ('linkage','menu','clock_action','break_action','status','incident','error','template','other')),
  message_format text NOT NULL DEFAULT 'text' CHECK (message_format IN ('text','button','interactive','template','other')),
  provider_category text NOT NULL DEFAULT 'unknown',
  template_name text,
  billable boolean,
  pricing_model text,
  delivery_status text NOT NULL DEFAULT 'attempted' CHECK (delivery_status IN ('received','attempted','accepted','sent','delivered','read','failed')),
  provider_error_code text,
  provider_error_title text,
  outcome text CHECK (outcome IN ('ok','error')),
  source_entity_type text,
  source_entity_id uuid,
  reply_to_message_id text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz
);
CREATE INDEX wme_company_created_idx ON public.whatsapp_message_events (company_id, created_at);
CREATE INDEX wme_created_idx ON public.whatsapp_message_events (created_at);
CREATE INDEX wme_reply_idx ON public.whatsapp_message_events (reply_to_message_id);
GRANT SELECT ON public.whatsapp_message_events TO authenticated;
GRANT ALL ON public.whatsapp_message_events TO service_role;
ALTER TABLE public.whatsapp_message_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read ledger" ON public.whatsapp_message_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));
COMMENT ON COLUMN public.whatsapp_message_events.raw_metadata IS 'Non-sensitive billing/debug fields only; never message bodies. Purged by whatsapp_purge_debug_metadata.';

-- Status callbacks: append-only, deduped per (message, status)
CREATE TABLE public.whatsapp_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text NOT NULL,
  status text NOT NULL,
  provider_timestamp timestamptz NOT NULL DEFAULT now(),
  provider_category text,
  billable boolean,
  pricing_model text,
  error_code text,
  error_title text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_message_id, status)
);
GRANT SELECT ON public.whatsapp_status_events TO authenticated;
GRANT ALL ON public.whatsapp_status_events TO service_role;
ALTER TABLE public.whatsapp_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read status events" ON public.whatsapp_status_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- Immutability guards
CREATE OR REPLACE FUNCTION public.whatsapp_ledger_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'append_only'; END IF;
  IF TG_TABLE_NAME = 'whatsapp_status_events' THEN RAISE EXCEPTION 'append_only'; END IF;
  IF NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.event_kind IS DISTINCT FROM OLD.event_kind OR NEW.message_format IS DISTINCT FROM OLD.message_format
     OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.market IS DISTINCT FROM OLD.market
     OR NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id OR NEW.reply_to_message_id IS DISTINCT FROM OLD.reply_to_message_id THEN
    RAISE EXCEPTION 'append_only';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER wme_guard BEFORE UPDATE OR DELETE ON public.whatsapp_message_events FOR EACH ROW EXECUTE FUNCTION public.whatsapp_ledger_guard();
CREATE TRIGGER wse_guard BEFORE UPDATE OR DELETE ON public.whatsapp_status_events FOR EACH ROW EXECUTE FUNCTION public.whatsapp_ledger_guard();

-- Derive ledger delivery state from ALL status rows (order-independent, idempotent)
CREATE OR REPLACE FUNCTION public.whatsapp_apply_statuses(p_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.whatsapp_message_events e SET
    sent_at = coalesce(s.sent, e.sent_at),
    delivered_at = coalesce(s.delivered, e.delivered_at),
    read_at = coalesce(s.rd, e.read_at),
    failed_at = coalesce(s.failed, e.failed_at),
    provider_category = coalesce(s.cat, e.provider_category),
    billable = coalesce(s.billable, e.billable),
    pricing_model = coalesce(s.pm, e.pricing_model),
    provider_error_code = coalesce(s.ecode, e.provider_error_code),
    provider_error_title = coalesce(s.etitle, e.provider_error_title),
    delivery_status = CASE WHEN s.rd IS NOT NULL THEN 'read' WHEN s.delivered IS NOT NULL THEN 'delivered'
      WHEN s.failed IS NOT NULL THEN 'failed' WHEN s.sent IS NOT NULL THEN 'sent' ELSE e.delivery_status END
  FROM (
    SELECT max(provider_timestamp) FILTER (WHERE status='sent') sent,
           max(provider_timestamp) FILTER (WHERE status='delivered') delivered,
           max(provider_timestamp) FILTER (WHERE status='read') rd,
           max(provider_timestamp) FILTER (WHERE status='failed') failed,
           (array_agg(provider_category ORDER BY provider_timestamp DESC) FILTER (WHERE provider_category IS NOT NULL))[1] cat,
           (array_agg(billable ORDER BY provider_timestamp DESC) FILTER (WHERE billable IS NOT NULL))[1] billable,
           (array_agg(pricing_model ORDER BY provider_timestamp DESC) FILTER (WHERE pricing_model IS NOT NULL))[1] pm,
           (array_agg(error_code ORDER BY provider_timestamp DESC) FILTER (WHERE error_code IS NOT NULL))[1] ecode,
           (array_agg(error_title ORDER BY provider_timestamp DESC) FILTER (WHERE error_title IS NOT NULL))[1] etitle,
           count(*) n
    FROM public.whatsapp_status_events WHERE provider_message_id = p_id
  ) s
  WHERE e.provider_message_id = p_id AND s.n > 0
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_apply_statuses(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.whatsapp_status_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.whatsapp_apply_statuses(NEW.provider_message_id); RETURN NEW; END; $$;
CREATE TRIGGER wse_apply AFTER INSERT ON public.whatsapp_status_events FOR EACH ROW EXECUTE FUNCTION public.whatsapp_status_trg();
CREATE TRIGGER wme_apply AFTER INSERT ON public.whatsapp_message_events FOR EACH ROW
  WHEN (NEW.direction = 'outbound') EXECUTE FUNCTION public.whatsapp_status_trg();

-- 3) Effective-dated rate table (internal only)
CREATE TABLE public.whatsapp_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'meta_whatsapp',
  market text NOT NULL DEFAULT '*',
  category text NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  unit_cost numeric(12,6) NOT NULL CHECK (unit_cost >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  rule_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);
CREATE INDEX whatsapp_rates_lookup_idx ON public.whatsapp_rates (provider, category, market, effective_from);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_rates TO authenticated;
GRANT ALL ON public.whatsapp_rates TO service_role;
ALTER TABLE public.whatsapp_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins manage rates" ON public.whatsapp_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin')) WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));
COMMENT ON COLUMN public.whatsapp_rates.rule_metadata IS 'e.g. {"free_units_per_month": 1000, "scope": "account"} — account-level allowance, never allocated per company.';

-- 4) Provider reconciliation (internal only)
CREATE TABLE public.whatsapp_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  business_account_id text,
  status text NOT NULL CHECK (status IN ('ok','unavailable','error')),
  provider_total_messages integer,
  provider_reported_spend numeric(14,6),
  provider_currency text,
  internal_messages integer,
  internal_estimated_total numeric(14,6),
  internal_currency text,
  variance numeric(14,6),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  reconciled_by uuid,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_reconciliations TO authenticated;
GRANT ALL ON public.whatsapp_reconciliations TO service_role;
ALTER TABLE public.whatsapp_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read reconciliations" ON public.whatsapp_reconciliations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

-- 2) Monthly counters (computed from ledger → duplicates impossible thanks to UNIQUE id)
CREATE OR REPLACE FUNCTION public.whatsapp_usage_counts(p_from date, p_to date, p_company_id uuid DEFAULT NULL)
RETURNS TABLE(month date, company_id uuid, worker_id uuid, inbound int, outbound_attempted int, outbound_sent int,
  delivered int, read int, failed int, interactive int, clock_actions int, incident_error_replies int,
  templates int, categories jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT date_trunc('month', created_at AT TIME ZONE 'Europe/Madrid')::date m, * FROM public.whatsapp_message_events
    WHERE public.has_role(auth.uid(), 'platform_admin')
      AND (created_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN p_from AND p_to
      AND (p_company_id IS NULL OR whatsapp_message_events.company_id = p_company_id)
  ), cats AS (
    SELECT m, company_id, worker_id, jsonb_object_agg(provider_category, n) c FROM (
      SELECT m, company_id, worker_id, provider_category, count(*) n FROM e WHERE direction='outbound'
      GROUP BY 1,2,3,4) x GROUP BY 1,2,3
  )
  SELECT e.m, e.company_id, e.worker_id,
    count(*) FILTER (WHERE direction='inbound')::int,
    count(*) FILTER (WHERE direction='outbound')::int,
    count(*) FILTER (WHERE direction='outbound' AND (sent_at IS NOT NULL OR delivered_at IS NOT NULL OR delivery_status IN ('accepted','sent','delivered','read')))::int,
    count(*) FILTER (WHERE direction='outbound' AND delivered_at IS NOT NULL)::int,
    count(*) FILTER (WHERE direction='outbound' AND read_at IS NOT NULL)::int,
    count(*) FILTER (WHERE direction='outbound' AND delivery_status='failed')::int,
    count(*) FILTER (WHERE direction='outbound' AND message_format IN ('interactive','button'))::int,
    count(*) FILTER (WHERE direction='inbound' AND event_kind IN ('clock_action','break_action') AND outcome='ok')::int,
    count(*) FILTER (WHERE direction='outbound' AND event_kind IN ('incident','error'))::int,
    count(*) FILTER (WHERE message_format='template')::int,
    coalesce(max(cats.c::text)::jsonb, '{}'::jsonb)
  FROM e LEFT JOIN cats ON cats.m = e.m AND cats.company_id IS NOT DISTINCT FROM e.company_id AND cats.worker_id IS NOT DISTINCT FROM e.worker_id
  GROUP BY 1,2,3
$$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_usage_counts(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_usage_counts(date, date, uuid) TO authenticated, service_role;

-- Cost estimation: delivered billable outbound × effective rate at delivery time
CREATE OR REPLACE FUNCTION public.whatsapp_estimate_cost(p_from date, p_to date, p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  WITH ev AS (
    SELECT e.*, date_trunc('month', e.delivered_at AT TIME ZONE 'Europe/Madrid')::date m
    FROM public.whatsapp_message_events e
    WHERE e.direction='outbound' AND e.delivered_at IS NOT NULL
      AND (e.delivered_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN p_from AND p_to
      AND coalesce(e.billable, e.provider_category <> 'service')
  ), priced AS (
    SELECT ev.m, ev.company_id, ev.worker_id, ev.provider_category, r.id rate_id, r.unit_cost, r.currency, r.rule_metadata
    FROM ev LEFT JOIN LATERAL (
      SELECT * FROM public.whatsapp_rates r WHERE r.provider = ev.provider AND r.category = ev.provider_category
        AND r.market IN (ev.market, '*') AND r.effective_from <= ev.delivered_at
        AND (r.effective_to IS NULL OR r.effective_to > ev.delivered_at)
      ORDER BY (r.market = ev.market) DESC, r.effective_from DESC LIMIT 1) r ON true
  ), allowance AS (
    SELECT currency, sum(least(n, free) * unit_cost) deduction FROM (
      SELECT m, rate_id, currency, unit_cost, count(*) n, (rule_metadata->>'free_units_per_month')::numeric free
      FROM priced WHERE rate_id IS NOT NULL AND rule_metadata ? 'free_units_per_month' GROUP BY 1,2,3,4,6) a
    GROUP BY 1
  ), acct AS (
    SELECT currency, count(*) n, sum(unit_cost) gross FROM priced WHERE rate_id IS NOT NULL GROUP BY 1
  )
  SELECT jsonb_build_object(
    'billable_delivered', (SELECT count(*) FROM priced),
    'unpriced_messages', (SELECT count(*) FROM priced WHERE rate_id IS NULL),
    'account', coalesce((SELECT jsonb_agg(jsonb_build_object('currency', a.currency, 'messages', a.n, 'gross', a.gross,
        'allowance_deduction', coalesce(al.deduction,0), 'net', a.gross - coalesce(al.deduction,0)))
      FROM acct a LEFT JOIN allowance al USING (currency)), '[]'::jsonb),
    'by_month', coalesce((SELECT jsonb_agg(x ORDER BY x->>'month') FROM (
      SELECT jsonb_build_object('month', m, 'currency', currency, 'messages', count(*), 'gross', sum(unit_cost)) x
      FROM priced WHERE rate_id IS NOT NULL GROUP BY m, currency) t), '[]'::jsonb),
    'companies', coalesce((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('company_id', company_id, 'currency', currency, 'messages', count(*), 'attributed_gross', sum(unit_cost),
        'active_workers', count(DISTINCT worker_id)) x
      FROM priced WHERE rate_id IS NOT NULL AND (p_company_id IS NULL OR company_id = p_company_id)
      GROUP BY company_id, currency) t), '[]'::jsonb),
    'attribution_note', 'Company figures are gross estimates before any account-level free allowance; allowance is applied only to the account total.'
  ) INTO v;
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_estimate_cost(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_estimate_cost(date, date, uuid) TO authenticated, service_role;

-- Dashboard KPIs (internal)
CREATE OR REPLACE FUNCTION public.whatsapp_dashboard(p_from date, p_to date, p_company_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH e AS (
    SELECT * FROM public.whatsapp_message_events
    WHERE (created_at AT TIME ZONE 'Europe/Madrid')::date BETWEEN p_from AND p_to
      AND (p_company_id IS NULL OR company_id = p_company_id)
  ), acts AS (
    SELECT i.* FROM e i WHERE i.direction='inbound' AND i.event_kind IN ('clock_action','break_action') AND i.outcome='ok'
  )
  SELECT jsonb_build_object(
    'linked_workers', (SELECT count(*) FROM public.workers w WHERE w.whatsapp_link_status='linked' AND w.archived_at IS NULL
                        AND (p_company_id IS NULL OR w.company_id = p_company_id)),
    'active_workers', (SELECT count(DISTINCT worker_id) FROM e WHERE direction='inbound' AND worker_id IS NOT NULL),
    'inbound', (SELECT count(*) FROM e WHERE direction='inbound'),
    'inbound_unlinked', (SELECT count(*) FROM e WHERE direction='inbound' AND worker_id IS NULL),
    'outbound', (SELECT count(*) FROM e WHERE direction='outbound'),
    'delivered', (SELECT count(*) FROM e WHERE direction='outbound' AND delivered_at IS NOT NULL),
    'failed', (SELECT count(*) FROM e WHERE direction='outbound' AND delivery_status='failed'),
    'successful_actions', (SELECT count(*) FROM acts),
    'actions_without_reply', (SELECT count(*) FROM acts a WHERE NOT EXISTS
        (SELECT 1 FROM public.whatsapp_message_events o WHERE o.reply_to_message_id = a.provider_message_id)),
    'top_companies', coalesce((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('company_id', c.id, 'name', coalesce(c.commercial_name, c.legal_name), 'messages', count(*)) x
        FROM e JOIN public.companies c ON c.id = e.company_id GROUP BY c.id ORDER BY count(*) DESC LIMIT 10) t), '[]'::jsonb),
    'by_month', coalesce((SELECT jsonb_agg(x ORDER BY x->>'month') FROM (
        SELECT jsonb_build_object('month', date_trunc('month', created_at AT TIME ZONE 'Europe/Madrid')::date,
          'inbound', count(*) FILTER (WHERE direction='inbound'), 'outbound', count(*) FILTER (WHERE direction='outbound')) x
        FROM e GROUP BY date_trunc('month', created_at AT TIME ZONE 'Europe/Madrid')) t), '[]'::jsonb)
  ) INTO v;
  RETURN v || jsonb_build_object('cost', public.whatsapp_estimate_cost(p_from, p_to, p_company_id));
END; $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_dashboard(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.whatsapp_dashboard(date, date, uuid) TO authenticated;

-- 6) Lightweight, non-financial usage for company admins
CREATE OR REPLACE FUNCTION public.company_whatsapp_usage(p_company_id uuid, p_month date)
RETURNS TABLE(worker_id uuid, messages int, actions int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.worker_id, count(*)::int,
    count(*) FILTER (WHERE e.direction='inbound' AND e.event_kind IN ('clock_action','break_action') AND e.outcome='ok')::int
  FROM public.whatsapp_message_events e
  WHERE public.is_company_member(p_company_id) AND e.company_id = p_company_id AND e.worker_id IS NOT NULL
    AND date_trunc('month', e.created_at AT TIME ZONE 'Europe/Madrid')::date = date_trunc('month', p_month)::date
  GROUP BY e.worker_id
$$;
REVOKE EXECUTE ON FUNCTION public.company_whatsapp_usage(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_whatsapp_usage(uuid, date) TO authenticated;

-- 7) Retention hook for raw/debug metadata and webhook payloads
CREATE OR REPLACE FUNCTION public.whatsapp_purge_debug_metadata(p_older_than interval DEFAULT interval '90 days')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int; m int;
BEGIN
  UPDATE public.whatsapp_message_events SET raw_metadata = '{}'::jsonb
   WHERE raw_metadata <> '{}'::jsonb AND created_at < now() - p_older_than;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.whatsapp_webhook_events SET payload = '{}'::jsonb
   WHERE payload <> '{}'::jsonb AND received_at < now() - p_older_than;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END; $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_purge_debug_metadata(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_purge_debug_metadata(interval) TO service_role;

-- Legacy telemetry retired
REVOKE SELECT ON public.whatsapp_usage FROM authenticated;
COMMENT ON TABLE public.whatsapp_usage IS 'DEPRECATED: replaced by whatsapp_message_events + whatsapp_status_events';

-- whatsapp_action: expose created entry id so telemetry can reference the source event
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.whatsapp_action(text,text,text,boolean,uuid)'::regprocedure);
  d := replace(d, '''punched'', v_res IS NOT NULL,', '''punched'', v_res IS NOT NULL, ''entry_id'', v_res->>''entry_id'',');
  EXECUTE d;
END $do$;