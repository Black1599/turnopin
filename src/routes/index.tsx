import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Faq, Features, FinalCta, Hero, HowItWorks, Pricing } from "@/components/site/sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TurnoPIN · Una pantalla. Un PIN. Y a trabajar." },
      {
        name: "description",
        content:
          "Control horario para bares, cafeterías y negocios pequeños: kiosco con PIN o fichaje opcional por WhatsApp. 30 días gratis; después 1 € + IVA por trabajador al mes.",
      },
      { property: "og:title", content: "TurnoPIN · Una pantalla. Un PIN. Y a trabajar." },
      {
        property: "og:description",
        content:
          "Fichaje de empleados desde el kiosco del local o por WhatsApp opcional. 30 días gratis, después 1 € + IVA por trabajador al mes, WhatsApp +1 € + IVA por trabajador activado.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
