import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}

/** Claim one item at a time so a waiting batch cannot outlive its leases. */
export async function runMailOutboxJob(tenantId?: string): Promise<void> {
  for (let count = 0; count < 50; count++) {
    const claimToken = randomUUID();
    const item = await dbPlatform.transaction().execute(async trx => {
      const row = await trx.selectFrom('email_outbox').selectAll()
        .$if(!!tenantId, query => query.where('tenant_id', '=', tenantId!))
        .where(sql<boolean>`(status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND next_attempt_at <= now()) OR (status = 'failed' AND attempts < max_attempts AND next_attempt_at <= now())`)
        .orderBy('created_at', 'asc').limit(1).forUpdate().skipLocked().executeTakeFirst();
      if (!row) return;
      await trx.updateTable('email_outbox').set({ status: 'sending', claim_token: claimToken, next_attempt_at: new Date(Date.now() + 300_000) })
        .where('tenant_id', '=', row.tenant_id).where('id', '=', row.id).execute();
      return row;
    });
    if (!item) return;
    let result: { success: boolean; simulated?: boolean; error?: string; messageId?: string };
    const heartbeat = setInterval(() => {
      void withTenant(item.tenant_id, trx => trx.updateTable('email_outbox')
        .set({ next_attempt_at: new Date(Date.now() + 300_000) })
        .where('tenant_id', '=', item.tenant_id).where('id', '=', item.id).where('claim_token', '=', claimToken).execute())
        .catch(error => console.error('Mail delivery lease renewal failed:', error));
    }, 60_000);
    try {
      const keys = [
        ...(item.attachment_storage_key ? [{ storageKey: item.attachment_storage_key, filename: item.attachment_filename || 'attachment' }] : []),
        ...parseJsonArray(item.attachments),
      ];
      const attachments = await Promise.all(keys.map(async attachment => {
        const content = await MinioIntegration.readFile(attachment.storageKey);
        if (!content) throw new Error(`Attachment unavailable: ${attachment.filename}. Restore the file before retrying.`);
        return { filename: attachment.filename, content };
      }));
      result = await EmailIntegration.sendEmail({
        to: item.to_address, cc: parseJsonArray(item.cc_addresses), bcc: parseJsonArray(item.bcc_addresses),
        subject: item.subject, bodyHtml: item.body_html, tenantId: item.tenant_id,
        attachments: attachments.length ? attachments : undefined,
        userId: item.user_id ?? undefined, fromIdentityId: item.from_identity_id ?? undefined,
        inReplyToMessageId: item.in_reply_to_message_id ?? undefined, referencesMessageIds: parseJsonArray(item.references_ids),
      });
    } catch (error) {
      result = { success: false, error: error instanceof Error ? error.message : 'Email delivery failed' };
    } finally { clearInterval(heartbeat); }
    try {
      await withTenant(item.tenant_id, async trx => {
        const attempts = item.attempts + 1;
        const updated = await trx.updateTable('email_outbox').set({
          status: result.simulated ? 'simulated' : result.success ? 'sent' : 'failed',
          attempts, claim_token: null, sent_at: result.success ? new Date() : null,
          message_id: result.messageId ?? null, last_error: result.success ? null : result.error ?? 'Email delivery failed',
          next_attempt_at: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000),
        }).where('tenant_id', '=', item.tenant_id).where('id', '=', item.id)
          .where('claim_token', '=', claimToken).returning('id').executeTakeFirst();
        if (!updated) return;
        if (item.communication_delivery_id) {
          await trx.updateTable('comm_delivery_log').set({
            status: result.success ? 'sent' : 'failed', sent_at: result.success ? new Date() : null,
            provider_id: result.messageId ?? null, error_message: result.success ? null : result.error ?? 'Email delivery failed', updated_at: new Date(),
          }).where('tenant_id', '=', item.tenant_id).where('id', '=', item.communication_delivery_id).execute();
          await trx.insertInto('comm_delivery_attempts').values({
            tenant_id: item.tenant_id, delivery_id: item.communication_delivery_id,
            attempt_number: attempts + 1, status: result.success ? 'sent' : 'failed',
            provider: 'outbox', provider_id: result.messageId ?? null,
            error_message: result.success ? null : result.error ?? 'Email delivery failed',
          }).execute();
        }
        if (result.success) {
          await trx.updateTable('email_messages').set({ folder: 'sent', send_error: null, message_id: result.messageId ?? null })
            .where('tenant_id', '=', item.tenant_id).where('outbox_id', '=', item.id).execute();
        } else {
          await trx.updateTable('email_messages').set({
            send_error: result.error ?? 'Email delivery failed',
            ...(result.simulated || attempts >= item.max_attempts ? { folder: 'drafts' as const } : {}),
          }).where('tenant_id', '=', item.tenant_id).where('outbox_id', '=', item.id).execute();
        }
      });
    } catch (error) { console.error(`Mail delivery result could not be saved for ${item.id}:`, error); }
  }
}
