import { env } from '../config/env.js';

export class WhatsAppIntegration {
  /**
   * Send a template or text message to a client WhatsApp number using Meta Cloud API
   */
  static async sendMessage(toPhone: string, messageText: string, tenantWaId?: string, tenantWaToken?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
      return { success: true, messageId: `sim_${Math.random().toString(36).substring(7)}` };
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
