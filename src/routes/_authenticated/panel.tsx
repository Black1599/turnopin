import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Settings,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  companyQueryKey,
  createCompanyForCurrentUser,
  isCompanyWritable,
  useCompany,
  usePendingIncidents,
} from "@/lib/company";

export const Route = createFileRoute("/_authenticated/panel")({
  component: PanelLayout,
});

const nav = [
  { to: "/panel", label: "Resumen", icon: LayoutDashboard, exact: true },
  { to: "/panel/incidencias", label: "Incidencias", icon: TriangleAlert },
  { to: "/panel/empleados", label: "Empleados", icon: Users },
  { to: "/panel/locales", label: "Locales", icon: MapPin },
  { to: "/panel/registros", label: "Registros", icon: FileText },
  { to: "/panel/correcciones", label: "Correcciones", icon: History },
  { to: "/panel/informes", label: "Informes", icon: BarChart3 },
  { to: "/panel/ajustes", label: "Ajustes", icon: Settings },
] as const;

function PanelLayout() {
  const companyQuery = useCompany();
  const pending = usePendingIncidents(companyQuery.data?.id).data ?? 0;
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
                {item.to === "/panel/incidencias" && pending > 0 && (
                  <span className="ml-auto rounded-full bg-warning px-2 text-xs font-bold text-warning-foreground">
                    {pending}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="border-t pt-3">
            <div className="truncate px-3 pb-2 text-xs text-muted-foreground">
              {companyQuery.data.commercial_name ?? companyQuery.data.legal_name}
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
            {!isCompanyWritable(companyQuery.data) && (
              <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4 text-sm">
                <div className="flex gap-3">
                  <TriangleAlert className="h-5 w-5 shrink-0 text-warning" />
                  <p>
                    <span className="font-semibold">Cuenta en solo lectura.</span> Puedes consultar y descargar todos
                    los registros, pero no fichar ni hacer cambios hasta añadir un método de pago.
                  </p>
                </div>
                <Button asChild size="sm">
                  <Link to="/panel/ajustes">Ir a Ajustes</Link>
                </Button>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="no-print fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto border-t bg-background md:hidden">
        {nav.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: "exact" in item ? item.exact : false }}
            activeProps={{ className: "text-primary" }}
            className="relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 py-3 text-[11px] text-muted-foreground"
          >
            <item.icon className="h-5 w-5" />
            {item.label}
            {item.to === "/panel/incidencias" && pending > 0 && (
              <span className="absolute right-3 top-1.5 h-2.5 w-2.5 rounded-full bg-warning" />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Onboarding() {
  const queryClient = useQueryClient();
  const [f, setF] = useState({
    legal_name: "",
    commercial_name: "",
    tax_id: "",
    fiscal_address: "",
    country: "ES",
    billing_email: "",
    ccc: "",
    location_name: "",
    location_address: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setF((p) => (p.billing_email ? p : { ...p, billing_email: data.user!.email! }));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createCompanyForCurrentUser({
        ...f,
        location_name: f.location_name || f.commercial_name || f.legal_name,
      });
      await queryClient.invalidateQueries({ queryKey: companyQueryKey });
      toast.success("Negocio creado. Tu prueba de 30 días ha empezado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se ha podido crear el negocio");
    } finally {
      setLoading(false);
    }
  }

  const field = (key: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-2">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        className="h-11"
        {...props}
      />
    </div>
  );

  return (
    <div className="flex min-h-screen items-start justify-center bg-surface p-5">
      <form onSubmit={handleSubmit} className="card-soft mt-10 w-full max-w-lg space-y-4 p-7">
        <h1 className="text-2xl font-bold">Datos de tu negocio</h1>
        <p className="text-sm text-muted-foreground">
          Los documentos oficiales usan la razón social. El nombre comercial se muestra en el kiosco.
        </p>
        {field("legal_name", "Razón social / nombre fiscal *", { required: true })}
        {field("tax_id", "NIF / CIF *", { required: true })}
        {field("fiscal_address", "Dirección fiscal *", { required: true })}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("country", "País *", { required: true })}
          {field("billing_email", "Email de facturación *", { required: true, type: "email" })}
        </div>
        {field("commercial_name", "Nombre comercial (kiosco)")}
        {field("ccc", "CCC (opcional)")}
        <div className="border-t pt-4">
          <h2 className="font-semibold">Primer local</h2>
          <div className="mt-3 grid gap-4">
            {field("location_name", "Nombre del local", { placeholder: "Bar La Esquina" })}
            {field("location_address", "Dirección del local *", { required: true })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          30 días gratis sin tarjeta, una prueba por NIF/CIF. Después, 1 € + IVA por trabajador activo
          al mes.
        </p>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? "Creando…" : "Crear negocio"}
        </Button>
      </form>
    </div>
  );
}
