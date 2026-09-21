import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_ID = "11111111-1111-1111-1111-111111111111";

export const Route = createFileRoute("/kiosco/")({
  head: () => ({
    meta: [
      { title: "Abrir el kiosco de fichaje · TurnoPIN" },
      {
        name: "description",
        content:
          "Abre el kiosco de TurnoPIN en la tablet del local con el código de tu negocio, o prueba el kiosco de demostración.",
      },
      { property: "og:title", content: "Abrir el kiosco de fichaje · TurnoPIN" },
      {
        property: "og:description",
        content: "Pantalla compartida para que tu equipo fiche con su PIN de 4 dígitos.",
      },
    ],
  }),
  component: KioscoIndex,
});

function KioscoIndex() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container-page section max-w-2xl">
        <h1 className="text-3xl font-bold md:text-4xl">Abrir el kiosco</h1>
        <p className="mt-3 text-muted-foreground">
          Pega el código de kiosco de tu negocio (lo encuentras en el panel, en Ajustes) y guarda la
          página en la pantalla de inicio de la tablet.
        </p>
        <form
          className="card-soft mt-8 space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim())
              navigate({ to: "/kiosco/$companyId", params: { companyId: code.trim() } });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="code">Código de kiosco</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="h-11"
            />
          </div>
          <Button type="submit" className="h-11 w-full">
            Abrir kiosco
          </Button>
        </form>
        <div className="mt-8 rounded-lg border bg-surface p-6">
          <h2 className="font-semibold">¿Solo quieres verlo?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Abre el kiosco de demostración del negocio ficticio «Bar Demo».
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/kiosco/$companyId" params={{ companyId: DEMO_ID }}>
              Abrir kiosco de demo
            </Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
