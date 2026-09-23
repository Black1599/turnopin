/** Pure telemetry helpers (no I/O). Message bodies are never part of telemetry. */
import type { Intent, WaAction } from "@/lib/whatsapp-bot";

export type EventKind =
  | "linkage"
  | "menu"
  | "clock_action"
  | "break_action"
  | "status"
  | "incident"
  | "error"
  | "template"
  | "other";
export type MessageFormat = "text" | "button" | "interactive" | "template" | "other";

const MARKETS: [string, string][] = [
  ["351", "PT"],
  ["34", "ES"],
  ["33", "FR"],
  ["39", "IT"],
  ["49", "DE"],
  ["44", "GB"],
  ["1", "US"],
];

/** Market used for rate lookup; mirrors public.whatsapp_market(). */
export function marketOf(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return MARKETS.find(([p]) => d.startsWith(p))?.[1] ?? "OTHER";
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function actionKind(a: WaAction): EventKind {
  if (a === "entry" || a === "exit") return "clock_action";
  if (a === "break_start" || a === "break_end") return "break_action";
  return "status";
}

/** Classifies an inbound message by intent. */
export function inboundKind(intent: Intent): EventKind {
  switch (intent.kind) {
    case "link":
      return "linkage";
    case "no_recall":
    case "reported_time":
      return "clock_action";
    case "location":
    case "action":
      return actionKind(intent.action);
    default:
      return "menu";
  }
}

export function inboundFormat(type: string): MessageFormat {
  if (type === "text") return "text";
  if (type === "interactive") return "interactive";
  if (type === "button") return "button";
  return "other";
}

/** Only non-sensitive fields from a status callback end up in raw metadata. */
export function safeStatusMetadata(s: { conversation?: { id?: string; origin?: { type?: string } }; pricing?: unknown }) {
  return {
    conversation_origin: s.conversation?.origin?.type ?? null,
    pricing: s.pricing ?? null,
  };
}

/** Strips message bodies (which may contain PINs/codes) before storing a webhook message. */
export function minimalMessagePayload(m: Record<string, unknown>) {
  const interactive = m["interactive"] as { type?: string } | undefined;
  return { id: m["id"], type: m["type"], timestamp: m["timestamp"], interactive_type: interactive?.type ?? null };
}
