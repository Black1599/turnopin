// Stripe integration layer (server only). No credentials are hardcoded:
// every call checks STRIPE_SECRET_KEY / STRIPE_PRICE_ID and returns "not_configured" if absent.
import { createHmac, timingSafeEqual } from "crypto";

import { meterEvent, type LedgerKind, type PriceConfig } from "./billing-logic";

export { METER_EVENT_NAME, WHATSAPP_METER_EVENT_NAME } from "./billing-logic";

export function stripeConfig(): ({ key: string } & PriceConfig) | null {
  const key = process.env["STRIPE_SECRET_KEY"];
  const priceId = process.env["STRIPE_PRICE_ID"];
  const whatsappPriceId = process.env["STRIPE_WHATSAPP_PRICE_ID"] || null;
  return key && priceId ? { key, priceId, whatsappPriceId } : null;
}

export async function stripeRequest<T = Record<string, unknown>>(
  key: string,
  path: string,
  params: Record<string, string>,
  idempotencyKey?: string,
  method: "POST" | "GET" = "POST",
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com${path}${method === "GET" && qs ? `?${qs}` : ""}`, {
    method,
    headers,
    body: method === "POST" ? qs : null,
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

const LEDGERS: Record<LedgerKind, "billable_worker_cycles" | "whatsapp_billable_worker_cycles"> = {
  base: "billable_worker_cycles",
  whatsapp: "whatsapp_billable_worker_cycles",
};

/** Sends one meter event per unreported ledger row (base + WhatsApp); Stripe dedupes by identifier. */
export async function reportBillableWorkers(admin: Admin) {
  const cfg = stripeConfig();
  if (!cfg) return { reported: 0, skipped: "not_configured" };
  const out = { reported: 0, whatsapp_reported: 0, errors: 0 };
  for (const kind of ["base", "whatsapp"] as const) {
    if (kind === "whatsapp" && !cfg.whatsappPriceId) continue;
    const { data: rows } = await admin
      .from(LEDGERS[kind])
      .select("id, company_id, worker_id, cycle_start, companies(stripe_customer_id)")
      .is("reported_to_stripe_at", null)
      .limit(500);
    for (const r of rows ?? []) {
      const customer = (r.companies as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
      if (!customer) continue;
      try {
        const ev = meterEvent(kind, r, customer);
        await stripeRequest(cfg.key, "/v1/billing/meter_events", ev, ev.identifier);
        await admin.from(LEDGERS[kind]).update({ reported_to_stripe_at: new Date().toISOString() }).eq("id", r.id);
        if (kind === "base") out.reported++;
        else out.whatsapp_reported++;
      } catch {
        out.errors++;
      }
    }
  }
  return out;
}
