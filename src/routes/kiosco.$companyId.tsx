import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock, Delete, LogIn, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, todayMadrid } from "@/lib/fmt";

export const Route = createFileRoute("/kiosco/$companyId")({
  head: () => ({
    meta: [
      { title: "Kiosco de fichaje · TurnoPIN" },
      {
        name: "description",
        content:
          "Pantalla de fichaje: elige tu nombre, introduce tu PIN de 4 dígitos y registra tu entrada o tu salida.",
      },
      { property: "og:title", content: "Kiosco de fichaje · TurnoPIN" },
      {
        property: "og:description",
        content: "Registro de entrada y salida desde el dispositivo compartido del local.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KioscoPage,
});

type PunchResult = {
  ok: boolean;
  error?: string;
  status?: "working" | "out";
  since?: string | null;
  server_time?: string;
  worker?: { id: string; first_name: string; last_name: string };
  entries?: { id: string; type: "entry" | "exit"; local_time: string; corrected: boolean }[];
};

const ERRORS: Record<string, string> = {
  invalid_pin: "PIN incorrecto. Vuelve a intentarlo.",
  rate_limited: "Demasiados intentos. Espera unos minutos.",
  worker_not_found: "Empleado no disponible.",
  already_working: "Ya tienes una entrada abierta.",
  not_working: "No tienes ninguna entrada abierta.",
};

function KioscoPage() {
  const { companyId } = Route.useParams();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<PunchResult | null>(null);
  const [validatedPin, setValidatedPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const hiddenInput = useRef<HTMLInputElement>(null);

  const companyQuery = useQuery({
    queryKey: ["kiosk-company", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kiosk_company", { p_company_id: companyId });
      if (error) throw error;
      return data as { id: string; legal_name: string; is_demo: boolean } | null;
    },
  });

  const workersQuery = useQuery({
    queryKey: ["kiosk-workers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kiosk_workers", { p_company_id: companyId });
      if (error) throw error;
      return (data ?? []) as { id: string; first_name: string; last_name: string }[];
    },
    enabled: Boolean(companyQuery.data),
  });

  // Keyboard typing for speed on a shared device.
  useEffect(() => {
    if (!selected || session) return;
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, session]);

  async function punch(action: "status" | "entry" | "exit", pinValue: string) {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_punch", {
      p_company_id: companyId,
      p_worker_id: selected.id,
      p_pin: pinValue,
      p_action: action,
    });
    setBusy(false);
    if (error) {
      toast.error("No se ha podido registrar. Inténtalo de nuevo.");
      return;
    }
    const result = data as unknown as PunchResult;
    if (!result.ok) {
      toast.error(ERRORS[result.error ?? ""] ?? "No se ha podido completar la acción");
      if (result.error === "invalid_pin" || result.error === "rate_limited") setPin("");
      return;
    }
    setSession(result);
    setValidatedPin(pinValue);
    if (action !== "status") {
      setConfirmation(
        action === "entry"
          ? `Entrada registrada a las ${result.entries?.at(-1)?.local_time ?? result.server_time}`
          : `Salida registrada a las ${result.entries?.at(-1)?.local_time ?? result.server_time}`,
      );
    }
  }

  useEffect(() => {
    if (pin.length === 4 && !session && !busy) void punch(pin === "" ? "status" : "status", pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function reset() {
    setSelected(null);
    setPin("");
    setSession(null);
    setValidatedPin("");
    setConfirmation(null);
  }

  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(reset, 4000);
    return () => clearTimeout(t);
  }, [confirmation]);

  if (companyQuery.isLoading) {
    return <FullScreen>Cargando kiosco…</FullScreen>;
  }

  if (!companyQuery.data) {
    return (
      <FullScreen>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Kiosco no encontrado</h1>
          <p className="mt-2 text-muted-foreground">
            Revisa el código de kiosco en el panel de tu negocio.
          </p>
          <Button asChild className="mt-6">
            <Link to="/kiosco">Volver</Link>
          </Button>
        </div>
      </FullScreen>
    );
  }

  const company = companyQuery.data;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {company.is_demo && (
        <div className="bg-warning px-4 py-2 text-center text-sm font-semibold text-warning-foreground">
          Kiosco de demostración · PIN de Ana Pérez: 2580 (Luis: 1111 · Marta: 2222)
        </div>
      )}
      <header className="flex items-center justify-between border-b bg-background px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <div className="text-base font-bold leading-tight">{company.legal_name}</div>
            <div className="text-xs capitalize text-muted-foreground">
              {formatDate(todayMadrid())}
            </div>
          </div>
        </div>
        {selected && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-11">
            <ArrowLeft className="mr-1 h-4 w-4" /> Cambiar
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-6">
        {confirmation ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-10 w-10" />
            </span>
            <h1 className="mt-6 text-2xl font-bold">{confirmation}</h1>
            <p className="mt-2 text-muted-foreground">
              {session?.worker?.first_name} {session?.worker?.last_name}
            </p>
            <Button className="mt-8 h-12 px-8" onClick={reset}>
              Listo
            </Button>
          </div>
        ) : !selected ? (
          <>
            <h1 className="text-2xl font-bold">¿Quién ficha?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pulsa tu nombre para continuar.</p>
            <div className="mt-6 grid gap-3">
              {workersQuery.data?.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  Todavía no hay empleados con PIN. Añádelos desde el panel.
                </div>
              )}
              {workersQuery.data?.map((w) => (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelected({ id: w.id, name: `${w.first_name} ${w.last_name}` });
                    setPin("");
                    hiddenInput.current?.focus();
                  }}
                  className="card-soft flex min-h-16 items-center justify-between px-5 py-4 text-left text-lg font-semibold transition-colors hover:bg-accent"
                >
                  {w.first_name} {w.last_name}
                  <ArrowLeft className="h-5 w-5 rotate-180 text-muted-foreground" />
                </button>
              ))}
            </div>
          </>
        ) : !session ? (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Introduce tu PIN de 4 dígitos.</p>
            <input
              ref={hiddenInput}
              className="sr-only"
              inputMode="numeric"
              value={pin}
              aria-label="PIN"
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
            <div className="mt-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-14 w-12 rounded-lg border-2 text-center text-3xl leading-[3rem] ${
                    pin.length > i ? "border-primary bg-accent" : "border-border bg-background"
                  }`}
                >
                  {pin.length > i ? "•" : ""}
                </div>
              ))}
            </div>
            <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
                <button
                  key={n}
                  className="keypad-key"
                  onClick={() => setPin((p) => (p.length < 4 ? p + n : p))}
                  aria-label={`Dígito ${n}`}
                >
                  {n}
                </button>
              ))}
              <div />
              <button className="keypad-key" onClick={() => setPin((p) => (p.length < 4 ? p + "0" : p))}>
                0
              </button>
              <button
                className="keypad-key"
                onClick={() => setPin((p) => p.slice(0, -1))}
                aria-label="Borrar"
              >
                <Delete className="h-6 w-6" />
              </button>
            </div>
            {busy && <p className="mt-6 text-center text-sm text-muted-foreground">Comprobando…</p>}
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold">
              Hola, {session.worker?.first_name} {session.worker?.last_name}
            </h1>
            <div
              className={`mt-5 rounded-xl p-5 ${
                session.status === "working"
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wide">Estado actual</div>
              <div className="mt-1 text-2xl font-bold">
                {session.status === "working" ? `TRABAJANDO desde ${session.since}` : "FUERA"}
              </div>
            </div>

            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tus fichajes de hoy
              </h2>
              <ul className="mt-3 space-y-2">
                {session.entries?.length === 0 && (
                  <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Todavía no has fichado hoy.
                  </li>
                )}
                {session.entries?.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      {e.type === "entry" ? (
                        <LogIn className="h-4 w-4 text-primary" />
                      ) : (
                        <LogOut className="h-4 w-4 text-muted-foreground" />
                      )}
                      {e.type === "entry" ? "Entrada" : "Salida"}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {e.local_time}
                      {e.corrected && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          corregido
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto pt-8">
              <Button
                className="h-16 w-full text-lg"
                disabled={busy}
                variant={session.status === "working" ? "outline" : "default"}
                onClick={() => punch(session.status === "working" ? "exit" : "entry", validatedPin)}
              >
                {session.status === "working" ? "Salir del trabajo" : "Entrar a trabajar"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-5 text-muted-foreground">
      {children}
    </div>
  );
}
