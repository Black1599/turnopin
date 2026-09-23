import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Period = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Estimate = { account?: { currency: string; messages: number; net: number }[] };

/**
 * Internal (platform admin only): compares our ledger estimate with Meta's pricing analytics
 * for the TurnoPIN WhatsApp Business Account. Stores the result either way.
 */
export const reconcileWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Period.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "platform_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { data: est } = await context.supabase.rpc("whatsapp_estimate_cost", { p_from: data.from, p_to: data.to });
    const acct = (est as Estimate | null)?.account?.[0];
    const internal = { messages: acct?.messages ?? 0, total: acct?.net ?? 0, currency: acct?.currency ?? null };

    const waba = process.env["META_WHATSAPP_BUSINESS_ACCOUNT_ID"];
    const token = process.env["META_WHATSAPP_ACCESS_TOKEN"];
    const version = process.env["META_GRAPH_API_VERSION"] ?? "v21.0";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const base = {
      period_start: data.from,
      period_end: data.to,
      business_account_id: waba ?? null,
      internal_messages: internal.messages,
      internal_estimated_total: internal.total,
      internal_currency: internal.currency,
      reconciled_by: context.userId,
    };

    if (!waba || !token) {
      await supabaseAdmin.from("whatsapp_reconciliations").insert({
        ...base,
        status: "unavailable",
        details: { reason: "meta_credentials_missing" },
      });
      return { status: "unavailable" as const, internal };
    }

    const start = Math.floor(new Date(`${data.from}T00:00:00Z`).getTime() / 1000);
    const end = Math.floor(new Date(`${data.to}T23:59:59Z`).getTime() / 1000);
    const fields = `pricing_analytics.start(${start}).end(${end}).granularity(MONTHLY).metric_types(["COST","VOLUME"])`;
    try {
      const res = await fetch(
        `https://graph.facebook.com/${version}/${waba}?fields=${encodeURIComponent(fields)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as {
        pricing_analytics?: { data?: { data_points?: { cost?: number; volume?: number }[] }[] };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      const points = json.pricing_analytics?.data?.flatMap((d) => d.data_points ?? []) ?? [];
      const volume = points.reduce((a, p) => a + (p.volume ?? 0), 0);
      const spend = points.reduce((a, p) => a + (p.cost ?? 0), 0);
      await supabaseAdmin.from("whatsapp_reconciliations").insert({
        ...base,
        status: "ok",
        provider_total_messages: volume,
        provider_reported_spend: spend,
        variance: internal.total - spend,
        details: { data_points: points.length },
      });
      return { status: "ok" as const, internal, provider: { volume, spend }, variance: internal.total - spend };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("whatsapp_reconciliations").insert({ ...base, status: "error", details: { error: msg.slice(0, 300) } });
      return { status: "error" as const, internal, error: msg };
    }
  });
