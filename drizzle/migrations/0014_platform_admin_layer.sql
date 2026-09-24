CREATE TABLE public.platform_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  action text NOT NULL CHECK (action IN ('grant','revoke')),
  reason text NOT NULL,
  performed_by text NOT NULL DEFAULT current_user,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_role_grants TO authenticated;
GRANT ALL ON public.platform_role_grants TO service_role;
ALTER TABLE public.platform_role_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read role grants" ON public.platform_role_grants
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'platform_admin'));
CREATE TRIGGER platform_role_grants_append_only BEFORE UPDATE OR DELETE ON public.platform_role_grants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_append_only_mutation();

-- Operator-only: callable by service role / database operator, never by app users.
CREATE OR REPLACE FUNCTION public.platform_set_role(p_email text, p_grant boolean, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid;
BEGIN
  IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(trim(p_email)) AND email_confirmed_at IS NOT NULL;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'user_not_found_or_unconfirmed'; END IF;
  IF p_grant THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (v_uid, 'platform_admin') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'platform_admin';
  END IF;
  INSERT INTO public.platform_role_grants(user_id, role, action, reason)
  VALUES (v_uid, 'platform_admin', CASE WHEN p_grant THEN 'grant' ELSE 'revoke' END, p_reason);
  RETURN v_uid;
END $$;
REVOKE ALL ON FUNCTION public.platform_set_role(text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_role(text, boolean, text) TO service_role;

-- Aggregate-only overview; no tenant rows or personal data.
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'platform_admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'companies_total', (SELECT count(*) FROM companies WHERE NOT is_demo),
    'demo_companies', (SELECT count(*) FROM companies WHERE is_demo),
    'pilot_companies', (SELECT count(*) FROM companies WHERE is_pilot AND NOT is_demo),
    'by_status', (SELECT coalesce(jsonb_object_agg(subscription_status, n), '{}'::jsonb)
                  FROM (SELECT subscription_status, count(*) n FROM companies WHERE NOT is_demo AND NOT is_pilot GROUP BY 1) s),
    'with_stripe_customer', (SELECT count(*) FROM companies WHERE stripe_customer_id IS NOT NULL),
    'active_workers', (SELECT count(*) FROM workers w JOIN companies c ON c.id = w.company_id WHERE w.status = 'active' AND NOT c.is_demo),
    'whatsapp_enabled_workers', (SELECT count(*) FROM workers w JOIN companies c ON c.id = w.company_id WHERE w.status = 'active' AND w.whatsapp_enabled AND NOT c.is_demo),
    'locations', (SELECT count(*) FROM locations l JOIN companies c ON c.id = l.company_id WHERE l.archived_at IS NULL AND NOT c.is_demo),
    'active_kiosks', (SELECT count(*) FROM kiosks k JOIN companies c ON c.id = k.company_id WHERE k.active AND NOT c.is_demo),
    'entries_24h', (SELECT count(*) FROM time_entries t JOIN companies c ON c.id = t.company_id WHERE t.created_at > now() - interval '24 hours' AND NOT c.is_demo),
    'entries_30d', (SELECT count(*) FROM time_entries t JOIN companies c ON c.id = t.company_id WHERE t.created_at > now() - interval '30 days' AND NOT c.is_demo),
    'pending_incidents', (SELECT count(*) FROM incidents i JOIN companies c ON c.id = i.company_id WHERE i.status = 'pending' AND NOT c.is_demo),
    'outbox_pending', (SELECT count(*) FROM notification_outbox WHERE status = 'pending'),
    'outbox_failed', (SELECT count(*) FROM notification_outbox WHERE status = 'failed'),
    'stripe_events_7d', (SELECT count(*) FROM stripe_events WHERE created_at > now() - interval '7 days'),
    'stripe_events_unprocessed', (SELECT count(*) FROM stripe_events WHERE processed_at IS NULL),
    'billable_unreported', (SELECT count(*) FROM billable_worker_cycles WHERE reported_to_stripe_at IS NULL)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;