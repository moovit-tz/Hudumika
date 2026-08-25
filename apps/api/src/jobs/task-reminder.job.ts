import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

/**
 * Task reminders — same shape as notes-reminder.job.ts (265_notes_app.sql /
 * 282_notes_enterprise.sql's reminder_at/reminder_notified_at pair), applied
 * to 305_task_reminders.sql's identical columns on `tasks`. 5-minute sweep:
 * reminders are set to the minute (a datetime-local picker), so a
 * daily/hourly cadence would defeat the point of setting one.
 *
 * Notified: the task's owner (user_id) only — a reminder is a personal
 * prompt to whoever set it, not a broadcast to an assignee or a shared
 * list's other members. Completed or soft-deleted tasks are skipped: a
 * reminder on a task you already finished or removed has nothing left to
 * remind you of.
 */
export async function runTaskReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Task reminders...');
  try {
    const due = await dbPlatform.selectFrom('tasks')
      .select(['id', 'tenant_id', 'user_id', 'title'])
      .where('reminder_at', 'is not', null)
      .where('reminder_at', '<=', new Date())
      .where('reminder_notified_at', 'is', null)
      .where('completed', '=', false)
      .where('deleted_at', 'is', null)
      .execute();

    if (due.length === 0) {
      console.log('📝 No due Task reminders.');
      return;
    }

    for (const task of due) {
      await withTenant(task.tenant_id, async (trx) => {
        await NotificationService.createNotification({
          tenantId: task.tenant_id,
          userId: task.user_id,
          app: 'tasks',
          type: 'info',
          title: 'Task reminder',
          message: task.title?.trim() ? task.title : 'You set a reminder on a task.',
          link: '/tasks',
          entityType: 'task',
          entityId: task.id,
        });
        await trx.updateTable('tasks').set({ reminder_notified_at: new Date().toISOString() })
          .where('id', '=', task.id).where('tenant_id', '=', task.tenant_id).execute();
      });
    }

    console.log(`✅ Task reminders job completed — ${due.length} notification(s) sent.`);
  } catch (error) {
    console.error('❌ Task reminder job failed:', error);
  }
}
