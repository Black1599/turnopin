import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useCompany, useLocations, useWorkers } from "@/lib/company";
import { formatDateTime, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/correcciones")({
  component: CorrectionsPage,
  head: () => ({
    meta: [
      { title: "Historial de correcciones · TurnoPIN" },
      { name: "description", content: "Historial inalterable de correcciones con motivo, autor y fecha." },
      { property: "og:title", content: "Historial de correcciones · TurnoPIN" },
      { property: "og:description", content: "Cada corrección se añade; ninguna se edita ni se borra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CorrectionsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);

  const corrections = useQuery({
    queryKey: ["corrections", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corrections")
        .select("*, time_entries(type)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const manual = useQuery({
    queryKey: ["corrections", "manual", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries_effective")
        .select("id, worker_id, type, effective_timestamp, manual_reason, created_at, effective_location_id")
        .eq("company_id", companyId!)
        .eq("is_manual", true)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });

  const wName = (id: string | null) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerShortName(w) : "—";
  };
  const lName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Correcciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Para corregir un fichaje, ábrelo desde Registros. Aquí ves el historial completo: las
          correcciones no se editan ni se borran; si hay un error, se añade otra.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Correcciones</h2>
        {(corrections.data ?? []).length === 0 && (
          <div className="card-soft p-8 text-center text-sm text-muted-foreground">Sin correcciones.</div>
        )}
        {corrections.data?.map((c) => (
          <div key={c.id} className="card-soft p-4 text-sm">
            <div className="font-semibold">
              {wName(c.worker_id)} · {formatDateTime(c.original_timestamp)} → {formatDateTime(c.corrected_timestamp)}
            </div>
            <div className="mt-1 text-muted-foreground">
              {c.reason}
              {c.corrected_location_id ? ` · ${lName(c.corrected_location_id)}` : ""} · registrada{" "}
              {formatDateTime(c.created_at)}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Registros añadidos manualmente</h2>
        {(manual.data ?? []).length === 0 && (
          <div className="card-soft p-8 text-center text-sm text-muted-foreground">Ninguno.</div>
        )}
        {manual.data?.map((m) => (
          <div key={m.id} className="card-soft p-4 text-sm">
            <div className="font-semibold">
              {wName(m.worker_id)} · {m.type === "entry" ? "Entrada" : m.type === "exit" ? "Salida" : m.type} ·{" "}
              {formatDateTime(m.effective_timestamp!)}
            </div>
            <div className="mt-1 text-muted-foreground">
              {m.manual_reason} · {lName(m.effective_location_id)} · creado {formatDateTime(m.created_at!)}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
