// Calendar events v2 — recurrence expansion, per-occurrence overrides, real
// guest invites, and ICS export/import. Extracted out of tasks.routes.ts
// (where /events used to be a handful of inline queries) now that a single
// event maps to many rendered occurrences instead of one row, one card.
import { withTenant } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import { MailService } from './mail.service.js';
import { expandRecurrence, validateRecurrenceRule, type RecurrenceRule } from './calendar-recurrence.service.js';
import { eventsToICS, parseICS } from '../lib/ics.js';

export interface Guest {
  userId: string | null;
  email: string;
  name: string | null;
  status: 'pending' | 'accepted' | 'declined';
}

export interface EventInput {
  title?: string;
  start?: string; // ISO
  end?: string;   // ISO
  description?: string | null;
  location?: string | null;
  category?: string;
  guests?: Guest[];
  allDay?: boolean;
  color?: string | null;
  recurrence?: RecurrenceRule | null;
  reminderOffsets?: number[];
  /** IANA name (e.g. 'Africa/Dar_es_Salaam') the organizer created this event
   *  in — display metadata only. start/end are already resolved to the
   *  correct UTC instant by the caller (calendarStore.ts's localToUTCISO)
   *  before this ever gets called, the same as every event without a
   *  timezone set; this is never re-interpreted or converted server-side,
   *  just stored so guests in another zone can see what zone the time was
   *  originally stated in. Recurrence expansion stays fixed-UTC-offset
   *  stepping regardless of this field (no DST-aware recurring math). */
  timezone?: string | null;
}

export class EventNotFoundError extends Error {}
export class EventValidationError extends Error {}

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').slice(0, 10);
}

/** One rendered card — either the whole of a non-recurring event, or one
 *  expanded occurrence of a recurring one. `id` always identifies the
 *  master row; `occurrenceDate` plus `scope: 'this'` is what a caller sends
 *  back to edit/delete just this occurrence rather than the whole series. */
function mapOccurrence(master: any, occ: { start: Date; end: Date; originalDate: string; title: string; description: string | null; location: string | null; isOverridden: boolean }) {
  return {
    id: master.id,
    occurrenceDate: occ.originalDate,
    isOverridden: occ.isOverridden,
    title: occ.title,
    start_at: occ.start.toISOString(),
    end_at: occ.end.toISOString(),
    description: occ.description,
    location: occ.location,
    category: master.category,
    guests: master.guests ?? [],
    all_day: master.all_day,
    color: master.color,
    recurrence: master.recurrence,
    is_recurring: !!master.recurrence,
    reminder_offsets: master.reminder_offsets ?? [],
    timezone: master.timezone ?? null,
    tenant_id: master.tenant_id,
    user_id: master.user_id,
    created_at: master.created_at,
    updated_at: master.updated_at,
  };
}

function computeOccurrencesInRange(master: any, overrides: any[], from: Date, to: Date) {
  const overrideByDate = new Map(overrides.map(o => [isoDate(o.occurrence_date), o]));
  const masterStart = new Date(master.start_at);
  const masterEnd = new Date(master.end_at);

  let raw: { start: Date; end: Date; originalDate: string }[];
  if (master.recurrence && validateRecurrenceRule(master.recurrence)) {
    raw = expandRecurrence(masterStart, masterEnd, master.recurrence, from, to);
  } else if (masterEnd.getTime() >= from.getTime() && masterStart.getTime() <= to.getTime()) {
    raw = [{ start: masterStart, end: masterEnd, originalDate: isoDate(masterStart) }];
  } else {
    raw = [];
  }

  const results: ReturnType<typeof mapOccurrence>[] = [];
  for (const occ of raw) {
    const override = overrideByDate.get(occ.originalDate);
    if (override?.is_cancelled) continue;
    results.push(mapOccurrence(master, {
      start: override?.start_at ? new Date(override.start_at) : occ.start,
      end: override?.end_at ? new Date(override.end_at) : occ.end,
      originalDate: occ.originalDate,
      title: override?.title ?? master.title,
      description: override?.description !== undefined && override?.description !== null ? override.description : master.description,
      location: override?.location !== undefined && override?.location !== null ? override.location : master.location,
      isOverridden: !!override,
    }));
  }
  return results;
}

export async function listEvents(tenantId: string, userId: string, range: { from: Date; to: Date }, search?: string) {
  return withTenant(tenantId, async (trx) => {
    let q = trx.selectFrom('calendar_events').selectAll()
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      q = q.where((eb: any) => eb.or([
        eb('title', 'ilike', term), eb('description', 'ilike', term), eb('location', 'ilike', term),
      ]));
    }
    const masters = await q.execute();

    const overridesByEvent = new Map<string, any[]>();
    if (masters.length) {
      const overrideRows = await trx.selectFrom('calendar_event_overrides').selectAll()
        .where('tenant_id', '=', tenantId).where('event_id', 'in', masters.map(m => m.id)).execute();
      for (const o of overrideRows) {
        const list = overridesByEvent.get(o.event_id) ?? [];
        list.push(o);
        overridesByEvent.set(o.event_id, list);
      }
    }

    const occurrences = masters.flatMap(m => computeOccurrencesInRange(m, overridesByEvent.get(m.id) ?? [], range.from, range.to));

    const hrHolidays = await trx.selectFrom('hr_holidays').selectAll().where('tenant_id', '=', tenantId).execute();
    const holidayEvents = hrHolidays
      .map(h => {
        const dateStr = isoDate(h.date);
        const d = new Date(`${dateStr}T00:00:00.000Z`);
        if (d.getTime() < range.from.getTime() || d.getTime() > range.to.getTime()) return null;
        return {
          id: h.id, occurrenceDate: dateStr, isOverridden: false,
          title: `🌴 ${h.name}`, start_at: `${dateStr}T00:00:00.000Z`, end_at: `${dateStr}T23:59:59.999Z`,
          description: `${h.type} Holiday`, location: null, category: 'holiday', guests: [],
          all_day: true, color: null, recurrence: null, is_recurring: false, reminder_offsets: [],
          tenant_id: h.tenant_id, user_id: userId, created_at: h.created_at, updated_at: h.created_at,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);

    return [...occurrences, ...holidayEvents].sort((a, b) => a.start_at.localeCompare(b.start_at));
  });
}

export interface BusyBlock { start: string; end: string; }

/** "Meet with…" — busy/free only, never titles/descriptions/location, for
 *  every requested colleague in the SAME tenant. There is no existing
 *  cross-user visibility model for calendars at all (every other query in
 *  this file is strictly scoped to the caller's own user_id) — this is
 *  deliberately the first one, and deliberately safe by construction: it
 *  can never leak what a meeting is about, only when someone is unavailable,
 *  matching how real workplace calendars behave by default for colleagues
 *  in the same organization. */
export async function getFreeBusy(tenantId: string, userIds: string[], range: { from: Date; to: Date }): Promise<Record<string, BusyBlock[]>> {
  return withTenant(tenantId, async (trx) => {
    const result: Record<string, BusyBlock[]> = {};
    for (const userId of userIds) {
      const masters = await trx.selectFrom('calendar_events').selectAll()
        .where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute();

      const overridesByEvent = new Map<string, any[]>();
      if (masters.length) {
        const overrideRows = await trx.selectFrom('calendar_event_overrides').selectAll()
          .where('tenant_id', '=', tenantId).where('event_id', 'in', masters.map(m => m.id)).execute();
        for (const o of overrideRows) {
          const list = overridesByEvent.get(o.event_id) ?? [];
          list.push(o);
          overridesByEvent.set(o.event_id, list);
        }
      }

      const occurrences = masters.flatMap(m => computeOccurrencesInRange(m, overridesByEvent.get(m.id) ?? [], range.from, range.to));
      result[userId] = occurrences
        .map(o => ({ start: o.start_at, end: o.end_at }))
        .sort((a, b) => a.start.localeCompare(b.start));
    }
    return result;
  });
}

async function notifyGuests(tenantId: string, actorName: string, event: { id: string; title: string; start_at: string }, guests: Guest[]) {
  for (const g of guests) {
    if (!g.userId) continue; // free-text-only guest (no platform account) — nothing to notify in-app
    const title = `${actorName} invited you to "${event.title}"`;
    await NotificationService.createNotification({
      tenantId, userId: g.userId, app: 'calendar', type: 'info', title,
      message: new Date(event.start_at).toLocaleString(), link: '/calendar', entityType: 'calendar_event', entityId: event.id,
    }).catch(err => console.error('[Calendar] Failed to notify guest:', err.message));
  }
}

export async function createEvent(tenantId: string, userId: string, actorName: string, id: string, input: EventInput) {
  if (input.recurrence && !validateRecurrenceRule(input.recurrence)) throw new EventValidationError('Invalid recurrence rule.');
  return withTenant(tenantId, async (trx) => {
    const row = await trx.insertInto('calendar_events').values({
      id, tenant_id: tenantId, user_id: userId,
      title: (input.title ?? '').trim(), start_at: input.start!, end_at: input.end!,
      description: input.description ?? null, location: input.location ?? null,
      category: input.category ?? 'work',
      guests: JSON.stringify(input.guests ?? []) as unknown as any,
      all_day: input.allDay ?? false, color: input.color ?? null,
      recurrence: input.recurrence ? JSON.stringify(input.recurrence) as unknown as any : null,
      reminder_offsets: input.reminderOffsets ?? [], timezone: input.timezone ?? null,
    }).returningAll().executeTakeFirstOrThrow();

    if (input.guests?.length) await notifyGuests(tenantId, actorName, { id: row.id, title: row.title, start_at: new Date(row.start_at).toISOString() }, input.guests);
    return row;
  });
}

/** scope 'all' edits the master row (every future occurrence). scope
 *  'this' with an occurrenceDate creates/updates a single-occurrence
 *  override instead — the master is never touched. */
export async function updateEvent(
  tenantId: string, userId: string, actorName: string, id: string, input: EventInput,
  scope: 'all' | 'this', occurrenceDate?: string,
) {
  if (input.recurrence && !validateRecurrenceRule(input.recurrence)) throw new EventValidationError('Invalid recurrence rule.');
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('calendar_events').selectAll()
      .where('id', '=', id).where('tenant_id', '=', tenantId).where('user_id', '=', userId).executeTakeFirst();
    if (!existing) throw new EventNotFoundError();

    if (scope === 'this' && occurrenceDate) {
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title.trim();
      if (input.start !== undefined) patch.start_at = input.start;
      if (input.end !== undefined) patch.end_at = input.end;
      if (input.description !== undefined) patch.description = input.description;
      if (input.location !== undefined) patch.location = input.location;

      const existingOverride = await trx.selectFrom('calendar_event_overrides').select('id')
        .where('event_id', '=', id).where('occurrence_date', '=', occurrenceDate).executeTakeFirst();
      const row = existingOverride
        ? await trx.updateTable('calendar_event_overrides').set(patch)
            .where('id', '=', existingOverride.id).returningAll().executeTakeFirstOrThrow()
        : await trx.insertInto('calendar_event_overrides').values({
            id: crypto.randomUUID(), tenant_id: tenantId, event_id: id, occurrence_date: occurrenceDate, ...patch,
          }).returningAll().executeTakeFirstOrThrow();
      return { override: row, master: existing };
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.start !== undefined) updates.start_at = input.start;
    if (input.end !== undefined) updates.end_at = input.end;
    if (input.description !== undefined) updates.description = input.description;
    if (input.location !== undefined) updates.location = input.location;
    if (input.category !== undefined) updates.category = input.category;
    if (input.allDay !== undefined) updates.all_day = input.allDay;
    if (input.color !== undefined) updates.color = input.color;
    if (input.recurrence !== undefined) updates.recurrence = input.recurrence ? JSON.stringify(input.recurrence) : null;
    if (input.reminderOffsets !== undefined) updates.reminder_offsets = input.reminderOffsets;
    if (input.timezone !== undefined) updates.timezone = input.timezone;

    let newlyInvitedGuests: Guest[] = [];
    if (input.guests !== undefined) {
      const prevIds = new Set((existing.guests ?? []).map((g: Guest) => g.userId).filter(Boolean));
      newlyInvitedGuests = input.guests.filter(g => g.userId && !prevIds.has(g.userId));
      updates.guests = JSON.stringify(input.guests);
    }

    const row = await trx.updateTable('calendar_events').set(updates)
      .where('id', '=', id).where('tenant_id', '=', tenantId).where('user_id', '=', userId)
      .returningAll().executeTakeFirstOrThrow();

    if (newlyInvitedGuests.length) await notifyGuests(tenantId, actorName, { id: row.id, title: row.title, start_at: new Date(row.start_at).toISOString() }, newlyInvitedGuests);
    return { master: row };
  });
}

/** scope 'all' deletes the whole series (cascades overrides/reminder-send
 *  guards via FK). scope 'this' cancels just one occurrence via an
 *  override, leaving the series and every other occurrence untouched. */
export async function deleteEvent(tenantId: string, userId: string, id: string, scope: 'all' | 'this', occurrenceDate?: string) {
  return withTenant(tenantId, async (trx) => {
    if (scope === 'this' && occurrenceDate) {
      const existing = await trx.selectFrom('calendar_events').select('id')
        .where('id', '=', id).where('tenant_id', '=', tenantId).where('user_id', '=', userId).executeTakeFirst();
      if (!existing) return;
      const existingOverride = await trx.selectFrom('calendar_event_overrides').select('id')
        .where('event_id', '=', id).where('occurrence_date', '=', occurrenceDate).executeTakeFirst();
      if (existingOverride) {
        await trx.updateTable('calendar_event_overrides').set({ is_cancelled: true }).where('id', '=', existingOverride.id).execute();
      } else {
        await trx.insertInto('calendar_event_overrides').values({
          id: crypto.randomUUID(), tenant_id: tenantId, event_id: id, occurrence_date: occurrenceDate, is_cancelled: true,
        }).execute();
      }
      return;
    }
    await trx.deleteFrom('calendar_events').where('id', '=', id).where('user_id', '=', userId).execute();
  });
}

// ── ICS export/import ──────────────────────────────────────────────────
export async function exportICS(tenantId: string, userId: string, range: { from: Date; to: Date }): Promise<string> {
  return withTenant(tenantId, async (trx) => {
    const masters = await trx.selectFrom('calendar_events').selectAll()
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute();
    // Recurring events export as ONE VEVENT carrying an RRULE (a real
    // calendar app reads that back as a series); non-recurring events
    // export their one occurrence directly — neither needs expanding here.
    return eventsToICS(masters.map(m => ({
      uid: m.id, title: m.title, startAt: new Date(m.start_at).toISOString(), endAt: new Date(m.end_at).toISOString(),
      description: m.description, location: m.location, allDay: m.all_day,
      recurrence: (m.recurrence as RecurrenceRule | null) ?? null,
    })));
  });
}

export async function importICS(tenantId: string, userId: string, icsText: string): Promise<{ imported: number; skipped: number }> {
  const parsed = parseICS(icsText);
  let imported = 0, skipped = 0;
  await withTenant(tenantId, async (trx) => {
    for (const ev of parsed) {
      if (!ev.title?.trim() || !ev.startAt || !ev.endAt) { skipped++; continue; }
      await trx.insertInto('calendar_events').values({
        id: crypto.randomUUID(), tenant_id: tenantId, user_id: userId,
        title: ev.title.trim(), start_at: ev.startAt, end_at: ev.endAt,
        description: ev.description ?? null, location: ev.location ?? null, category: 'work',
        guests: '[]' as unknown as any, all_day: ev.allDay,
        recurrence: ev.recurrence ? JSON.stringify(ev.recurrence) as unknown as any : null,
        reminder_offsets: [],
      }).execute();
      imported++;
    }
  });
  return { imported, skipped };
}
