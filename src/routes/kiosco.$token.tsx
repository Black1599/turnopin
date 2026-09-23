import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Clock, Coffee, Delete, KeyRound, LogIn, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatShortDate, todayMadrid } from "@/lib/fmt";

export const Route = createFileRoute("/kiosco/$token")({
  head: () => ({
    meta: [
      { title: "Kiosco de fichaje · TurnoPIN" },
      {
        name: "description",
        content: "Elige tu nombre, introduce tu PIN de 4 dígitos y registra tu entrada o tu salida.",
      },
      { property: "og:title", content: "Kiosco de fichaje · TurnoPIN" },
      { property: "og:description", content: "Registro de jornada desde el dispositivo del local." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KioscoPage,
});

type Action = "status" | "entry" | "exit" | "break_start" | "break_end" | "change_pin";

type Result = {
  ok: boolean;
  error?: string;
  pin_changed?: boolean;
  status?: "working" | "break" | "out";
  today?: string;
  server_time?: string;
  open_shift?: { local_time: string; work_date: string; location_name: string; same_location: boolean } | null;
  worker?: { id: string; first_name: string; last_name: string; break_tracking: boolean };
  entries?: { id: string; type: string; local_time: string; corrected: boolean; manual: boolean }[];
  incidents?: { id: string; work_date: string; reported_time: string | null; no_recall: boolean }[];
};

const ERRORS: Record<string, string> = {
  invalid_pin: "PIN incorrecto. Vuelve a intentarlo.",
  rate_limited: "Demasiados intentos. Espera unos minutos.",
  worker_not_found: "Trabajador no disponible en este local.",
  kiosk_not_found: "Este kiosco ya no está activo.",
  already_working: "Ya tienes una entrada abierta.",
  not_working: "No tienes ninguna entrada abierta.",
  on_break: "Finaliza la pausa antes de salir.",
  not_on_break: "No estás en pausa.",
  breaks_disabled: "Las pausas no están activadas para ti.",
  wrong_location: "Tu turno abierto es de otro local. Sal en ese local o avisa de la salida olvidada.",
  invalid_new_pin: "El nuevo PIN debe tener 4 dígitos.",
};

const LABEL: Record<string, string> = {
  entry: "Entrada",
  exit: "Salida",
  break_start: "Inicio de pausa",
  break_end: "Fin de pausa",
};

function KioscoPage() {
  const { token } = Route.useParams();
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [pin, setPin] = useState("");
  const [session, setSession] = useState<Result | null>(null);
  const [validatedPin, setValidatedPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mode, setMode] = useState<"main" | "forgot" | "pin">("main");
  const [reported, setReported] = useState("");
  const [newPin, setNewPin] = useState("");
  const hiddenInput = useRef<HTMLInputElement>(null);

  const info = useQuery({
    queryKey: ["kiosk-info", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kiosk_info", { p_token: token });
      if (error) throw error;
      return data as { company_name: string; location_name: string; is_demo: boolean } | null;
    },
  });

  const workers = useQuery({
    queryKey: ["kiosk-workers", token],
    enabled: Boolean(info.data),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("kiosk_list_workers", { p_token: token });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!selected || session) return;
    function onKey(e: KeyboardEvent) {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 4 ? p + e.key : p));
      if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, session]);

  async function call(action: Action, pinValue: string, extra: { reported?: string; noRecall?: boolean; newPin?: string } = {}) {
    if (!selected) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("kiosk_action", {
      p_token: token,
      p_worker_id: selected.id,
      p_pin: pinValue,
      p_action: action,
      p_no_recall: extra.noRecall ?? false,
      ...(extra.reported ? { p_reported_time: extra.reported } : {}),
      ...(extra.newPin ? { p_new_pin: extra.newPin } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error("No se ha podido registrar. Inténtalo de nuevo.");
      return;
    }
    const r = data as unknown as Result;
    if (!r.ok) {
      toast.error(ERRORS[r.error ?? ""] ?? "No se ha podido completar la acción");
      if (r.error === "invalid_pin" || r.error === "rate_limited") setPin("");
      return;
    }
    if (r.pin_changed) {
      setConfirmation("PIN cambiado. Usa el nuevo PIN a partir de ahora.");
      return;
    }
    setSession(r);
    setValidatedPin(pinValue);
    setMode("main");
    if (action !== "status") {
      const last = r.entries?.at(-1)?.local_time ?? r.server_time;
      setConfirmation(`${LABEL[action]} registrada a las ${last}`);
    }
  }

  useEffect(() => {
    if (pin.length === 4 && !session && !busy) void call("status", pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function reset() {
    setSelected(null);
    setPin("");
    setSession(null);
    setValidatedPin("");
    setConfirmation(null);
    setMode("main");
    setReported("");
    setNewPin("");
  }

  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(reset, 4000);
    return () => clearTimeout(t);
  }, [confirmation]);

  // Inactivity safety: return to worker list after 60s on a personal screen
  useEffect(() => {
    if (!session || confirmation) return;
    const t = setTimeout(reset, 60000);
    return () => clearTimeout(t);
  }, [session, confirmation, mode]);

  if (info.isLoading) return <FullScreen>Cargando kiosco…</FullScreen>;

  if (!info.data) {
    return (
      <FullScreen>
        <div className="text-center">
          <h1 className="text-2xl font-bold">Kiosco no encontrado</h1>
          <p className="mt-2 text-muted-foreground">
            Este enlace no está activo. Pide al responsable el enlace del kiosco de este local.
          </p>
          <Button asChild className="mt-6">
            <Link to="/kiosco">Volver</Link>
          </Button>
        </div>
      </FullScreen>
    );
  }

  const k = info.data;
  const s = session;
  const open = s?.open_shift;
  const staleShift = Boolean(open && (open.work_date !== s?.today || !open.same_location));

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {k.is_demo && (
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
            <div className="text-base font-bold leading-tight">{k.company_name}</div>
            <div className="text-xs text-muted-foreground">
              {k.location_name} · <span className="capitalize">{formatDate(todayMadrid())}</span>
            </div>
          </div>
        </div>
        {selected && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-11">
            <ArrowLeft className="mr-1 h-4 w-4" /> Salir
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
            <p className="mt-2 text-muted-foreground">{selected?.name}</p>
            <Button className="mt-8 h-12 px-8" onClick={reset}>
              Listo
            </Button>
          </div>
        ) : !selected ? (
          <>
            <h1 className="text-2xl font-bold">¿Quién ficha?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pulsa tu nombre para continuar.</p>
            <div className="mt-6 grid gap-3">
              {workers.data?.length === 0 && (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  No hay trabajadores autorizados en este local.
                </div>
              )}
              {workers.data?.map((w) => (
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
        ) : !s ? (
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
            <PinDots value={pin} />
            <Keypad onDigit={(n) => setPin((p) => (p.length < 4 ? p + n : p))} onDelete={() => setPin((p) => p.slice(0, -1))} />
            {busy && <p className="mt-6 text-center text-sm text-muted-foreground">Comprobando…</p>}
          </div>
        ) : mode === "pin" ? (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold">Nuevo PIN</h1>
            <p className="mt-1 text-sm text-muted-foreground">Elige 4 dígitos. No se lo muestres a nadie.</p>
            <PinDots value={newPin} />
            <Keypad onDigit={(n) => setNewPin((p) => (p.length < 4 ? p + n : p))} onDelete={() => setNewPin((p) => p.slice(0, -1))} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" className="h-12" onClick={() => setMode("main")}>
                Cancelar
              </Button>
              <Button className="h-12" disabled={newPin.length !== 4 || busy} onClick={() => call("change_pin", validatedPin, { newPin })}>
                Guardar PIN
              </Button>
            </div>
          </div>
        ) : mode === "forgot" ? (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold">Salida olvidada</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tu turno del {open ? formatShortDate(open.work_date) : ""} desde las {open?.local_time}
              {open ? ` en ${open.location_name}` : ""} quedará pendiente para que lo revise el responsable. Tu
              propuesta no cambia el registro.
            </p>
            <label className="mt-6 text-sm font-medium" htmlFor="rep">
              ¿A qué hora saliste?
            </label>
            <input
              id="rep"
              type="time"
              value={reported}
              onChange={(e) => setReported(e.target.value)}
              className="mt-2 h-14 rounded-lg border bg-background px-4 text-2xl"
            />
            <div className="mt-auto grid gap-3 pt-8">
              <Button className="h-14 text-lg" disabled={!reported || busy} onClick={() => call("entry", validatedPin, { reported })}>
                Enviar hora y entrar a trabajar
              </Button>
              <Button variant="outline" className="h-14 text-lg" disabled={busy} onClick={() => call("entry", validatedPin, { noRecall: true })}>
                No recuerdo la hora · entrar a trabajar
              </Button>
              <Button variant="ghost" onClick={() => setMode("main")}>
                Volver
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold">Hola, {s.worker?.first_name}</h1>
            <div className={`mt-5 rounded-xl p-5 ${s.status === "out" ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground"}`}>
              <div className="text-xs font-semibold uppercase tracking-wide">Estado actual</div>
              <div className="mt-1 text-2xl font-bold">
                {s.status === "working" && `TRABAJANDO desde ${open?.local_time ?? ""}`}
                {s.status === "break" && "EN PAUSA"}
                {s.status === "out" && "FUERA"}
              </div>
              {open && open.work_date !== s.today && (
                <div className="mt-1 text-sm">Turno iniciado el {formatShortDate(open.work_date)} en {open.location_name}</div>
              )}
            </div>

            {(staleShift || (s.incidents?.length ?? 0) > 0) && (
              <div className="mt-4 flex gap-3 rounded-xl border-2 border-warning bg-warning/10 p-4 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <div>
                  {staleShift && <p className="font-semibold">Parece que no fichaste la salida de tu último turno.</p>}
                  {(s.incidents?.length ?? 0) > 0 && (
                    <p>
                      Tienes {s.incidents!.length} incidencia{s.incidents!.length > 1 ? "s" : ""} pendiente
                      {s.incidents!.length > 1 ? "s" : ""} de revisar por el responsable.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tus fichajes de hoy</h2>
              <ul className="mt-3 space-y-2">
                {s.entries?.length === 0 && (
                  <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Todavía no has fichado hoy.</li>
                )}
                {s.entries?.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {e.type === "entry" ? <LogIn className="h-4 w-4 text-primary" /> : e.type === "exit" ? <LogOut className="h-4 w-4 text-muted-foreground" /> : <Coffee className="h-4 w-4 text-muted-foreground" />}
                      {LABEL[e.type]}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {e.local_time}
                      {(e.corrected || e.manual) && <span className="ml-2 text-xs font-normal text-muted-foreground">corregido</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto grid gap-3 pt-8">
              {s.status === "out" && (
                <Button className="h-16 text-lg" disabled={busy} onClick={() => call("entry", validatedPin)}>
                  Entrar a trabajar
                </Button>
              )}
              {s.status === "working" && !staleShift && (
                <Button className="h-16 text-lg" variant="outline" disabled={busy} onClick={() => call("exit", validatedPin)}>
                  Salir del trabajo
                </Button>
              )}
              {s.status === "working" && !staleShift && s.worker?.break_tracking && (
                <Button className="h-14" variant="secondary" disabled={busy} onClick={() => call("break_start", validatedPin)}>
                  Iniciar pausa
                </Button>
              )}
              {s.status === "break" && !staleShift && (
                <Button className="h-16 text-lg" disabled={busy} onClick={() => call("break_end", validatedPin)}>
                  Finalizar pausa
                </Button>
              )}
              {s.status !== "out" && (
                <Button className={staleShift ? "h-16 text-lg" : "h-12"} variant={staleShift ? "default" : "ghost"} onClick={() => setMode("forgot")}>
                  Olvidé fichar la salida · empezar turno nuevo
                </Button>
              )}
              <Button variant="ghost" className="h-11 text-sm" onClick={() => (setNewPin(""), setMode("pin"))}>
                <KeyRound className="mr-2 h-4 w-4" /> Cambiar mi PIN
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PinDots({ value }: { value: string }) {
  return (
    <div className="mt-6 flex justify-center gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`h-14 w-12 rounded-lg border-2 text-center text-3xl leading-[3rem] ${value.length > i ? "border-primary bg-accent" : "border-border bg-background"}`}
        >
          {value.length > i ? "•" : ""}
        </div>
      ))}
    </div>
  );
}

function Keypad({ onDigit, onDelete }: { onDigit: (n: string) => void; onDelete: () => void }) {
  return (
    <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
        <button key={n} type="button" className="keypad-key" onClick={() => onDigit(n)} aria-label={`Dígito ${n}`}>
          {n}
        </button>
      ))}
      <div />
      <button type="button" className="keypad-key" onClick={() => onDigit("0")} aria-label="Dígito 0">
        0
      </button>
      <button type="button" className="keypad-key" onClick={onDelete} aria-label="Borrar">
        <Delete className="h-6 w-6" />
      </button>
    </div>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-surface px-5 text-muted-foreground">{children}</div>;
}
