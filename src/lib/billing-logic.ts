// Pure billing helpers (no I/O) so Checkout/meter semantics are unit-testable.

export const METER_EVENT_NAME = "trabajadores_facturables";
export const WHATSAPP_METER_EVENT_NAME = "trabajadores_whatsapp";
/** Stripe Checkout requires trial_end to be at least 48 h in the future. */
export const CHECKOUT_MIN_TRIAL_SECONDS = 48 * 3600;

export type CheckoutPlan =
  /** Checkout in subscription mode; trialEnd null = paid billing starts immediately. */
  | { mode: "subscription"; trialEnd: number | null }
  /** Trial ends too soon for Checkout: collect the card (setup mode), webhook creates the subscription with the exact trial end. */
  | { mode: "setup"; trialEnd: number };

/** Uses the company's EXISTING trial end; never creates, resets or extends a trial. */
export function planCheckout(trialEndsAt: string | null, nowMs: number, status: string): CheckoutPlan {
  const end = trialEndsAt ? Math.floor(new Date(trialEndsAt).getTime() / 1000) : 0;
  const now = Math.floor(nowMs / 1000);
  if (status !== "trialing" || !end || end <= now) return { mode: "subscription", trialEnd: null };
  if (end - now >= CHECKOUT_MIN_TRIAL_SECONDS) return { mode: "subscription", trialEnd: end };
  return { mode: "setup", trialEnd: end };
}

export type PriceConfig = { priceId: string; whatsappPriceId: string | null };

export function checkoutParams(opts: {
  plan: CheckoutPlan;
  prices: PriceConfig;
  customer: string;
  companyId: string;
  baseUrl: string;
}): Record<string, string> {
  const { plan, prices, customer, companyId, baseUrl } = opts;
  const p: Record<string, string> = {
    mode: plan.mode,
    customer,
    "metadata[company_id]": companyId,
    success_url: `${baseUrl}/panel/ajustes?pago=ok`,
    cancel_url: `${baseUrl}/panel/ajustes`,
  };
  if (plan.mode === "setup") {
    p["currency"] = "eur";
    p["setup_intent_data[metadata][company_id]"] = companyId;
    p["metadata[trial_end]"] = String(plan.trialEnd);
    return p;
  }
  // Metered prices: no quantity.
  p["line_items[0][price]"] = prices.priceId;
  if (prices.whatsappPriceId) p["line_items[1][price]"] = prices.whatsappPriceId;
  p["payment_method_collection"] = "always";
  p["subscription_data[metadata][company_id]"] = companyId;
  if (plan.trialEnd) {
    p["subscription_data[trial_end]"] = String(plan.trialEnd);
    p["subscription_data[trial_settings][end_behavior][missing_payment_method]"] = "cancel";
  }
  return p;
}

/** Params for creating the subscription directly (after a setup-mode Checkout). */
export function subscriptionParams(opts: {
  customer: string;
  paymentMethod: string;
  prices: PriceConfig;
  companyId: string;
  trialEnd: number | null;
  nowMs: number;
}): Record<string, string> {
  const p: Record<string, string> = {
    customer: opts.customer,
    default_payment_method: opts.paymentMethod,
    "items[0][price]": opts.prices.priceId,
    "metadata[company_id]": opts.companyId,
  };
  if (opts.prices.whatsappPriceId) p["items[1][price]"] = opts.prices.whatsappPriceId;
  if (opts.trialEnd && opts.trialEnd > Math.floor(opts.nowMs / 1000)) {
    p["trial_end"] = String(opts.trialEnd);
    p["trial_settings[end_behavior][missing_payment_method]"] = "cancel";
  }
  return p;
}

/** Maps a Stripe subscription state onto TurnoPIN's company status. */
export function mapSubscriptionStatus(opts: {
  eventType: string;
  stripeStatus: string;
  trialEndsAt: string | null;
  nowMs: number;
}): string {
  const inTrial = !!opts.trialEndsAt && new Date(opts.trialEndsAt).getTime() > opts.nowMs;
  const gone =
    opts.eventType === "customer.subscription.deleted" ||
    ["incomplete_expired", "paused", "unpaid"].includes(opts.stripeStatus);
  // Cancelled/removed while our own trial is still running: keep the trial, nothing charged.
  if (gone) return inTrial ? "trialing" : "read_only";
  if (opts.stripeStatus === "incomplete") return inTrial ? "trialing" : "read_only";
  return opts.stripeStatus; // trialing | active | past_due | canceled (cancel at period end)
}

export type LedgerKind = "base" | "whatsapp";
export function meterEvent(kind: LedgerKind, row: { company_id: string; worker_id: string; cycle_start: string }, customer: string) {
  return {
    event_name: kind === "base" ? METER_EVENT_NAME : WHATSAPP_METER_EVENT_NAME,
    identifier: `${kind === "base" ? "" : "wa:"}${row.company_id}:${row.worker_id}:${row.cycle_start}`,
    "payload[stripe_customer_id]": customer,
    "payload[value]": "1",
  };
}

const ALLOWED_HOST = /(^|\.)turnopin\.(es|com)$|\.lovable\.app$|\.lovableproject\.com$|^localhost$|^127\.0\.0\.1$/;

/** Return URL base: APP_BASE_URL if set, else the caller's origin when it's an allowed host, else turnopin.es. */
export function resolveBaseUrl(envBase: string | undefined, origin: string | null | undefined): string {
  if (envBase) return envBase.replace(/\/+$/, "");
  if (origin) {
    try {
      const u = new URL(origin);
      if (ALLOWED_HOST.test(u.hostname)) return u.origin;
    } catch {
      /* ignore */
    }
  }
  return "https://turnopin.es";
}
