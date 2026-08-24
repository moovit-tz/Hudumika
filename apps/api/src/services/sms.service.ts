import { withTenant } from '../db/client.js';
import { SmsIntegration } from '../integrations/sms.js';
import { formatTemplate } from '../lib/template.js';

export interface SendSmsInput {
  to: string;
  body: string;
  sourceApp: string;
  contactName?: string;
  campaignId?: string;
  templateId?: string;
}

export interface SmsSendResult {
  success: boolean;
  error?: string;
  /** sms_messages.id — this platform's own row, not the provider's message id. */
  id: string;
}

/** Rough GSM-7 segment count: 160 chars for a single segment, 153/segment once
 *  concatenated (each segment loses 7 chars to the UDH concat header). Doesn't
 *  detect UCS-2-only characters (emoji, non-Latin scripts) — good enough for
 *  cost/usage visibility, not billing-grade precision. */
function countSegments(body: string): number {
  const len = body.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}

/**
 * The one shared entrypoint every app/route/job should call to send SMS —
 * mirrors mail.service.ts's MailService shape (raw/templated crossed with
 * sendNow/enqueue). Every send lands one row in sms_messages regardless of
 * caller, so the SMS app's own Reports view is a true unified log — not
 * just what was sent from its own Compose screen.
 *
 * Built on integrations/sms.ts's SmsIntegration, which already does real
 * HTTP sends via Africa's Talking/Twilio (or an honest "not configured"/
 * "not yet wired" failure — never a fabricated success).
 */
export const SmsService = {
  /** Sends synchronously and logs the real result — for quick-send, OTP-adjacent
   *  flows, and anywhere the caller's own UX depends on an immediate outcome. */
  async sendNow(tenantId: string, userId: string | null, input: SendSmsInput): Promise<SmsSendResult> {
    const result = await SmsIntegration.sendSms(tenantId, input.to, input.body);
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('sms_messages').values({
        tenant_id: tenantId, user_id: userId, to_number: input.to, body: input.body,
        status: result.success ? 'sent' : 'failed',
        provider: result.provider ?? null,
        provider_message_id: result.messageId ?? null,
        error: result.success ? null : (result.error ?? 'Unknown send error'),
        segments: countSegments(input.body), source_app: input.sourceApp,
        campaign_id: input.campaignId ?? null, template_id: input.templateId ?? null,
        contact_name: input.contactName ?? null, attempts: 1,
        sent_at: result.success ? new Date().toISOString() : null,
      }).returning('id').executeTakeFirstOrThrow();
      return { success: result.success, error: result.error, id: row.id };
    });
  },

  /** Renders templateId's body against vars, then sends synchronously. */
  async sendNowTemplated(tenantId: string, userId: string | null, templateId: string, to: string, vars: Record<string, string>, sourceApp: string, contactName?: string): Promise<SmsSendResult> {
    const template = await withTenant(tenantId, trx => trx.selectFrom('sms_templates').select('body')
      .where('id', '=', templateId).where('tenant_id', '=', tenantId).executeTakeFirst());
    if (!template) return { success: false, error: 'Template not found', id: '' };
    const body = formatTemplate(template.body, vars);
    return this.sendNow(tenantId, userId, { to, body, sourceApp, templateId, contactName });
  },

  /** Inserts a 'queued' row and returns immediately — sms-outbox.job.ts does
   *  the real send, throttled. Use for bulk/campaign fan-out so a request
   *  handler never blocks on hundreds of gateway round-trips. */
  async enqueue(tenantId: string, userId: string | null, input: SendSmsInput): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('sms_messages').values({
        tenant_id: tenantId, user_id: userId, to_number: input.to, body: input.body,
        status: 'queued', segments: countSegments(input.body), source_app: input.sourceApp,
        campaign_id: input.campaignId ?? null, template_id: input.templateId ?? null,
        contact_name: input.contactName ?? null,
      }).returning('id').executeTakeFirstOrThrow();
      return row.id;
    });
  },

  /** Enqueues one row per recipient. Returns the count queued (not sent —
   *  sms-outbox.job.ts sends them). */
  async enqueueBulk(tenantId: string, userId: string | null, recipients: { phone: string; name?: string }[], body: string, sourceApp: string, campaignId?: string, templateId?: string): Promise<number> {
    if (recipients.length === 0) return 0;
    return withTenant(tenantId, async (trx) => {
      const rows = recipients.map(r => ({
        tenant_id: tenantId, user_id: userId, to_number: r.phone, body,
        status: 'queued' as const, segments: countSegments(body), source_app: sourceApp,
        campaign_id: campaignId ?? null, template_id: templateId ?? null, contact_name: r.name ?? null,
      }));
      await trx.insertInto('sms_messages').values(rows).execute();
      return rows.length;
    });
  },
};
