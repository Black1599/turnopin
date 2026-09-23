export const TZ = "Europe/Madrid";

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDate(value: string) {
  const date = value.length <= 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return `${formatShortDate(iso)} ${formatTime(iso)}`;
}

/** Today's date (YYYY-MM-DD) in Europe/Madrid. */
export function todayMadrid() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function currentMonthMadrid() {
  return todayMadrid().slice(0, 7);
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const label = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: TZ })
    .format(new Date(Number(y), Number(m) - 1, 15));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function workerName(w: {
  first_name: string;
  last_name: string;
  second_last_name?: string | null;
}) {
  return [w.first_name, w.last_name, w.second_last_name].filter(Boolean).join(" ");
}

export function workerShortName(w: { first_name: string; last_name: string }) {
  return `${w.first_name} ${w.last_name}`;
}

/** Sums worked minutes from an ordered list of entry/exit records. */
export function workedMinutes(entries: { type: string; server_timestamp: string }[]) {
  let total = 0;
  let open: number | null = null;
  for (const e of entries) {
    const t = new Date(e.server_timestamp).getTime();
    if (e.type === "entry") {
      open = t;
    } else if (open !== null) {
      total += (t - open) / 60000;
      open = null;
    }
  }
  return Math.round(total);
}

export function formatMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Converts a Madrid wall-clock date (YYYY-MM-DD) + time (HH:MM) into a UTC ISO string. */
export function madridToIso(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, h!, mi!);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (asUtc - guess)).toISOString();
}

/** Madrid date (YYYY-MM-DD) of an ISO timestamp. */
export function madridDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}
