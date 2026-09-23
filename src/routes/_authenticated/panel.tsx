import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { companyQueryKey, createCompanyForCurrentUser, useCompany } from "@/lib/company";

export const Route = createFileRoute("/_authenticated/panel")({
  component: PanelLayout,
});

const nav = [
  { to: "/panel", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/panel/empleados", label: "Empleados", icon: Users },
  { to: "/panel/registros", label: "Registros", icon: FileText },
  { to: "/panel/correcciones", label: "Correcciones", icon: History },
  { to: "/panel/informes", label: "Informes", icon: BarChart3 },
  { to: "/panel/ajustes", label: "Ajustes", icon: Settings },
] as const;

function PanelLayout() {
  const companyQuery = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { modo: "acceso" }, replace: true });
  }

  if (companyQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando tu negocio…
      </div>
    );
  }

  if (!companyQuery.data) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-background p-4 md:flex">
          <Link to="/panel" className="flex items-center gap-2 px-2 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Clock className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold">TurnoPIN</span>
          </Link>
          <nav className="mt-4 flex flex-1 flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: "exact" in item ? item.exact : false }}
                activeProps={{ className: "bg-accent text-accent-foreground" }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="border-t pt-3">
            <div className="truncate px-3 pb-2 text-xs text-muted-foreground">
              {companyQuery.data.legal_name}
            </div>
            <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Salir
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-24 md:pb-8">
          <div className="no-print flex items-center justify-between border-b bg-background px-5 py-3 md:hidden">
            <span className="flex items-center gap-2 font-bold">
              <Clock className="h-5 w-5 text-primary" /> TurnoPIN
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-5 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="no-print fixed bottom-0 left-0 right-0 z-40 flex border-t bg-background md:hidden">
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: "exact" in item ? item.exact : false }}
            activeProps={{ className: "text-primary" }}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-[11px] text-muted-foreground"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Onboarding() {
  const queryClient = useQueryClient();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [ccc, setCcc] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createCompanyForCurrentUser({ legal_name: legalName, tax_id: taxId, ccc });
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      toast.success("Negocio creado. Tu prueba de 30 días ha empezado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se ha podido crear el negocio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-surface p-5">
      <form onSubmit={handleSubmit} className="card-soft mt-10 w-full max-w-md space-y-4 p-7">
        <h1 className="text-2xl font-bold">Datos de tu negocio</h1>
        <p className="text-sm text-muted-foreground">
          Solo lo imprescindible para empezar. Podrás cambiarlo en Ajustes.
        </p>
        <div className="space-y-2">
          <Label htmlFor="legal">Nombre fiscal *</Label>
          <Input
            id="legal"
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Bar La Esquina S.L."
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tax">CIF / NIF</Label>
          <Input id="tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ccc">CCC (opcional)</Label>
          <Input id="ccc" value={ccc} onChange={(e) => setCcc(e.target.value)} className="h-11" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Creando…" : "Crear negocio"}
        </Button>
      </form>
    </div>
  );
}
