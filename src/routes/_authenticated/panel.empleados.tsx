import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Pencil, Plus, RotateCcw, Archive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { logAudit, useCompany, type Worker } from "@/lib/company";
import { workerName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/empleados")({
  component: WorkersPage,
});

type FormState = {
  first_name: string;
  last_name: string;
  second_last_name: string;
  dni_nie: string;
  naf: string;
  hired_at: string;
  pin: string;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  second_last_name: "",
  dni_nie: "",
  naf: "",
  hired_at: "",
  pin: "",
};

function WorkersPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Worker | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pinTarget, setPinTarget] = useState<Worker | null>(null);
  const [newPin, setNewPin] = useState("");

  const workersQuery = useQuery({
    queryKey: ["workers", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .eq("company_id", companyId!)
        .order("status")
        .order("first_name");
      if (error) throw error;
      return data as Worker[];
    },
  });

  const saveWorker = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sin negocio");
      if (!form.first_name.trim() || !form.last_name.trim())
        throw new Error("Nombre y primer apellido son obligatorios");
      if (form.pin && !/^\d{4}$/.test(form.pin)) throw new Error("El PIN debe tener 4 dígitos");

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        second_last_name: form.second_last_name.trim() || null,
        dni_nie: form.dni_nie.trim() || null,
        naf: form.naf.trim() || null,
        hired_at: form.hired_at || null,
      };

      let workerId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("workers").update(payload).eq("id", editing.id);
        if (error) throw error;
        await logAudit(companyId, "update_worker", "worker", editing.id, payload);
      } else {
        const { data, error } = await supabase
          .from("workers")
          .insert({ ...payload, company_id: companyId })
          .select("id")
          .single();
        if (error) throw error;
        workerId = data.id;
        await logAudit(companyId, "create_worker", "worker", data.id, payload);
      }

      if (form.pin && workerId) {
        const { error } = await supabase.rpc("admin_set_worker_pin", {
          p_worker_id: workerId,
          p_pin: form.pin,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Empleado actualizado" : "Empleado creado");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["workers", companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Error al guardar"),
  });

  const toggleStatus = useMutation({
    mutationFn: async (worker: Worker) => {
      const archiving = worker.status === "active";
      const { error } = await supabase
        .from("workers")
        .update({
          status: archiving ? "archived" : "active",
          archived_at: archiving ? new Date().toISOString() : null,
        })
        .eq("id", worker.id);
      if (error) throw error;
      await logAudit(
        worker.company_id,
        archiving ? "archive_worker" : "reactivate_worker",
        "worker",
        worker.id,
      );
    },
    onSuccess: () => {
      toast.success("Estado actualizado. El historial se conserva.");
      queryClient.invalidateQueries({ queryKey: ["workers", companyId] });
    },
    onError: () => toast.error("No se ha podido cambiar el estado"),
  });

  const setPin = useMutation({
    mutationFn: async () => {
      if (!/^\d{4}$/.test(newPin)) throw new Error("El PIN debe tener 4 dígitos");
      const { error } = await supabase.rpc("admin_set_worker_pin", {
        p_worker_id: pinTarget!.id,
        p_pin: newPin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PIN guardado. No volverá a mostrarse.");
      setPinTarget(null);
      setNewPin("");
      queryClient.invalidateQueries({ queryKey: ["workers", companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Error al guardar PIN"),
  });

  const workers = workersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Empleados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Los empleados archivados no aparecen en el kiosco, pero conservan su historial.
          </p>
        </div>
        <Button
          className="h-11"
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo empleado
        </Button>
      </header>

      {workers.length === 0 ? (
        <div className="card-soft p-10 text-center">
          <h2 className="font-semibold">Todavía no hay empleados</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Añade a tu equipo y asigna un PIN de 4 dígitos para que puedan fichar en el kiosco.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {workers.map((w) => (
            <div
              key={w.id}
              className="card-soft flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{workerName(w)}</span>
                  {w.status === "archived" && <Badge variant="secondary">Archivado</Badge>}
                  {!w.pin_hash && <Badge variant="outline">Sin PIN</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {w.dni_nie ? `DNI/NIE ${w.dni_nie} · ` : ""}
                  {w.naf ? `NAF ${w.naf} · ` : ""}
                  {w.hired_at ? `Alta ${w.hired_at}` : "Sin fecha de alta"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => {
                    setEditing(w);
                    setForm({
                      first_name: w.first_name,
                      last_name: w.last_name,
                      second_last_name: w.second_last_name ?? "",
                      dni_nie: w.dni_nie ?? "",
                      naf: w.naf ?? "",
                      hired_at: w.hired_at ?? "",
                      pin: "",
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => {
                    setPinTarget(w);
                    setNewPin("");
                  }}
                >
                  <KeyRound className="mr-1 h-4 w-4" /> PIN
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10"
                  onClick={() => toggleStatus.mutate(w)}
                >
                  {w.status === "active" ? (
                    <>
                      <Archive className="mr-1 h-4 w-4" /> Archivar
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-1 h-4 w-4" /> Reactivar
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
            <DialogDescription>
              El PIN se guarda cifrado y no puede consultarse después.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Nombre *">
              <Input
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="h-11"
              />
            </Field>
            <Field label="Primer apellido *">
              <Input
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="h-11"
              />
            </Field>
            <Field label="Segundo apellido">
              <Input
                value={form.second_last_name}
                onChange={(e) => setForm({ ...form, second_last_name: e.target.value })}
                className="h-11"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="DNI / NIE">
                <Input
                  value={form.dni_nie}
                  onChange={(e) => setForm({ ...form, dni_nie: e.target.value })}
                  className="h-11"
                />
              </Field>
              <Field label="NAF">
                <Input
                  value={form.naf}
                  onChange={(e) => setForm({ ...form, naf: e.target.value })}
                  className="h-11"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha de alta">
                <Input
                  type="date"
                  value={form.hired_at}
                  onChange={(e) => setForm({ ...form, hired_at: e.target.value })}
                  className="h-11"
                />
              </Field>
              <Field label={editing ? "Nuevo PIN (opcional)" : "PIN de 4 dígitos"}>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) =>
                    setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })
                  }
                  className="h-11"
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveWorker.mutate()} disabled={saveWorker.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pinTarget)} onOpenChange={(v) => !v && setPinTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PIN de {pinTarget ? workerName(pinTarget) : ""}</DialogTitle>
            <DialogDescription>
              Escribe 4 dígitos. Comunícaselos al empleado: no podrás volver a verlos.
            </DialogDescription>
          </DialogHeader>
          <Input
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="h-12 text-center text-2xl tracking-[0.5em]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={() => setPin.mutate()} disabled={setPin.isPending}>
              Guardar PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
