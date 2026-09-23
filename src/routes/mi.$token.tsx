import { createFileRoute } from "@tanstack/react-router";
import { Clock, Printer } from "lucide-react";
import { useCallback, useState } from "react";

import { MonthlyReport } from "@/components/report/MonthlyReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import type { EffectiveEntry } from "@/lib/company";
import { currentMonthMadrid, monthLabel } from "@/lib/fmt";

export const Route = createFileRoute("/mi/$token")({
  head: () => ({
    meta: [
      { title: "Mis registros de jornada · TurnoPIN" },
      { name: "description", content: "Consulta tus fichajes y descarga tu informe mensual con tu PIN." },
      { property: "og:title", content: "Mis registros de jornada · TurnoPIN" },
      { property: "og:description", content: "Acceso personal de solo lectura para trabajadores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkerPortal,
});

type PortalEntry = {
  id: string;
  type: EffectiveEntry["type"];
  work_date: string;
  local_time: string;
  effective_timestamp: string;
  original_local_time: string;
  corrected: boolean;
  manual: boolean;
  reason: string | null;
  location: string | null;
};

type Portal = {
  ok: boolean;
  error?: string;
  month: string;
  months: string[];
  worker: { first_name: string; last_name: string; second_last_name: string | null; dni_nie: string | null; naf: string | null; break_paid: boolean };
  company: { legal_name: string; tax_id: string | null; ccc: string | null };
  entries: PortalEntry[];
};

const ERR: Record<string, string> = {
  invalid_pin: "PIN incorrecto.",
  rate_limited: "Demasiados intentos. Espera unos minutos.",
  access_revoked: "Este acceso ya no está activo. Habla con tu responsable.",
};

function WorkerPortal() {
  const { token } = Route.useParams();
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Portal | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(month?: string) {
    setBusy(true);
    setError("");
    const { data: res, error: err } = await supabase.rpc("worker_portal", {
      p_access_token: token,
      p_pin: pin,
      p_month: month ?? currentMonthMadrid(),
    });
    setBusy(false);
    const r = res as unknown as Portal | null;
    if (err || !r?.ok) {
      setError(ERR[r?.error ?? ""] ?? "No se ha podido abrir tu registro.");
      setData(null);
      return;
    }
    setData(r);
  }

  const locName = useCallback((id: string | null) => id ?? "", []);
  const [pinMsg, setPinMsg] = useState("");

  async function changePin() {
    const next = window.prompt("Nuevo PIN de 4 cifras");
    if (next === null) return;
    if (!/^\d{4}$/.test(next)) return setPinMsg("El PIN debe tener 4 cifras.");
    if (window.prompt("Repite el nuevo PIN") !== next) return setPinMsg("Los PIN no coinciden.");
    const { data: res } = await supabase.rpc("worker_portal_change_pin", {
      p_access_token: token,
      p_pin: pin,
      p_new_pin: next,
    });
    const r = res as { ok?: boolean; error?: string } | null;
    if (r?.ok) {
      setPin(next);
      setPinMsg("PIN cambiado. Úsalo a partir de ahora en el kiosco.");
    } else setPinMsg(ERR[r?.error ?? ""] ?? "No se ha podido cambiar el PIN.");
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-5">
        <form
          className="card-soft w-full max-w-sm space-y-4 p-7"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <div className="flex items-center gap-2 font-bold">
            <Clock className="h-5 w-5 text-primary" /> Mis registros
          </div>
          <p className="text-sm text-muted-foreground">
            Introduce tu PIN para ver tus fichajes. Es solo de consulta: para fichar usa el kiosco del local.
          </p>
          <Input
            inputMode="numeric"
            maxLength={4}
            autoFocus
            aria-label="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-14 text-center text-3xl tracking-[0.5em]"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full" disabled={pin.length !== 4 || busy}>
            {busy ? "Comprobando…" : "Ver mis registros"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Tus datos los trata tu empleador para cumplir con el registro de jornada.{" "}
            <a className="underline" href="/privacidad" target="_blank" rel="noreferrer">
              Más información
            </a>
          </p>
        </form>
      </div>
    );
  }

  const w = data.worker;
  const name = [w.first_name, w.last_name, w.second_last_name].filter(Boolean).join(" ");
  const months = Array.from(new Set([currentMonthMadrid(), ...data.months])).sort().reverse();
  const entries: EffectiveEntry[] = data.entries.map((e) => ({
    id: e.id,
    company_id: "",
    worker_id: "me",
    type: e.type,
    is_manual: e.manual,
    manual_reason: e.manual ? e.reason : null,
    original_timestamp: e.effective_timestamp,
    original_local_time: e.original_local_time,
    original_work_date: e.work_date,
    original_location_id: e.location,
    effective_timestamp: e.effective_timestamp,
    effective_work_date: e.work_date,
    effective_local_time: e.local_time,
    effective_location_id: e.location,
    is_corrected: e.corrected,
    correction_reason: e.corrected ? e.reason : null,
    correction_reason_code: null,
    corrected_at: null,
    created_at: "",
  }));

  return (
    <div className="min-h-screen bg-surface">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b bg-background px-5 py-4">
        <div>
          <div className="font-bold">{name}</div>
          <div className="text-xs text-muted-foreground">{data.company.legal_name} · solo lectura</div>
        </div>
        <div className="flex gap-2">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={data.month}
            onChange={(e) => void load(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <Button onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => void changePin()}>
            Cambiar PIN
          </Button>
          <Button variant="ghost" onClick={() => (setData(null), setPin(""))}>
            Salir
          </Button>
        </div>
      </div>
      {pinMsg && <div className="no-print bg-accent px-5 py-2 text-center text-sm">{pinMsg}</div>}
      <div className="mx-auto max-w-3xl p-5">
        <div className="card-soft p-5 md:p-8">
          <MonthlyReport
            company={data.company}
            month={data.month}
            workers={[{ id: "me", name, dni_nie: w.dni_nie, naf: w.naf, break_paid: w.break_paid }]}
            entries={entries}
            locName={locName}
            byLocation
          />
        </div>
      </div>
    </div>
  );
}
