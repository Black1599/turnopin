import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  ENTRY_LABEL,
  REASONS,
  rpcErrorMessage,
  type EffectiveEntry,
  type Location,
  type Worker,
} from "@/lib/company";
import { formatShortDate, madridToIso, todayMadrid, workerName } from "@/lib/fmt";

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export function ReasonPicker({
  code,
  text,
  onChange,
}: {
  code: string;
  text: string;
  onChange: (code: string, text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Motivo *</Label>
      <select className={selectClass} value={code} onChange={(e) => onChange(e.target.value, text)}>
        {REASONS.map((r) => (
          <option key={r.code} value={r.code}>
            {r.label}
          </option>
        ))}
      </select>
      <Textarea
        placeholder={code === "otro" ? "Describe el motivo (obligatorio)" : "Detalle (opcional)"}
        value={text}
        onChange={(e) => onChange(code, e.target.value)}
      />
    </div>
  );
}

export function buildReason(code: string, text: string) {
  const label = REASONS.find((r) => r.code === code)?.label ?? code;
  if (code === "otro") return text.trim();
  return text.trim() ? `${label}: ${text.trim()}` : label;
}

function invalidateEntries(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ["entries", "corrections", "report", "incidents", "incidents-pending-count", "overview"])
    qc.invalidateQueries({ queryKey: [k] });
}

export function CorrectionDialog({
  entry,
  locations,
  workerLabel,
  onClose,
}: {
  entry: EffectiveEntry | null;
  locations: Location[];
  workerLabel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loc, setLoc] = useState("");
  const [code, setCode] = useState("hora_incorrecta");
  const [text, setText] = useState("");

  useEffect(() => {
    if (!entry) return;
    setDate(entry.effective_work_date);
    setTime(entry.effective_local_time);
    setLoc(entry.effective_location_id ?? "");
    setCode("hora_incorrecta");
    setText("");
  }, [entry]);

  const m = useMutation({
    mutationFn: async () => {
      const reason = buildReason(code, text);
      if (reason.length < 3) throw new Error("reason_required");
      const { error } = await supabase.rpc("admin_correct_entry", {
        p_entry_id: entry!.id,
        p_corrected_timestamp: madridToIso(date, time),
        p_reason: reason,
        p_reason_code: code,
        p_location_id: loc || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Corrección guardada. El registro original se conserva.");
      invalidateEntries(qc);
      onClose();
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Corregir {entry ? ENTRY_LABEL[entry.type]?.toLowerCase() : ""} · {workerLabel}
          </DialogTitle>
          <DialogDescription>
            Original: {entry ? `${formatShortDate(entry.original_work_date)} ${entry.original_local_time}` : ""}.
            La corrección se añade como un registro nuevo; el original nunca se modifica.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Local</Label>
            <select className={selectClass} value={loc} onChange={(e) => setLoc(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <ReasonPicker code={code} text={text} onChange={(c, t) => (setCode(c), setText(t))} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Guardar corrección
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManualShiftDialog({
  open,
  onClose,
  workers,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  workers: Worker[];
  locations: Location[];
}) {
  const qc = useQueryClient();
  const [workerId, setWorkerId] = useState("");
  const [loc, setLoc] = useState("");
  const [date, setDate] = useState(todayMadrid());
  const [start, setStart] = useState("");
  const [endDate, setEndDate] = useState(todayMadrid());
  const [end, setEnd] = useState("");
  const [code, setCode] = useState("olvido_turno");
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) {
      setWorkerId("");
      setLoc(locations[0]?.id ?? "");
      setDate(todayMadrid());
      setEndDate(todayMadrid());
      setStart("");
      setEnd("");
      setCode("olvido_turno");
      setText("");
    }
  }, [open, locations]);

  const m = useMutation({
    mutationFn: async () => {
      if (!workerId || !loc || !start || !end) throw new Error("Completa trabajador, local y horas");
      const reason = buildReason(code, text);
      if (reason.length < 3) throw new Error("reason_required");
      const { error } = await supabase.rpc("admin_add_manual_shift", {
        p_worker_id: workerId,
        p_location_id: loc,
        p_start: madridToIso(date, start),
        p_end: madridToIso(endDate, end),
        p_reason: reason,
        p_reason_code: code,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Turno manual añadido y marcado como manual.");
      invalidateEntries(qc);
      onClose();
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Añadir turno completo manual</DialogTitle>
          <DialogDescription>
            Solo si faltan la entrada y la salida. Quedará marcado como manual con tu usuario, el motivo
            y la fecha de creación.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Trabajador *</Label>
            <select className={selectClass} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">Selecciona…</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {workerName(w)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Local *</Label>
            <select className={selectClass} value={loc} onChange={(e) => setLoc(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Día de entrada</Label>
              <Input type="date" value={date} onChange={(e) => (setDate(e.target.value), setEndDate(e.target.value))} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>Hora de entrada</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>Día de salida</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>Hora de salida</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11" />
            </div>
          </div>
          <ReasonPicker code={code} text={text} onChange={(c, t) => (setCode(c), setText(t))} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Añadir turno
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
