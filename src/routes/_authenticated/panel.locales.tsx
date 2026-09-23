import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, ExternalLink, MapPin, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { logAudit, rpcErrorMessage, useCompany, useLocations, type Location } from "@/lib/company";

export const Route = createFileRoute("/_authenticated/panel/locales")({
  component: LocationsPage,
  head: () => ({
    meta: [
      { title: "Locales y kioscos · TurnoPIN" },
      { name: "description", content: "Gestiona tus locales y el kiosco de fichaje de cada uno." },
      { property: "og:title", content: "Locales y kioscos · TurnoPIN" },
      { property: "og:description", content: "Un kiosco por local, vinculado hasta que lo cambies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LocationsPage() {
  const { data: company } = useCompany();
  const companyId = company?.id;
  const qc = useQueryClient();
  const { data: locations = [] } = useLocations(companyId);
  const [editing, setEditing] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const kiosks = useQuery({
    queryKey: ["kiosks", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kiosks")
        .select("location_id, token")
        .eq("company_id", companyId!)
        .eq("active", true);
      if (error) throw error;
      return Object.fromEntries(data.map((k) => [k.location_id, k.token])) as Record<string, string>;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !address.trim()) throw new Error("Nombre y dirección son obligatorios");
      if (editing) {
        const { error } = await supabase
          .from("locations")
          .update({ name: name.trim(), address: address.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        await logAudit(companyId!, "update_location", "location", editing.id, { name });
      } else {
        const { data, error } = await supabase
          .from("locations")
          .insert({ company_id: companyId!, name: name.trim(), address: address.trim() })
          .select("id")
          .single();
        if (error) throw error;
        await supabase.from("kiosks").insert({ company_id: companyId!, location_id: data.id });
        await logAudit(companyId!, "create_location", "location", data.id, { name });
      }
    },
    onSuccess: () => {
      toast.success("Local guardado");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["locations", companyId] });
      qc.invalidateQueries({ queryKey: ["kiosks", companyId] });
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const toggleArchive = useMutation({
    mutationFn: async (l: Location) => {
      const archiving = !l.archived_at;
      const { error } = await supabase
        .from("locations")
        .update({ archived_at: archiving ? new Date().toISOString() : null })
        .eq("id", l.id);
      if (error) throw error;
      await logAudit(companyId!, archiving ? "archive_location" : "reactivate_location", "location", l.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations", companyId] }),
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const rotate = useMutation({
    mutationFn: async (locationId: string) => {
      const { error } = await supabase.rpc("admin_rotate_kiosk", { p_location_id: locationId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nuevo enlace de kiosco creado. El anterior deja de funcionar.");
      qc.invalidateQueries({ queryKey: ["kiosks", companyId] });
    },
    onError: (e) => toast.error(rpcErrorMessage(e)),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Locales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Locales ilimitados. Cada local tiene un kiosco: abre su enlace en la tablet o móvil del
            local y déjalo ahí.
          </p>
        </div>
        <Button
          className="h-11"
          onClick={() => {
            setEditing(null);
            setName("");
            setAddress("");
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo local
        </Button>
      </header>

      <div className="grid gap-3">
        {locations.map((l) => {
          const token = kiosks.data?.[l.id];
          const url = token ? `${origin}/kiosco/${token}` : "";
          return (
            <div key={l.id} className="card-soft space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    <MapPin className="h-4 w-4 text-primary" /> {l.name}
                    {l.archived_at && (
                      <span className="rounded bg-muted px-2 text-xs font-normal">Archivado</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{l.address || "Sin dirección"}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(l);
                      setName(l.name);
                      setAddress(l.address);
                      setOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleArchive.mutate(l)}>
                    {l.archived_at ? "Reactivar" : "Archivar"}
                  </Button>
                </div>
              </div>
              {token && !l.archived_at && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Enlace del kiosco
                  </div>
                  <div className="mt-1 break-all font-mono text-xs">{url}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(url);
                        toast.success("Enlace copiado");
                      }}
                    >
                      <Copy className="mr-1 h-4 w-4" /> Copiar
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1 h-4 w-4" /> Abrir
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("¿Cambiar el dispositivo del kiosco? El enlace actual dejará de funcionar."))
                          rotate.mutate(l.id);
                      }}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" /> Cambiar dispositivo
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar local" : "Nuevo local"}</DialogTitle>
            <DialogDescription>Cada fichaje queda asociado al local donde se hace.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label>Dirección física *</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-11" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
