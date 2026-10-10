import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/site/SiteChrome";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de privacidad (borrador) · TurnoPIN" },
      {
        name: "description",
        content:
          "Borrador de política de privacidad de TurnoPIN: qué datos se tratan al registrar la jornada y quién accede a ellos.",
      },
      { property: "og:title", content: "Política de privacidad · TurnoPIN" },
      { property: "og:description", content: "Plantilla pendiente de revisión profesional." },
    ],
  }),
  component: () => (
    <LegalPage title="Política de privacidad">
      <p>
        TurnoPIN trata los datos necesarios para registrar la jornada laboral de las personas
        trabajadoras de cada negocio: nombre y apellidos, identificadores laborales opcionales y las
        marcas de entrada y salida.
      </p>
      <p>
        El PIN no se guarda en claro: se almacena como un hash irreversible (bcrypt), por lo que no
        puede consultarse, solo restablecerse. Cada negocio
        accede exclusivamente a sus propios datos.
      </p>
      <p>
        Fichaje por WhatsApp (opcional): si el negocio lo activa y la persona trabajadora acepta
        usarlo, se trata su número de teléfono y los mensajes de fichaje que envía al número oficial
        de TurnoPIN, a través de WhatsApp Business Platform de Meta. Solo un número vinculado con su
        PIN o un código de un solo uso puede fichar. Usar el móvil personal es voluntario: el kiosco
        del local sigue disponible siempre, y desactivar WhatsApp o cambiar el teléfono desvincula el
        número al momento. No se usa geolocalización.
      </p>
      <p>
        Responsable del tratamiento, plazos de conservación, encargados, base jurídica y ejercicio de
        derechos deben completarse con la información real del negocio antes de publicar.
      </p>
    </LegalPage>
  ),
});
