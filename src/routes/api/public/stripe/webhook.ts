import { createFileRoute } from "@tanstack/react-router";

type Sub = {
  id: string;
  customer: string;
  status: string;
  metadata?: { company_id?: string };
  canceled_at?: number | null;
  items?: { data: { current_period_start?: number; current_period_end?: number }[] };
  current_period_start?: number;
  current_period_end?: number;
};

type Session = {
  id: string;
  mode: string;
  customer: string;
  metadata?: { company_id?: string; trial_end?: string };
  setup_intent?: string | null;
};

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

/**
 * Idempotent Stripe webhook: each event id is stored once in stripe_events.
 * Never modifies trial_ends_at (the trial is owned by TurnoPIN, set at signup).
 */
export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        const body = await request.text();
        const { verifyStripeSignature, stripeConfig, stripeRequest } = await import("@/lib/billing.server");
        if (!verifyStripeSignature(body, request.headers.get("stripe-signature"), secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const { mapSubscriptionStatus, subscriptionParams } = await import("@/lib/billing-logic");
        const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, unknown> } };
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

        const { data: seen } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
        if (seen?.processed_at) return new Response("duplicate");
        if (!seen) await admin.from("stripe_events").insert({ id: event.id, type: event.type, payload: event as never });

        let companyId: string | null = null;

        // Setup-mode Checkout (trial ending in < 48 h): create the subscription with the exact trial end.
        if (event.type === "checkout.session.completed") {
          const s = event.data.object as unknown as Session;
          companyId = s.metadata?.company_id ?? null;
          const cfg = stripeConfig();
          if (s.mode === "setup" && companyId && s.setup_intent && cfg) {
            const { data: c } = await admin
              .from("companies")
              .select("id, stripe_subscription_id, subscription_status, stripe_customer_id")
              .eq("id", companyId)
              .maybeSingle();
            if (c && c.stripe_customer_id === s.customer && (!c.stripe_subscription_id || ["read_only", "canceled"].includes(c.subscription_status))) {
              const si = await stripeRequest<{ payment_method: string }>(cfg.key, `/v1/setup_intents/${s.setup_intent}`, {}, undefined, "GET");
              await stripeRequest(
                cfg.key,
                "/v1/subscriptions",
                subscriptionParams({
                  customer: s.customer,
                  paymentMethod: si.payment_method,
                  prices: cfg,
                  companyId,
                  trialEnd: Number(s.metadata?.trial_end) || null,
                  nowMs: Date.now(),
                }),
                `sub-from-setup-${s.id}`,
              );
            }
          }
        }

        if (event.type.startsWith("customer.subscription.")) {
          const sub = event.data.object as unknown as Sub;
          companyId = sub.metadata?.company_id ?? null;
          if (!companyId) {
            const { data } = await admin.from("companies").select("id").eq("stripe_customer_id", sub.customer).maybeSingle();
            companyId = data?.id ?? null;
          }
          if (companyId) {
            const { data: company } = await admin
              .from("companies")
              .select("trial_ends_at, stripe_subscription_id")
              .eq("id", companyId)
              .maybeSingle();
            // Ignore events for an older subscription once a newer one is linked.
            const stale = company?.stripe_subscription_id && company.stripe_subscription_id !== sub.id &&
              event.type !== "customer.subscription.created";
            if (company && !stale) {
              const item = sub.items?.data?.[0];
              const start = iso(item?.current_period_start ?? sub.current_period_start);
              const end = iso(item?.current_period_end ?? sub.current_period_end);
              const deleted = event.type === "customer.subscription.deleted";
              const status = mapSubscriptionStatus({
                eventType: event.type,
                stripeStatus: sub.status,
                trialEndsAt: company.trial_ends_at,
                nowMs: Date.now(),
              });
              await admin
                .from("companies")
                .update({
                  stripe_customer_id: sub.customer,
                  stripe_subscription_id: deleted ? null : sub.id,
                  subscription_status: status,
                  billing_cycle_start: start,
                  billing_cycle_end: end,
                  current_period_end: end,
                  canceled_at: iso(sub.canceled_at),
                })
                .eq("id", companyId);
              if (status === "active" || status === "past_due") {
                await admin.rpc("record_billable_workers", { _company_id: companyId });
              }
            }
          }
        }
        await admin
          .from("stripe_events")
          .update({ processed_at: new Date().toISOString(), company_id: companyId })
          .eq("id", event.id);
        return new Response("ok");
      },
    },
  },
});
