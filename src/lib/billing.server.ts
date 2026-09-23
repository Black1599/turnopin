// Stripe integration layer (server only). No credentials are hardcoded:
// every call checks STRIPE_SECRET_KEY / STRIPE_PRICE_ID and returns "not_configured" if absent.
import { createHmac, timingSafeEqual } from "crypto";

export const METER_EVENT_NAME = "trabajadores_facturables";
export const APP_URL = "https://turnopin.es";

export function stripeConfig() {
  const key = process.env["STRIPE_SECRET_KEY"];
  const priceId = process.env["STRIPE_PRICE_ID"];
  return key && priceId ? { key, priceId } : null;
}

export async function stripeRequest<T = Record<string, unknown>>(
  key: string,
  path: string,
  params: Record<string, string>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe ${res.status}`);
  return json;
}

/** Verifies the Stripe-Signature header (v1 scheme, 5 min tolerance). */
export function verifyStripeSignature(body: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sigs = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Sends one meter event per unreported ledger row; Stripe dedupes by identifier. */
export async function reportBillableWorkers(admin: Admin) {
  const cfg = stripeConfig();
  if (!cfg) return { reported: 0, skipped: "not_configured" };
  const { data: rows } = await admin
    .from("billable_worker_cycles")
    .select("id, company_id, worker_id, cycle_start, companies(stripe_customer_id)")
    .is("reported_to_stripe_at", null)
    .limit(500);
  let reported = 0;
  for (const r of rows ?? []) {
    const customer = (r.companies as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
    if (!customer) continue;
    const identifier = `${r.company_id}:${r.worker_id}:${r.cycle_start}`;
    await stripeRequest(cfg.key, "/v1/billing/meter_events", {
      event_name: METER_EVENT_NAME,
      identifier,
      "payload[stripe_customer_id]": customer,
      "payload[value]": "1",
    });
    await admin.from("billable_worker_cycles").update({ reported_to_stripe_at: new Date().toISOString() }).eq("id", r.id);
    reported++;
  }
  return { reported };
}
