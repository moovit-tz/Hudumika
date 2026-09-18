import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { decryptJson } from '../services/onsite-secrets.service.js';
import { normalizePhone } from '../lib/phone.js';

interface GatewayRow {
  id: string; provider: string; label: string; credentials: string; sender_id: string | null;
}
/** transient=true means every gateway attempted failed via a genuine
 *  network-level exception (fetch never got a response at all) — never set
 *  when at least one gateway's provider actually answered, even with a
 *  rejection, since that's real signal the message was processed somehow.
 *  sms-outbox.job.ts uses this to decide whether a blind requeue is safe —
 *  see its own header comment for why a provider rejection is never
 *  auto-retried (double-charging risk). */
interface SendResult { success: boolean; messageId?: string; error?: string; provider?: string; gatewayId?: string; transient?: boolean }

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

/** Vonage/Nexmo's own long-stable SMS REST API — https://rest.nexmo.com/sms/json,
 *  api_key/api_secret/to/from/text form params, a per-message "0" status
 *  string for success (not an HTTP-level signal — Nexmo returns 200 even for
 *  a rejected message, the real result is buried per-message in the body). */
async function sendViaNexmo(cfg: Record<string, any>, to: string, message: string, senderId: string | null): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!cfg.nexmoKey || !cfg.nexmoSecret) return { success: false, error: 'Nexmo API key/secret not configured' };
  const res = await fetch('https://rest.nexmo.com/sms/json', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      api_key: cfg.nexmoKey, api_secret: cfg.nexmoSecret, to, text: message,
      ...(senderId ? { from: senderId } : {}),
    }).toString(),
  });
  const data: any = await res.json().catch(() => ({}));
  const msg = data?.messages?.[0];
  if (res.ok && msg?.status === '0') {
    console.log(`📱 [SMS sent via Nexmo] to=${to} messageId=${msg['message-id']}`);
    return { success: true, messageId: msg['message-id'] };
  }
  return { success: false, error: msg?.['error-text'] || `Nexmo rejected the request (status ${msg?.status ?? res.status})` };
}

async function sendViaGateway(gateway: GatewayRow, to: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let cfg: Record<string, any>;
  try { cfg = decryptJson(gateway.credentials); } catch { return { success: false, error: 'Could not decrypt gateway credentials' }; }

  if (gateway.provider === 'africas_talking') return sendViaAfricasTalking(cfg, to, message, gateway.sender_id);
  if (gateway.provider === 'twilio') return sendViaTwilio(cfg, to, message, gateway.sender_id);
  if (gateway.provider === 'nexmo') return sendViaNexmo(cfg, to, message, gateway.sender_id);
  // bongolive: offered as a provider choice but no verified API reference
  // for it exists in this codebase — honestly reported rather than guessed
  // at or faked. Real wiring needs BongoLive's own API docs.
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
  static async sendSms(tenantId: string, to: string, message: string, opts?: { bypassOptOut?: boolean }): Promise<SendResult> {
    return withTenant(tenantId, async (trx) => {
      // Matched on the normalized form (last 9 digits), not the raw string —
      // an exact-string match let "+255700111222" opted out one way get
      // messaged again as "255700111222" or "0700111222", live-reproduced
      // and fixed as HUD-0125.
      //
      // `opts.bypassOptOut` exists for exactly one caller: the STOP-reply
      // confirmation SMS sent immediately after recording that very opt-out
      // (registerInboundRoutes in sms.routes.ts). Without it, that one
      // required reply would always self-block — the opt-out row it needs
      // to confirm is the same row that blocks every other send to that
      // number. Never set it from a campaign/bulk/user-facing send path.
      const normalizedTo = normalizePhone(to);
      const optedOut = (!opts?.bypassOptOut && normalizedTo)
        ? await trx.selectFrom('sms_opt_outs').select('id')
            .where('tenant_id', '=', tenantId).where('phone_normalized', '=', normalizedTo).executeTakeFirst()
        : undefined;
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
      // True only if every gateway attempted below fails via a thrown
      // exception (fetch itself never returned) — flips false the moment
      // any gateway's provider actually answers, success or rejection,
      // since that's real evidence the message was processed somehow.
      let allTransient = true;
      for (const gateway of gateways) {
        try {
          const result = await sendViaGateway(gateway, to, message);
          allTransient = false;
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
      return {
        success: false,
        error: gateways.length > 1 ? `All ${gateways.length} gateways failed — last error: ${lastError}` : lastError,
        transient: allTransient,
      };
    });
  }
}

/** Twilio's own request-signing scheme: HMAC-SHA1 of the full callback URL
 *  with every POST param name+value appended in sorted-key order (no
 *  delimiter), keyed by the account's real auth token, base64-encoded.
 *  Works from the already-parsed param object (unlike Meta's raw-byte
 *  X-Hub-Signature-256 in webhooks.routes.ts) since Twilio's own algorithm
 *  is defined over individual param values, not literal request bytes.
 *  Returns true (allow) only when the caller has no authToken to check
 *  against yet — same "fails open until configured" posture every other
 *  webhook guard in this codebase already has. The `url` passed in MUST be
 *  byte-exact to whatever's configured in the tenant's own Twilio console
 *  (protocol, host, path, query string) — a mismatch here (a reverse proxy
 *  rewriting the path, a trailing slash) fails verification silently, the
 *  same real operational risk this codebase already discloses for the
 *  Onsite SSRF guard's own redirect-chain gap. */
export function verifyTwilioSignature(url: string, params: Record<string, string>, authToken: string | undefined, header: string | undefined): boolean {
  if (!authToken) return true;
  if (!header) return false;
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');
  const a = Buffer.from(expected, 'utf-8');
  const b = Buffer.from(header, 'utf-8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
