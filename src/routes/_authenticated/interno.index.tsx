import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { getIntegrationStatus } from "@/lib/platform-admin.functions";

export const Route = createFileRoute("/_authenticated/interno/")({
  component: InternalHome,
  head: () => ({
    meta: [
      { title: "Panel interno · TurnoPIN" },
      { name: "description", content: "Panel interno de operación de la plataforma TurnoPIN." },
      { property: "og:title", content: "Panel interno · TurnoPIN" },
      { property: "og:description", content: "Estado agregado de la plataforma TurnoPIN." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type Overview = Record<string, number> & { by_status: Record<string, number> };

const STATUS: Record<string, string> = {
  trialing: "En prueba",
  active: "Activas",
  past_due: "Pago pendiente",
  read_only: "Solo lectura",
  canceled: "Canceladas",
};

function InternalHome() {
  const integrations = useServerFn(getIntegrationStatus);
  const role = useQuery({
    queryKey: ["platform-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "platform_admin" });
      return Boolean(data);
    },
  });
  const ov = useQuery({
    queryKey: ["platform-overview"],
    enabled: role.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_overview");
      if (error) throw error;
      return data as unknown as Overview;
    },
  });
  const integ = useQuery({ queryKey: ["platform-integrations"], enabled: role.data === true, queryFn: () => integrations() });

  if (role.isLoading) return <main className="p-6">Cargando…</main>;
  if (!role.data)
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="mt-2 text-muted-foreground">Esta página es solo para el equipo interno de TurnoPIN.</p>
      </main>
    );

  const d = ov.data;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Interno · no visible para clientes</p>
        <h1 className="text-2xl font-semibold">Operación de la plataforma</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo datos agregados. Sin acceso a registros ni datos personales de empresas.
        </p>
      </header>

      {ov.error && <p className="text-destructive">{(ov.error as Error).message}</p>}
      {d && (
        <>
          <Section title="Empresas">
            <Kpi label="Clientes (sin demo)" value={d.companies_total} />
            <Kpi label="Piloto (sin facturación)" value={d.pilot_companies} />
            {Object.keys(STATUS).map((s) => (
              <Kpi key={s} label={STATUS[s]!} value={d.by_status[s] ?? 0} />
            ))}
            <Kpi label="Demo / pruebas" value={d.demo_companies} />
          </Section>
          <Section title="Uso">
            <Kpi label="Trabajadores activos" value={d.active_workers} />
            <Kpi label="Con WhatsApp activado" value={d.whatsapp_enabled_workers} />
            <Kpi label="Locales" value={d.locations} />
            <Kpi label="Kioscos activos" value={d.active_kiosks} />
            <Kpi label="Fichajes 24 h" value={d.entries_24h} />
            <Kpi label="Fichajes 30 días" value={d.entries_30d} />
            <Kpi label="Incidencias pendientes" value={d.pending_incidents} />
          </Section>
          <Section title="Salud técnica">
            <Kpi label="Emails en cola" value={d.outbox_pending} hint={integ.data?.email ? undefined : "Proveedor de email sin conectar"} />
            <Kpi label="Emails fallidos" value={d.outbox_failed} />
            <Kpi label="Eventos Stripe (7 días)" value={d.stripe_events_7d} />
            <Kpi label="Eventos Stripe sin procesar" value={d.stripe_events_unprocessed} />
            <Kpi label="Unidades facturables sin enviar" value={d.billable_unreported} />
            <Kpi label="Empresas con cliente Stripe" value={d.with_stripe_customer} />
          </Section>
        </>
      )}

      <Section title="Integraciones">
        <Kpi label="Stripe" value={integ.data ? (integ.data.stripe ? "Configurado" : "Pendiente") : "—"} />
        <Kpi label="Email" value={integ.data ? (integ.data.email ? "Configurado" : "Pendiente") : "—"} />
        <Kpi label="WhatsApp (Meta)" value={integ.data ? (integ.data.whatsapp ? "Configurado" : "Pendiente") : "—"} />
        <Kpi label="Soporte" value="Próximamente" hint="Sin acceso a datos de clientes" />
      </Section>

      <nav>
        <Link to="/interno/whatsapp" className="font-medium text-primary underline underline-offset-4">
          Uso y coste de WhatsApp →
        </Link>
      </nav>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
