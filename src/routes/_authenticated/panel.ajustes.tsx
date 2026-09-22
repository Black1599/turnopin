import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { companyQueryKey, logAudit, PLANS, useCompany } from "@/lib/company";
import { formatShortDate } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/ajustes")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Ajustes del negocio · TurnoPIN" },
      {
        name: "description",
        content: "Actualiza los datos fiscales de tu negocio y consulta tu plan en TurnoPIN.",
      },
      { property: "og:title", content: "Ajustes del negocio · TurnoPIN" },
      {
        property: "og:description",
        content: "Datos del negocio, plan contratado y estado de la prueba gratuita.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SettingsPage() {
  const { data: company } = useCompany();
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [ccc, setCcc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setLegalName(company.legal_name);
    setTaxId(company.tax_id ?? "");
    setCcc(company.ccc ?? "");
  }, [company]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({ legal_name: legalName, tax_id: taxId || null, ccc: ccc || null })
        .eq("id", company.id);
      if (error) throw error;
      await logAudit(company.id, "update_company", "company", company.id, { legal_name: legalName });
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      toast.success("Datos guardados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se ha podido guardar");
    } finally {
      setSaving(false);
    }
  }

  const plan = company ? PLANS[(company.plan as keyof typeof PLANS) ?? "local"] : undefined;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Datos del negocio y suscripción.</p>
      </header>

      <form onSubmit={handleSave} className="card-soft space-y-4 p-5 md:p-6">
        <h2 className="font-semibold">Datos del negocio</h2>
        <div className="space-y-2">
          <Label htmlFor="legal">Nombre fiscal *</Label>
          <Input
            id="legal"
            required
            className="h-11"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tax">CIF / NIF</Label>
            <Input
              id="tax"
              className="h-11"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ccc">CCC (opcional)</Label>
            <Input id="ccc" className="h-11" value={ccc} onChange={(e) => setCcc(e.target.value)} />
          </div>
        </div>
        <Button type="submit" className="h-11" disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </Button>
      </form>

      <section className="card-soft space-y-3 p-5 md:p-6">
        <h2 className="font-semibold">Suscripción</h2>
        <div className="text-sm text-muted-foreground">
          Plan actual: <span className="font-medium text-foreground">{plan?.name ?? "Local"}</span>{" "}
          · {plan?.price} · {plan?.limits}
        </div>
        <div className="text-sm text-muted-foreground">
          Estado: <span className="font-medium text-foreground">{company?.subscription_status}</span>
          {company?.trial_ends_at && ` · prueba hasta ${formatShortDate(company.trial_ends_at)}`}
        </div>
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          El pago con tarjeta todavía no está activado. Durante la prueba puedes usar todas las
          funciones; cuando conectemos la pasarela de pago podrás cambiar de plan desde aquí.
        </p>
        <Button variant="outline" disabled>
          Gestionar suscripción (próximamente)
        </Button>
      </section>

      <section className="card-soft space-y-2 p-5 md:p-6">
        <h2 className="font-semibold">Conservación de datos</h2>
        <p className="text-sm text-muted-foreground">
          Los fichajes se conservan un mínimo de 4 años y no pueden borrarse desde la aplicación.
          Las correcciones se guardan como registros adicionales, conservando siempre el valor
          original, el motivo y quién lo modificó.
        </p>
      </section>
    </div>
  );
}
