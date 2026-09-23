import { useEffect, useState } from "react";

import { ENTRY_LABEL, effectiveMinutes, type EffectiveEntry } from "@/lib/company";
import { formatDateTime, formatMinutes, formatShortDate, monthLabel } from "@/lib/fmt";

export type ReportWorker = {
  id: string;
  name: string;
  dni_nie?: string | null;
  naf?: string | null;
  break_paid: boolean;
};

export type ReportCompany = { legal_name: string; tax_id?: string | null; ccc?: string | null };

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function reportCsv(
  company: ReportCompany,
  month: string,
  workers: ReportWorker[],
  entries: EffectiveEntry[],
  locName: (id: string | null) => string,
) {
  const rows = [
    [
      "empresa", "nif", "trabajador", "dni_nie", "fecha", "tipo", "hora_efectiva", "local",
      "utc_efectivo", "utc_original", "hora_original", "corregido", "manual", "motivo", "fecha_correccion",
    ],
  ];
  for (const w of workers)
    for (const e of entries.filter((x) => x.worker_id === w.id))
      rows.push([
        company.legal_name, company.tax_id ?? "", w.name, w.dni_nie ?? "", e.effective_work_date,
        ENTRY_LABEL[e.type] ?? e.type, e.effective_local_time, locName(e.effective_location_id),
        e.effective_timestamp, e.original_timestamp, e.original_local_time, e.is_corrected ? "si" : "no",
        e.is_manual ? "si" : "no", e.correction_reason ?? e.manual_reason ?? "", e.corrected_at ?? "",
      ]);
  return `# TurnoPIN · ${month}\n` + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
}

export function MonthlyReport({
  company,
  month,
  workers,
  entries,
  locName,
  byLocation,
}: {
  company: ReportCompany;
  month: string;
  workers: ReportWorker[];
  entries: EffectiveEntry[];
  locName: (id: string | null) => string;
  byLocation: boolean;
}) {
  const [hash, setHash] = useState("");
  const [exportId] = useState(() => crypto.randomUUID().slice(0, 8).toUpperCase());

  useEffect(() => {
    void sha256(reportCsv(company, month, workers, entries, locName)).then(setHash);
  }, [company, month, workers, entries, locName]);

  let companyTotal = 0;

  return (
    <div className="print-area space-y-8 bg-background">
      <div className="border-b pb-4">
        <h2 className="text-xl font-bold">Registro de jornada · {monthLabel(month)}</h2>
        <div className="mt-1 text-sm text-muted-foreground">
          {company.legal_name}
          {company.tax_id ? ` · NIF ${company.tax_id}` : ""}
          {company.ccc ? ` · CCC ${company.ccc}` : ""}
        </div>
      </div>

      {workers.map((w) => {
        const list = entries.filter((e) => e.worker_id === w.id);
        const days = Array.from(new Set(list.map((e) => e.effective_work_date))).sort();
        const total = effectiveMinutes(list, w.break_paid);
        companyTotal += total;
        const locs = Array.from(new Set(list.map((e) => e.effective_location_id)));
        return (
          <section key={w.id} className="break-inside-avoid space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-bold">
                {w.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {w.dni_nie ? `DNI/NIE ${w.dni_nie}` : ""} {w.naf ? `· NAF ${w.naf}` : ""}
                </span>
              </h3>
              <span className="text-sm font-semibold">Total: {formatMinutes(total)}</span>
            </div>
            {byLocation && locs.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {locs
                  .map((l) => `${locName(l)}: ${formatMinutes(effectiveMinutes(list.filter((e) => e.effective_location_id === l), w.break_paid))}`)
                  .join(" · ")}
              </div>
            )}
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin fichajes este mes.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1">Día</th>
                    <th>Registros (hora efectiva)</th>
                    <th className="text-right">Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const dayList = list.filter((e) => e.effective_work_date === d);
                    return (
                      <tr key={d} className="border-b align-top">
                        <td className="py-1.5 pr-3 tabular-nums">{formatShortDate(d)}</td>
                        <td className="py-1.5">
                          {dayList.map((e) => (
                            <div key={e.id}>
                              {ENTRY_LABEL[e.type]} {e.effective_local_time}
                              {byLocation ? ` · ${locName(e.effective_location_id)}` : ""}
                              {e.is_corrected && (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  (corregido; original {formatShortDate(e.original_work_date)} {e.original_local_time}; {e.correction_reason}; {formatDateTime(e.corrected_at!)})
                                </span>
                              )}
                              {e.is_manual && (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  (añadido manualmente; {e.manual_reason}; {formatDateTime(e.created_at)})
                                </span>
                              )}
                            </div>
                          ))}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMinutes(effectiveMinutes(dayList, w.break_paid))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      {workers.length > 1 && (
        <div className="border-t pt-3 text-right font-semibold">Total empresa: {formatMinutes(companyTotal)}</div>
      )}

      <footer className="border-t pt-3 text-[11px] text-muted-foreground">
        Generado con TurnoPIN el {formatDateTime(new Date().toISOString())} (hora de Madrid). Export {exportId} ·
        SHA-256 {hash.slice(0, 32)}… Los horarios se muestran en Europe/Madrid; los originales se conservan en UTC.
        Este documento refleja la base de datos en el momento de generarlo; la base de datos es la fuente de verdad.
      </footer>
    </div>
  );
}
