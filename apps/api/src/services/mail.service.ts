import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { randomUUID } from 'node:crypto';
import { withTenant } from '../db/client.js';
import { MailTemplateService } from './mail-template.service.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';

interface EnqueueInput {
  to: string;
  subject: string;
  bodyHtml: string;
  cc?: string[];
  bcc?: string[];
  templateKey?: string;
  sourceApp: string;
  communicationDeliveryId?: string;
  /** A storage_key from MinioIntegration (e.g. uploadShipmentReport) to
   *  attach — mail-outbox.job.ts reads it at send time, so the file only
   *  needs to exist by then, not at enqueue time. */
  attachmentStorageKey?: string;
  attachmentFilename?: string;
  /** Preserved on the durable delivery envelope, including retries. */
  attachments?: { storageKey: string; filename: string }[];
  /** Real RFC 5322 threading — see EmailIntegration.sendEmail's own doc. */
  inReplyToMessageId?: string | null;
  referencesMessageIds?: string[];
  /** Only ever set by the Email app's own scheduled-send delivery (the
   *  message's owning user) — see EmailIntegration.sendEmail's own doc for
   *  why every other caller (payroll, workflow AutoComms, etc.) must leave
   *  this unset. */
  userId?: string;
  /** See EmailIntegration.sendEmail's own doc — an explicit "Send mail as"
   *  alias for this one send, only ever set alongside userId. */
  fromIdentityId?: string | null;
  /** Compatibility bridge while legacy business actions move to the
   * communication registry. New callers should call CommEventsService. */
  communication?: {
    eventKey: string;
    actorId?: string | null;
    record?: { type: string; id: string; label?: string };
    context: Record<string, unknown>;
    idempotencyKey?: string;
    recipientName?: string;
  };
}

interface SendResult {
  success: boolean;
  simulated: boolean;
  error?: string;
  outboxId: string;
  /** The real Message-ID nodemailer's transport assigned this send —
   *  scheduled-email-send.job.ts stores it on the email_messages row so a
   *  later reply threads against it for real. */
  messageId?: string;
}

/**
 * The one shared entrypoint every app/route/job should call to send mail
 * going forward, instead of calling EmailIntegration.sendEmail directly.
 *
 * Two shapes, crossed with two timings:
 *   raw / templated   — templated resolves a template_key via
 *                        MailTemplateService first; raw takes an
 *                        already-built subject/bodyHtml (e.g. workflow
 *                        AutoComms, already tenant-authored via
 *                        formatTemplate elsewhere).
 *   enqueue / sendNow  — enqueue inserts 'pending' and returns immediately;
 *                        mail-outbox.job.ts does the real send, with retry.
 *                        sendNow is for the few callers whose own UX
 *                        depends on a real, immediate result (payroll's
 *                        documented per-recipient sent/skipped count,
 *                        messaging.service.ts's external_ref, workflow run
 *                        outcome journaling). It still writes to
 *                        email_outbox with a final status, so it shows up
 *                        in the same history — and a failure there leaves
 *                        a 'failed' row mail-outbox.job.ts will retry on
 *                        its own next poll, so "send now" isn't "no retry,"
 *                        it's "also try once immediately."
 */
export const MailService = {
  async enqueue(tenantId: string, input: EnqueueInput, claimToken?: string): Promise<string> {
    if (input.communication) {
      const { CommEventsService } = await import('./comm-events.service.js');
      const result = await CommEventsService.dispatch({
        tenantId, eventKey: input.communication.eventKey, actorId: input.communication.actorId,
        record: input.communication.record, context: input.communication.context,
        idempotencyKey: input.communication.idempotencyKey,
        manualRecipients: [{ email: input.to, name: input.communication.recipientName, type: 'TO' }],
      });
      return result.deliveryIds[0] ?? '';
    }
    return withTenant(tenantId, trx => this.enqueueInTransaction(trx, tenantId, input, claimToken));
  },

  /** Used when a scheduled message and its durable delivery must commit together. */
  async enqueueInTransaction(trx: Transaction<Database>, tenantId: string, input: EnqueueInput, claimToken?: string): Promise<string> {
      const row = await trx.insertInto('email_outbox').values({
        tenant_id: tenantId,
        status: claimToken ? 'sending' : 'pending',
        claim_token: claimToken ?? null,
        next_attempt_at: new Date(Date.now() + (claimToken ? 300_000 : 0)),
        to_address: input.to,
        cc_addresses: input.cc && input.cc.length ? JSON.stringify(input.cc) : null,
        bcc_addresses: input.bcc && input.bcc.length ? JSON.stringify(input.bcc) : null,
        subject: input.subject,
        body_html: input.bodyHtml,
        template_key: input.templateKey ?? null,
        source_app: input.sourceApp,
        attachments: JSON.stringify(input.attachments ?? []),
        communication_delivery_id: input.communicationDeliveryId ?? null,
        attachment_storage_key: input.attachmentStorageKey ?? null,
        attachment_filename: input.attachmentFilename ?? null,
        user_id: input.userId ?? null,
        from_identity_id: input.fromIdentityId ?? null,
        in_reply_to_message_id: input.inReplyToMessageId ?? null,
        references_ids: input.referencesMessageIds?.length ? JSON.stringify(input.referencesMessageIds) : null,
      }).returning('id').executeTakeFirstOrThrow();
      return row.id;
  },

  /** Renders templateKey via MailTemplateService, then enqueues the result. */
  async enqueueTemplated(tenantId: string, templateKey: string, to: string, vars: Record<string, string>, sourceApp: string, attachment?: { storageKey: string; filename: string }): Promise<string> {
    const { subject, bodyHtml } = await MailTemplateService.render(tenantId, templateKey, vars);
    return this.enqueue(tenantId, { to, subject, bodyHtml, templateKey, sourceApp, attachmentStorageKey: attachment?.storageKey, attachmentFilename: attachment?.filename });
  },

  /** Sends already-built subject/bodyHtml synchronously — see class doc for when to reach for this over enqueue(). */
  async sendNow(tenantId: string, input: EnqueueInput): Promise<SendResult> {
    const claimToken = randomUUID();
    const outboxId = await this.enqueue(tenantId, { ...input, communication: undefined }, claimToken);
    let result: { success: boolean; simulated?: boolean; error?: string; messageId?: string };
    const heartbeat = setInterval(() => {
      void withTenant(tenantId, trx => trx.updateTable('email_outbox')
        .set({ next_attempt_at: new Date(Date.now() + 300_000) })
        .where('tenant_id', '=', tenantId).where('id', '=', outboxId).where('claim_token', '=', claimToken).execute())
        .catch(error => console.error('Immediate mail lease renewal failed:', error));
    }, 60_000);
    try {
      const keys = [
        ...(input.attachmentStorageKey ? [{ storageKey: input.attachmentStorageKey, filename: input.attachmentFilename || 'attachment' }] : []),
        ...(input.attachments ?? []),
      ];
      const attachments = await Promise.all(keys.map(async attachment => {
        const content = await MinioIntegration.readFile(attachment.storageKey);
        if (!content) throw new Error(`Attachment unavailable: ${attachment.filename}. Restore the file before retrying.`);
        return { filename: attachment.filename, content };
      }));
      result = await EmailIntegration.sendEmail({
        to: input.to, subject: input.subject, bodyHtml: input.bodyHtml,
        cc: input.cc, bcc: input.bcc, tenantId,
        attachments: attachments.length ? attachments : undefined,
        inReplyToMessageId: input.inReplyToMessageId, referencesMessageIds: input.referencesMessageIds,
        userId: input.userId, fromIdentityId: input.fromIdentityId,
      });
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : 'Email delivery failed' };
    } finally { clearInterval(heartbeat); }
    await withTenant(tenantId, trx => trx.updateTable('email_outbox').set({
      status: result.simulated ? 'simulated' : result.success ? 'sent' : 'failed',
      claim_token: null, attempts: 1, message_id: result.messageId ?? null,
      sent_at: result.success ? new Date() : null,
      last_error: result.success ? null : result.error ?? 'Email delivery failed',
      next_attempt_at: new Date(Date.now() + 120_000),
    }).where('tenant_id', '=', tenantId).where('id', '=', outboxId)
      .where('claim_token', '=', claimToken).execute());
    return { success: result.success, simulated: !!result.simulated, error: result.error, outboxId, messageId: result.messageId };
  },

  /** Renders templateKey via MailTemplateService, then sends synchronously.
   *  attachment forwards straight to sendNow's own attachmentStorageKey/
   *  attachmentFilename — added for support.routes.ts's broadcast composer,
   *  the first templated caller that ever had a real file to attach. */
  async sendNowTemplated(tenantId: string, templateKey: string, to: string, vars: Record<string, string>, sourceApp: string, attachment?: { storageKey: string; filename: string }): Promise<SendResult> {
    const { subject, bodyHtml } = await MailTemplateService.render(tenantId, templateKey, vars);
    return this.sendNow(tenantId, { to, subject, bodyHtml, templateKey, sourceApp, attachmentStorageKey: attachment?.storageKey, attachmentFilename: attachment?.filename });
  },
};
