import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Faq, FinalCta, Pricing } from "@/components/site/sections";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios de TurnoPIN · 1 € + IVA por trabajador al mes" },
      {
        name: "description",
        content:
          "1 € + IVA por trabajador activo al mes, todo incluido y locales ilimitados. 30 días de prueba gratis sin tarjeta.",
      },
      { property: "og:title", content: "Precios de TurnoPIN" },
      {
        property: "og:description",
        content: "Un único precio por trabajador, sin permanencia y con 30 días gratis.",
      },
    ],
  }),
  component: PreciosPage,
});

function PreciosPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <div className="container-page pt-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">Precios</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Paga por lo que usas. Empieza con 30 días gratis y cámbiate de plan cuando crezca tu
            equipo.
          </p>
        </div>
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
