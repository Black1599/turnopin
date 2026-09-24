import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, KeyRound, Link2, MessageCircle, Pencil, Plus, RotateCcw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
import {
  logAudit,
  MAX_SELF_SERVICE_WORKERS,
  rpcErrorMessage,
  useCompany,
  useLocations,
  useWorkers,
  type Worker,
} from "@/lib/company";
import { formatShortDate, workerName } from "@/lib/fmt";

export const Route = createFileRoute("/_authenticated/panel/empleados")({
  component: WorkersPage,
  head: () => ({
    meta: [
      { title: "Trabajadores · TurnoPIN" },
      { name: "description", content: "Alta, edición, PIN, locales y pausas de tus trabajadores." },
      { property: "og:title", content: "Trabajadores · TurnoPIN" },
      { property: "og:description", content: "Gestiona tu equipo sin borrar nunca su historial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FormState = {
  first_name: string;
  last_name: string;
  second_last_name: string;
  dni_nie: string;
  naf: string;
  hired_at: string;
  ended_at: string;
  pin: string;
  break_tracking: boolean;
  break_paid: boolean;
  locations: string[];
  phone: string;
  whatsapp_enabled: boolean;
};

const emptyForm: FormState = {
  first_name: "",
  last_name: "",
  second_last_name: "",
  dni_nie: "",
  naf: "",
  hired_at: "",
  ended_at: "",
  pin: "",
  break_tracking: false,
  break_paid: false,
  locations: [],
  phone: "",
  whatsapp_enabled: false,
};

const BILLING_NOTE =
  "Cada trabajador activo cuenta 1 € + IVA completo en el ciclo mensual en que esté activo (sin prorrateo, máximo una vez por ciclo). Durante la prueba no se cobra.";

function WorkersPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const qc = useQueryClient();
  const { data: workers = [] } = useWorkers(companyId);
  const { data: locations = [] } = useLocations(companyId);
  const activeLocations = locations.filter((l) => !l.archived_at);
  const [editing, setEditing] = useState<Worker | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pinTarget, setPinTarget] = useState<Worker | null>(null);
  const [newPin, setNewPin] = useState("");
  const [linkTarget, setLinkTarget] = useState<Worker | null>(null);
  const [waTarget, setWaTarget] = useState<Worker | null>(null);
  const [waCode, setWaCode] = useState<string | null>(null);
  const [waPriceConfirm, setWaPriceConfirm] = useState(false);


  const assignments = useQuery({
    queryKey: ["worker-locations", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_locations")
        .select("worker_id, location_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const r of data) (map[r.worker_id] ??= []).push(r.location_id);
      return map;
    },
  });

  // Non-financial WhatsApp usage for this month (no cost data is exposed to companies).
  const waUsage = useQuery({
    queryKey: ["wa-usage", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("company_whatsapp_usage", {
        p_company_id: companyId!,
        p_month: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      const map: Record<string, { actions: number; messages: number }> = {};
      for (const r of data ?? []) map[r.worker_id] = { actions: r.actions, messages: r.messages };
      return map;
    },
  });

  const activeCount = workers.filter((w) => w.status === "active").length;
  const atLimit = activeCount >= MAX_SELF_SERVICE_WORKERS;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workers", companyId] });
    qc.invalidateQueries({ queryKey: ["worker-locations", companyId] });
  };

  const saveWorker = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sin negocio");
      if (!form.first_name.trim() || !form.last_name.trim())
        throw new Error("Nombre y primer apellido son obligatorios");
      if (form.pin && !/^\d{4}$/.test(form.pin)) throw new Error("El PIN debe tener 4 dígitos");
      if (!editing && !form.pin) throw new Error("Asigna un PIN inicial de 4 dígitos");
      if (form.locations.length === 0) throw new Error("Autoriza al menos un local");
      const phone = form.phone.replace(/[\s-]/g, "");
      if (phone && !/^\+?\d{8,15}$/.test(phone))
        throw new Error("Teléfono no válido. Usa el formato internacional, p. ej. +34600111222");
      if (form.whatsapp_enabled && !phone) throw new Error("Para usar WhatsApp indica su teléfono");

      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        second_last_name: form.second_last_name.trim() || null,
        dni_nie: form.dni_nie.trim() || null,
        naf: form.naf.trim() || null,
        hired_at: form.hired_at || null,
        ended_at: form.ended_at || null,
        break_tracking: form.break_tracking,
        break_paid: form.break_paid,
        phone: phone ? (phone.startsWith("+") ? phone : `+34${phone}`) : null,
        whatsapp_enabled: form.whatsapp_enabled,
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

      const current = assignments.data?.[workerId!] ?? [];
      const toAdd = form.locations.filter((l) => !current.includes(l));
      const toRemove = current.filter((l) => !form.locations.includes(l));
      if (toAdd.length) {
        const { error } = await supabase
          .from("worker_locations")
          .insert(toAdd.map((location_id) => ({ worker_id: workerId!, location_id, company_id: companyId })));
        if (error) throw error;
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from("worker_locations")
          .delete()
          .eq("worker_id", workerId!)
          .in("location_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length || toRemove.length)
        await logAudit(companyId, "update_worker_locations", "worker", workerId!, { add: toAdd, remove: toRemove });

      if (form.pin && workerId) {
        const { error } = await supabase.rpc("admin_set_worker_pin", { p_worker_id: workerId, p_pin: form.pin });
        if (error) throw error;
      }
      return !editing;
    },
    onSuccess: (created) => {
      toast.success(editing ? "Trabajador actualizado" : "Trabajador creado");
      if (created && activeCount + 1 === MAX_SELF_SERVICE_WORKERS)
        toast.warning("Has llegado al máximo de 30 trabajadores activos en autoservicio.");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: (error) => toast.error(rpcErrorMessage(error, "Error al guardar")),
  });

  const toggleStatus = useMutation({
    mutationFn: async (worker: Worker) => {
      const archiving = worker.status === "active";
      const msg = archiving
        ? "¿Archivar? Su acceso personal y su PIN dejan de funcionar al momento. El historial se conserva. No hay devolución del ciclo en curso; deja de contar desde la siguiente renovación."
        : "¿Reactivar? Si no se ha contado ya en este ciclo, cuenta 1 € completo en el ciclo actual.";
      if (!confirm(msg)) return;
      const { error } = await supabase
        .from("workers")
        .update({ status: archiving ? "archived" : "active", archived_at: archiving ? new Date().toISOString() : null })
        .eq("id", worker.id);
      if (error) throw error;
      await logAudit(worker.company_id, archiving ? "archive_worker" : "reactivate_worker", "worker", worker.id);
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const setPin = useMutation({
    mutationFn: async () => {
      if (!/^\d{4}$/.test(newPin)) throw new Error("El PIN debe tener 4 dígitos");
      const { error } = await supabase.rpc("admin_set_worker_pin", { p_worker_id: pinTarget!.id, p_pin: newPin });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("PIN restablecido. No volverá a mostrarse.");
      setPinTarget(null);
      setNewPin("");
      invalidate();
    },
    onError: (error) => toast.error(rpcErrorMessage(error)),
  });

  const rotateLink = useMutation({
    mutationFn: async (w: Worker) => {
      const { data, error } = await supabase.rpc("admin_rotate_worker_access", { p_worker_id: w.id });
      if (error) throw error;
      return { ...w, access_token: data as string };
    },
    onSuccess: (w) => {
      setLinkTarget(w);
      toast.success("Enlace renovado. El anterior deja de funcionar.");
      invalidate();
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const genCode = useMutation({
    mutationFn: async (w: Worker) => {
      const { data, error } = await supabase.rpc("admin_whatsapp_link_code", { p_worker_id: w.id });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (code) => {
      setWaCode(code);
      invalidate();
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const unlinkWa = useMutation({
    mutationFn: async (w: Worker) => {
      const { error } = await supabase.rpc("admin_whatsapp_unlink", { p_worker_id: w.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("WhatsApp desvinculado. Ese número ya no puede fichar.");
      setWaTarget(null);
      invalidate();
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Trabajadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} activos de {MAX_SELF_SERVICE_WORKERS} en autoservicio. Los archivados conservan
            su historial.
          </p>
        </div>
        <Button
          className="h-11"
          disabled={atLimit}
          onClick={() => {
            setEditing(null);
            setForm({ ...emptyForm, locations: activeLocations.length === 1 ? [activeLocations[0]!.id] : [] });
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo trabajador
        </Button>
      </header>

      {atLimit && (
        <div className="rounded-lg border border-warning bg-warning/10 p-4 text-sm">
          Has llegado a 30 trabajadores activos. Los fichajes siguen funcionando con normalidad. ¿Necesitas
          más capacidad?{" "}
          <a className="font-medium underline" href="mailto:soporte@turnopin.es">
            Contacta con nosotros
          </a>
          .
        </div>
      )}

      {workers.length === 0 ? (
        <div className="card-soft p-10 text-center">
          <h2 className="font-semibold">Todavía no hay trabajadores</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Añade a tu equipo, autorízalo en su local y asigna un PIN de 4 dígitos.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {workers.map((w) => (
            <div key={w.id} className="card-soft flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{workerName(w)}</span>
                  {w.status === "archived" && <Badge variant="secondary">Archivado</Badge>}
                  {!w.has_pin && <Badge variant="outline">Sin PIN</Badge>}
                  {w.whatsapp_enabled && (
                    <Badge variant="outline">
                      WhatsApp {w.whatsapp_link_status === "linked" ? "vinculado" : "pendiente"}
                    </Badge>
                  )}
                  {waUsage.data?.[w.id] && (
                    <span className="text-xs text-muted-foreground">
                      Este mes por WhatsApp: {waUsage.data[w.id]!.actions} fichajes · {waUsage.data[w.id]!.messages} mensajes
                    </span>
                  )}
                  {w.break_tracking && (
                    <Badge variant="outline">Pausas {w.break_paid ? "retribuidas" : "no computan"}</Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {(assignments.data?.[w.id] ?? []).map(locName).join(", ") || "Sin local"}
                  {w.hired_at ? ` · Alta ${formatShortDate(w.hired_at)}` : ""}
                  {w.ended_at ? ` · Baja ${formatShortDate(w.ended_at)}` : ""}
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
                      ended_at: w.ended_at ?? "",
                      pin: "",
                      break_tracking: w.break_tracking,
                      break_paid: w.break_paid,
                      locations: assignments.data?.[w.id] ?? [],
                      phone: w.phone ?? "",
                      whatsapp_enabled: w.whatsapp_enabled,
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
                {w.status === "active" && (
                  <>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setPinTarget(w)}>
                      <KeyRound className="mr-1 h-4 w-4" /> Restablecer PIN
                    </Button>
                    <Button variant="outline" size="sm" className="h-10" onClick={() => setLinkTarget(w)}>
                      <Link2 className="mr-1 h-4 w-4" /> Acceso personal
                    </Button>
                    {w.whatsapp_enabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10"
                        onClick={() => {
                          setWaCode(null);
                          setWaTarget(w);
                        }}
                      >
                        <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
                      </Button>
                    )}
                  </>
                )}
                <Button variant="ghost" size="sm" className="h-10" onClick={() => toggleStatus.mutate(w)}>
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
            <DialogTitle>{editing ? "Editar trabajador" : "Nuevo trabajador"}</DialogTitle>
            <DialogDescription>
              {editing ? "El PIN se guarda cifrado y no puede consultarse." : BILLING_NOTE}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre *">
                <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="h-11" />
              </Field>
              <Field label="Primer apellido *">
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="h-11" />
              </Field>
              <Field label="Segundo apellido">
                <Input value={form.second_last_name} onChange={(e) => setForm({ ...form, second_last_name: e.target.value })} className="h-11" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="DNI / NIE (opcional)">
                <Input value={form.dni_nie} onChange={(e) => setForm({ ...form, dni_nie: e.target.value })} className="h-11" />
              </Field>
              <Field label="NAF (opcional)">
                <Input value={form.naf} onChange={(e) => setForm({ ...form, naf: e.target.value })} className="h-11" />
              </Field>
              <Field label="Fecha de alta interna">
                <Input type="date" value={form.hired_at} onChange={(e) => setForm({ ...form, hired_at: e.target.value })} className="h-11" />
              </Field>
              <Field label="Fecha de baja interna">
                <Input type="date" value={form.ended_at} onChange={(e) => setForm({ ...form, ended_at: e.target.value })} className="h-11" />
              </Field>
            </div>
            <Field label={editing ? "Nuevo PIN (opcional)" : "PIN inicial de 4 dígitos *"}>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className="h-11"
              />
            </Field>
            <div className="space-y-2">
              <Label>Locales autorizados *</Label>
              <div className="grid gap-2">
                {activeLocations.map((l) => (
                  <label key={l.id} className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-primary"
                      checked={form.locations.includes(l.id)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          locations: e.target.checked
                            ? [...form.locations, l.id]
                            : form.locations.filter((x) => x !== l.id),
                        })
                      }
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={form.break_tracking}
                  onChange={(e) => setForm({ ...form, break_tracking: e.target.checked })}
                />
                Registrar pausas en el kiosco
              </label>
              {form.break_tracking && (
                <label className="flex items-center gap-3 pl-8 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={form.break_paid}
                    onChange={(e) => setForm({ ...form, break_paid: e.target.checked })}
                  />
                  La pausa computa como tiempo trabajado
                </label>
              )}
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={form.whatsapp_enabled}
                  onChange={(e) => setForm({ ...form, whatsapp_enabled: e.target.checked })}
                />
                Permitir fichar también por WhatsApp (opcional)
              </label>
              <p className="pl-8 text-sm font-medium text-foreground">
                +1 € + IVA / trabajador con WhatsApp activado / mes
              </p>
              <Field label={form.whatsapp_enabled ? "Teléfono móvil *" : "Teléfono móvil (opcional)"}>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="+34 600 111 222"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-11"
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                Usar su móvil personal es voluntario: el kiosco sigue disponible siempre. Cambiar el teléfono o
                desactivar WhatsApp desvincula el número al momento. Si desactivas WhatsApp, no hay devolución
                del ciclo en curso: deja de contar a partir de la siguiente renovación.
              </p>
            </div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (form.whatsapp_enabled && !editing?.whatsapp_enabled) setWaPriceConfirm(true);
                else saveWorker.mutate();
              }}
              disabled={saveWorker.isPending}
            >
              Guardar
            </Button>

          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pinTarget)} onOpenChange={(v) => !v && setPinTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restablecer PIN de {pinTarget ? workerName(pinTarget) : ""}</DialogTitle>
            <DialogDescription>
              El PIN actual no se puede consultar. Escribe uno nuevo y comunícaselo; podrá cambiarlo en el
              kiosco.
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

      <Dialog open={Boolean(waTarget)} onOpenChange={(v) => !v && setWaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>WhatsApp de {waTarget ? workerName(waTarget) : ""}</DialogTitle>
            <DialogDescription>
              Opcional. El kiosco sigue disponible. Solo un número vinculado puede fichar; cualquier otro número
              se ignora.
            </DialogDescription>
          </DialogHeader>
          {waTarget && (
            <div className="space-y-3 text-sm">
              <div>
                Teléfono: <span className="font-mono">{waTarget.phone}</span>
              </div>
              <div>
                Estado:{" "}
                {waTarget.whatsapp_link_status === "linked"
                  ? `Vinculado el ${formatShortDate(waTarget.whatsapp_linked_at)}`
                  : waTarget.whatsapp_link_status === "pending"
                    ? "Pendiente de vincular"
                    : "Sin vincular"}
              </div>
              {waCode ? (
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-xs text-muted-foreground">Código de un solo uso (24 h). No volverá a mostrarse.</div>
                  <div className="mt-1 font-mono text-3xl tracking-[0.3em]">{waCode}</div>
                </div>
              ) : null}
              <p className="text-muted-foreground">
                Para vincular, el trabajador escribe desde ese teléfono al WhatsApp de TurnoPIN y envía el código de 6
                cifras (o su PIN de 4 cifras). Después verá los botones Entrar, Pausa, Salir y Ver estado.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            {waTarget?.whatsapp_link_status === "linked" && (
              <Button variant="ghost" onClick={() => unlinkWa.mutate(waTarget)} disabled={unlinkWa.isPending}>
                Desvincular
              </Button>
            )}
            <Button onClick={() => waTarget && genCode.mutate(waTarget)} disabled={genCode.isPending}>
              Generar código
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkTarget)} onOpenChange={(v) => !v && setLinkTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acceso personal de {linkTarget ? workerName(linkTarget) : ""}</DialogTitle>
            <DialogDescription>
              Con este enlace y su PIN puede consultar su historial y descargar su PDF mensual. Solo
              lectura: no permite fichar.
            </DialogDescription>
          </DialogHeader>
          {linkTarget && (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg bg-background p-3">
                <QRCodeSVG value={`${origin}/mi/${linkTarget.access_token}`} size={180} />
              </div>
              <div className="break-all text-center font-mono text-xs">
                {origin}/mi/{linkTarget.access_token}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => linkTarget && rotateLink.mutate(linkTarget)}>
              Renovar enlace
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(`${origin}/mi/${linkTarget?.access_token}`);
                toast.success("Enlace copiado");
              }}
            >
              Copiar enlace
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
