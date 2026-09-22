import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, type TimeEntry, type Worker } from "@/lib/company";
import {
  currentMonthMadrid,
  formatMinutes,
  formatShortDate,
  monthLabel,
  monthRange,
  workedMinutes,
  workerName,
} from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/informes")({
  component: ReportsPage,
  head: () => ({
    meta: [
      { title: "Informes mensuales · TurnoPIN" },
      {
        name: "description",
        content: "Resumen mensual imprimible por empleado y descarga en CSV de los fichajes.",
      },
      { property: "og:title", content: "Informes mensuales · TurnoPIN" },
      {
        property: "og:description",
        content: "Genera el resumen mensual de horas y expórtalo en CSV.",
      },
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

  const workersQuery = useQuery({
    queryKey: ["workers", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("company_id", companyId!)
        .order("first_name");
      if (error) throw error;
      return data as Worker[];
    },
  });

  const { start, end } = monthRange(month);

  const entriesQuery = useQuery({
    queryKey: ["report", companyId, month, workerId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      let query = supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", companyId!)
        .gte("work_date", start)
        .lte("work_date", end)
        .order("server_timestamp");
      if (workerId) query = query.eq("worker_id", workerId);
      const { data, error } = await query;
      if (error) throw error;
      return data as TimeEntry[];
    },
  });

  const workers = workersQuery.data ?? [];
  const entries = entriesQuery.data ?? [];
  const nameOf = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerName(w) : "Empleado";
  };

  const byWorkerDay = new Map<string, TimeEntry[]>();
  for (const e of entries) {
    const key = `${e.worker_id}|${e.work_date}`;
    byWorkerDay.set(key, [...(byWorkerDay.get(key) ?? []), e]);
  }
  const rows = [...byWorkerDay.entries()]
    .map(([key, list]) => {
      const [wId, day] = key.split("|");
      return { workerId: wId!, day: day!, list, minutes: workedMinutes(list) };
    })
    .sort((a, b) => (a.day === b.day ? nameOf(a.workerId).localeCompare(nameOf(b.workerId)) : a.day.localeCompare(b.day)));

  const totalMinutes = rows.reduce((acc, r) => acc + r.minutes, 0);

  function exportCsv() {
    if (entries.length === 0) {
      toast.error("No hay fichajes para exportar en este periodo.");
      return;
    }
    const header = [
      "empresa",
      "cif",
      "empleado",
      "fecha",
      "tipo",
      "hora_local",
      "marca_servidor_utc",
      "corregido",
    ];
    const lines = entries.map((e) =>
      [
        company?.legal_name ?? "",
        company?.tax_id ?? "",
        nameOf(e.worker_id),
        e.work_date,
        e.type === "entry" ? "entrada" : "salida",
        e.local_time,
        e.server_timestamp,
        e.corrected ? "si" : "no",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = `\ufeff${header.join(";")}\n${lines.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `turnopin-${month}${workerId ? "-empleado" : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descargado.");
  }

  return (
    <div className="space-y-6">
      <header className="no-print">
        <h1 className="text-2xl font-bold md:text-3xl">Informes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen mensual por empleado, listo para imprimir o guardar como PDF.
        </p>
      </header>

      <div className="no-print card-soft grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="mes">Mes</Label>
          <Input
            id="mes"
            type="month"
            className="h-11"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="empleado">Empleado</Label>
          <select
            id="empleado"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={workerId}
            onChange={(e) => setWorkerId(e.target.value)}
          >
            <option value="">Todos</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {workerName(w)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" /> Descargar CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / guardar PDF
          </Button>
        </div>
      </div>

      <section className="card-soft p-5 md:p-6">
        <div>
          <h2 className="text-lg font-bold">{company?.legal_name}</h2>
          <p className="text-sm text-muted-foreground">
            Resumen de {monthLabel(month)}
            {workerId ? ` · ${nameOf(workerId)}` : " · todos los empleados"}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No hay fichajes en este periodo.</p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Empleado</th>
                  <th className="py-2 pr-4 font-medium">Marcajes</th>
                  <th className="py-2 pr-4 font-medium">Horas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.workerId}-${r.day}`} className="border-b last:border-0">
                    <td className="py-2 pr-4 tabular-nums">{formatShortDate(r.day)}</td>
                    <td className="py-2 pr-4">{nameOf(r.workerId)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {r.list
                        .map(
                          (e) =>
                            `${e.type === "entry" ? "E" : "S"} ${e.local_time}${e.corrected ? "*" : ""}`,
                        )
                        .join(" · ")}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatMinutes(r.minutes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="py-3" colSpan={3}>
                    Total del periodo
                  </td>
                  <td className="py-3 tabular-nums">{formatMinutes(totalMinutes)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              * Marcaje corregido por la empresa. El valor original se conserva en el historial de
              correcciones.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
