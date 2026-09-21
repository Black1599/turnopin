import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos del servicio (borrador) · TurnoPIN" },
      {
        name: "description",
        content:
          "Borrador de condiciones de uso de TurnoPIN: prueba de 30 días, planes de suscripción y responsabilidades.",
      },
      { property: "og:title", content: "Términos del servicio · TurnoPIN" },
      { property: "og:description", content: "Plantilla pendiente de revisión profesional." },
    ],
  }),
  component: () => (
    <LegalPage title="Términos del servicio">
      <p>
        El servicio incluye 30 días de prueba gratuita. Los planes Local (7,90 €/mes + IVA) y Local+
        (14,90 €/mes + IVA) se facturan de forma mensual, impuestos no incluidos.
      </p>
      <p>
        El negocio es responsable de la veracidad de los datos registrados, de informar a su
        plantilla y de conservar la documentación que le corresponda.
      </p>
      <p>
        Condiciones de cancelación, disponibilidad, límites de responsabilidad y ley aplicable deben
        redactarse con asesoramiento profesional.
      </p>
    </LegalPage>
  ),
});
