import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Faq, FinalCta, Pricing } from "@/components/site/sections";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios de TurnoPIN · desde 7,90 €/mes + IVA" },
      {
        name: "description",
        content:
          "Plan Local 7,90 €/mes + IVA hasta 10 empleados y Local+ 14,90 €/mes + IVA hasta 30 empleados. 30 días de prueba gratis.",
      },
      { property: "og:title", content: "Precios de TurnoPIN" },
      {
        property: "og:description",
        content: "Dos planes sencillos para bares y negocios pequeños, con 30 días gratis.",
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
