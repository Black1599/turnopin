import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, UserCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, type TimeEntry, type Worker } from "@/lib/company";
import { formatDate, todayMadrid, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;

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

  const todayQuery = useQuery({
    queryKey: ["entries-today", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", companyId!)
        .eq("work_date", todayMadrid())
        .order("server_timestamp");
      if (error) throw error;
      return data as TimeEntry[];
    },
  });

  const lastQuery = useQuery({
    queryKey: ["entries-last", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", companyId!)
        .order("server_timestamp", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data as TimeEntry[];
    },
  });

  const activeWorkers = (workersQuery.data ?? []).filter((w) => w.status === "active");
  const latestByWorker = new Map<string, TimeEntry>();
  for (const e of lastQuery.data ?? []) {
    if (!latestByWorker.has(e.worker_id)) latestByWorker.set(e.worker_id, e);
  }
  const working = activeWorkers.filter((w) => latestByWorker.get(w.id)?.type === "entry");
  const anomalies = (todayQuery.data ?? []).filter((e) => e.corrected).length;

  const kioskUrl =
    typeof window !== "undefined" && companyId
      ? `${window.location.origin}/kiosco/${companyId}`
      : "";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Resumen</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{formatDate(todayMadrid())}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Users} label="Empleados activos" value={activeWorkers.length} />
        <Stat icon={UserCheck} label="Trabajando ahora" value={working.length} />
        <Stat icon={ExternalLink} label="Fichajes de hoy" value={(todayQuery.data ?? []).length} />
        <Stat icon={AlertTriangle} label="Incidencias por revisar" value={anomalies} />
      </div>

      <section className="card-soft p-6">
        <h2 className="font-semibold">Trabajando ahora</h2>
        {working.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nadie tiene una entrada abierta.</p>
        ) : (
          <ul className="mt-4 divide-y">
            {working.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-3 text-sm">
                <span className="font-medium">{workerShortName(w)}</span>
                <span className="tabular-nums text-muted-foreground">
                  desde {latestByWorker.get(w.id)?.local_time}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-soft p-6">
        <h2 className="font-semibold">Pantalla de fichaje</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Abre esta dirección en la tablet del local y guárdala en la pantalla de inicio.
        </p>
        <code className="mt-3 block overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs">
          {kioskUrl}
        </code>
        <div className="mt-4 flex flex-wrap gap-2">
          {companyId && (
            <Button asChild>
              <Link to="/kiosco/$companyId" params={{ companyId }} target="_blank">
                Abrir kiosco
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/panel/empleados">Gestionar empleados</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <div className="card-soft p-5">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-3 text-3xl font-extrabold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
