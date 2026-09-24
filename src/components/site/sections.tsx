import { Link } from "@tanstack/react-router";
import {
  Check,
  CheckCheck,
  KeyRound,
  ListChecks,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Smartphone,
  Table2,
} from "lucide-react";

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
      <div className="container-page grid gap-12 overflow-hidden py-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(34rem,1.08fr)] lg:items-center lg:gap-8 lg:py-20">
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-5">
            Registro de jornada para bares y negocios pequeños
          </Badge>
          <h1 className="text-4xl font-extrabold leading-[1.08] md:text-6xl">
            Una pantalla. Un PIN. Y a trabajar.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Ficha desde el kiosco del local o, si quieres, directamente por WhatsApp. Tú eliges
            qué trabajadores pueden usarlo y el kiosco sigue siempre disponible.
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
            Sin tarjeta para empezar · Alta en 5 minutos · 1 € + IVA por trabajador/mes · WhatsApp
            opcional +1 € + IVA por trabajador activado
          </p>
        </div>

        <div
          className="relative mx-auto grid w-full max-w-2xl gap-5 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center lg:min-h-[31rem] lg:grid-cols-none"
          aria-label="TurnoPIN en el kiosco y por WhatsApp"
        >
          <div className="card-soft min-w-0 p-5 sm:pr-8 lg:absolute lg:left-0 lg:top-7 lg:w-[76%] lg:p-6 lg:pr-20">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Monitor className="h-4 w-4" aria-hidden="true" />
              Kiosco · Bar Demo
            </div>
            <div className="mt-1 text-2xl font-bold">Hola, Ana Pérez</div>
            <div className="mt-5 rounded-lg bg-accent p-4 text-accent-foreground">
              <div className="text-xs uppercase tracking-wide">Estado actual</div>
              <div className="mt-1 text-lg font-bold sm:text-xl">TRABAJANDO desde 08:00</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <div key={n} className="keypad-key h-12 text-lg">
                  {n}
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground opacity-60">
              Salir del trabajo
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[16rem] rounded-[2rem] border-[6px] border-foreground bg-card p-1.5 shadow-soft sm:max-w-none lg:absolute lg:bottom-0 lg:right-0 lg:w-[16.5rem]">
            <div className="absolute left-1/2 top-1.5 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-foreground" />
            <div className="overflow-hidden rounded-[1.45rem] bg-surface">
              <div className="flex items-center gap-2 bg-primary px-3 pb-3 pt-7 text-primary-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground text-primary">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">TurnoPIN</div>
                  <div className="text-[11px] opacity-80">Bar Demo</div>
                </div>
              </div>

              <div className="min-h-[19rem] space-y-3 p-3">
                <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-card p-3 text-xs shadow-key">
                  <p className="font-semibold">Hola, Ana. ¿Qué quieres hacer?</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {["Entrar", "Pausa", "Volver", "Salir"].map((action) => (
                      <span
                        key={action}
                        className="flex min-h-8 items-center justify-center rounded-md border bg-background px-1.5 text-center font-semibold text-primary"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="ml-auto max-w-[82%] rounded-lg rounded-tr-sm bg-accent p-2.5 text-xs text-accent-foreground shadow-key">
                  Entrar
                  <CheckCheck className="ml-auto mt-1 h-3.5 w-3.5" aria-label="Mensaje leído" />
                </div>

                <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-card p-3 text-xs shadow-key">
                  <p className="font-semibold">Entrada registrada a las 08:57</p>
                  <p className="mt-1 text-muted-foreground">Que tengas un buen turno.</p>
                </div>
              </div>
              <div className="mx-3 mb-3 flex h-9 items-center gap-2 rounded-full bg-card px-3 text-[11px] text-muted-foreground">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Mensaje
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-3 hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-semibold shadow-soft lg:flex">
            <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            WhatsApp opcional
          </div>
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
    icon: KeyRound,
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
    icon: KeyRound,
    title: "PIN de 4 dígitos",
    text: "Se guarda cifrado y nunca se vuelve a mostrar. Puedes restablecerlo cuando quieras.",
  },
  {
    icon: MessageCircle,
    title: "Fichaje por WhatsApp",
    text: "Opcional: botones de Entrar, Pausa, Volver y Salir desde el móvil personal. El kiosco sigue disponible siempre; lo activas solo para quien quieras.",
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

const baseIncluded = [
  "Locales ilimitados, un kiosco por local",
  "Kiosco con PIN y pausas opcionales",
  "Incidencias y correcciones con historial",
  "Acceso personal de cada trabajador (solo lectura)",
  "Informes mensuales en PDF y CSV",
  "Administrador gratis",
];

const whatsappIncluded = [
  "Entrar / Pausa / Volver / Salir por WhatsApp",
  "Sin instalar aplicaciones en el móvil",
  "Un mismo número puede servir a varios negocios",
  "Actívalo solo para los trabajadores que quieras",
  "El kiosco sigue disponible siempre",
];

export function Pricing() {
  return (
    <section className="section border-b bg-surface">
      <div className="container-page">
        <h2 className="text-3xl font-bold md:text-4xl">Un precio por trabajador. Todo incluido.</h2>
        <p className="mt-3 text-muted-foreground">
          TurnoPIN base obligatorio · WhatsApp opcional por trabajador. 30 días gratis sin tarjeta.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="card-soft p-7 ring-2 ring-primary">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold">1 €</span>
              <span className="text-sm text-muted-foreground">+ IVA por trabajador activo / mes</span>
            </div>
            <p className="mt-2 text-sm font-medium text-primary">TurnoPIN</p>
            <ul className="mt-6 space-y-3 text-sm">
              {baseIncluded.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card-soft p-7">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold">+1 €</span>
              <span className="text-sm text-muted-foreground">+ IVA por trabajador con WhatsApp activado / mes</span>
            </div>
            <p className="mt-2 text-sm font-medium text-primary">Extra WhatsApp</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Un trabajador con WhatsApp activado cuesta 2 € + IVA en total: 1 € base + 1 € WhatsApp.
            </p>
            <ul className="mt-4 space-y-3 text-sm">
              {whatsappIncluded.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-8 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
          <p>
            Cada trabajador activo en un ciclo mensual cuenta 1 € base completo, sin prorrateo, y
            como máximo una vez por ciclo aunque se archive y se reactive. El extra WhatsApp se
            aplica solo a los trabajadores con la opción activada.
          </p>
          <p className="mt-2">
            Si archivas a alguien, deja de contar desde la siguiente renovación.
          </p>
          <p className="mt-2">Durante la prueba no se cobra ningún trabajador. Una prueba por NIF/CIF.</p>
        </div>
        <Button asChild className="mt-8 h-11 w-full md:w-auto md:px-12">
          <Link to="/auth" search={{ modo: "registro" }}>
            Probar 30 días gratis
          </Link>
        </Button>
        <p className="mt-4 max-w-2xl text-xs text-muted-foreground">
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
    a: "Sí, como opción. El responsable activa WhatsApp por trabajador (+1 € + IVA sobre el precio base de ese trabajador). El trabajador vincula su número con su PIN o un código de un solo uso y ficha con botones de Entrar, Pausa, Volver y Salir. Usar el móvil personal es voluntario: el kiosco sigue disponible siempre.",
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
