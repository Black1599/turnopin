import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, type TimeEntry, type Worker } from "@/lib/company";
import { formatDateTime, formatShortDate, todayMadrid, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/correcciones")({
  component: CorrectionsPage,
  head: () => ({
    meta: [
      { title: "Correcciones de fichajes · TurnoPIN" },
      {
        name: "description",
        content:
          "Corrige fichajes conservando el valor original, el motivo y quién hizo el cambio.",
      },
      { property: "og:title", content: "Correcciones de fichajes · TurnoPIN" },
      {
        property: "og:description",
        content: "Cada corrección guarda el valor original y queda registrada.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type EntryRow = TimeEntry & { original_server_timestamp: string | null };

type Correction = {
  id: string;
  worker_id: string;
  original_timestamp: string;
  corrected_timestamp: string;
  reason: string;
  internal_notes: string | null;
  created_at: string;
};

function CorrectionsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayMadrid());
  const [target, setTarget] = useState<EntryRow | null>(null);
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const workersQuery = useQuery({
    queryKey: ["workers", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("company_id", companyId!)
        .order("first_name");
      if (error) throw error;
      return data as Worker[];
    },
  });

  const entriesQuery = useQuery({
    queryKey: ["entries", companyId, date, ""],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .eq("company_id", companyId!)
        .eq("work_date", date)
        .order("server_timestamp");
      if (error) throw error;
      return data as EntryRow[];
    },
  });

  const historyQuery = useQuery({
    queryKey: ["corrections", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("corrections")
        .select("id, worker_id, original_timestamp, corrected_timestamp, reason, internal_notes, created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Correction[];
    },
  });

  const workers = workersQuery.data ?? [];
  const nameOf = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerShortName(w) : "Empleado";
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!target) throw new Error("Selecciona un fichaje");
      if (!/^\d{2}:\d{2}$/.test(newTime)) throw new Error("Introduce una hora válida (HH:MM)");
      if (reason.trim().length < 3) throw new Error("Indica el motivo de la corrección");
      // Interpret the entered time in Europe/Madrid for the entry's day.
      const iso = madridToIso(target.work_date, newTime);
      const { data, error } = await supabase.rpc("admin_correct_entry", {
        p_entry_id: target.id,
        p_corrected_timestamp: iso,
        p_reason: reason.trim(),
        p_internal_notes: (notes.trim() || null) as unknown as string,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("Corrección registrada. El valor original se conserva.");
      setTarget(null);
      setNewTime("");
      setReason("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["entries"] });
      await queryClient.invalidateQueries({ queryKey: ["corrections"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "No se ha podido corregir"),
  });

  const entries = entriesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Correcciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Corregir un fichaje nunca borra el valor original: se guarda el motivo, la hora anterior y
          quién hizo el cambio.
        </p>
      </header>

      <div className="card-soft p-5">
        <Label htmlFor="fecha">Fecha de los fichajes</Label>
        <Input
          id="fecha"
          type="date"
          className="mt-2 h-11 sm:max-w-xs"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <section className="card-soft p-5 md:p-6">
        <h2 className="font-semibold">Fichajes del día</h2>
        {entries.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No hay fichajes en esta fecha.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div>
                  <div className="font-medium">{nameOf(e.worker_id)}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.type === "entry" ? "Entrada" : "Salida"} · {e.local_time}
                    {e.corrected ? " · corregido" : ""}
                  </div>
                </div>
                <Dialog
                  open={target?.id === e.id}
                  onOpenChange={(open) => {
                    setTarget(open ? e : null);
                    if (open) setNewTime(e.local_time);
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Corregir
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Corregir fichaje</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        {nameOf(e.worker_id)} · {e.type === "entry" ? "Entrada" : "Salida"} del{" "}
                        {formatShortDate(e.work_date)} · hora actual {e.local_time}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor="hora">Hora correcta *</Label>
                        <Input
                          id="hora"
                          type="time"
                          className="h-11"
                          value={newTime}
                          onChange={(ev) => setNewTime(ev.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="motivo">Motivo *</Label>
                        <Input
                          id="motivo"
                          className="h-11"
                          placeholder="Olvidó fichar la salida"
                          value={reason}
                          onChange={(ev) => setReason(ev.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notas">Notas internas</Label>
                        <Textarea
                          id="notas"
                          value={notes}
                          onChange={(ev) => setNotes(ev.target.value)}
                        />
                      </div>
                      <Button
                        className="h-11 w-full"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate()}
                      >
                        {mutation.isPending ? "Guardando…" : "Guardar corrección"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-soft p-5 md:p-6">
        <h2 className="font-semibold">Historial de correcciones</h2>
        {(historyQuery.data ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Todavía no hay correcciones.</p>
        ) : (
          <ul className="mt-4 divide-y">
            {(historyQuery.data ?? []).map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <div className="font-medium">{nameOf(c.worker_id)}</div>
                <div className="text-muted-foreground">
                  {formatDateTime(c.original_timestamp)} → {formatDateTime(c.corrected_timestamp)}
                </div>
                <div className="mt-1">Motivo: {c.reason}</div>
                {c.internal_notes && (
                  <div className="text-muted-foreground">Notas: {c.internal_notes}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Builds an ISO instant from a Madrid-local date + HH:MM. */
function madridToIso(workDate: string, time: string) {
  const naive = new Date(`${workDate}T${time}:00Z`);
  const offsetLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  })
    .formatToParts(naive)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offsetLabel ?? "");
  let minutes = 0;
  if (match) {
    minutes = Number(match[2]) * 60 + Number(match[3]);
    if (match[1] === "-") minutes = -minutes;
  }
  return new Date(naive.getTime() - minutes * 60000).toISOString();
}
