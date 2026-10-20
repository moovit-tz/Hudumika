import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';

export async function runFleetReminderSweep(tenantId?: string): Promise<void> {
  let query = dbPlatform.selectFrom('fleet_reminders').select(['id', 'tenant_id'])
    .where('status', '=', 'PENDING').where('notified_at', 'is', null)
    .where('created_by', 'is not', null).where('due_date', '<=', new Date().toISOString().slice(0, 10));
  if (tenantId) query = query.where('tenant_id', '=', tenantId);
  const due = await query.limit(500).execute();
  for (const candidate of due) {
    await withTenant(candidate.tenant_id, async trx => {
      const reminder = await trx.selectFrom('fleet_reminders').selectAll()
        .where('id', '=', candidate.id).where('tenant_id', '=', candidate.tenant_id)
        .where('status', '=', 'PENDING').where('notified_at', 'is', null)
        .forUpdate().skipLocked().executeTakeFirst();
      if (!reminder?.created_by) return;
      await NotificationService.createNotificationInTrx(trx, {
        tenantId: reminder.tenant_id, userId: reminder.created_by, app: 'tracking', type: 'info',
        title: 'Fleet reminder due', message: reminder.title, link: '/tracking/reminders',
        entityType: 'fleet_reminder', entityId: reminder.id,
      });
      await trx.updateTable('fleet_reminders').set({ notified_at: new Date() })
        .where('id', '=', reminder.id).where('tenant_id', '=', reminder.tenant_id).execute();
    });
  }
}

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
    await runFleetReminderSweep();
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
