import { env } from '../config/env.js';

export interface WaTemplate {
  id: string;
  name: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED' | string;
  category: string;
  language: string;
  components: any[];
}

export class WhatsAppIntegration {
  /** Whether the platform's Meta WhatsApp Cloud API credentials are real
   *  (not the placeholder defaults) — this is a single platform-wide
   *  credential, not a per-tenant one (no tenant currently has a way to
   *  bring their own WhatsApp Business number), so this is honestly a
   *  SUPER_ADMIN/server-environment fact, not something a tenant "connects". */
  static isConfigured(): boolean {
    return env.META_WA_TOKEN !== 'your-meta-whatsapp-token' && env.META_PHONE_NUMBER_ID !== 'your-phone-number-id';
  }

  /** Template management (list/create) is scoped to the WABA, a separate
   *  Graph API object from the phone number sends use — configured
   *  independently, so a platform can send free-form text without ever
   *  having set this up. */
  static isWabaConfigured(): boolean {
    return this.isConfigured() && env.META_WABA_ID !== 'your-whatsapp-business-account-id';
  }

  /** Real GET against Meta's own message_templates list — whatever this
   *  returns (including each template's real APPROVED/PENDING/REJECTED
   *  status) is what Meta will actually let you send, not a local guess. */
  static async listTemplates(): Promise<{ success: boolean; templates?: WaTemplate[]; error?: string }> {
    if (!this.isWabaConfigured()) return { success: false, error: 'META_WABA_ID is not configured' };
    const url = `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_WABA_ID}/message_templates?fields=name,status,category,language,components&limit=100`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${env.META_WA_TOKEN}` } });
      const data = (await res.json()) as any;
      if (!res.ok) return { success: false, error: data?.error?.message || 'Meta API request failed' };
      const templates: WaTemplate[] = (data?.data || []).map((t: any) => ({
        id: t.id, name: t.name, status: t.status, category: t.category, language: t.language, components: t.components || [],
      }));
      return { success: true, templates };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /** Submits a new template to Meta for review — this does NOT come back
   *  approved; Meta reviews every template asynchronously (minutes to
   *  days), so the real status is whatever listTemplates() reports on a
   *  later call, never assumed here. */
  static async createTemplate(input: { name: string; category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'; language: string; bodyText: string }): Promise<{ success: boolean; id?: string; error?: string }> {
    if (!this.isWabaConfigured()) return { success: false, error: 'META_WABA_ID is not configured' };
    const url = `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_WABA_ID}/message_templates`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.META_WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          category: input.category,
          language: input.language,
          components: [{ type: 'BODY', text: input.bodyText }],
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) return { success: false, error: data?.error?.message || 'Meta API request failed' };
      return { success: true, id: data?.id };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /** Sends an already-APPROVED template — the only way to message a
   *  customer outside Meta's 24h free-form service window. Body params are
   *  positional ({{1}}, {{2}}...), matching how Meta itself indexes them. */
  static async sendTemplateMessage(toPhone: string, templateName: string, languageCode: string, bodyParams: string[] = []): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
    let phoneClean = toPhone.replace(/\D/g, '');
    if (phoneClean.startsWith('0')) phoneClean = '255' + phoneClean.substring(1);
    if (!phoneClean.startsWith('255') && phoneClean.length === 9) phoneClean = '255' + phoneClean;

    if (!this.isConfigured()) {
      return { success: true, simulated: true, messageId: `sim_${Math.random().toString(36).substring(7)}` };
    }

    const url = `https://graph.facebook.com/${env.META_API_VERSION}/${env.META_PHONE_NUMBER_ID}/messages`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.META_WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneClean,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(bodyParams.length ? { components: [{ type: 'body', parameters: bodyParams.map(p => ({ type: 'text', text: p })) }] } : {}),
          },
        }),
      });
      const data = (await response.json()) as any;
      if (!response.ok) return { success: false, error: data?.error?.message || 'Meta API request failed' };
      return { success: true, messageId: data?.messages?.[0]?.id };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /**
   * Send a template or text message to a client WhatsApp number using Meta Cloud API
   */
  static async sendMessage(toPhone: string, messageText: string, tenantWaId?: string, tenantWaToken?: string): Promise<{ success: boolean; messageId?: string; error?: string; simulated?: boolean }> {
    const waPhoneId = tenantWaId || env.META_PHONE_NUMBER_ID;
    const waToken = tenantWaToken || env.META_WA_TOKEN;

    // Normalize phone number (must be international without + or leading 0, Tanzanian numbers start with 255)
    let phoneClean = toPhone.replace(/\D/g, '');
    if (phoneClean.startsWith('0')) {
      phoneClean = '255' + phoneClean.substring(1);
    }
    if (!phoneClean.startsWith('255') && phoneClean.length === 9) {
      phoneClean = '255' + phoneClean;
    }

    console.log(`💬 WhatsApp simulation [To: +${phoneClean}] — ID: ${waPhoneId || 'DEFAULT'}: ${messageText}`);

    // If credentials are placeholder, return success immediately in simulation mode
    if (
      !waToken ||
      waToken === 'your-meta-whatsapp-token' ||
      !waPhoneId ||
      waPhoneId === 'your-phone-number-id'
    ) {
      // `simulated` so callers can tell this apart from a real send. It used to
      // return only `success: true`, and notification.service recorded that as
      // SENT — an audit trail asserting delivery of a message that was never
      // handed to Meta. `success` stays true so a missing key does not fail the
      // caller's own request; what changes is that it no longer claims delivery.
      return { success: true, simulated: true, messageId: `sim_${Math.random().toString(36).substring(7)}` };
    }

    const url = `https://graph.facebook.com/${env.META_API_VERSION}/${waPhoneId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneClean,
          type: 'text',
          text: { body: messageText },
        }),
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        console.error('❌ Meta API Error:', JSON.stringify(data));
        return { success: false, error: data?.error?.message || 'Meta API request failed' };
      }

      console.log(`✅ WhatsApp sent successfully to +${phoneClean}. Message ID: ${data?.messages?.[0]?.id}`);
      return { success: true, messageId: data?.messages?.[0]?.id };
    } catch (err: any) {
      console.error('❌ WhatsApp send network error:', err);
      return { success: false, error: err.message || 'Network error' };
    }
  }
}
