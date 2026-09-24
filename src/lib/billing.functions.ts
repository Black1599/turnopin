import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Result = { url: string } | { error: "not_configured" | "no_company" | "no_customer" | "already_subscribed" };

async function loadCompany(supabase: SupabaseClient<Database>) {
  const { data } = await supabase.from("companies").select("*").order("created_at").limit(1);
  return data?.[0] ?? null;
}

async function baseUrl() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { resolveBaseUrl } = await import("./billing-logic");
  const req = getRequest();
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  return resolveBaseUrl(process.env["APP_BASE_URL"], origin);
}

/**
 * Checkout. Uses the company's existing trial end (set at signup) — never starts, resets or
 * extends a trial. Trial still running: card is saved, nothing charged until trial_ends_at.
 * Trial over: paid subscription starts immediately.
 */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { stripeConfig, stripeRequest } = await import("./billing.server");
    const { planCheckout, checkoutParams } = await import("./billing-logic");
    const cfg = stripeConfig();
    if (!cfg) return { error: "not_configured" };
    const company = await loadCompany(context.supabase);
    if (!company) return { error: "no_company" };
    if (company.stripe_subscription_id && !["read_only", "canceled"].includes(company.subscription_status)) {
      return { error: "already_subscribed" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let customer = company.stripe_customer_id;
    if (!customer) {
      const c = await stripeRequest<{ id: string }>(
        cfg.key,
        "/v1/customers",
        {
          name: company.legal_name,
          email: company.billing_email ?? "",
          "metadata[company_id]": company.id,
          ...(company.tax_id ? { "tax_id_data[0][type]": "es_cif", "tax_id_data[0][value]": company.tax_id } : {}),
        },
        `customer-${company.id}`,
      );
      customer = c.id;
      await supabaseAdmin.from("companies").update({ stripe_customer_id: customer }).eq("id", company.id);
    }
    const plan = planCheckout(company.trial_ends_at, Date.now(), company.subscription_status);
    const s = await stripeRequest<{ url: string }>(
      cfg.key,
      "/v1/checkout/sessions",
      checkoutParams({ plan, prices: cfg, customer, companyId: company.id, baseUrl: await baseUrl() }),
    );
    return { url: s.url };
  });

/** Customer Portal: invoices, billing data, payment method, cancel at period end. */
export const createPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { stripeConfig, stripeRequest } = await import("./billing.server");
    const cfg = stripeConfig();
    if (!cfg) return { error: "not_configured" };
    const company = await loadCompany(context.supabase);
    if (!company) return { error: "no_company" };
    if (!company.stripe_customer_id) return { error: "no_customer" };
    const s = await stripeRequest<{ url: string }>(cfg.key, "/v1/billing_portal/sessions", {
      customer: company.stripe_customer_id,
      return_url: `${await baseUrl()}/panel/ajustes`,
    });
    return { url: s.url };
  });
