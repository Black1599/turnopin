import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useCallback, useState } from "react";

import { selectClass } from "@/components/panel/EntryDialogs";
import { MonthlyReport, reportCsv } from "@/components/report/MonthlyReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, useCompany, useLocations, useWorkers, type EffectiveEntry } from "@/lib/company";
import { currentMonthMadrid, monthRange, workerName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/informes")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Informes mensuales · TurnoPIN" },
      { name: "description", content: "Informe mensual por trabajador o empresa en PDF y CSV." },
      { property: "og:title", content: "Informes mensuales · TurnoPIN" },
      { property: "og:description", content: "Valores efectivos con detalle de correcciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ReportsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const [month, setMonth] = useState(currentMonthMadrid());
  const [workerId, setWorkerId] = useState("");
  const [byLocation, setByLocation] = useState(false);
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);

  const entries = useQuery({
    queryKey: ["report", companyId, month, workerId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { start, end } = monthRange(month);
      let q = supabase
        .from("time_entries_effective")
        .select("*")
        .eq("company_id", companyId!)
        .gte("effective_work_date", start)
        .lte("effective_work_date", end)
        .order("effective_timestamp");
      if (workerId) q = q.eq("worker_id", workerId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EffectiveEntry[];
    },
  });

  const locName = useCallback(
    (id: string | null) => locations.find((l) => l.id === id)?.name ?? "—",
    [locations],
  );
  const list = entries.data ?? [];
  const reportWorkers = workers
    .filter((w) => (workerId ? w.id === workerId : w.status === "active" || list.some((e) => e.worker_id === w.id)))
    .map((w) => ({ id: w.id, name: workerName(w), dni_nie: w.dni_nie, naf: w.naf, break_paid: w.break_paid }));

  function downloadCsv() {
    if (!company) return;
    const csv = reportCsv(company, month, reportWorkers, list, locName);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `turnopin-${month}${workerId ? "-" + reportWorkers[0]?.name.replace(/\s+/g, "_") : "-empresa"}.csv`;
    a.click();
    void logAudit(company.id, "export_csv", "report", null, { month, worker_id: workerId || null });
  }

  function printPdf() {
    if (company) void logAudit(company.id, "export_pdf", "report", null, { month, worker_id: workerId || null });
    window.print();
  }

  return (
    <div className="space-y-6">
      <header className="no-print">
        <h1 className="text-2xl font-bold md:text-3xl">Informes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Informe mensual por trabajador o de toda la empresa, sumando todos los locales. Se genera bajo
          demanda con los valores efectivos y el detalle de cada corrección.
        </p>
      </header>

      <div className="no-print card-soft grid gap-3 p-4 sm:grid-cols-4">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-11" />
        <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">Toda la empresa</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {workerName(w)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={byLocation} onChange={(e) => setByLocation(e.target.checked)} />
          Desglose por local
        </label>
        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={printPdf}>
            <Printer className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button className="h-11 flex-1" variant="outline" onClick={downloadCsv}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
        </div>
      </div>
      <p className="no-print text-xs text-muted-foreground">
        «PDF» abre el diálogo de impresión: elige «Guardar como PDF».
      </p>

      {company && (
        <div className="card-soft p-5 md:p-8">
          <MonthlyReport
            company={company}
            month={month}
            workers={reportWorkers}
            entries={list}
            locName={locName}
            byLocation={byLocation}
          />
        </div>
      )}
    </div>
  );
}
