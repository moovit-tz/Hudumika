import { dbPlatform, withTenant } from '../db/client.js';
import { MailService } from '../services/mail.service.js';
import { env } from '../config/env.js';

const BATCH_SIZE = 50;

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

/**
 * Performs the real, deferred delivery for every 'scheduled' email_messages
 * row whose scheduled_at has arrived — the one mechanism behind both
 * Gmail-style "Undo send" (queued with a short default delay) and "Schedule
 * send" (queued with a caller-chosen future time); see migration 461's own
 * comment and email.routes.ts's POST /send. Cancelling before this runs is
 * just DELETE /v1/emails/:id on the still-'scheduled' row — no separate
 * cancel endpoint exists or is needed.
 *
 * A failed send bounces the row back to 'drafts' with send_error set,
 * rather than being retried from this same sweep — retrying in place would
 * re-call MailService.sendNow (and create a fresh email_outbox row) on
 * every pass until it succeeded or was manually removed, which is not a
 * bounded retry, it's an unbounded one with no backoff. Bouncing to Drafts
 * gives the sender a visible, actionable failure they can just click Send
 * on again.
 */
export async function runScheduledEmailSendJob(): Promise<void> {
  try {
    const due = await dbPlatform.selectFrom('email_messages').selectAll()
      .where('folder', '=', 'scheduled')
      .where('scheduled_at', '<=', new Date())
      .orderBy('scheduled_at', 'asc')
      .limit(BATCH_SIZE)
      .execute();

    if (due.length === 0) return;

    let sent = 0, failed = 0;

    for (const row of due) {
      try {
        const toAddrs = asArray(row.to_addresses);
        const ccAddrs = asArray(row.cc_addresses);
        const attachments = asArray(row.attachments);
        const referencesIds = asArray(row.references_ids);

        const toStr = toAddrs.map((a: any) => a?.email).filter(Boolean).join(',');
        if (!toStr) throw new Error('No recipient on this message.');

        // The receipt pixel + HTML wrapper are rebuilt here from the stored
        // plain-text body rather than kept as a second stored copy — see
        // email.routes.ts's POST /send comment on why `body` stays plain.
        const receiptTag = row.read_receipt_requested
          ? `<img src="${env.API_BASE_URL}/v1/email/receipt/${row.id}" width="1" height="1" alt="" style="display:none" />`
          : '';
        const bodyHtml = `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6; white-space: pre-wrap;">${row.body}</div>${receiptTag}`;

        const result = await MailService.sendNow(row.tenant_id, {
          to: toStr,
          cc: ccAddrs.map((a: any) => a?.email).filter(Boolean),
          subject: row.subject,
          bodyHtml,
          sourceApp: 'email',
          attachments: attachments.map((a: any) => ({ storageKey: a.storageKey, filename: a.filename })),
          inReplyToMessageId: row.in_reply_to_message_id,
          referencesMessageIds: referencesIds,
          // The only place this delivers real per-user send identity
          // (migration 491) — this is a message the owning user composed
          // through the Email app, not a system-generated notification.
          userId: row.user_id,
        });

        await withTenant(row.tenant_id, async (trx) => {
          if (result.success) {
            await trx.updateTable('email_messages').set({
              folder: 'sent',
              outbox_id: result.outboxId,
              message_id: result.messageId ?? null,
              send_error: null,
            }).where('id', '=', row.id).execute();
          } else {
            await trx.updateTable('email_messages').set({
              folder: 'drafts',
              scheduled_at: null,
              send_error: result.error ?? 'Send failed',
            }).where('id', '=', row.id).execute();
          }
        });
        result.success ? sent++ : failed++;
      } catch (err: any) {
        failed++;
        console.error(`❌ Scheduled email send failed for message ${row.id}:`, err.message);
        await withTenant(row.tenant_id, async (trx) => {
          await trx.updateTable('email_messages').set({
            folder: 'drafts',
            scheduled_at: null,
            send_error: err.message?.slice(0, 500) ?? 'Unknown send error',
          }).where('id', '=', row.id).execute();
        }).catch(() => {});
      }
    }

    console.log(`📤 Scheduled email send — sent: ${sent}, failed: ${failed} (of ${due.length} due)`);
  } catch (error) {
    console.error('❌ Scheduled email send job failed:', error);
  }
}
