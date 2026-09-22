import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, type TimeEntry, type Worker } from "@/lib/company";
import { formatDate, formatTime, todayMadrid, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/registros")({
  component: RecordsPage,
  head: () => ({
    meta: [
      { title: "Registros de fichaje · TurnoPIN" },
      {
        name: "description",
        content: "Consulta los fichajes de tu equipo por día y empleado en TurnoPIN.",
      },
      { property: "og:title", content: "Registros de fichaje · TurnoPIN" },
      {
        property: "og:description",
        content: "Historial cronológico de entradas y salidas de tu negocio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export type EntryRow = TimeEntry & {
  original_server_timestamp: string | null;
  original_local_time: string | null;
};

function RecordsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const [date, setDate] = useState(todayMadrid());
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

  const entriesQuery = useQuery({
    queryKey: ["entries", companyId, date, workerId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      let query = supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", companyId!)
        .eq("work_date", date)
        .order("server_timestamp");
      if (workerId) query = query.eq("worker_id", workerId);
      const { data, error } = await query;
      if (error) throw error;
      return data as EntryRow[];
    },
  });

  const workers = workersQuery.data ?? [];
  const nameOf = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerShortName(w) : "Empleado";
  };
  const entries = entriesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Registros</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los fichajes no se pueden borrar. Las correcciones quedan siempre visibles.
        </p>
      </header>

      <div className="card-soft grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="fecha">Fecha</Label>
          <Input
            id="fecha"
            type="date"
            className="h-11"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
                {workerShortName(w)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="card-soft p-5 md:p-6">
        <h2 className="font-semibold capitalize">{formatDate(date)}</h2>
        {entriesQuery.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Cargando fichajes…</p>
        ) : entries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay fichajes registrados con estos filtros.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      e.type === "entry" ? "bg-primary" : "bg-muted-foreground"
                    }`}
                  />
                  <div>
                    <div className="font-medium">{nameOf(e.worker_id)}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.type === "entry" ? "Entrada" : "Salida"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums">{e.local_time}</div>
                  {e.corrected && (
                    <div className="mt-1 text-xs text-warning-foreground">
                      Corregido
                      {e.original_server_timestamp
                        ? ` · original ${formatTime(e.original_server_timestamp)}`
                        : ""}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
