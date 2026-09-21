import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/aviso-legal")({
  head: () => ({
    meta: [
      { title: "Aviso legal (borrador) · TurnoPIN" },
      {
        name: "description",
        content:
          "Borrador de aviso legal de TurnoPIN con los datos identificativos del titular pendientes de completar.",
      },
      { property: "og:title", content: "Aviso legal · TurnoPIN" },
      { property: "og:description", content: "Plantilla pendiente de revisión profesional." },
    ],
  }),
  component: () => (
    <LegalPage title="Aviso legal">
      <p>
        Titular, domicilio social, NIF, datos de contacto y registro mercantil deben incluirse aquí
        antes de la puesta en producción.
      </p>
      <p>
        TurnoPIN es una herramienta de registro horario. No presta servicios de asesoría laboral ni
        garantiza el cumplimiento de obligaciones normativas concretas.
      </p>
    </LegalPage>
  ),
});
