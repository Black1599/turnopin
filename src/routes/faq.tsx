import { createFileRoute } from "@tanstack/react-router";

import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";
import { Faq, FinalCta } from "@/components/site/sections";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Preguntas frecuentes · TurnoPIN" },
      {
        name: "description",
        content:
          "Dudas habituales sobre el fichaje con PIN, los turnos partidos, las correcciones de registros y la prueba gratuita de TurnoPIN.",
      },
      { property: "og:title", content: "Preguntas frecuentes · TurnoPIN" },
      {
        property: "og:description",
        content: "Cómo funciona el kiosco con PIN, las correcciones y los informes mensuales.",
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <div className="container-page pt-14">
          <h1 className="text-4xl font-extrabold md:text-5xl">Preguntas frecuentes</h1>
        </div>
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
