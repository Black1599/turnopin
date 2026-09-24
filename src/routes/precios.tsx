import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Faq, FinalCta, Pricing } from "@/components/site/sections";

export const Route = createFileRoute("/precios")({
  head: () => ({
    meta: [
      { title: "Precios de TurnoPIN · 1 € + IVA, WhatsApp +1 € + IVA" },
      {
        name: "description",
        content:
          "TurnoPIN base 1 € + IVA por trabajador activo al mes. WhatsApp opcional +1 € + IVA por trabajador activado. Todo incluido, locales ilimitados y 30 días gratis sin tarjeta.",
      },
      { property: "og:title", content: "Precios de TurnoPIN" },
      {
        property: "og:description",
        content: "1 € + IVA por trabajador activo. WhatsApp opcional +1 € + IVA por trabajador activado. Sin permanencia y 30 días gratis.",
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
            Paga por trabajador. TurnoPIN base más WhatsApp opcional, activado solo para quien
            quieras. Empieza con 30 días gratis.
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
