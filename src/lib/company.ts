import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Company = {
  id: string;
  legal_name: string;
  tax_id: string | null;
  ccc: string | null;
  plan: string;
  trial_ends_at: string;
  subscription_status: string;
  is_demo: boolean;
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
  archived_at: string | null;
  pin_hash: string | null;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  company_id: string;
  worker_id: string;
  work_date: string;
  server_timestamp: string;
  local_time: string;
  type: "entry" | "exit";
  corrected: boolean;
  internal_notes: string | null;
};

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

export async function createCompanyForCurrentUser(input: {
  legal_name: string;
  tax_id?: string;
  ccc?: string;
}) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error("Sesión no válida");

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      legal_name: input.legal_name,
      tax_id: input.tax_id || null,
      ccc: input.ccc || null,
      owner_id: userData.user.id,
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase
    .from("company_members")
    .insert({ company_id: company.id, user_id: userData.user.id, role: "admin" });
  if (memberError) throw memberError;

  await logAudit(company.id, "create_company", "company", company.id, {
    legal_name: input.legal_name,
  });
  return company as Company;
}

export const PLANS = {
  local: { name: "Local", price: "7,90 €/mes + IVA", limits: "Hasta 10 empleados · 1 centro" },
  "local-plus": {
    name: "Local+",
    price: "14,90 €/mes + IVA",
    limits: "Hasta 30 empleados · Hasta 3 centros",
  },
} as const;
