import { withTenant } from '../db/client.js';
import { decryptJson } from '../services/onsite-secrets.service.js';

interface GatewayRow {
  id: string; provider: string; label: string; credentials: string; sender_id: string | null;
}
interface SendResult { success: boolean; messageId?: string; error?: string; provider?: string; gatewayId?: string }

async function sendViaAfricasTalking(cfg: Record<string, any>, to: string, message: string, senderId: string | null): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!cfg.atUser || !cfg.atKey) return { success: false, error: "Africa's Talking username/API key not configured" };
  const res = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: { apiKey: cfg.atKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: cfg.atUser, to, message, ...(senderId ? { from: senderId } : {}) }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  const recipient = data?.SMSMessageData?.Recipients?.[0];
  if (res.ok && recipient?.status === 'Success') {
    console.log(`📱 [SMS sent via Africa's Talking] to=${to} messageId=${recipient.messageId}`);
    return { success: true, messageId: recipient.messageId };
  }
  return { success: false, error: recipient?.status || data?.error || `Africa's Talking rejected the request (HTTP ${res.status})` };
}

async function sendViaTwilio(cfg: Record<string, any>, to: string, message: string, senderId: string | null): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!cfg.twilioSid || !cfg.twilioToken || !(senderId || cfg.twilioFrom)) return { success: false, error: 'Twilio account SID / auth token / from number not configured' };
  const auth = Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: senderId || cfg.twilioFrom, Body: message }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  if (res.ok && data?.sid) {
    console.log(`📱 [SMS sent via Twilio] to=${to} sid=${data.sid}`);
    return { success: true, messageId: data.sid };
  }
  return { success: false, error: data?.message || `Twilio rejected the request (HTTP ${res.status})` };
}

async function sendViaGateway(gateway: GatewayRow, to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let cfg: Record<string, any>;
  try { cfg = decryptJson(gateway.credentials); } catch { return { success: false, error: 'Could not decrypt gateway credentials' }; }

  if (gateway.provider === 'africas_talking') return sendViaAfricasTalking(cfg, to, message, gateway.sender_id);
  if (gateway.provider === 'twilio') return sendViaTwilio(cfg, to, message, gateway.sender_id);
  // nexmo / bongolive: offered as a provider choice but no REST wiring yet —
  // honestly reported rather than faking a delivered message.
  return { success: false, error: `SMS provider "${gateway.provider}" is configured but not yet wired for live sending` };
}

export class SmsIntegration {
  /**
   * Sends a real SMS via the tenant's active gateways (sms_gateways, tried in
   * priority order — a failure on one falls through to the next active one,
   * not an immediate give-up), unless the recipient is on the tenant's
   * sms_opt_outs list, in which case no gateway is ever contacted at all.
   * Mirrors EmailIntegration/WhatsAppIntegration: a real HTTP call when
   * credentials exist, an honest no-op (never a fake success) when they don't.
   */
  static async sendSms(tenantId: string, to: string, message: string): Promise<SendResult> {
    return withTenant(tenantId, async (trx) => {
      const optedOut = await trx.selectFrom('sms_opt_outs').select('id')
        .where('tenant_id', '=', tenantId).where('phone', '=', to).executeTakeFirst();
      if (optedOut) {
        console.log(`📱 [SMS blocked — opted out] to=${to}`);
        return { success: false, error: 'This recipient has opted out of SMS and cannot be messaged.' };
      }

      const gateways = await trx.selectFrom('sms_gateways').selectAll()
        .where('tenant_id', '=', tenantId).where('active', '=', true)
        .orderBy('priority', 'asc').execute();

      if (gateways.length === 0) {
        console.log(`📱 [SMS not configured] Would send to ${to}: ${message}`);
        return { success: false, error: 'No SMS gateway configured for this tenant' };
      }

      let lastError = 'Unknown SMS delivery error';
      for (const gateway of gateways) {
        try {
          const result = await sendViaGateway(gateway, to, message);
          if (result.success) {
            await trx.updateTable('sms_gateways').set({ last_used_at: new Date().toISOString(), last_error: null }).where('id', '=', gateway.id).execute();
            return { success: true, messageId: result.messageId, provider: gateway.provider, gatewayId: gateway.id };
          }
          lastError = result.error ?? lastError;
          await trx.updateTable('sms_gateways').set({ last_error: lastError }).where('id', '=', gateway.id).execute();
        } catch (err: any) {
          lastError = err.message || lastError;
          await trx.updateTable('sms_gateways').set({ last_error: lastError }).where('id', '=', gateway.id).execute().catch(() => {});
        }
      }
      console.error(`❌ All SMS gateways failed for tenant ${tenantId}: ${lastError}`);
      return { success: false, error: gateways.length > 1 ? `All ${gateways.length} gateways failed — last error: ${lastError}` : lastError };
    });
  }
}
