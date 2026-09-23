import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { reconcileWhatsApp } from "@/lib/whatsapp-admin.functions";

export const Route = createFileRoute("/_authenticated/interno/whatsapp")({
  component: InternalWhatsApp,
  head: () => ({
    meta: [
      { title: "Uso de WhatsApp (interno) · TurnoPIN" },
      { name: "description", content: "Panel interno de consumo y coste estimado de WhatsApp." },
      { property: "og:title", content: "Uso de WhatsApp (interno) · TurnoPIN" },
      { property: "og:description", content: "Consumo real de mensajes y coste estimado por empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type CostRow = { currency: string; messages: number; gross: number; allowance_deduction: number; net: number };
type Dash = {
  linked_workers: number;
  active_workers: number;
  inbound: number;
  inbound_unlinked: number;
  outbound: number;
  delivered: number;
  failed: number;
  successful_actions: number;
  actions_without_reply: number;
  top_companies: { company_id: string; name: string; messages: number }[];
  by_month: { month: string; inbound: number; outbound: number }[];
  cost: {
    billable_delivered: number;
    unpriced_messages: number;
    account: CostRow[];
    by_month: { month: string; currency: string; gross: number; messages: number }[];
    companies: { company_id: string; currency: string; messages: number; attributed_gross: number }[];
    attribution_note: string;
  };
};

const money = (n: number, c: string) => `${Number(n).toFixed(4)} ${c}`;

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function InternalWhatsApp() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [company, setCompany] = useState("");
  const reconcile = useServerFn(reconcileWhatsApp);

  const role = useQuery({
    queryKey: ["platform-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "platform_admin" });
      return Boolean(data);
    },
  });

  const dash = useQuery({
    queryKey: ["wa-dash", from, to, company],
    enabled: role.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("whatsapp_dashboard", {
        p_from: from,
        p_to: to,
        ...(company ? { p_company_id: company } : {}),
      });
      if (error) throw error;
      return data as unknown as Dash;
    },
  });

  const rates = useQuery({
    queryKey: ["wa-rates"],
    enabled: role.data === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("whatsapp_rates").select("*").order("effective_from", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const recons = useQuery({
    queryKey: ["wa-recons"],
    enabled: role.data === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_reconciliations")
        .select("*")
        .order("reconciled_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const [rate, setRate] = useState({ market: "ES", category: "utility", unit_cost: "", currency: "EUR", effective_from: monthStart() });
  const addRate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("whatsapp_rates").insert({
        market: rate.market.trim().toUpperCase() || "*",
        category: rate.category.trim(),
        unit_cost: Number(rate.unit_cost),
        currency: rate.currency.trim().toUpperCase(),
        effective_from: `${rate.effective_from}T00:00:00+00:00`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarifa añadida");
      qc.invalidateQueries({ queryKey: ["wa-rates"] });
      qc.invalidateQueries({ queryKey: ["wa-dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runRecon = useMutation({
    mutationFn: () => reconcile({ data: { from, to } }),
    onSuccess: (r) => {
      if (r.status === "unavailable") toast.info("Conciliación con Meta no disponible: faltan credenciales.");
      else if (r.status === "error") toast.error("Meta devolvió un error. Guardado en el historial.");
      else toast.success("Conciliación guardada");
      qc.invalidateQueries({ queryKey: ["wa-recons"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role.isLoading) return <main className="p-6">Cargando…</main>;
  if (!role.data)
    return (
      <main className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="mt-2 text-muted-foreground">Esta página es solo para el equipo interno de TurnoPIN.</p>
      </main>
    );

  const d = dash.data;
  const acct = d?.cost.account[0];
  const perWorker = acct && d.active_workers ? acct.net / d.active_workers : null;
  const ratio = d && d.successful_actions ? d.outbound / d.successful_actions : null;

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Interno · no visible para clientes</p>
        <h1 className="text-2xl font-semibold">Uso y coste estimado de WhatsApp</h1>
      </header>

      <section className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="f">Desde</Label>
          <Input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t">Hasta</Label>
          <Input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="c">Empresa</Label>
          <select
            id="c"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">Todas</option>
            {d?.top_companies.map((c) => (
              <option key={c.company_id} value={c.company_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {dash.error && <p className="text-destructive">{(dash.error as Error).message}</p>}
      {d && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Trabajadores vinculados" value={d.linked_workers} />
            <Kpi label="Activos en el periodo" value={d.active_workers} />
            <Kpi label="Entrantes" value={d.inbound} hint={`${d.inbound_unlinked} de números no vinculados`} />
            <Kpi label="Salientes" value={d.outbound} />
            <Kpi label="Entregados" value={d.delivered} />
            <Kpi label="Fallidos" value={d.failed} />
            <Kpi
              label="Mensajes por trabajador activo"
              value={d.active_workers ? ((d.inbound + d.outbound) / d.active_workers).toFixed(1) : "—"}
            />
            <Kpi label="Salientes por fichaje correcto" value={ratio == null ? "—" : ratio.toFixed(2)} />
            <Kpi
              label="Fichajes sin confirmación enviada"
              value={d.actions_without_reply}
              hint={`de ${d.successful_actions} fichajes correctos`}
            />
            <Kpi label="Coste estimado (cuenta)" value={acct ? money(acct.net, acct.currency) : "—"} hint={acct && acct.allowance_deduction > 0 ? `tras franquicia de ${money(acct.allowance_deduction, acct.currency)}` : undefined} />
            <Kpi label="Coste por trabajador activo" value={perWorker == null || !acct ? "—" : money(perWorker, acct.currency)} />
            <Kpi label="Entregados sin tarifa" value={d.cost.unpriced_messages} hint="Añade tarifa para estimarlos" />
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="mb-2 font-semibold">Empresas con más mensajes</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th>Empresa</th><th className="text-right">Mensajes</th><th className="text-right">Coste atribuido*</th></tr>
                </thead>
                <tbody>
                  {d.top_companies.map((c) => {
                    const cost = d.cost.companies.find((x) => x.company_id === c.company_id);
                    return (
                      <tr key={c.company_id} className="border-t">
                        <td className="py-1">{c.name}</td>
                        <td className="text-right">{c.messages}</td>
                        <td className="text-right">{cost ? money(cost.attributed_gross, cost.currency) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">* Estimación bruta antes de franquicias de la cuenta; no es un importe exacto por empresa.</p>
            </div>
            <div>
              <h2 className="mb-2 font-semibold">Evolución mensual</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th>Mes</th><th className="text-right">Entrantes</th><th className="text-right">Salientes</th><th className="text-right">Coste bruto</th></tr>
                </thead>
                <tbody>
                  {d.by_month.map((m) => {
                    const c = d.cost.by_month.find((x) => x.month === m.month);
                    return (
                      <tr key={m.month} className="border-t">
                        <td className="py-1">{m.month.slice(0, 7)}</td>
                        <td className="text-right">{m.inbound}</td>
                        <td className="text-right">{m.outbound}</td>
                        <td className="text-right">{c ? money(c.gross, c.currency) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Tarifas configurables (con fecha de vigencia)</h2>
        <p className="text-sm text-muted-foreground">
          Introduce las tarifas publicadas por Meta. No hay precios fijados en el código; cambia una tarifa cerrando la anterior y añadiendo otra.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Mercado" value={rate.market} onChange={(v) => setRate({ ...rate, market: v })} />
          <Field label="Categoría" value={rate.category} onChange={(v) => setRate({ ...rate, category: v })} />
          <Field label="Coste unitario" value={rate.unit_cost} onChange={(v) => setRate({ ...rate, unit_cost: v })} />
          <Field label="Moneda" value={rate.currency} onChange={(v) => setRate({ ...rate, currency: v })} />
          <Field label="Desde" type="date" value={rate.effective_from} onChange={(v) => setRate({ ...rate, effective_from: v })} />
          <Button onClick={() => addRate.mutate()} disabled={!rate.unit_cost || addRate.isPending}>Añadir</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Mercado</th><th>Categoría</th><th>Desde</th><th>Hasta</th><th className="text-right">Coste</th></tr>
          </thead>
          <tbody>
            {rates.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.market}</td>
                <td>{r.category}</td>
                <td>{r.effective_from.slice(0, 10)}</td>
                <td>{r.effective_to?.slice(0, 10) ?? "vigente"}</td>
                <td className="text-right">{money(Number(r.unit_cost), r.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Conciliación con Meta</h2>
        <Button variant="outline" onClick={() => runRecon.mutate()} disabled={runRecon.isPending}>
          Conciliar periodo seleccionado
        </Button>
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>Periodo</th><th>Estado</th><th className="text-right">Meta (msgs / gasto)</th><th className="text-right">Interno</th><th className="text-right">Diferencia</th></tr>
          </thead>
          <tbody>
            {recons.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1">{r.period_start} → {r.period_end}</td>
                <td>{r.status === "unavailable" ? "Conciliación con Meta no disponible" : r.status === "ok" ? "Conciliado" : "Error"}</td>
                <td className="text-right">{r.status === "ok" ? `${r.provider_total_messages} / ${r.provider_reported_spend}` : "—"}</td>
                <td className="text-right">{r.internal_messages} / {Number(r.internal_estimated_total ?? 0).toFixed(4)}</td>
                <td className="text-right">{r.variance ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
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

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input className="w-32" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
