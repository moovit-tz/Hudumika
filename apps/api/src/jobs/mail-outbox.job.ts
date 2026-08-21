import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { EmailIntegration } from '../integrations/email.js';
import { MinioIntegration } from '../integrations/minio.js';

const BATCH_SIZE = 50;
const BACKOFF_CAP_MINUTES = 60;

function nextAttemptDelayMs(attempts: number): number {
  // 2, 4, 8, 16, 32... minutes, capped — attempts is post-increment when this is called.
  const minutes = Math.min(2 ** attempts, BACKOFF_CAP_MINUTES);
  return minutes * 60_000;
}

/**
 * Polls email_outbox for due work and sends it via EmailIntegration — the
 * one place that actually calls the real transport. Closes the "a failed
 * payslip email is just silently lost" gap: every prior send in this
 * codebase was a synchronous await or a fire-and-forget .catch() with no
 * retry anywhere.
 */
export async function runMailOutboxJob(): Promise<void> {
  try {
    // Pending rows are always due; failed rows are due once their backoff
    // window has passed AND they haven't exhausted max_attempts — a raw SQL
    // predicate for the attempts/max_attempts column-to-column comparison,
    // so a permanently-given-up row stops being re-selected by this query
    // at all (rather than being fetched every poll forever and potentially
    // crowding LIMIT 50 out of newer retriable rows once enough rows have
    // exhausted their retries over time).
    const due = await dbPlatform.selectFrom('email_outbox').selectAll()
      .where(sql<boolean>`(status = 'pending') OR (status = 'failed' AND attempts < max_attempts AND next_attempt_at <= now())`)
      .orderBy('created_at', 'asc')
      .limit(BATCH_SIZE)
      .execute();

    if (due.length === 0) return;

    let sent = 0, failed = 0;

    for (const item of due) {
      await withTenant(item.tenant_id, async (trx) => {
        await trx.updateTable('email_outbox').set({ status: 'sending' }).where('id', '=', item.id).execute();
      });

      // Read lazily, at send time rather than enqueue time, so a report
      // generated moments before this poll runs is already on disk.
      const attachments = item.attachment_storage_key
        ? (() => { const content = MinioIntegration.readFile(item.attachment_storage_key!); return content ? [{ filename: item.attachment_filename || 'attachment', content }] : undefined; })()
        : undefined;

      const result = await EmailIntegration.sendEmail({
        to: item.to_address,
        cc: item.cc_addresses ? (typeof item.cc_addresses === 'string' ? JSON.parse(item.cc_addresses) : item.cc_addresses as any) : undefined,
        subject: item.subject,
        bodyHtml: item.body_html,
        tenantId: item.tenant_id,
        attachments,
      });

      await withTenant(item.tenant_id, async (trx) => {
        if (result.success) {
          await trx.updateTable('email_outbox').set({
            status: 'sent', sent_at: new Date(),
          }).where('id', '=', item.id).execute();
          sent++;
        } else {
          const attempts = item.attempts + 1;
          await trx.updateTable('email_outbox').set({
            status: 'failed',
            attempts,
            last_error: result.error ?? 'Unknown send error',
            next_attempt_at: new Date(Date.now() + nextAttemptDelayMs(attempts)),
          }).where('id', '=', item.id).execute();
          failed++;
        }
      });
    }

    console.log(`✉️  Mail outbox sweep — sent: ${sent}, failed: ${failed} (of ${due.length} due)`);
  } catch (error) {
    console.error('❌ Mail outbox job failed:', error);
  }
}
