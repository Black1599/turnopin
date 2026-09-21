import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Clock className="h-5 w-5" />
      </span>
      <span className="text-lg font-bold tracking-tight">TurnoPIN</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <Link to="/precios" className="hover:text-foreground">
            Precios
          </Link>
          <Link to="/faq" className="hover:text-foreground">
            Preguntas
          </Link>
          <Link to="/kiosco" className="hover:text-foreground">
            Kiosco
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth" search={{ modo: "registro" }}>
              Probar gratis
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md text-sm text-muted-foreground">
            TurnoPIN es una herramienta de registro de jornada para negocios pequeños. No sustituye
            el asesoramiento laboral ni jurídico.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link to="/privacidad" className="hover:text-foreground">
            Privacidad
          </Link>
          <Link to="/aviso-legal" className="hover:text-foreground">
            Aviso legal
          </Link>
          <Link to="/terminos" className="hover:text-foreground">
            Términos
          </Link>
        </nav>
      </div>
      <div className="container-page pb-8 text-xs text-muted-foreground">
        © {new Date().getFullYear()} TurnoPIN. Documentos legales pendientes de revisión
        profesional.
      </div>
    </footer>
  );
}

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container-page section max-w-3xl">
        <h1 className="text-3xl font-bold md:text-4xl">{title}</h1>
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          <strong>Documento provisional.</strong> Este texto es una plantilla de ejemplo y debe ser
          revisado y adaptado por un profesional antes de cualquier lanzamiento comercial.
        </div>
        <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
