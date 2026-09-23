import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Company = {
  id: string;
  legal_name: string;
  commercial_name: string | null;
  stripe_customer_id?: string | null;
  current_period_end?: string | null;
  tax_id: string | null;
  ccc: string | null;
  fiscal_address: string | null;
  country: string;
  billing_email: string | null;
  trial_ends_at: string;
  subscription_status: string;
  is_demo: boolean;
  is_pilot: boolean;
  created_at: string;
  owner_id: string | null;
};

export type Worker = {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  second_last_name: string | null;
  dni_nie: string | null;
  naf: string | null;
  status: string;
  hired_at: string | null;
  ended_at: string | null;
  archived_at: string | null;
  has_pin: boolean | null;
  access_token: string;
  break_tracking: boolean;
  break_paid: boolean;
  created_at: string;
};

export const WORKER_COLUMNS =
  "id, company_id, first_name, last_name, second_last_name, dni_nie, naf, status, hired_at, ended_at, archived_at, has_pin, access_token, break_tracking, break_paid, created_at";

export type Location = {
  id: string;
  company_id: string;
  name: string;
  address: string;
  archived_at: string | null;
  created_at: string;
};

export type EffectiveEntry = {
  id: string;
  company_id: string;
  worker_id: string;
  type: "entry" | "exit" | "break_start" | "break_end";
  is_manual: boolean;
  manual_reason: string | null;
  original_timestamp: string;
  original_local_time: string;
  original_work_date: string;
  original_location_id: string | null;
  effective_timestamp: string;
  effective_work_date: string;
  effective_local_time: string;
  effective_location_id: string | null;
  is_corrected: boolean;
  correction_reason: string | null;
  correction_reason_code: string | null;
  corrected_at: string | null;
  created_at: string;
};

export const ENTRY_LABEL: Record<string, string> = {
  entry: "Entrada",
  exit: "Salida",
  break_start: "Inicio pausa",
  break_end: "Fin pausa",
};

export const REASONS = [
  { code: "olvido_entrada", label: "Olvido de entrada" },
  { code: "olvido_salida", label: "Olvido de salida" },
  { code: "olvido_turno", label: "Olvido de turno completo" },
  { code: "fichaje_erroneo", label: "Fichaje erróneo" },
  { code: "hora_incorrecta", label: "Hora incorrecta" },
  { code: "local_incorrecto", label: "Local incorrecto" },
  { code: "incidencia_tecnica", label: "Incidencia técnica" },
  { code: "cambio_comunicado", label: "Cambio comunicado" },
  { code: "otro", label: "Otro" },
] as const;

export const MAX_SELF_SERVICE_WORKERS = 30;
export const PRICE_PER_WORKER = "1,00 € + IVA";

export const companyQueryKey = ["current-company"];

export function useCompany() {
  return useQuery({
    queryKey: companyQueryKey,
    queryFn: async (): Promise<Company | null> => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Company | undefined) ?? null;
    },
  });
}

export function useLocations(companyId?: string) {
  return useQuery({
    queryKey: ["locations", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at");
      if (error) throw error;
      return data as Location[];
    },
  });
}

export function useWorkers(companyId?: string) {
  return useQuery({
    queryKey: ["workers", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(WORKER_COLUMNS)
        .eq("company_id", companyId!)
        .order("status")
        .order("first_name");
      if (error) throw error;
      return data as unknown as Worker[];
    },
  });
}

export function usePendingIncidents(companyId?: string) {
  return useQuery({
    queryKey: ["incidents-pending-count", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("incidents")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export async function logAudit(
  companyId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { data } = await supabase.auth.getUser();
  await supabase.from("audit_logs").insert({
    company_id: companyId,
    actor_id: data.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: metadata as never,
  });
}

export function rpcErrorMessage(error: unknown, fallback = "No se ha podido completar") {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  const map: Record<string, string> = {
    reason_required: "Indica un motivo (mínimo 3 caracteres).",
    worker_limit_reached:
      "Has llegado a 30 trabajadores activos. ¿Necesitas más capacidad? Contacta con nosotros en soporte@turnopin.es.",
    end_before_start: "La salida debe ser posterior a la entrada.",
    exit_before_entry: "La salida debe ser posterior a la entrada abierta.",
    future_time: "No se pueden registrar horas futuras.",
    already_resolved: "Esta incidencia ya estaba resuelta.",
    invalid_location: "Local no válido.",
    not_allowed: "No tienes permiso para esta acción.",
    company_read_only:
      "La cuenta está en solo lectura (prueba terminada o suscripción cancelada). Añade un método de pago en Ajustes.",
    companies_tax_id_unique: "Ya existe una cuenta o prueba con este NIF/CIF. Escríbenos a soporte@turnopin.es.",
  };
  for (const key of Object.keys(map)) if (msg.includes(key)) return map[key]!;
  return msg || fallback;
}

export async function createCompanyForCurrentUser(input: {
  legal_name: string;
  commercial_name: string;
  tax_id: string;
  fiscal_address: string;
  country: string;
  billing_email: string;
  ccc?: string;
  location_name: string;
  location_address: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sesión no válida");

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      legal_name: input.legal_name,
      commercial_name: input.commercial_name || null,
      tax_id: input.tax_id,
      fiscal_address: input.fiscal_address,
      country: input.country,
      billing_email: input.billing_email,
      ccc: input.ccc || null,
      owner_id: userData.user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(rpcErrorMessage(error));

  const { error: memberError } = await supabase
    .from("company_members")
    .insert({ company_id: company.id, user_id: userData.user.id, role: "admin" });
  if (memberError) throw memberError;

  const { data: loc, error: locError } = await supabase
    .from("locations")
    .insert({ company_id: company.id, name: input.location_name, address: input.location_address })
    .select("id")
    .single();
  if (locError) throw locError;
  await supabase.from("kiosks").insert({ company_id: company.id, location_id: loc.id });

  await logAudit(company.id, "create_company", "company", company.id, {
    legal_name: input.legal_name,
  });
  return company as Company;
}

/** Sums worked minutes from ordered effective entries; breaks subtract unless paid. */
export function effectiveMinutes(entries: EffectiveEntry[], breakPaid: boolean) {
  let total = 0;
  let open: number | null = null;
  let breakOpen: number | null = null;
  for (const e of entries) {
    const t = new Date(e.effective_timestamp).getTime();
    if (e.type === "entry") open = t;
    else if (e.type === "exit" && open !== null) {
      total += (t - open) / 60000;
      open = null;
    } else if (e.type === "break_start") breakOpen = t;
    else if (e.type === "break_end" && breakOpen !== null) {
      if (!breakPaid) total -= (t - breakOpen) / 60000;
      breakOpen = null;
    }
  }
  return Math.max(0, Math.round(total));
}
