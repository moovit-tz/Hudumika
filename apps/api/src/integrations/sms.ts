import { withTenant } from '../db/client.js';

export class SmsIntegration {
  /**
   * Sends a real SMS via the tenant's configured provider (Workspace ▸ Settings
   * ▸ Integrations ▸ SMS / WhatsApp — Settings.tsx SMSSection, saved under the
   * `int-sms` key). Previously this whole config screen had no consumer at all
   * — messaging.service.ts's SMS branch just logged `[SMS] Sending to...` and
   * fabricated a `sms-${Date.now()}` ref. Mirrors EmailIntegration/WhatsAppIntegration:
   * a real HTTP call when credentials exist, an honest no-op (not a fake success)
   * when they don't.
   */
  static async sendSms(tenantId: string, to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const row = await withTenant(tenantId, (trx) =>
      trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst(),
    );
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const cfg = settings?.['int-sms'];

    if (!cfg || cfg.provider === 'none' || !cfg.provider) {
      console.log(`📱 [SMS not configured] Would send to ${to}: ${message}`);
      return { success: false, error: 'No SMS provider configured for this tenant' };
    }

    try {
      if (cfg.provider === 'africas_talking') {
        if (!cfg.atUser || !cfg.atKey) return { success: false, error: "Africa's Talking username/API key not configured" };
        const res = await fetch('https://api.africastalking.com/version1/messaging', {
          method: 'POST',
          headers: {
            apiKey: cfg.atKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            username: cfg.atUser,
            to,
            message,
            ...(cfg.atSender ? { from: cfg.atSender } : {}),
          }).toString(),
        });
        const data: any = await res.json().catch(() => ({}));
        const recipient = data?.SMSMessageData?.Recipients?.[0];
        if (res.ok && recipient?.status === 'Success') {
          console.log(`📱 [SMS sent via Africa's Talking] to=${to} messageId=${recipient.messageId}`);
          return { success: true, messageId: recipient.messageId };
        }
        return { success: false, error: recipient?.status || data?.error || `Africa's Talking rejected the request (HTTP ${res.status})` };
      }

      if (cfg.provider === 'twilio') {
        if (!cfg.twilioSid || !cfg.twilioToken || !cfg.twilioFrom) return { success: false, error: 'Twilio account SID / auth token / from number not configured' };
        const auth = Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString('base64');
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioSid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: cfg.twilioFrom, Body: message }).toString(),
        });
        const data: any = await res.json().catch(() => ({}));
        if (res.ok && data?.sid) {
          console.log(`📱 [SMS sent via Twilio] to=${to} sid=${data.sid}`);
          return { success: true, messageId: data.sid };
        }
        return { success: false, error: data?.message || `Twilio rejected the request (HTTP ${res.status})` };
      }

      // nexmo / bongolive: config fields exist in the UI but no REST wiring
      // yet — honestly reported rather than faking a delivered message.
      return { success: false, error: `SMS provider "${cfg.provider}" is configured but not yet wired for live sending` };
    } catch (err: any) {
      console.error('❌ Failed to send SMS:', err.message || err);
      return { success: false, error: err.message || 'Unknown SMS delivery error' };
    }
  }
}
