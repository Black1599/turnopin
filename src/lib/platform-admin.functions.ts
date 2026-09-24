import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Platform admin only: reports which external integrations are configured (booleans, never values). */
export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "platform_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const has = (k: string) => Boolean(process.env[k]);
    return {
      stripe: has("STRIPE_SECRET_KEY") && has("STRIPE_WEBHOOK_SECRET"),
      email: has("RESEND_API_KEY") || has("EMAIL_API_KEY"),
      whatsapp: has("META_WHATSAPP_ACCESS_TOKEN") && has("META_WHATSAPP_PHONE_NUMBER_ID"),
    };
  });
