import { withTenant } from '../db/client.js';
import { MailTemplateService } from './mail-template.service.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';

interface EnqueueInput {
  to: string;
  subject: string;
  bodyHtml: string;
  cc?: string[];
  templateKey?: string;
  sourceApp: string;
  /** A storage_key from MinioIntegration (e.g. uploadShipmentReport) to
   *  attach — mail-outbox.job.ts reads it at send time, so the file only
   *  needs to exist by then, not at enqueue time. */
  attachmentStorageKey?: string;
  attachmentFilename?: string;
  /** Multiple attachments — sendNow only (Email compose's own multi-file
   *  picker). Merged with attachmentStorageKey above if both are given,
   *  rather than the single field becoming dead once this exists. */
  attachments?: { storageKey: string; filename: string }[];
  /** Real RFC 5322 threading — see EmailIntegration.sendEmail's own doc. */
  inReplyToMessageId?: string | null;
  referencesMessageIds?: string[];
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
  async enqueue(tenantId: string, input: EnqueueInput): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('email_outbox').values({
        tenant_id: tenantId,
        to_address: input.to,
        cc_addresses: input.cc && input.cc.length ? JSON.stringify(input.cc) : null,
        subject: input.subject,
        body_html: input.bodyHtml,
        template_key: input.templateKey ?? null,
        source_app: input.sourceApp,
        attachment_storage_key: input.attachmentStorageKey ?? null,
        attachment_filename: input.attachmentFilename ?? null,
      }).returning('id').executeTakeFirstOrThrow();
      return row.id;
    });
  },

  /** Renders templateKey via MailTemplateService, then enqueues the result. */
  async enqueueTemplated(tenantId: string, templateKey: string, to: string, vars: Record<string, string>, sourceApp: string, attachment?: { storageKey: string; filename: string }): Promise<string> {
    const { subject, bodyHtml } = await MailTemplateService.render(tenantId, templateKey, vars);
    return this.enqueue(tenantId, { to, subject, bodyHtml, templateKey, sourceApp, attachmentStorageKey: attachment?.storageKey, attachmentFilename: attachment?.filename });
  },

  /** Sends already-built subject/bodyHtml synchronously — see class doc for when to reach for this over enqueue(). */
  async sendNow(tenantId: string, input: EnqueueInput): Promise<SendResult> {
    const keys = [
      ...(input.attachmentStorageKey ? [{ storageKey: input.attachmentStorageKey, filename: input.attachmentFilename || 'attachment' }] : []),
      ...(input.attachments ?? []),
    ];
    const loaded = await Promise.all(keys.map(async k => {
      const content = await MinioIntegration.readFile(k.storageKey);
      return content ? { filename: k.filename, content } : null;
    }));
    const attachments = loaded.filter((a): a is { filename: string; content: Buffer } => a !== null);
    const result = await EmailIntegration.sendEmail({
      to: input.to, subject: input.subject, bodyHtml: input.bodyHtml, cc: input.cc, tenantId,
      attachments: attachments.length ? attachments : undefined,
      inReplyToMessageId: input.inReplyToMessageId, referencesMessageIds: input.referencesMessageIds,
    });
    const outboxId = await withTenant(tenantId, async (trx) => {
      const row = await trx.insertInto('email_outbox').values({
        tenant_id: tenantId, to_address: input.to,
        cc_addresses: input.cc && input.cc.length ? JSON.stringify(input.cc) : null,
        subject: input.subject, body_html: input.bodyHtml,
        template_key: input.templateKey ?? null, source_app: input.sourceApp,
        attachment_storage_key: input.attachmentStorageKey ?? null,
        attachment_filename: input.attachmentFilename ?? null,
        status: result.success ? 'sent' : 'failed',
        attempts: 1,
        sent_at: result.success ? new Date() : null,
        last_error: result.success ? null : (result.error ?? 'Unknown send error'),
      }).returning('id').executeTakeFirstOrThrow();
      return row.id;
    });
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
