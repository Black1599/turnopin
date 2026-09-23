import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled job (e.g. every Monday 08:00 Europe/Madrid):
 * 1. Enqueues the weekly incident summary for each company (deduplicated per ISO week).
 * 2. Dispatches pending outbox emails once an email provider is connected.
 *    Until then messages stay "pending" in notification_outbox — the core app is never blocked.
 */
export const Route = createFileRoute("/api/public/cron/notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const url = new URL(request.url);
        let enqueued = 0;
        if (url.searchParams.get("weekly") === "1") {
          const { data, error } = await supabaseAdmin.rpc("enqueue_weekly_summaries");
          if (error) return new Response(error.message, { status: 500 });
          enqueued = Number(data ?? 0);
        }
        const { dispatchPending } = await import("@/lib/notifications.server");
        const dispatched = await dispatchPending(supabaseAdmin);
        return Response.json({ ok: true, enqueued, ...dispatched });
      },
    },
  },
});
