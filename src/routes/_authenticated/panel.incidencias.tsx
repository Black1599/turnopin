import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { buildReason, ReasonPicker } from "@/components/panel/EntryDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { rpcErrorMessage, useCompany, useLocations, useWorkers } from "@/lib/company";
import { formatDateTime, formatShortDate, madridToIso, workerShortName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/incidencias")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s.id === "string" ? { id: s.id } : {},
  component: IncidentsPage,
  head: () => ({
    meta: [
      { title: "Incidencias · TurnoPIN" },
      { name: "description", content: "Salidas olvidadas pendientes de resolver." },
      { property: "og:title", content: "Incidencias · TurnoPIN" },
      { property: "og:description", content: "Resuelve incidencias en remoto con motivo y rastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Incident = {
  id: string;
  worker_id: string;
  time_entry_id: string | null;
  location_id: string | null;
  status: string;
  work_date: string | null;
  worker_reported_time: string | null;
  worker_no_recall: boolean;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  time_entries: { server_timestamp: string; local_time: string } | null;
};

function IncidentsPage() {
  const { id: focusId } = Route.useSearch();
  const { data: company } = useCompany();
  const companyId = company?.id;
  const qc = useQueryClient();
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const [target, setTarget] = useState<Incident | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [noExit, setNoExit] = useState(false);
  const [code, setCode] = useState("olvido_salida");
  const [text, setText] = useState("");

  const incidents = useQuery({
    queryKey: ["incidents", companyId, tab],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incidents")
        .select("*, time_entries!incidents_time_entry_id_fkey(server_timestamp, local_time)")
        .eq("company_id", companyId!)
        .eq("status", tab)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as Incident[];
    },
  });

  useEffect(() => {
    if (!focusId || !incidents.data) return;
    const found = incidents.data.find((i) => i.id === focusId);
    if (found) open(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, incidents.data]);

  function open(i: Incident) {
    setTarget(i);
    setDate(i.work_date ?? "");
    setTime(i.worker_reported_time && /^\d{2}:\d{2}$/.test(i.worker_reported_time) ? i.worker_reported_time : "");
    setNoExit(false);
    setCode("olvido_salida");
    setText("");
  }

  const resolve = useMutation({
    mutationFn: async () => {
      const reason = buildReason(code, text);
      if (reason.length < 3) throw new Error("reason_required");
      if (!noExit && (!date || !time)) throw new Error("Indica la hora de salida o marca «sin salida»");
      const { error } = await supabase.rpc("admin_resolve_incident_v2", {
        p_incident_id: target!.id,
        p_exit_timestamp: noExit ? (null as unknown as string) : madridToIso(date, time),
        p_reason: reason,
        p_reason_code: code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Incidencia resuelta");
      setTarget(null);
      for (const k of ["incidents", "incidents-pending-count", "entries", "report"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const wName = (id: string) => {
    const w = workers.find((x) => x.id === id);
    return w ? workerShortName(w) : "—";
  };
  const lName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Incidencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se crean cuando alguien empieza un turno sin haber cerrado el anterior. Lo que indica el
          trabajador es solo una propuesta: el registro no cambia hasta que lo resuelvas.
        </p>
      </header>
      <div className="flex gap-2">
        <Button variant={tab === "pending" ? "default" : "outline"} onClick={() => setTab("pending")}>
          Pendientes
        </Button>
        <Button variant={tab === "resolved" ? "default" : "outline"} onClick={() => setTab("resolved")}>
          Resueltas
        </Button>
      </div>

      {(incidents.data ?? []).length === 0 ? (
        <div className="card-soft p-10 text-center text-sm text-muted-foreground">
          {tab === "pending" ? "No hay incidencias pendientes." : "Todavía no hay incidencias resueltas."}
        </div>
      ) : (
        <div className="grid gap-3">
          {incidents.data!.map((i) => (
            <div key={i.id} className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  {wName(i.worker_id)} · Salida no registrada
                  <Badge variant={i.status === "pending" ? "destructive" : "secondary"}>
                    {i.status === "pending" ? "Pendiente" : "Resuelta"}
                  </Badge>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Entrada {i.work_date ? formatShortDate(i.work_date) : ""} {i.time_entries?.local_time}
                  {lName(i.location_id) && ` · ${lName(i.location_id)}`} ·{" "}
                  {i.worker_no_recall
                    ? "El trabajador no recuerda la hora"
                    : i.worker_reported_time
                      ? `Propone salida a las ${i.worker_reported_time}`
                      : "Sin propuesta"}
                </div>
                {i.status === "resolved" && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {i.resolution_notes} · {formatDateTime(i.resolved_at!)}
                  </div>
                )}
              </div>
              {i.status === "pending" && (
                <Button className="h-10" onClick={() => open(i)}>
                  Resolver
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolver incidencia · {target ? wName(target.worker_id) : ""}</DialogTitle>
            <DialogDescription>
              Se añadirá una salida manual en el mismo local de la entrada, con tu usuario y el motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={noExit} onChange={(e) => setNoExit(e.target.checked)} />
              Cerrar sin añadir salida (por ejemplo, entrada errónea que corregirás aparte)
            </label>
            {!noExit && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Día de salida</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label>Hora de salida</Label>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
                </div>
              </div>
            )}
            <ReasonPicker code={code} text={text} onChange={(c, t) => (setCode(c), setText(t))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => resolve.mutate()} disabled={resolve.isPending}>
              Marcar como resuelta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
