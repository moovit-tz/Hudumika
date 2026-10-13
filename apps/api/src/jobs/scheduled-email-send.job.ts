import { dbPlatform, withTenant } from '../db/client.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';

function asArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
  return [];
}

/** Handoff is atomic: a crash cannot leave a sent message eligible for another scheduled send. */
export async function runScheduledEmailSendJob(tenantId?: string): Promise<void> {
  const due = await dbPlatform.selectFrom('email_messages').select(['id', 'tenant_id'])
    .$if(!!tenantId, query => query.where('tenant_id', '=', tenantId!))
    .where('folder', '=', 'scheduled').where('scheduled_at', '<=', new Date())
    .orderBy('scheduled_at', 'asc').limit(50).execute();
  for (const candidate of due) {
    try {
      await withTenant(candidate.tenant_id, async trx => {
        const row = await trx.selectFrom('email_messages').selectAll()
          .where('tenant_id', '=', candidate.tenant_id).where('id', '=', candidate.id)
          .where('folder', '=', 'scheduled').where('scheduled_at', '<=', new Date())
          .forUpdate().skipLocked().executeTakeFirst();
        if (!row) return;
        const to = asArray(row.to_addresses).map(address => address?.email).filter(Boolean).join(',');
        if (!to) {
          await trx.updateTable('email_messages').set({ folder: 'drafts', scheduled_at: null, send_error: 'Add a recipient before sending.' })
            .where('tenant_id', '=', row.tenant_id).where('id', '=', row.id).execute();
          return;
        }
        const receipt = row.read_receipt_requested ? `<img src="${env.API_BASE_URL}/v1/email/receipt/${row.id}" width="1" height="1" alt="" style="display:none" />` : '';
        const outboxId = await MailService.enqueueInTransaction(trx, row.tenant_id, {
          to, cc: asArray(row.cc_addresses).map(address => address?.email).filter(Boolean),
          bcc: asArray(row.bcc_addresses).map(address => address?.email).filter(Boolean),
          subject: row.subject, bodyHtml: `<div style="white-space:pre-wrap">${row.body}</div>${receipt}`,
          sourceApp: 'email', userId: row.user_id, fromIdentityId: row.from_identity_id,
          attachments: asArray(row.attachments).map(attachment => ({ storageKey: attachment.storageKey, filename: attachment.filename })),
          inReplyToMessageId: row.in_reply_to_message_id, referencesMessageIds: asArray(row.references_ids),
        });
        await trx.updateTable('email_messages').set({ outbox_id: outboxId, scheduled_at: null, send_error: null })
          .where('tenant_id', '=', row.tenant_id).where('id', '=', row.id).execute();
      });
    } catch (error) { console.error(`Scheduled email handoff failed for ${candidate.id}:`, error); }
  }
}
