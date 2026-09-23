import { createFileRoute } from "@tanstack/react-router";

type Change = {
  field?: string;
  value?: {
    messages?: ({ id: string; from: string; type: string } & Record<string, unknown>)[];
    statuses?: { id: string; status: string; timestamp?: string }[];
  };
};

/**
 * Meta WhatsApp Cloud API webhook.
 * GET: subscription verification (hub.verify_token). POST: signed deliveries (X-Hub-Signature-256).
 * Without credentials it answers 503 and writes nothing — the core app is unaffected.
 */
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const verifyToken = process.env["META_WHATSAPP_VERIFY_TOKEN"];
        if (!verifyToken) return new Response("not configured", { status: 503 });
        const url = new URL(request.url);
        if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verifyToken) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const appSecret = process.env["META_WHATSAPP_APP_SECRET"];
        if (!appSecret) return new Response("not configured", { status: 503 });
        const raw = await request.text();
        if (raw.length > 4 * 1024 * 1024) return new Response("too large", { status: 413 });
        const { verifyMetaSignature, getWhatsAppProvider } = await import("@/lib/whatsapp.server");
        if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
          return new Response("invalid signature", { status: 401 });
        }
        let body: { entry?: { changes?: Change[] }[] };
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { handleIncoming, handleStatus } = await import("@/lib/whatsapp-handler.server");
        const provider = getWhatsAppProvider();

        for (const entry of body.entry ?? []) {
          for (const change of entry.changes ?? []) {
            const v = change.value ?? {};
            for (const m of v.messages ?? []) {
              const key = `msg:${m.id}`;
              const { data: seen } = await admin
                .from("whatsapp_webhook_events")
                .select("id, processed_at")
                .eq("dedupe_key", key)
                .maybeSingle();
              if (seen?.processed_at) continue; // idempotent: already handled
              let rowId = seen?.id;
              if (!rowId) {
                const { data: ins, error } = await admin
                  .from("whatsapp_webhook_events")
                  .insert({ dedupe_key: key, kind: "message", payload: m as never })
                  .select("id")
                  .single();
                if (error) {
                  if (error.code === "23505") continue; // concurrent duplicate
                  return new Response("storage error", { status: 500 });
                }
                rowId = ins.id;
              }
              try {
                await handleIncoming(admin, provider, m.from, m.id, m as never);
                await admin
                  .from("whatsapp_webhook_events")
                  .update({ processed_at: new Date().toISOString(), processing_error: null })
                  .eq("id", rowId);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                console.error("whatsapp processing failed", msg);
                await admin.from("whatsapp_webhook_events").update({ processing_error: msg }).eq("id", rowId);
                return new Response("processing error", { status: 500 });
              }
            }
            for (const s of v.statuses ?? []) {
              const key = `status:${s.id}:${s.status}`;
              const { error } = await admin
                .from("whatsapp_webhook_events")
                .insert({ dedupe_key: key, kind: "status", payload: s as never, processed_at: new Date().toISOString() });
              if (error && error.code !== "23505") return new Response("storage error", { status: 500 });
              if (!error) await handleStatus(admin, s as never);
            }
            if (!v.messages && !v.statuses) {
              // Unknown change types are stored, not discarded.
              await admin.from("whatsapp_webhook_events").insert({
                dedupe_key: `other:${crypto.randomUUID()}`,
                kind: change.field ?? "unknown",
                payload: change as never,
                processed_at: new Date().toISOString(),
              });
            }
          }
        }
        return new Response("ok");
      },
    },
  },
});
