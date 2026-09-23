import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Email provider hook. Returns false when no provider is configured so messages stay queued.
 * Connect a provider here (e.g. Lovable Emails from soporte@turnopin.es) without touching the core.
 */
async function sendEmail(_to: string, _kind: string, _payload: unknown): Promise<boolean> {
  return false;
}

export async function dispatchPending(db: SupabaseClient<Database>) {
  const { data } = await db
    .from("notification_outbox")
    .select("id, recipient, kind, payload, attempts")
    .eq("status", "pending")
    .order("created_at")
    .limit(50);
  let sent = 0;
  let skipped = 0;
  for (const m of data ?? []) {
    if (!m.recipient) {
      skipped++;
      continue;
    }
    const ok = await sendEmail(m.recipient, m.kind, m.payload);
    if (ok) {
      sent++;
      await db.from("notification_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", m.id);
    } else skipped++;
  }
  return { sent, skipped, provider: "not_configured" as const };
}
