import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { companyQueryKey, logAudit, rpcErrorMessage, useCompany, useWorkers } from "@/lib/company";
import { formatShortDate } from "@/lib/fmt";
import { createCheckout, createPortal } from "@/lib/billing.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/panel/ajustes")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Ajustes del negocio · TurnoPIN" },
      { name: "description", content: "Datos fiscales, facturación y conservación de datos en TurnoPIN." },
      { property: "og:title", content: "Ajustes del negocio · TurnoPIN" },
      { property: "og:description", content: "Datos del negocio y estado de la suscripción." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const FIELDS = [
  ["legal_name", "Razón social / nombre fiscal *", true],
  ["tax_id", "NIF / CIF *", true],
  ["fiscal_address", "Dirección fiscal *", true],
  ["country", "País *", true],
  ["billing_email", "Email de facturación *", true],
  ["commercial_name", "Nombre comercial (kiosco)", false],
  ["ccc", "CCC (opcional)", false],
] as const;

type Key = (typeof FIELDS)[number][0];

function SettingsPage() {
  const { data: company } = useCompany();
  const qc = useQueryClient();
  const { data: workers = [] } = useWorkers(company?.id);
  const [form, setForm] = useState<Record<Key, string>>({} as Record<Key, string>);
  const [saving, setSaving] = useState(false);

  const outbox = useQuery({
    queryKey: ["outbox", company?.id],
    enabled: Boolean(company?.id),
    queryFn: async () => {
      const { count } = await supabase
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company!.id)
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!company) return;
    setForm(Object.fromEntries(FIELDS.map(([k]) => [k, (company[k] as string | null) ?? ""])) as Record<Key, string>);
  }, [company]);

  const checkout = useServerFn(createCheckout);
  const portal = useServerFn(createPortal);
  async function openBilling(kind: "checkout" | "portal") {
    try {
      const r = kind === "checkout" ? await checkout() : await portal();
      if ("url" in r) window.location.href = r.url;
      else if (r.error === "not_configured")
        toast.info("El pago aún no está activado. Escríbenos a soporte@turnopin.es si lo necesitas ya.");
      else toast.error("No se ha podido abrir el pago.");
    } catch {
      toast.error("No se ha podido abrir el pago.");
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    try {
      const payload = Object.fromEntries(FIELDS.map(([k, , req]) => [k, req ? form[k].trim() : form[k].trim() || null]));
      const { error } = await supabase.from("companies").update(payload as never).eq("id", company.id);
      if (error) throw error;
      await logAudit(company.id, "update_company", "company", company.id, payload);
      await qc.invalidateQueries({ queryKey: companyQueryKey });
      toast.success("Datos guardados.");
    } catch (error) {
      toast.error(rpcErrorMessage(error, "No se ha podido guardar"));
    } finally {
      setSaving(false);
    }
  }

  const active = workers.filter((w) => w.status === "active").length;
  const trial = company?.subscription_status === "trialing";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Los documentos oficiales usan la razón social; el nombre comercial solo aparece en el kiosco.
        </p>
      </header>

      <form onSubmit={handleSave} className="card-soft space-y-4 p-5 md:p-6">
        <h2 className="font-semibold">Datos del negocio</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, label, req]) => (
            <div key={k} className="space-y-2">
              <Label htmlFor={k}>{label}</Label>
              <Input
                id={k}
                required={req}
                type={k === "billing_email" ? "email" : "text"}
                className="h-11"
                value={form[k] ?? ""}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      <section className="card-soft space-y-3 p-5 md:p-6">
        <h2 className="font-semibold">Suscripción</h2>
        <p className="text-sm">
          <span className="font-medium">1,00 € + IVA por trabajador activo al mes.</span> Administrador gratis,
          locales ilimitados, todas las funciones incluidas.
        </p>
        <div className="text-sm text-muted-foreground">
          Estado: <span className="font-medium text-foreground">{trial ? "Prueba gratuita" : company?.subscription_status}</span>
          {trial && company && ` · hasta ${formatShortDate(company.trial_ends_at)}`} · {active} trabajadores activos
          {!trial && ` · estimación ${active} € + IVA este ciclo`}
        </div>
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          Cada trabajador activo en un ciclo cuenta una vez (1 € completo, sin prorrateo), aunque lo archives y
          reactives. Durante la prueba no se cobra nada. Si la prueba termina sin método de pago, la cuenta pasa a
          solo lectura hasta que lo añadas.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void openBilling("checkout")}>
            Añadir método de pago
          </Button>
          {(company as { stripe_customer_id?: string | null } | null)?.stripe_customer_id && (
            <Button variant="ghost" onClick={() => void openBilling("portal")}>
              Facturas y datos de pago
            </Button>
          )}
        </div>
      </section>

      <section className="card-soft space-y-2 p-5 md:p-6">
        <h2 className="font-semibold">Avisos por email</h2>
        <p className="text-sm text-muted-foreground">
          Recibirás un aviso inmediato por cada incidencia nueva y un resumen semanal los lunes en{" "}
          {company?.billing_email || "tu email de facturación"}. {outbox.data ? `${outbox.data} avisos en cola.` : ""}{" "}
          El envío se activará al conectar el proveedor de correo.
        </p>
      </section>

      <section className="card-soft space-y-2 p-5 md:p-6">
        <h2 className="font-semibold">Conservación de datos</h2>
        <p className="text-sm text-muted-foreground">
          Los fichajes originales no pueden modificarse ni borrarse. Las correcciones se guardan como
          registros adicionales con motivo, autor y fecha. Tras una baja del servicio podrás exportar tus
          datos durante 30 días en modo solo lectura.
        </p>
      </section>
    </div>
  );
}
