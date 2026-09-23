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
          "Control horario para bares, cafeterías y negocios pequeños: una tablet compartida, un PIN de 4 dígitos y registros listos para tu asesoría.",
      },
      { property: "og:title", content: "TurnoPIN · Una pantalla. Un PIN. Y a trabajar." },
      {
        property: "og:description",
        content:
          "Fichaje de empleados desde un único dispositivo del local. 30 días gratis, después 1 € + IVA por trabajador al mes.",
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
