import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Result = { url: string } | { error: "not_configured" | "no_company" | "no_customer" };

async function loadCompany(supabase: Parameters<Parameters<typeof requireSupabaseAuth.server>[0]>[0] extends never ? never : any) {
  const { data } = await supabase.from("companies").select("*").limit(1);
  return data?.[0] ?? null;
}

/** Checkout (subscription mode, metered €1 price). Customer is created once and reused. */
export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { stripeConfig, stripeRequest, APP_URL } = await import("./billing.server");
    const cfg = stripeConfig();
    if (!cfg) return { error: "not_configured" };
    const company = await loadCompany(context.supabase);
    if (!company) return { error: "no_company" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let customer = company.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripeRequest<{ id: string }>(
        cfg.key,
        "/v1/customers",
        {
          name: company.legal_name,
          email: company.billing_email ?? "",
          "metadata[company_id]": company.id,
          "tax_id_data[0][type]": "es_cif",
          "tax_id_data[0][value]": company.tax_id ?? "",
        },
        `customer-${company.id}`,
      );
      customer = c.id;
      await supabaseAdmin.from("companies").update({ stripe_customer_id: customer }).eq("id", company.id);
    }
    const s = await stripeRequest<{ url: string }>(cfg.key, "/v1/checkout/sessions", {
      mode: "subscription",
      customer,
      "line_items[0][price]": cfg.priceId,
      "subscription_data[metadata][company_id]": company.id,
      "metadata[company_id]": company.id,
      success_url: `${APP_URL}/panel/ajustes?pago=ok`,
      cancel_url: `${APP_URL}/panel/ajustes`,
    });
    return { url: s.url };
  });

/** Customer Portal: invoices, billing data, payment method, cancel at period end. */
export const createPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Result> => {
    const { stripeConfig, stripeRequest, APP_URL } = await import("./billing.server");
    const cfg = stripeConfig();
    if (!cfg) return { error: "not_configured" };
    const company = await loadCompany(context.supabase);
    if (!company) return { error: "no_company" };
    if (!company.stripe_customer_id) return { error: "no_customer" };
    const s = await stripeRequest<{ url: string }>(cfg.key, "/v1/billing_portal/sessions", {
      customer: company.stripe_customer_id,
      return_url: `${APP_URL}/panel/ajustes`,
    });
    return { url: s.url };
  });
