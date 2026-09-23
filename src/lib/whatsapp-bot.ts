/** Pure WhatsApp conversation logic (no I/O) — easy to unit test. */

export type WaAction = "entry" | "exit" | "break_start" | "break_end" | "status";
export type WorkerState = "out" | "working" | "break";

export type Intent =
  | { kind: "action"; action: WaAction }
  | { kind: "link"; secret: string }
  | { kind: "no_recall" }
  | { kind: "reported_time"; time: string }
  | { kind: "location"; locationId: string; action: WaAction }
  | { kind: "menu" };

export const BUTTON = {
  entry: { id: "entry", title: "Entrar" },
  break_start: { id: "break_start", title: "Iniciar pausa" },
  break_end: { id: "break_end", title: "Finalizar pausa" },
  exit: { id: "exit", title: "Salir" },
  status: { id: "status", title: "Ver estado" },
  no_recall: { id: "no_recall", title: "No recuerdo la hora" },
} as const;

const TEXT_ACTIONS: Record<string, WaAction> = {
  entrar: "entry",
  entrada: "entry",
  salir: "exit",
  salida: "exit",
  pausa: "break_start",
  "iniciar pausa": "break_start",
  "finalizar pausa": "break_end",
  "fin pausa": "break_end",
  estado: "status",
  "ver estado": "status",
};

export type IncomingMessage = {
  type: string;
  text?: { body?: string };
  interactive?: { button_reply?: { id: string }; list_reply?: { id: string } };
  button?: { payload?: string };
};

export function parseIntent(msg: IncomingMessage): Intent {
  const id = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? msg.button?.payload;
  if (id) {
    if (id === "no_recall") return { kind: "no_recall" };
    if (id.startsWith("loc:")) {
      const [, action, locationId] = id.split(":");
      if (locationId && action && isAction(action)) return { kind: "location", locationId, action };
    }
    if (isAction(id)) return { kind: "action", action: id };
    return { kind: "menu" };
  }
  const body = (msg.text?.body ?? "").trim().toLowerCase();
  const link = body.match(/^(?:vincular\s+)?(\d{4}|\d{6})$/);
  if (link) return { kind: "link", secret: link[1]! };
  const time = body.match(/^([01]?\d|2[0-3])[:.h]([0-5]\d)$/);
  if (time) return { kind: "reported_time", time: `${time[1]!.padStart(2, "0")}:${time[2]}` };
  const action = TEXT_ACTIONS[body];
  if (action) return { kind: "action", action };
  return { kind: "menu" };
}

function isAction(s: string): s is WaAction {
  return ["entry", "exit", "break_start", "break_end", "status"].includes(s);
}

/** Max 3 reply buttons (Meta limit): only the actions that make sense in the current state. */
export function buttonsFor(state: WorkerState, breakTracking: boolean) {
  if (state === "out") return [BUTTON.entry, BUTTON.status];
  if (state === "break") return [BUTTON.break_end, BUTTON.status];
  return breakTracking ? [BUTTON.exit, BUTTON.break_start, BUTTON.status] : [BUTTON.exit, BUTTON.status];
}

const STATE_LABEL: Record<WorkerState, string> = {
  out: "Sin turno abierto",
  working: "Trabajando",
  break: "En pausa",
};

export function statusText(r: {
  first_name?: string;
  status: WorkerState;
  open_shift?: { local_time?: string; location_name?: string } | null;
  pending_incidents?: number;
  server_time?: string;
}) {
  const lines = [`${r.first_name ?? ""}: ${STATE_LABEL[r.status]}`.trim()];
  if (r.open_shift?.local_time)
    lines.push(`Entrada ${r.open_shift.local_time}${r.open_shift.location_name ? ` · ${r.open_shift.location_name}` : ""}`);
  if (r.pending_incidents) lines.push(`Incidencias pendientes: ${r.pending_incidents}`);
  if (r.server_time) lines.push(`Hora actual: ${r.server_time}`);
  return lines.join("\n");
}

export const ERROR_TEXT: Record<string, string> = {
  already_working:
    "Ya tienes una entrada sin salida. Escribe la hora a la que saliste (p. ej. 18:30) o pulsa «No recuerdo la hora». El turno anterior queda pendiente para tu responsable.",
  not_working: "No tienes un turno abierto.",
  on_break: "Estás en pausa. Finaliza la pausa antes de salir.",
  not_on_break: "No estás en pausa.",
  breaks_disabled: "Las pausas no están activadas para ti.",
  wrong_location: "Tu turno abierto es en otro local. Ficha la salida allí.",
  no_location: "No tienes ningún local autorizado. Habla con tu responsable.",
  company_read_only: "La cuenta del negocio está en solo lectura. Usa el kiosco o habla con tu responsable.",
  location_required: "Elige el local:",
};

export const LINK_ERROR_TEXT: Record<string, string> = {
  not_found:
    "Este número no está dado de alta para fichar por WhatsApp. Pide a tu responsable que lo active. El kiosco sigue disponible.",
  invalid_code: "Código incorrecto o caducado.",
  invalid_pin: "PIN incorrecto.",
  use_code: "Este número está en varias empresas. Envía el código de 6 cifras que te dio tu responsable.",
  rate_limited: "Demasiados intentos. Espera unos minutos.",
  already_linked: "Este número ya está vinculado.",
  invalid_format: "Envía tu PIN de 4 cifras o el código de 6 cifras.",
};

export const UNLINKED_TEXT =
  "Para fichar por WhatsApp, envía tu PIN de 4 cifras o el código de vinculación de 6 cifras que te dio tu responsable. Fichar por WhatsApp es opcional: el kiosco sigue disponible.";
