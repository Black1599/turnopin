import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    modo: search["modo"] === "registro" ? ("registro" as const) : ("acceso" as const),
  }),
  head: () => ({
    meta: [
      { title: "Acceso de administración · TurnoPIN" },
      {
        name: "description",
        content:
          "Entra en el panel de TurnoPIN o crea la cuenta de tu negocio para empezar la prueba de 30 días.",
      },
      { property: "og:title", content: "Acceso de administración · TurnoPIN" },
      {
        property: "og:description",
        content: "Gestiona empleados, registros y correcciones desde el panel de TurnoPIN.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { modo } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(modo === "registro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/panel", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/panel` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Cuenta creada");
          navigate({ to: "/panel", replace: true });
        } else {
          setEmailSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada");
        navigate({ to: "/panel", replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(
        message.includes("Invalid login credentials")
          ? "Email o contraseña incorrectos"
          : message.includes("already registered")
            ? "Ese email ya tiene cuenta. Inicia sesión."
            : message,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No se ha podido iniciar sesión con Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/panel", replace: true });
  }

  async function handleReset() {
    if (!email) {
      toast.error("Escribe tu email para restablecer la contraseña");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Te hemos enviado un correo para cambiar la contraseña");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="container-page flex h-16 items-center">
        <Logo />
      </div>
      <main className="container-page flex flex-1 items-start justify-center pb-16 pt-6">
        <div className="card-soft w-full max-w-md p-7">
          {emailSent ? (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-bold">Revisa tu correo</h1>
              <p className="text-sm text-muted-foreground">
                Hemos enviado un enlace de confirmación a <strong>{email}</strong>. Confirma tu email
                para entrar en el panel.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setEmailSent(false)}>
                Volver
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold">
                {isSignup ? "Crea tu cuenta" : "Entra en tu panel"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {isSignup
                  ? "30 días de prueba gratis, sin tarjeta."
                  : "Accede para gestionar empleados y registros."}
              </p>

              <Button variant="outline" className="mt-6 h-11 w-full" onClick={handleGoogle}>
                Continuar con Google
              </Button>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> o con email{" "}
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? "Un momento…" : isSignup ? "Crear cuenta" : "Entrar"}
                </Button>
              </form>

              <div className="mt-5 flex flex-col gap-2 text-center text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setIsSignup((v) => !v)}
                >
                  {isSignup ? "Ya tengo cuenta" : "Quiero crear una cuenta"}
                </button>
                {!isSignup && (
                  <button
                    type="button"
                    className="text-muted-foreground hover:underline"
                    onClick={handleReset}
                  >
                    He olvidado mi contraseña
                  </button>
                )}
                <Link to="/" className="text-muted-foreground hover:underline">
                  Volver a la web
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
