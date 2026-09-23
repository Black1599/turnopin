import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, UserCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, useLocations, usePendingIncidents, useWorkers, type EffectiveEntry } from "@/lib/company";
import { formatDate, formatShortDate, todayMadrid, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/")({
  component: OverviewPage,
  head: () => ({
    meta: [
      { title: "Resumen del día · TurnoPIN" },
      { name: "description", content: "Quién está trabajando, fichajes de hoy e incidencias pendientes." },
      { property: "og:title", content: "Resumen del día · TurnoPIN" },
      { property: "og:description", content: "Panel de control horario de tu negocio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function OverviewPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);
  const pending = usePendingIncidents(companyId).data ?? 0;

  const recent = useQuery({
    queryKey: ["entries", "overview", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries_effective")
        .select("*")
        .eq("company_id", companyId!)
        .gte("effective_timestamp", new Date(Date.now() - 3 * 86400000).toISOString())
        .order("effective_timestamp", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as EffectiveEntry[];
    },
  });

  const today = todayMadrid();
  const list = recent.data ?? [];
  const active = workers.filter((w) => w.status === "active");
  const latest = new Map<string, EffectiveEntry>();
  for (const e of list) if (!latest.has(e.worker_id)) latest.set(e.worker_id, e);
  const working = active
    .map((w) => ({ w, e: latest.get(w.id) }))
    .filter((x) => x.e && x.e.type !== "exit");
  const todayCount = list.filter((e) => e.effective_work_date === today).length;
  const lName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";
  const trialDays = company ? Math.ceil((new Date(company.trial_ends_at).getTime() - Date.now()) / 86400000) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Resumen</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{formatDate(today)}</p>
      </header>

      {company?.subscription_status === "trialing" && !company.is_demo && (
        <div className="rounded-lg bg-accent p-4 text-sm text-accent-foreground">
          Prueba gratuita: {trialDays > 0 ? `quedan ${trialDays} días` : "terminada"} (hasta{" "}
          {formatShortDate(company.trial_ends_at)}). Durante la prueba no se cobra ningún trabajador.
        </div>
      )}

      <Link
        to="/panel/incidencias"
        className={`card-soft flex items-center justify-between p-5 ${pending > 0 ? "border-2 border-warning" : ""}`}
      >
        <span className="flex items-center gap-3">
          <AlertTriangle className={`h-6 w-6 ${pending > 0 ? "text-warning" : "text-muted-foreground"}`} />
          <span>
            <span className="block text-3xl font-extrabold">{pending}</span>
            <span className="text-sm text-muted-foreground">incidencias pendientes</span>
          </span>
        </span>
        <span className="text-sm font-medium text-primary">Ver →</span>
      </Link>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Trabajadores activos" value={active.length} />
        <Stat icon={UserCheck} label="Trabajando ahora" value={working.length} />
        <Stat icon={UserCheck} label="Fichajes hoy" value={todayCount} />
      </div>

      <section className="card-soft p-5">
        <h2 className="font-semibold">Trabajando ahora</h2>
        {working.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nadie tiene una entrada abierta.</p>
        ) : (
          <ul className="mt-3 divide-y">
            {working.map(({ w, e }) => (
              <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{workerShortName(w)}</span>
                <span className="text-muted-foreground">
                  {e!.type === "break_start" ? "En pausa" : "Desde"} {e!.effective_local_time}
                  {e!.effective_work_date !== today ? ` (${formatShortDate(e!.effective_work_date)})` : ""} ·{" "}
                  {lName(e!.effective_location_id)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/panel/locales">Enlaces de kiosco</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/panel/informes">Informe del mes</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="card-soft p-5">
      <Icon className="h-5 w-5 text-primary" />
      <div className="mt-3 text-3xl font-extrabold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
