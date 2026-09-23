import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  BUTTON,
  buttonsFor,
  ERROR_TEXT,
  LINK_ERROR_TEXT,
  parseIntent,
  statusText,
  UNLINKED_TEXT,
  type IncomingMessage,
  type WaAction,
  type WorkerState,
} from "@/lib/whatsapp-bot";
import type { Button, WhatsAppProvider } from "@/lib/whatsapp.server";
import { createHash, randomUUID } from "crypto";
import { inboundFormat, inboundKind, marketOf, normalizePhone, type EventKind } from "@/lib/whatsapp-telemetry";

type Admin = SupabaseClient<Database>;
type ActionResult = {
  ok: boolean;
  error?: string;
  status?: WorkerState;
  break_tracking?: boolean;
  worker_id?: string;
  company_id?: string;
  first_name?: string;
  open_shift?: { local_time?: string; location_name?: string } | null;
  pending_incidents?: number;
  server_time?: string;
  punched?: boolean;
  entry_id?: string | null;
  locations?: { id: string; name: string }[];
};

const KNOWN_ERRORS = Object.keys(ERROR_TEXT);

async function runAction(
  admin: Admin,
  phone: string,
  action: WaAction,
  opts: { reported?: string; noRecall?: boolean; locationId?: string } = {},
): Promise<ActionResult> {
  const { data, error } = await admin.rpc("whatsapp_action", {
    p_phone: phone,
    p_action: action,
    p_no_recall: opts.noRecall ?? false,
    ...(opts.reported ? { p_reported_time: opts.reported } : {}),
    ...(opts.locationId ? { p_location_id: opts.locationId } : {}),
  });
  if (error) {
    const known = KNOWN_ERRORS.find((k) => error.message.includes(k));
    return { ok: false, error: known ?? "internal" };
  }
  return data as unknown as ActionResult;
}

/**
 * Handles one inbound message. Unknown/unlinked numbers never reach punch_core (whatsapp_action
 * returns not_linked before any write). Successful punches are NOT confirmed with a message
 * (only a free read receipt) to minimise outgoing traffic.
 */
export async function handleIncoming(
  admin: Admin,
  provider: WhatsAppProvider | null,
  from: string,
  messageId: string,
  msg: IncomingMessage,
) {
  const intent = parseIntent(msg);
  const phoneHash = createHash("sha256").update(normalizePhone(from)).digest("hex");
  const market = marketOf(from);
  const logIn = (c: typeof ctx, outcome: "ok" | "error", sourceId?: string | null) =>
    record(admin, {
      provider_message_id: messageId || `local:${randomUUID()}`,
      company_id: c.company_id ?? null,
      worker_id: c.worker_id ?? null,
      counterpart_phone_hash: phoneHash,
      market,
      direction: "inbound",
      event_kind: inboundKind(intent),
      message_format: inboundFormat(msg.type),
      delivery_status: "received",
      outcome,
      source_entity_type: sourceId ? "time_entry" : null,
      source_entity_id: sourceId ?? null,
    });
  let ctx: { company_id?: string | null | undefined; worker_id?: string | null | undefined } = {};

  const send = async (text: string, buttons?: Button[], kind: EventKind = "menu") => {
    if (!provider) return; // credentials absent: nothing is sent, nothing breaks
    const res = buttons?.length ? await provider.sendButtons(from, text, buttons) : await provider.sendText(from, text);
    const now = new Date().toISOString();
    await record(admin, {
      provider_message_id: res.ok && res.messageId ? res.messageId : `local:${randomUUID()}`,
      company_id: ctx.company_id ?? null,
      worker_id: ctx.worker_id ?? null,
      counterpart_phone_hash: phoneHash,
      market,
      direction: "outbound",
      event_kind: kind,
      message_format: buttons?.length ? "interactive" : "text",
      delivery_status: res.ok ? "accepted" : "failed",
      failed_at: res.ok ? null : now,
      provider_error_title: res.ok ? null : res.error.slice(0, 200),
      reply_to_message_id: messageId || null,
    });
  };
  const reply = async (r: ActionResult, extra?: string, kind: EventKind = "status") => {
    const state = r.status ?? "out";
    await send([extra, statusText({ ...r, status: state })].filter(Boolean).join("\n\n"), buttonsFor(state, Boolean(r.break_tracking)), kind);
  };

  let result: ActionResult;
  if (intent.kind === "link") {
    const { data, error } = await admin.rpc("whatsapp_link", { p_phone: from, p_secret: intent.secret });
    const link = (data ?? { ok: false, error: error ? "internal" : "not_found" }) as {
      ok: boolean;
      error?: string;
      worker_id?: string;
      company_id?: string;
    };
    if (!link.ok) {
      // Already-linked number sending 4 digits: treat as menu, never as a punch.
      if (link.error !== "already_linked") {
        await logIn(ctx, "error");
        await send(LINK_ERROR_TEXT[link.error ?? ""] ?? UNLINKED_TEXT, undefined, "linkage");
        return;
      }
      result = await runAction(admin, from, "status");
    } else {
      ctx = { company_id: link.company_id, worker_id: link.worker_id };
      await logIn(ctx, "ok");
      result = await runAction(admin, from, "status");
      await reply(result, "Número vinculado. Ya puedes fichar desde aquí. El kiosco sigue disponible.", "linkage");
      return;
    }
  } else if (intent.kind === "no_recall") {
    result = await runAction(admin, from, "entry", { noRecall: true });
  } else if (intent.kind === "reported_time") {
    const st = await runAction(admin, from, "status");
    result = st.ok && st.status !== "out" ? await runAction(admin, from, "entry", { reported: intent.time }) : st;
    if (result.ok && !result.punched) {
      ctx = { company_id: result.company_id, worker_id: result.worker_id };
      await logIn(ctx, "ok");
      await reply(result, undefined, "status");
      return;
    }
  } else if (intent.kind === "location") {
    result = await runAction(admin, from, intent.action, { locationId: intent.locationId });
  } else if (intent.kind === "action") {
    result = await runAction(admin, from, intent.action);
  } else {
    result = await runAction(admin, from, "status");
  }

  ctx = { company_id: result.company_id ?? null, worker_id: result.worker_id ?? null };
  await logIn(ctx, result.ok ? "ok" : "error", result.punched ? (result.entry_id ?? null) : null);

  if (!result.ok) {
    if (result.error === "not_linked") return send(UNLINKED_TEXT, undefined, "linkage");
    if (result.error === "location_required" && result.locations?.length && intent.kind === "action") {
      return send(
        ERROR_TEXT["location_required"]!,
        result.locations.slice(0, 3).map((l) => ({ id: `loc:${intent.action}:${l.id}`, title: l.name })),
        "menu",
      );
    }
    const buttons: Button[] = buttonsFor(result.status ?? "out", Boolean(result.break_tracking));
    if (result.error === "already_working") buttons.splice(0, buttons.length, { ...BUTTON.no_recall }, { ...BUTTON.status });
    return send(ERROR_TEXT[result.error ?? ""] ?? "No se ha podido registrar. Usa el kiosco.", buttons, "error");
  }

  if (result.punched) {
    // Incident path gets a short notice; plain successful punches only get a read receipt.
    if (intent.kind === "no_recall" || intent.kind === "reported_time") {
      return reply(result, "Entrada registrada. El turno anterior queda pendiente para tu responsable.", "incident");
    }
    if (provider && messageId) await provider.markRead(messageId).catch(() => undefined);
    return;
  }
  return reply(result);
}

type LedgerRow = Database["public"]["Tables"]["whatsapp_message_events"]["Insert"];

/** Ledger insert; a duplicate provider id (webhook retry) is silently ignored — never double counted. */
async function record(admin: Admin, row: LedgerRow) {
  const { error } = await admin.from("whatsapp_message_events").insert({
    phone_number_id: process.env["META_WHATSAPP_PHONE_NUMBER_ID"] ?? null,
    business_account_id: process.env["META_WHATSAPP_BUSINESS_ACCOUNT_ID"] ?? null,
    ...row,
  });
  if (error && error.code !== "23505") console.error("whatsapp telemetry insert failed", error.message);
}

type StatusPayload = {
  id: string;
  status: string;
  timestamp?: string;
  pricing?: { billable?: boolean; category?: string; pricing_model?: string };
  errors?: { code?: number | string; title?: string }[];
  conversation?: { id?: string; origin?: { type?: string } };
};

/** Delivery/pricing callbacks → append-only status rows; the ledger row is derived by trigger. */
export async function handleStatus(admin: Admin, s: StatusPayload) {
  const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
  const { error } = await admin.from("whatsapp_status_events").insert({
    provider_message_id: s.id,
    status: s.status,
    provider_timestamp: ts,
    provider_category: s.pricing?.category ?? null,
    billable: s.pricing?.billable ?? null,
    pricing_model: s.pricing?.pricing_model ?? null,
    error_code: s.errors?.[0]?.code != null ? String(s.errors[0].code) : null,
    error_title: s.errors?.[0]?.title ?? null,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}
