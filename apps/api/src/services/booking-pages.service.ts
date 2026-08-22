// Public scheduling links (Calendly-style) — 287_calendar_v3.sql. A page
// belongs to one staff member (working hours/days, slot duration, how far
// ahead it's bookable); booking one creates a real calendar_events row on
// that person's own calendar, the same as if they'd added it themselves.
import { dbPlatform, withTenant } from '../db/client.js';
import { NotificationService } from './notification.service.js';
import { MailService } from './mail.service.js';
import { expandRecurrence, validateRecurrenceRule, type RecurrenceRule } from './calendar-recurrence.service.js';

export interface BookingPageInput {
  slug?: string;
  title?: string;
  description?: string | null;
  durationMinutes?: number;
  bufferMinutes?: number;
  workingDays?: number[];
  workingStartTime?: string;
  workingEndTime?: string;
  timezone?: string;
  bookingWindowDays?: number;
  active?: boolean;
}

export class SlugTakenError extends Error {}
export class BookingPageNotFoundError extends Error {}
export class SlotUnavailableError extends Error {}

function mapPage(row: any) {
  return {
    id: row.id, slug: row.slug, title: row.title, description: row.description,
    durationMinutes: row.duration_minutes, bufferMinutes: row.buffer_minutes,
    workingDays: row.working_days, workingStartTime: row.working_start_time, workingEndTime: row.working_end_time,
    timezone: row.timezone, bookingWindowDays: row.booking_window_days, active: row.active,
    userId: row.user_id, createdAt: new Date(row.created_at).toISOString(),
  };
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])?$/;

async function slugAvailable(slug: string, excludeId?: string): Promise<boolean> {
  let q = dbPlatform.selectFrom('booking_pages').select('id').where('slug', '=', slug);
  if (excludeId) q = q.where('id', '!=', excludeId);
  const existing = await q.executeTakeFirst();
  return !existing;
}

export async function listBookingPages(tenantId: string, userId: string) {
  return withTenant(tenantId, async (trx) => {
    const rows = await trx.selectFrom('booking_pages').selectAll()
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
      .orderBy('created_at', 'asc').execute();
    return rows.map(mapPage);
  });
}

export async function createBookingPage(tenantId: string, userId: string, userName: string, id: string, input: BookingPageInput) {
  const rawSlug = (input.slug || `${userName}-${input.durationMinutes ?? 30}min`).toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
  let slug = rawSlug || `booking-${id.slice(0, 8)}`;
  if (!SLUG_RE.test(slug)) slug = `booking-${id.slice(0, 8)}`;
  if (!(await slugAvailable(slug))) {
    // A slug the caller typed by hand is a namespace pick, not a hint — if
    // it's taken, tell them (matching updateBookingPage's own behaviour)
    // rather than silently handing back a different link than they saw.
    // Only the auto-derived fallback (no slug given at all) is safe to
    // rewrite quietly, since nobody has seen that value yet.
    if (input.slug) throw new SlugTakenError('That link is already taken — pick another.');
    slug = `${slug}-${id.slice(0, 6)}`;
  }

  return withTenant(tenantId, async (trx) => {
    const row = await trx.insertInto('booking_pages').values({
      id, tenant_id: tenantId, user_id: userId, slug,
      title: (input.title || `${input.durationMinutes ?? 30} min meeting`).trim(),
      description: input.description ?? null,
      duration_minutes: input.durationMinutes ?? 30,
      buffer_minutes: input.bufferMinutes ?? 0,
      working_days: input.workingDays ?? [1, 2, 3, 4, 5],
      working_start_time: input.workingStartTime ?? '09:00',
      working_end_time: input.workingEndTime ?? '17:00',
      timezone: input.timezone ?? 'UTC',
      booking_window_days: input.bookingWindowDays ?? 30,
      active: input.active ?? true,
    }).returningAll().executeTakeFirstOrThrow();
    return mapPage(row);
  });
}

export async function updateBookingPage(tenantId: string, userId: string, id: string, input: BookingPageInput) {
  if (input.slug) {
    const clean = input.slug.toLowerCase().trim();
    if (!SLUG_RE.test(clean)) throw new SlugTakenError('That link isn\'t a valid format — use lowercase letters, numbers and hyphens only.');
    if (!(await slugAvailable(clean, id))) throw new SlugTakenError('That link is already taken — pick another.');
  }
  return withTenant(tenantId, async (trx) => {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.slug !== undefined) updates.slug = input.slug.toLowerCase().trim();
    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) updates.description = input.description;
    if (input.durationMinutes !== undefined) updates.duration_minutes = input.durationMinutes;
    if (input.bufferMinutes !== undefined) updates.buffer_minutes = input.bufferMinutes;
    if (input.workingDays !== undefined) updates.working_days = input.workingDays;
    if (input.workingStartTime !== undefined) updates.working_start_time = input.workingStartTime;
    if (input.workingEndTime !== undefined) updates.working_end_time = input.workingEndTime;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.bookingWindowDays !== undefined) updates.booking_window_days = input.bookingWindowDays;
    if (input.active !== undefined) updates.active = input.active;
    const row = await trx.updateTable('booking_pages').set(updates)
      .where('id', '=', id).where('user_id', '=', userId)
      .returningAll().executeTakeFirst();
    if (!row) throw new BookingPageNotFoundError();
    return mapPage(row);
  });
}

export async function deleteBookingPage(tenantId: string, userId: string, id: string) {
  return withTenant(tenantId, trx =>
    trx.deleteFrom('booking_pages').where('id', '=', id).where('user_id', '=', userId).execute()
  );
}

// ── Public (unauthenticated) surface ──────────────────────────────────────

/** Resolves which tenant owns a public slug — the one legitimate
 *  cross-tenant lookup this feature needs, since a public URL carries no
 *  tenant hint at all. Narrow and audited: only ever returns the page's own
 *  id/tenant_id/basic display fields, nothing else. */
export async function getPublicBookingPage(slug: string) {
  const row = await dbPlatform.selectFrom('booking_pages')
    .innerJoin('users', 'users.id', 'booking_pages.user_id')
    .select([
      'booking_pages.id', 'booking_pages.tenant_id', 'booking_pages.title', 'booking_pages.description',
      'booking_pages.duration_minutes', 'booking_pages.buffer_minutes', 'booking_pages.working_days',
      'booking_pages.working_start_time', 'booking_pages.working_end_time', 'booking_pages.timezone',
      'booking_pages.booking_window_days', 'booking_pages.active', 'booking_pages.user_id',
      'users.name as host_name',
    ])
    .where('booking_pages.slug', '=', slug)
    .executeTakeFirst();
  if (!row || !row.active) return null;
  return {
    id: row.id, title: row.title, description: row.description, hostName: row.host_name,
    durationMinutes: row.duration_minutes, bufferMinutes: row.buffer_minutes,
    workingDays: row.working_days, workingStartTime: row.working_start_time, workingEndTime: row.working_end_time,
    timezone: row.timezone, bookingWindowDays: row.booking_window_days,
    tenantId: row.tenant_id, userId: row.user_id,
  };
}

/** Every candidate slot for one calendar day, minus whatever the host's
 *  real calendar already has booked (recurring events expanded the same
 *  way the main calendar does). */
export async function getAvailableSlots(tenantId: string, userId: string, page: { durationMinutes: number; bufferMinutes: number; workingDays: number[]; workingStartTime: string; workingEndTime: string }, dateStr: string) {
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  if (!page.workingDays.includes(dayOfWeek)) return [];

  const [startH, startM] = page.workingStartTime.split(':').map(Number);
  const [endH, endM] = page.workingEndTime.split(':').map(Number);
  const dayStart = new Date(`${dateStr}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00.000Z`);
  const dayEnd = new Date(`${dateStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00.000Z`);
  const stepMs = page.durationMinutes * 60_000;

  return withTenant(tenantId, async (trx) => {
    const masters = await trx.selectFrom('calendar_events').selectAll()
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).execute();
    const overrideRows = masters.length
      ? await trx.selectFrom('calendar_event_overrides').selectAll()
          .where('tenant_id', '=', tenantId).where('event_id', 'in', masters.map(m => m.id)).execute()
      : [];
    const overridesByEvent = new Map<string, any[]>();
    for (const o of overrideRows) {
      const list = overridesByEvent.get(o.event_id) ?? [];
      list.push(o);
      overridesByEvent.set(o.event_id, list);
    }

    const busy: { start: number; end: number }[] = [];
    for (const m of masters) {
      const overrides = overridesByEvent.get(m.id) ?? [];
      const overrideByDate = new Map(overrides.map((o: any) => [String(o.occurrence_date).slice(0, 10), o]));
      const masterStart = new Date(m.start_at);
      const masterEnd = new Date(m.end_at);
      let occs: { start: Date; end: Date; originalDate: string }[];
      if (m.recurrence && validateRecurrenceRule(m.recurrence as RecurrenceRule)) {
        occs = expandRecurrence(masterStart, masterEnd, m.recurrence as RecurrenceRule, dayStart, dayEnd);
      } else if (masterEnd.getTime() >= dayStart.getTime() && masterStart.getTime() <= dayEnd.getTime()) {
        occs = [{ start: masterStart, end: masterEnd, originalDate: masterStart.toISOString().slice(0, 10) }];
      } else {
        occs = [];
      }
      for (const occ of occs) {
        const override = overrideByDate.get(occ.originalDate);
        if (override?.is_cancelled) continue;
        const s = override?.start_at ? new Date(override.start_at) : occ.start;
        const e = override?.end_at ? new Date(override.end_at) : occ.end;
        busy.push({ start: s.getTime() - page.bufferMinutes * 60_000, end: e.getTime() + page.bufferMinutes * 60_000 });
      }
    }

    const slots: string[] = [];
    for (let t = dayStart.getTime(); t + stepMs <= dayEnd.getTime(); t += stepMs) {
      const slotEnd = t + stepMs;
      const conflict = busy.some(b => t < b.end && slotEnd > b.start);
      const inPast = t < Date.now();
      if (!conflict && !inPast) slots.push(new Date(t).toISOString());
    }
    return slots;
  });
}

export async function createBooking(
  page: { id: string; tenantId: string; userId: string; title: string; durationMinutes: number; hostName: string },
  slotStartIso: string, bookerName: string, bookerEmail: string, bookerNotes?: string,
) {
  return withTenant(page.tenantId, async (trx) => {
    const start = new Date(slotStartIso);
    const end = new Date(start.getTime() + page.durationMinutes * 60_000);

    // Re-check the slot at booking time, not just when the page was loaded
    // — two people can't be looking at the same page at once and both win
    // the same slot.
    const conflict = await trx.selectFrom('calendar_events').select('id')
      .where('tenant_id', '=', page.tenantId).where('user_id', '=', page.userId)
      .where('start_at', '<', end).where('end_at', '>', start)
      .executeTakeFirst();
    if (conflict) throw new SlotUnavailableError('That time was just booked by someone else — pick another slot.');

    const row = await trx.insertInto('calendar_events').values({
      id: crypto.randomUUID(), tenant_id: page.tenantId, user_id: page.userId,
      title: `${page.title} with ${bookerName}`,
      start_at: start.toISOString(), end_at: end.toISOString(),
      description: bookerNotes || null, category: 'personal',
      guests: JSON.stringify([{ userId: null, email: bookerEmail, name: bookerName, status: 'accepted' }]) as unknown as any,
      booking_page_id: page.id, reminder_offsets: [],
    }).returningAll().executeTakeFirstOrThrow();

    const host = await trx.selectFrom('users').select(['name', 'email']).where('id', '=', page.userId).executeTakeFirst();

    await NotificationService.createNotification({
      tenantId: page.tenantId, userId: page.userId, app: 'calendar', type: 'info',
      title: `${bookerName} booked "${page.title}"`, message: start.toLocaleString(),
      link: '/calendar', entityType: 'calendar_event', entityId: row.id,
    }).catch(err => console.error('[BookingPages] Failed to notify host:', err.message));

    if (host?.email) {
      await MailService.sendNow(page.tenantId, {
        to: host.email, subject: `New booking: ${bookerName} — ${page.title}`,
        bodyHtml: `<p>${bookerName} (${bookerEmail}) booked <strong>${page.title}</strong> for ${start.toLocaleString()}.</p>${bookerNotes ? `<p>${bookerNotes}</p>` : ''}`,
        sourceApp: 'calendar',
      }).catch(err => console.error('[BookingPages] Failed to email host:', err.message));
    }
    await MailService.sendNow(page.tenantId, {
      to: bookerEmail, subject: `Confirmed: ${page.title} with ${page.hostName}`,
      bodyHtml: `<p>Hi ${bookerName},</p><p>Your booking with ${page.hostName} is confirmed for <strong>${start.toLocaleString()}</strong>.</p>`,
      sourceApp: 'calendar',
    }).catch(err => console.error('[BookingPages] Failed to email booker:', err.message));

    return { id: row.id, start: start.toISOString(), end: end.toISOString() };
  });
}
