import { createFileRoute } from "@tanstack/react-router";

type Sub = {
  id: string;
  customer: string;
  status: string;
  metadata?: { company_id?: string };
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  items?: { data: { current_period_start?: number; current_period_end?: number }[] };
  current_period_start?: number;
  current_period_end?: number;
};

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

/** Idempotent Stripe webhook: each event id is stored once in stripe_events. */
export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        const body = await request.text();
        const { verifyStripeSignature } = await import("@/lib/billing.server");
        if (!verifyStripeSignature(body, request.headers.get("stripe-signature"), secret)) {
          return new Response("invalid signature", { status: 401 });
        }
        const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, unknown> } };
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

        const { data: seen } = await admin.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
        if (seen?.processed_at) return new Response("duplicate");
        if (!seen) await admin.from("stripe_events").insert({ id: event.id, type: event.type, payload: event as never });

        let companyId: string | null = null;
        if (event.type.startsWith("customer.subscription.")) {
          const sub = event.data.object as unknown as Sub;
          companyId = sub.metadata?.company_id ?? null;
          if (!companyId) {
            const { data } = await admin.from("companies").select("id").eq("stripe_customer_id", sub.customer).maybeSingle();
            companyId = data?.id ?? null;
          }
          if (companyId) {
            const item = sub.items?.data?.[0];
            const start = iso(item?.current_period_start ?? sub.current_period_start);
            const end = iso(item?.current_period_end ?? sub.current_period_end);
            const deleted = event.type === "customer.subscription.deleted";
            const status = deleted ? "read_only" : sub.status === "canceled" ? "canceled" : sub.status;
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
        await admin
          .from("stripe_events")
          .update({ processed_at: new Date().toISOString(), company_id: companyId })
          .eq("id", event.id);
        return new Response("ok");
      },
    },
  },
});
