import type { EffectiveEntry } from "@/lib/company";

/**
 * A shift built from effective (latest-correction) events.
 * TurnoPIN never invents hours: a shift without an exit is `incomplete`
 * and its duration is `null` (not 0).
 */
export type Shift = {
  start: EffectiveEntry;
  end: EffectiveEntry | null;
  /** Work date of the entry (a shift crossing midnight belongs to its start day). */
  workDate: string;
  locationId: string | null;
  grossMinutes: number | null;
  breakMinutes: number;
  /** Paid minutes (gross minus unpaid breaks). null when incomplete. */
  workedMinutes: number | null;
  incomplete: boolean;
  /** A break started but never ended inside this shift. */
  openBreak: boolean;
};

const ts = (e: EffectiveEntry) => new Date(e.effective_timestamp).getTime();

export function buildShifts(entries: EffectiveEntry[], breakPaid: boolean): Shift[] {
  const sorted = [...entries].sort((a, b) => ts(a) - ts(b));
  const shifts: Shift[] = [];
  let cur: { start: EffectiveEntry; breakMs: number; breakOpen: number | null } | null = null;

  const close = (end: EffectiveEntry | null) => {
    if (!cur) return;
    const breakMin = Math.round(cur.breakMs / 60000);
    const openBreak = cur.breakOpen !== null;
    let gross: number | null = null;
    let worked: number | null = null;
    if (end) {
      gross = Math.round((ts(end) - ts(cur.start)) / 60000);
      // An unclosed break has no end time: do not guess, count nothing extra.
      worked = Math.max(0, gross - (breakPaid ? 0 : breakMin));
    }
    shifts.push({
      start: cur.start,
      end,
      workDate: cur.start.effective_work_date,
      locationId: cur.start.effective_location_id,
      grossMinutes: gross,
      breakMinutes: breakMin,
      workedMinutes: worked,
      incomplete: end === null,
      openBreak,
    });
    cur = null;
  };

  for (const e of sorted) {
    if (e.type === "entry") {
      if (cur) close(null); // previous entry never got an exit
      cur = { start: e, breakMs: 0, breakOpen: null };
    } else if (e.type === "exit") {
      if (cur) {
        if (cur.breakOpen !== null) {
          // Exit during a break ends the break at the exit time.
          cur.breakMs += ts(e) - cur.breakOpen;
          cur.breakOpen = null;
        }
        close(e);
      }
    } else if (e.type === "break_start") {
      if (cur && cur.breakOpen === null) cur.breakOpen = ts(e);
    } else if (e.type === "break_end") {
      if (cur && cur.breakOpen !== null) {
        cur.breakMs += ts(e) - cur.breakOpen;
        cur.breakOpen = null;
      }
    }
  }
  if (cur) close(null);
  return shifts;
}

export function sumWorked(shifts: Shift[]) {
  return shifts.reduce((a, s) => a + (s.workedMinutes ?? 0), 0);
}

export function countIncomplete(shifts: Shift[]) {
  return shifts.filter((s) => s.incomplete).length;
}
