import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from '../services/notification.service.js';
import { expandRecurrence, validateRecurrenceRule, type RecurrenceRule } from '../services/calendar-recurrence.service.js';

// Calendar events (286_calendar_v2.sql) can now carry reminder_offsets
// (minutes-before-start), but nothing ever read them — the exact
// "reminders that never fired" gap notes-reminder.job.ts already fixed for
// Notes. This is the calendar equivalent, generalized for recurrence: a
// weekly standup's reminder needs to fire every week, not once ever, so the
// guard (calendar_event_reminder_sends) is keyed per OCCURRENCE, not per
// event — see that table's own comment in the migration.
//
// The largest reminder lead time allowed (eventCreateSchema's cap) is 30
// days, so occurrences are expanded up to 31 days out to make sure a
// "remind me a month before" reminder is never missed just because the
// occurrence itself is still far away.
const LOOKAHEAD_MS = 31 * 24 * 60 * 60 * 1000;
// How far back to still consider an occurrence "due" — an offset of e.g. 30
// minutes means the notify time (start - offset) is already in the past
// relative to the occurrence's own start, so the window has to look
// backward past `now`, not just forward. A full day comfortably covers
// every real offset this app allows (max 43200 min = 30 days is the LEAD
// TIME before start, not how overdue a notify moment can be — a job
// running every 5 minutes never lets a notifyAt point sit unhandled for
// more than 5 minutes in practice; a day of slack is for job downtime, not
// the normal case) while not resurrecting reminders for long-past events.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

export async function runCalendarReminderJob(): Promise<void> {
  console.log('⏳ Running background job: Calendar reminders...');
  try {
    const events = await dbPlatform.selectFrom('calendar_events')
      .select(['id', 'tenant_id', 'user_id', 'title', 'start_at', 'end_at', 'recurrence', 'reminder_offsets'])
      .execute();
    const withReminders = events.filter(e => Array.isArray(e.reminder_offsets) && e.reminder_offsets.length > 0);
    if (withReminders.length === 0) {
      console.log('📝 No calendar events carry a reminder.');
      return;
    }

    const now = new Date();
    const rangeFrom = new Date(now.getTime() - LOOKBACK_MS);
    const rangeTo = new Date(now.getTime() + LOOKAHEAD_MS);
    let notified = 0;

    for (const event of withReminders as any[]) {
      await withTenant(event.tenant_id, async (trx) => {
        const overrides = await trx.selectFrom('calendar_event_overrides').selectAll()
          .where('event_id', '=', event.id).execute();
        const overrideByDate = new Map(overrides.map(o => [String(o.occurrence_date).slice(0, 10), o]));

        const masterStart = new Date(event.start_at);
        const masterEnd = new Date(event.end_at);
        let occurrences: { start: Date; originalDate: string }[];
        if (event.recurrence && validateRecurrenceRule(event.recurrence as RecurrenceRule)) {
          occurrences = expandRecurrence(masterStart, masterEnd, event.recurrence as RecurrenceRule, rangeFrom, rangeTo);
        } else if (masterStart.getTime() >= rangeFrom.getTime() && masterStart.getTime() <= rangeTo.getTime()) {
          occurrences = [{ start: masterStart, originalDate: masterStart.toISOString().slice(0, 10) }];
        } else {
          occurrences = [];
        }

        for (const occ of occurrences) {
          const override = overrideByDate.get(occ.originalDate);
          if (override?.is_cancelled) continue;
          const occStart = override?.start_at ? new Date(override.start_at) : occ.start;
          const occTitle = override?.title ?? event.title;

          for (const offsetMinutes of event.reminder_offsets as number[]) {
            const notifyAt = new Date(occStart.getTime() - offsetMinutes * 60_000);
            if (notifyAt.getTime() > now.getTime()) continue; // not due yet

            const already = await trx.selectFrom('calendar_event_reminder_sends').select('event_id')
              .where('event_id', '=', event.id).where('occurrence_start', '=', occStart)
              .where('offset_minutes', '=', offsetMinutes).executeTakeFirst();
            if (already) continue;

            await NotificationService.createNotification({
              tenantId: event.tenant_id, userId: event.user_id, app: 'calendar', type: 'info',
              title: offsetMinutes === 0 ? `Starting now: ${occTitle}` : `Upcoming: ${occTitle}`,
              message: occStart.toLocaleString(),
              link: '/calendar', entityType: 'calendar_event', entityId: event.id,
            });
            await trx.insertInto('calendar_event_reminder_sends').values({
              event_id: event.id, occurrence_start: occStart.toISOString(), offset_minutes: offsetMinutes, tenant_id: event.tenant_id,
            }).execute();
            notified++;
          }
        }
      });
    }

    console.log(`✅ Calendar reminders job completed — ${notified} notification(s) sent.`);
  } catch (error) {
    console.error('❌ Calendar reminder job failed:', error);
  }
}
