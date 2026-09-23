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
  let ctx: { company_id?: string | null | undefined; worker_id?: string | null | undefined } = {};

  const send = async (text: string, buttons?: Button[]) => {
    if (!provider) return; // credentials absent: nothing is sent, nothing breaks
    const res = buttons?.length ? await provider.sendButtons(from, text, buttons) : await provider.sendText(from, text);
    await admin.from("whatsapp_usage").insert({
      company_id: ctx.company_id ?? null,
      worker_id: ctx.worker_id ?? null,
      direction: "out",
      kind: buttons?.length ? "interactive" : "text",
      wa_message_id: res.ok ? res.messageId || null : null,
      delivery_status: res.ok ? "accepted" : "failed",
      error: res.ok ? null : res.error,
    });
  };

  const reply = async (r: ActionResult, extra?: string) => {
    const state = r.status ?? "out";
    await send([extra, statusText({ ...r, status: state })].filter(Boolean).join("\n\n"), buttonsFor(state, Boolean(r.break_tracking)));
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
        await logIn(admin, ctx, "link_failed");
        await send(LINK_ERROR_TEXT[link.error ?? ""] ?? UNLINKED_TEXT);
        return;
      }
      result = await runAction(admin, from, "status");
    } else {
      ctx = { company_id: link.company_id, worker_id: link.worker_id };
      await logIn(admin, ctx, "link");
      result = await runAction(admin, from, "status");
      await reply(result, "Número vinculado. Ya puedes fichar desde aquí. El kiosco sigue disponible.");
      return;
    }
  } else if (intent.kind === "no_recall") {
    result = await runAction(admin, from, "entry", { noRecall: true });
  } else if (intent.kind === "reported_time") {
    const st = await runAction(admin, from, "status");
    result = st.ok && st.status !== "out" ? await runAction(admin, from, "entry", { reported: intent.time }) : st;
    if (result.ok && !result.punched) {
      ctx = { company_id: result.company_id, worker_id: result.worker_id };
      await logIn(admin, ctx, "text");
      await reply(result);
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
  await logIn(admin, ctx, msg.type);

  if (!result.ok) {
    if (result.error === "not_linked") return send(UNLINKED_TEXT);
    if (result.error === "location_required" && result.locations?.length && intent.kind === "action") {
      return send(
        ERROR_TEXT["location_required"]!,
        result.locations.slice(0, 3).map((l) => ({ id: `loc:${intent.action}:${l.id}`, title: l.name })),
      );
    }
    const buttons: Button[] = buttonsFor(result.status ?? "out", Boolean(result.break_tracking));
    if (result.error === "already_working") buttons.splice(0, buttons.length, { ...BUTTON.no_recall }, { ...BUTTON.status });
    return send(ERROR_TEXT[result.error ?? ""] ?? "No se ha podido registrar. Usa el kiosco.", buttons);
  }

  if (result.punched) {
    // Incident path gets a short notice; plain successful punches only get a read receipt.
    if (intent.kind === "no_recall" || intent.kind === "reported_time") {
      return reply(result, "Entrada registrada. El turno anterior queda pendiente para tu responsable.");
    }
    if (provider && messageId) await provider.markRead(messageId).catch(() => undefined);
    return;
  }
  return reply(result);
}

async function logIn(admin: Admin, ctx: { company_id?: string | null | undefined; worker_id?: string | null | undefined }, kind: string) {
  await admin.from("whatsapp_usage").insert({
    company_id: ctx.company_id ?? null,
    worker_id: ctx.worker_id ?? null,
    direction: "in",
    kind,
  });
}

/** Delivery/pricing callbacks: keeps per-message cost telemetry up to date. */
export async function handleStatus(
  admin: Admin,
  s: { id: string; status: string; pricing?: { billable?: boolean; category?: string; pricing_model?: string }; errors?: { title?: string }[] },
) {
  await admin
    .from("whatsapp_usage")
    .update({
      delivery_status: s.status,
      billable: s.pricing?.billable ?? null,
      pricing_category: s.pricing?.category ?? null,
      pricing_model: s.pricing?.pricing_model ?? null,
      error: s.errors?.[0]?.title ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("wa_message_id", s.id)
    .eq("direction", "out");
}
