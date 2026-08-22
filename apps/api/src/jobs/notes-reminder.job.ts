import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Notes reminders (265_notes_app.sql) used to be purely decorative: a
 * reminder_at was stored and shown on the card, but nothing anywhere ever
 * read it — no job, no notification, ever fired. This is the fix: a
 * short-interval sweep (see jobs/index.ts's 5-minute schedule — reminders
 * are set to the minute, so a daily/hourly cadence would miss the point of
 * setting one) that fires a real in-app notification to the note's creator
 * once its reminder_at has passed, then marks it notified so it never fires
 * twice. Only the creator is notified — a reminder is a personal prompt to
 * the person who set it, not a broadcast to everyone the note is visible to.
 *
 * Notes with no creator (legacy rows 266_notes_migrate_existing.sql copied
 * in with created_by NULL) have no one to notify and are skipped — same
 * "don't invent an owner" rule that migration already applied to authorship.
 */
export async function runNotesReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Notes reminders...');
  try {
    const due = await dbPlatform.selectFrom('notes')
      .select(['id', 'tenant_id', 'title', 'created_by', 'subject_type'])
      .where('reminder_at', 'is not', null)
      .where('reminder_at', '<=', new Date())
      .where('reminder_notified_at', 'is', null)
      .where('is_trashed', '=', false)
      .execute();

    if (due.length === 0) {
      console.log('📝 No due Notes reminders.');
      return;
    }

    let notified = 0, skipped = 0;
    for (const note of due) {
      if (!note.created_by) { skipped++; continue; }
      await withTenant(note.tenant_id, async (trx) => {
        await NotificationService.createNotification({
          tenantId: note.tenant_id,
          userId: note.created_by!,
          app: 'notes',
          type: 'info',
          title: 'Note reminder',
          message: note.title?.trim() ? note.title : 'You set a reminder on a note.',
          link: '/notes/reminders',
          entityType: 'note',
          entityId: note.id,
        });
        await trx.updateTable('notes').set({ reminder_notified_at: new Date() })
          .where('id', '=', note.id).where('tenant_id', '=', note.tenant_id).execute();
      });
      notified++;
    }

    console.log(`✅ Notes reminders job completed — ${notified} notification(s) sent, ${skipped} skipped (no creator).`);
  } catch (error) {
    console.error('❌ Notes reminder job failed:', error);
  }
}
