import { describe, expect, it } from "vitest";

import type { EffectiveEntry } from "@/lib/company";
import { buildShifts, countIncomplete, sumWorked } from "@/lib/shifts";

let n = 0;
function ev(type: EffectiveEntry["type"], iso: string, date: string, loc = "A", extra: Partial<EffectiveEntry> = {}): EffectiveEntry {
  n++;
  return {
    id: String(n), company_id: "c", worker_id: "w", type, is_manual: false, manual_reason: null,
    original_timestamp: iso, original_local_time: "", original_work_date: date, original_location_id: loc,
    effective_timestamp: iso, effective_work_date: date, effective_local_time: "", effective_location_id: loc,
    is_corrected: false, correction_reason: null, correction_reason_code: null, corrected_at: null, created_at: "",
    ...extra,
  };
}

describe("buildShifts", () => {
  const withBreak = [
    ev("entry", "2026-09-01T08:00:00Z", "2026-09-01"),
    ev("break_start", "2026-09-01T11:00:00Z", "2026-09-01"),
    ev("break_end", "2026-09-01T11:30:00Z", "2026-09-01"),
    ev("exit", "2026-09-01T16:00:00Z", "2026-09-01"),
  ];

  it("subtracts unpaid breaks", () => {
    const s = buildShifts(withBreak, false);
    expect(s).toHaveLength(1);
    expect(s[0]!.workedMinutes).toBe(450);
    expect(s[0]!.breakMinutes).toBe(30);
  });

  it("keeps paid breaks as worked time", () => {
    expect(sumWorked(buildShifts(withBreak, true))).toBe(480);
  });

  it("keeps a cross-midnight shift continuous on its start day", () => {
    const s = buildShifts(
      [ev("exit", "2026-09-02T02:00:00Z", "2026-09-02"), ev("entry", "2026-09-01T20:00:00Z", "2026-09-01")],
      false,
    );
    expect(s).toHaveLength(1);
    expect(s[0]!.workDate).toBe("2026-09-01");
    expect(s[0]!.workedMinutes).toBe(360);
  });

  it("handles multiple shifts per day", () => {
    const s = buildShifts(
      [
        ev("entry", "2026-09-01T08:00:00Z", "2026-09-01"),
        ev("exit", "2026-09-01T12:00:00Z", "2026-09-01"),
        ev("entry", "2026-09-01T18:00:00Z", "2026-09-01"),
        ev("exit", "2026-09-01T22:00:00Z", "2026-09-01"),
      ],
      false,
    );
    expect(s).toHaveLength(2);
    expect(sumWorked(s)).toBe(480);
  });

  it("uses corrected (effective) timestamps", () => {
    const s = buildShifts(
      [
        ev("entry", "2026-09-01T08:00:00Z", "2026-09-01"),
        ev("exit", "2026-09-01T15:00:00Z", "2026-09-01", "A", {
          original_timestamp: "2026-09-01T23:00:00Z",
          is_corrected: true,
        }),
      ],
      false,
    );
    expect(s[0]!.workedMinutes).toBe(420);
  });

  it("marks missing exits as incomplete, never 0 h, and never invents hours", () => {
    const s = buildShifts(
      [
        ev("entry", "2026-09-01T08:00:00Z", "2026-09-01"),
        ev("entry", "2026-09-02T08:00:00Z", "2026-09-02"),
        ev("exit", "2026-09-02T12:00:00Z", "2026-09-02"),
      ],
      false,
    );
    expect(s).toHaveLength(2);
    expect(s[0]!.incomplete).toBe(true);
    expect(s[0]!.workedMinutes).toBeNull();
    expect(countIncomplete(s)).toBe(1);
    expect(sumWorked(s)).toBe(240);
  });

  it("flags an unclosed break without subtracting a guessed duration", () => {
    const s = buildShifts(
      [
        ev("entry", "2026-09-01T08:00:00Z", "2026-09-01"),
        ev("break_start", "2026-09-01T10:00:00Z", "2026-09-01"),
        ev("exit", "2026-09-01T12:00:00Z", "2026-09-01"),
      ],
      false,
    );
    // Exit during a break closes the break at exit time.
    expect(s[0]!.workedMinutes).toBe(120);
  });

  it("ignores stray breaks outside a shift", () => {
    const s = buildShifts(
      [ev("break_start", "2026-09-01T07:00:00Z", "2026-09-01"), ev("break_end", "2026-09-01T07:30:00Z", "2026-09-01")],
      false,
    );
    expect(s).toHaveLength(0);
  });
});
