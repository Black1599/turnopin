import { describe, expect, it } from "vitest";

import {
  checkoutParams,
  mapSubscriptionStatus,
  meterEvent,
  planCheckout,
  resolveBaseUrl,
  subscriptionParams,
} from "./billing-logic";

const NOW = Date.parse("2026-09-24T10:00:00Z");
const days = (n: number) => new Date(NOW + n * 86400_000).toISOString();
const prices = { priceId: "price_base", whatsappPriceId: "price_wa" };

describe("Checkout keeps the existing trial", () => {
  it("uses trial_ends_at exactly when > 48h away (no reset/extension)", () => {
    const plan = planCheckout(days(20), NOW, "trialing");
    expect(plan).toEqual({ mode: "subscription", trialEnd: Math.floor(Date.parse(days(20)) / 1000) });
    const p = checkoutParams({ plan, prices, customer: "cus_1", companyId: "c1", baseUrl: "https://x.lovable.app" });
    expect(p["subscription_data[trial_end]"]).toBe(String(Math.floor(Date.parse(days(20)) / 1000)));
    expect(p["subscription_data[trial_settings][end_behavior][missing_payment_method]"]).toBe("cancel");
    expect(p["payment_method_collection"]).toBe("always");
    expect(p["subscription_data[trial_period_days]"]).toBeUndefined();
  });
  it("revisiting Checkout later gives the same trial end", () => {
    const a = planCheckout(days(20), NOW, "trialing");
    const b = planCheckout(days(20), NOW + 5 * 86400_000, "trialing");
    expect(a.trialEnd).toBe(b.trialEnd);
  });
  it("trial ending in < 48h uses setup mode with the exact trial end", () => {
    const plan = planCheckout(days(1), NOW, "trialing");
    expect(plan.mode).toBe("setup");
    const p = checkoutParams({ plan, prices, customer: "cus_1", companyId: "c1", baseUrl: "https://turnopin.es" });
    expect(p["line_items[0][price]"]).toBeUndefined();
    expect(p["metadata[trial_end]"]).toBe(String(plan.trialEnd));
  });
  it("expired trial starts paid billing immediately", () => {
    const plan = planCheckout(days(-2), NOW, "trialing");
    expect(plan).toEqual({ mode: "subscription", trialEnd: null });
    const p = checkoutParams({ plan, prices, customer: "c", companyId: "c1", baseUrl: "https://turnopin.es" });
    expect(p["subscription_data[trial_end]"]).toBeUndefined();
  });
  it("read-only company re-subscribing never gets a new trial", () => {
    expect(planCheckout(days(10), NOW, "read_only")).toEqual({ mode: "subscription", trialEnd: null });
  });
  it("includes WhatsApp price only when configured", () => {
    const plan = planCheckout(days(20), NOW, "trialing");
    const both = checkoutParams({ plan, prices, customer: "c", companyId: "x", baseUrl: "b" });
    expect(both["line_items[1][price]"]).toBe("price_wa");
    expect(both["line_items[0][quantity]"]).toBeUndefined();
    const base = checkoutParams({ plan, prices: { priceId: "p", whatsappPriceId: null }, customer: "c", companyId: "x", baseUrl: "b" });
    expect(base["line_items[1][price]"]).toBeUndefined();
  });
  it("subscription from setup keeps trial only if still future", () => {
    const end = Math.floor(NOW / 1000) + 3600;
    const s = subscriptionParams({ customer: "c", paymentMethod: "pm", prices, companyId: "x", trialEnd: end, nowMs: NOW });
    expect(s["trial_end"]).toBe(String(end));
    expect(s["items[1][price]"]).toBe("price_wa");
    const late = subscriptionParams({ customer: "c", paymentMethod: "pm", prices, companyId: "x", trialEnd: end, nowMs: NOW + 7200_000 });
    expect(late["trial_end"]).toBeUndefined();
  });
});

describe("Webhook status mapping", () => {
  const m = (eventType: string, stripeStatus: string, trial: string) =>
    mapSubscriptionStatus({ eventType, stripeStatus, trialEndsAt: trial, nowMs: NOW });
  it("trial end without payment method → read_only", () => {
    expect(m("customer.subscription.deleted", "canceled", days(-1))).toBe("read_only");
    expect(m("customer.subscription.updated", "paused", days(-1))).toBe("read_only");
  });
  it("cancel during our trial keeps the trial", () => {
    expect(m("customer.subscription.deleted", "canceled", days(5))).toBe("trialing");
  });
  it("passes normal statuses through", () => {
    expect(m("customer.subscription.updated", "trialing", days(5))).toBe("trialing");
    expect(m("customer.subscription.updated", "active", days(-1))).toBe("active");
    expect(m("customer.subscription.updated", "canceled", days(-1))).toBe("canceled");
  });
});

describe("Meter events are idempotent per worker+cycle", () => {
  const row = { company_id: "c", worker_id: "w", cycle_start: "2026-10-01" };
  it("base and WhatsApp use distinct meters and stable identifiers", () => {
    const a = meterEvent("base", row, "cus");
    const b = meterEvent("whatsapp", row, "cus");
    expect(a.event_name).toBe("trabajadores_facturables");
    expect(b.event_name).toBe("trabajadores_whatsapp");
    expect(a.identifier).toBe(meterEvent("base", row, "cus").identifier);
    expect(a.identifier).not.toBe(b.identifier);
    expect(a["payload[value]"]).toBe("1");
    expect(b.identifier.length).toBeLessThanOrEqual(100);
  });
});

describe("Return URL", () => {
  it("prefers APP_BASE_URL, else allowed origin, else turnopin.es", () => {
    expect(resolveBaseUrl("https://turnopin.es/", "https://evil.com")).toBe("https://turnopin.es");
    expect(resolveBaseUrl(undefined, "https://id-preview--abc.lovable.app/panel")).toBe("https://id-preview--abc.lovable.app");
    expect(resolveBaseUrl(undefined, "https://evil.com")).toBe("https://turnopin.es");
  });
});
