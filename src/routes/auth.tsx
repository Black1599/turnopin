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
    modo: (search["modo"] === "registro" ? "registro" : "acceso") as
      | "registro"
      | "acceso"
      | undefined,
    volver: safePath(search["volver"]),
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

/** Only same-origin panel paths are allowed as return destinations. */
function safePath(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (!v.startsWith("/panel") || v.startsWith("//")) return undefined;
  return v;
}

const RETURN_KEY = "turnopin.volver";

function AuthPage() {
  const { modo, volver } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignup, setIsSignup] = useState(modo === "registro");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  function goIn() {
    const stored = safePath(sessionStorage.getItem(RETURN_KEY) ?? undefined);
    sessionStorage.removeItem(RETURN_KEY);
    window.location.replace(volver ?? stored ?? "/panel");
  }

  useEffect(() => {
    if (volver) sessionStorage.setItem(RETURN_KEY, volver);
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) goIn();
    });
    // Confirmation links land here (public page); enter once the session is hydrated.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goIn();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resendConfirmation() {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) toast.error("No se ha podido reenviar. Espera un minuto y vuelve a intentarlo.");
    else toast.success("Te hemos reenviado el correo de confirmación");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    setNeedsConfirm(false);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Cuenta creada");
          goIn();
        } else {
          setEmailSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada");
        goIn();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      if (message.toLowerCase().includes("email not confirmed")) {
        setNeedsConfirm(true);
        toast.error("Aún no has confirmado tu email. Revisa tu correo.");
        return;
      }
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
    goIn();
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
                Hemos enviado un enlace de confirmación a <strong>{email}</strong>. Ábrelo desde este
                dispositivo y entrarás directamente en el panel para completar los datos de tu negocio.
              </p>
              <p className="text-xs text-muted-foreground">
                ¿No lo ves? Revisa la carpeta de spam o promociones.
              </p>
              <Button variant="outline" className="w-full" onClick={resendConfirmation}>
                Reenviar correo
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setEmailSent(false);
                  setIsSignup(false);
                }}
              >
                Ya lo he confirmado · Entrar
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
                {needsConfirm && (
                  <div className="rounded-md border bg-muted p-3 text-sm">
                    Tu email aún no está confirmado. Abre el enlace que te enviamos al registrarte.{" "}
                    <button type="button" className="font-medium text-primary hover:underline" onClick={resendConfirmation}>
                      Reenviar correo
                    </button>
                  </div>
                )}
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
