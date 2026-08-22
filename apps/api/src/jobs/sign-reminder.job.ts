import { dbPlatform, withTenant } from '../db/client.js';
import { logEvent, recipientsToNotify, notifyRecipients } from '../services/sign-notify.service.js';

/** Google's own real eSignature reminder cadence — every 3 days, up to 9
 *  days total (3 reminders). Matched deliberately rather than invented, so
 *  Hudumika's automatic behavior is the same shape a signer would already
 *  expect from the product it's being compared against. */
const REMINDER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_AUTO_REMINDERS = 3;

/**
 * Automatically reminds whichever recipient is currently "up" on a sent
 * envelope (the same recipientsToNotify() logic /send and /public/:token/
 * sign already use — sequential mode only ever nags the current signer in
 * line, not everyone at once) if they haven't been sent anything — invite
 * or reminder — in the last 3 days, and haven't already had 3 automatic
 * reminders.
 *
 * Idempotent and capped on purpose. reminder.job.ts's own header documents
 * a real incident where an uncapped daily job fanned out to 226,315
 * notification rows because "run daily" and "notify once" were never the
 * same guarantee — this job checks sign_events itself before sending
 * anything, so it is safe to invoke as often as its caller likes.
 *
 * Only counts *automatic* reminders toward the cap — actor_name/
 * actor_email are null on every event this job logs (system-triggered,
 * same convention 'viewed'/'signed'/'completed' events already use),
 * while a human clicking "Remind" in the UI always carries a real actor.
 * A staff member can still remind manually as many times as they want;
 * only this job's own nagging stops after 3.
 */
export async function runSignReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Sign Auto-Reminders...');
  try {
    const sentEnvelopes = await dbPlatform
      .selectFrom('sign_envelopes')
      .select(['id', 'tenant_id', 'title', 'message', 'order_mode'])
      .where('status', '=', 'sent')
      .execute();

    if (sentEnvelopes.length === 0) {
      console.log('📝 No sent envelopes to consider for auto-reminders.');
      return;
    }

    let reminded = 0, skippedCooldown = 0, skippedCap = 0;

    for (const envelope of sentEnvelopes) {
      await withTenant(envelope.tenant_id, async (trx) => {
        const recipients = await trx.selectFrom('sign_recipients').selectAll()
          .where('envelope_id', '=', envelope.id).execute();
        const due = recipientsToNotify(recipients, envelope.order_mode);
        if (!due.length) return;

        for (const recipient of due) {
          const events = await trx.selectFrom('sign_events').selectAll()
            .where('envelope_id', '=', envelope.id)
            .where('recipient_id', '=', recipient.id)
            .where('event_type', 'in', ['sent', 'reminded'])
            .orderBy('created_at', 'desc')
            .execute();

          const lastNotified = events[0];
          if (lastNotified && lastNotified.created_at.getTime() > Date.now() - REMINDER_COOLDOWN_MS) {
            skippedCooldown++;
            continue;
          }

          const autoReminderCount = events.filter(e => e.event_type === 'reminded' && !e.actor_name).length;
          if (autoReminderCount >= MAX_AUTO_REMINDERS) {
            skippedCap++;
            continue;
          }

          await notifyRecipients(envelope.tenant_id, envelope, [recipient], 'reminder');
          await logEvent(trx, envelope.id, envelope.tenant_id, 'reminded', {
            recipientId: recipient.id,
            note: `Automatic reminder (${autoReminderCount + 1}/${MAX_AUTO_REMINDERS})`,
          });
          reminded++;
        }
      });
    }

    console.log(`✅ Sign Auto-Reminders job completed — ${reminded} reminder(s) sent, ${skippedCooldown} within cooldown, ${skippedCap} already at the auto-reminder cap.`);
  } catch (error) {
    console.error('❌ Sign auto-reminder job failed:', error);
  }
}
