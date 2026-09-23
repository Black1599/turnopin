import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";

import { CorrectionDialog, ManualShiftDialog, selectClass } from "@/components/panel/EntryDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ENTRY_LABEL,
  useCompany,
  useLocations,
  useWorkers,
  type EffectiveEntry,
} from "@/lib/company";
import { formatDate, formatDateTime, formatShortDate, todayMadrid, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/registros")({
  component: RecordsPage,
  head: () => ({
    meta: [
      { title: "Registros de jornada · TurnoPIN" },
      { name: "description", content: "Consulta los fichajes por día, trabajador y local." },
      { property: "og:title", content: "Registros de jornada · TurnoPIN" },
      { property: "og:description", content: "Registros originales inmutables con correcciones visibles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RecordsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const [date, setDate] = useState(todayMadrid());
  const [workerId, setWorkerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [correcting, setCorrecting] = useState<EffectiveEntry | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);

  const entries = useQuery({
    queryKey: ["entries", companyId, date, workerId, locationId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      let q = supabase
        .from("time_entries_effective")
        .select("*")
        .eq("company_id", companyId!)
        .eq("effective_work_date", date)
        .order("effective_timestamp");
      if (workerId) q = q.eq("worker_id", workerId);
      if (locationId) q = q.eq("effective_location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as EffectiveEntry[];
    },
  });

  const wName = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerShortName(w) : "—";
  };
  const lName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Registros</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los fichajes originales nunca se modifican ni se borran. Pulsa uno para corregirlo.
          </p>
        </div>
        <Button className="h-11" variant="outline" onClick={() => setManualOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Turno manual
        </Button>
      </header>

      <div className="card-soft grid gap-3 p-4 sm:grid-cols-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          <option value="">Todos los trabajadores</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {workerShortName(w)}
            </option>
          ))}
        </select>
        <select className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Todos los locales</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <h2 className="text-sm font-semibold text-muted first-letter:uppercase-foreground">{formatDate(date)}</h2>

      {(entries.data ?? []).length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          No hay fichajes para este filtro.
        </div>
      ) : (
        <ol className="space-y-2">
          {entries.data!.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setCorrecting(e)}
                className={`card-soft flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-accent ${
                  e.is_corrected || e.is_manual ? "border-l-4 border-l-warning" : ""
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    {wName(e.worker_id)} · {ENTRY_LABEL[e.type]}
                    {e.is_manual && <Badge variant="outline">Manual</Badge>}
                    {e.is_corrected && <Badge variant="secondary">Corregido</Badge>}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {lName(e.effective_location_id)}
                    {e.is_corrected &&
                      ` · Original ${formatShortDate(e.original_work_date)} ${e.original_local_time} · ${e.correction_reason} (${formatDateTime(e.corrected_at!)})`}
                    {e.is_manual && ` · ${e.manual_reason} · creado ${formatDateTime(e.created_at)}`}
                  </div>
                </div>
                <span className="text-xl font-bold tabular-nums">{e.effective_local_time}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <CorrectionDialog
        entry={correcting}
        locations={locations}
        workerLabel={correcting ? wName(correcting.worker_id) : ""}
        onClose={() => setCorrecting(null)}
      />
      <ManualShiftDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        workers={workers.filter((w) => w.status === "active")}
        locations={locations.filter((l) => !l.archived_at)}
      />
    </div>
  );
}
