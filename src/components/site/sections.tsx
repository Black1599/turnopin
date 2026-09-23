import { Link } from "@tanstack/react-router";
import { Check, Fingerprint, ListChecks, Monitor, ShieldCheck, Smartphone, Table2 } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b bg-background">
      <div className="container-page grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
        <div>
          <Badge variant="secondary" className="mb-5">
            Registro de jornada para bares y negocios pequeños
          </Badge>
          <h1 className="text-4xl font-extrabold leading-[1.08] md:text-6xl">
            Una pantalla. Un PIN. Y a trabajar.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Pon una tablet o un móvil compartido en la barra. Cada empleado elige su nombre,
            introduce su PIN de 4 dígitos y ficha su entrada o su salida. Sin instalar nada en el
            móvil de tu equipo.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-7 text-base">
              <Link to="/auth" search={{ modo: "registro" }}>
                Probar 30 días gratis
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base">
              <Link to="/kiosco/$token" params={{ token: "demo" }}>
                Ver el kiosco de demo
              </Link>

            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sin tarjeta para empezar · Alta en 5 minutos · 1 € + IVA por trabajador/mes
          </p>
        </div>
        <div className="card-soft p-6">
          <div className="text-sm text-muted-foreground">Bar Demo</div>
          <div className="mt-1 text-2xl font-bold">Hola, Ana Pérez</div>
          <div className="mt-6 rounded-lg bg-accent p-4 text-accent-foreground">
            <div className="text-xs uppercase tracking-wide">Estado actual</div>
            <div className="mt-1 text-xl font-bold">TRABAJANDO desde 08:00</div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
              <div key={n} className="keypad-key h-14 text-xl">
                {n}
              </div>
            ))}
          </div>
          <Button className="mt-5 h-12 w-full text-base" disabled>
            Salir del trabajo
          </Button>
        </div>
      </div>
    </section>
  );
}

const steps = [
  {
    icon: Monitor,
    title: "1. Deja una pantalla fija",
    text: "Abre el kiosco en una tablet o móvil del local y déjalo siempre en esa pantalla.",
  },
  {
    icon: Fingerprint,
    title: "2. Cada empleado ficha con su PIN",
    text: "Elige su nombre, escribe sus 4 dígitos y pulsa entrar o salir. Nada más.",
  },
  {
    icon: Table2,
    title: "3. Tú lo ves todo en el panel",
    text: "Registros por día y empleado, correcciones con motivo y exportación mensual.",
  },
];

export function HowItWorks() {
  return (
    <section className="section border-b bg-surface">
      <div className="container-page">
        <h2 className="text-3xl font-bold md:text-4xl">Cómo funciona</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Pensado para negocios de 3 a 30 personas que no quieren un programa de recursos humanos.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card-soft p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Smartphone,
    title: "Un solo dispositivo compartido",
    text: "Funciona en tablet o móvil. Tu equipo no necesita instalar ninguna aplicación.",
  },
  {
    icon: Fingerprint,
    title: "PIN de 4 dígitos",
    text: "Se guarda cifrado y nunca se vuelve a mostrar. Puedes restablecerlo cuando quieras.",
  },
  {
    icon: ListChecks,
    title: "Varios turnos al día",
    text: "Entradas y salidas ilimitadas: partidos, refuerzos y cambios de última hora.",
  },
  {
    icon: ShieldCheck,
    title: "Historial que no se borra",
    text: "Las correcciones guardan el valor original, el motivo y quién las hizo.",
  },
  {
    icon: Table2,
    title: "Informe mensual",
    text: "Elige empleado y mes: informe imprimible y descarga en CSV.",
  },
  {
    icon: Monitor,
    title: "Hora del servidor",
    text: "El fichaje usa la hora del servidor, no la del dispositivo del local.",
  },
];

export function Features() {
  return (
    <section className="section border-b">
      <div className="container-page">
        <h2 className="text-3xl font-bold md:text-4xl">Solo lo que necesitas</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card-soft p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const included = [
  "Locales ilimitados, un kiosco por local",
  "Kiosco con PIN y pausas opcionales",
  "Incidencias y correcciones con historial",
  "Acceso personal de cada trabajador (solo lectura)",
  "Informes mensuales en PDF y CSV",
  "Administrador gratis",
];

export function Pricing() {
  return (
    <section className="section border-b bg-surface">
      <div className="container-page">
        <h2 className="text-3xl font-bold md:text-4xl">Un precio. Todo incluido.</h2>
        <p className="mt-3 text-muted-foreground">
          30 días gratis sin tarjeta. Sin permanencia, sin mínimo mensual.
        </p>
        <div className="card-soft mt-10 max-w-xl p-7 ring-2 ring-primary">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold">1 €</span>
            <span className="text-sm text-muted-foreground">+ IVA por trabajador activo / mes</span>
          </div>
          <ul className="mt-6 space-y-3 text-sm">
            {included.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 space-y-2 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
            <p>
              Cada trabajador activo en un ciclo mensual cuenta 1 € completo, sin prorrateo, y como
              máximo una vez por ciclo aunque se archive y se reactive.
            </p>
            <p>Si archivas a alguien, deja de contar desde la siguiente renovación.</p>
            <p>Durante la prueba no se cobra ningún trabajador. Una prueba por NIF/CIF.</p>
          </div>
          <Button asChild className="mt-7 h-11 w-full">
            <Link to="/auth" search={{ modo: "registro" }}>
              Probar 30 días gratis
            </Link>
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Alta directa hasta 30 trabajadores. ¿Necesitas más capacidad?{" "}
            <a href="mailto:soporte@turnopin.es" className="font-medium text-primary underline">
              Contacta con nosotros
            </a>
          </p>
        </div>
        <p className="mt-6 max-w-2xl text-xs text-muted-foreground">
          TurnoPIN es una herramienta diseñada para facilitar el registro de jornada. No ofrecemos
          garantías de cumplimiento normativo: consulta con tu asesor laboral cómo aplicarlo.
        </p>
      </div>
    </section>
  );
}

const faqs = [
  {
    q: "¿Mis empleados necesitan instalar una aplicación?",
    a: "No. Se ficha desde la pantalla compartida del local con un PIN de 4 dígitos.",
  },
  {
    q: "¿Se puede fichar por WhatsApp?",
    a: "Sí, como opción. El responsable puede activarlo por trabajador; el trabajador vincula su número con su PIN o un código de un solo uso y ficha con botones. Usar el móvil personal es voluntario: el kiosco sigue disponible siempre.",
  },
  {
    q: "¿Puedo tener varios turnos al día?",
    a: "Sí, no hay límite de entradas y salidas por día.",
  },
  {
    q: "¿Qué pasa si alguien se olvida de fichar?",
    a: "Puedes corregir el registro desde el panel indicando un motivo. El valor original se conserva siempre.",
  },
  {
    q: "¿Se puede borrar un fichaje?",
    a: "No. Los registros no se eliminan desde la aplicación: solo se corrigen dejando rastro de la corrección.",
  },
  {
    q: "¿TurnoPIN garantiza el cumplimiento legal?",
    a: "No. Es una herramienta de registro de jornada. La forma de aplicarla en tu negocio debe revisarla tu asesoría.",
  },
  {
    q: "¿Puedo probarlo antes de pagar?",
    a: "Sí, 30 días gratis y sin tarjeta. También puedes abrir el kiosco de demo sin registrarte.",
  },
];

export function Faq() {
  return (
    <section className="section">
      <div className="container-page max-w-3xl">
        <h2 className="text-3xl font-bold md:text-4xl">Preguntas frecuentes</h2>
        <Accordion type="single" collapsible className="mt-8">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="section border-t bg-surface">
      <div className="container-page text-center">
        <h2 className="text-3xl font-bold md:text-4xl">Empieza hoy en tu barra</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Crea tu cuenta, añade a tu equipo y deja la tablet lista para el próximo turno.
        </p>
        <Button asChild size="lg" className="mt-8 h-12 px-8 text-base">
          <Link to="/auth" search={{ modo: "registro" }}>
            Probar 30 días gratis
          </Link>
        </Button>
      </div>
    </section>
  );
}
