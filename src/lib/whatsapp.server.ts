/**
 * WhatsApp provider layer — Meta WhatsApp Business Platform (Cloud API), direct, no BSP.
 * All credentials come from environment secrets; nothing is hardcoded.
 *   META_WHATSAPP_PHONE_NUMBER_ID, META_WHATSAPP_ACCESS_TOKEN, META_WHATSAPP_VERIFY_TOKEN,
 *   META_WHATSAPP_APP_SECRET, META_WHATSAPP_BUSINESS_ACCOUNT_ID, (optional) META_GRAPH_API_VERSION
 */
import { createHmac, timingSafeEqual } from "crypto";

export type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string | undefined;
  appSecret: string | undefined;
  businessAccountId: string | undefined;
  apiVersion: string;
};

export function whatsappConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env["META_WHATSAPP_PHONE_NUMBER_ID"];
  const accessToken = process.env["META_WHATSAPP_ACCESS_TOKEN"];
  if (!phoneNumberId || !accessToken) return null;
  return {
    phoneNumberId,
    accessToken,
    verifyToken: process.env["META_WHATSAPP_VERIFY_TOKEN"],
    appSecret: process.env["META_WHATSAPP_APP_SECRET"],
    businessAccountId: process.env["META_WHATSAPP_BUSINESS_ACCOUNT_ID"],
    apiVersion: process.env["META_GRAPH_API_VERSION"] ?? "v21.0",
  };
}

/** Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the app secret). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Button = { id: string; title: string };

export interface WhatsAppProvider {
  sendText(to: string, text: string): Promise<SendResult>;
  sendButtons(to: string, text: string, buttons: Button[]): Promise<SendResult>;
  markRead(messageId: string): Promise<void>;
}

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };

class MetaCloudProvider implements WhatsAppProvider {
  constructor(private cfg: WhatsAppConfig) {}

  private async post(body: Record<string, unknown>): Promise<SendResult> {
    const res = await fetch(
      `https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error(`WhatsApp send failed [${res.status}]: ${text}`);
      return { ok: false, error: `${res.status}: ${text.slice(0, 500)}` };
    }
    try {
      const json = JSON.parse(text) as { messages?: { id: string }[] };
      return { ok: true, messageId: json.messages?.[0]?.id ?? "" };
    } catch {
      return { ok: true, messageId: "" };
    }
  }

  sendText(to: string, text: string) {
    return this.post({ to, type: "text", text: { body: text } });
  }

  sendButtons(to: string, text: string, buttons: Button[]) {
    return this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    });
  }

  async markRead(messageId: string) {
    await this.post({ status: "read", message_id: messageId });
  }
}

/** Returns null when Meta credentials are absent — callers must degrade gracefully. */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  const cfg = whatsappConfig();
  return cfg ? new MetaCloudProvider(cfg) : null;
}
