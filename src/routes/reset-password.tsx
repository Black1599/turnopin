import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nueva contraseña · TurnoPIN" },
      {
        name: "description",
        content: "Define una nueva contraseña para acceder al panel de administración de TurnoPIN.",
      },
      { property: "og:title", content: "Nueva contraseña · TurnoPIN" },
      { property: "og:description", content: "Restablece el acceso a tu panel de TurnoPIN." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contraseña actualizada");
    navigate({ to: "/panel", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="container-page flex h-16 items-center">
        <Logo />
      </div>
      <main className="container-page flex flex-1 items-start justify-center pb-16 pt-6">
        <form onSubmit={handleSubmit} className="card-soft w-full max-w-md space-y-4 p-7">
          <h1 className="text-2xl font-bold">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Escribe la contraseña que usarás para entrar en el panel.
          </p>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      </main>
    </div>
  );
}
