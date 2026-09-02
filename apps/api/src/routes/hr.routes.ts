import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { MailService } from '../services/mail.service.js';
import { emitDomainEvent, emitDomainEventStandalone } from '../services/domain-events.service.js';
import { HolidaysService } from '../services/holidays.service.js';
import { workingDaysBetween } from '../services/holiday-calendar.service.js';
import { checkRequest as checkLeaveRequest, splitPayDays, computeBalances as computeLeaveBalances } from '../services/leave-entitlement.service.js';
import { env } from '../config/env.js';
import { settleEntry, MIN_SHIFT_MINUTES } from '../services/time-entry.service.js';
import { callAI } from './ai.routes.js';
import { recordAuthEvent } from '../lib/audit-chain.js';
import { computeAttendance, type Shift } from '../services/attendance.service.js';

/**
 * YYYY-MM-DD from a `date` column, whatever the driver hands back.
 *
 * pg parses `date` into a JS Date, so `String(v).slice(0, 10)` yields
 * "Tue Sep 01" — a value that looks like a date, is not one, and would arrive
 * in every consuming app's workflow payload. The same trap cost the SuperAdmin
 * trade-wizard trend a 500.
 */
function isoDate(v: unknown): string {
  if (v instanceof Date) {
    // Local parts, NOT toISOString(). A `date` column has no time or zone, and
    // pg materialises it at LOCAL midnight — so in any timezone ahead of UTC
    // toISOString() rolls it back a day. Storing 2026-09-01 and emitting
    // 2026-08-31 to every subscribing app is a whole day of leave in the wrong
    // place; verified here, on this machine, before it shipped.
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : isoDate(d);
}

async function logActivity(trx: any, tenantId: string, userId: string | null, action: string, module = 'HR') {
  await trx.insertInto('hr_activity_log').values({ tenant_id: tenantId, user_id: userId, action, module }).execute();
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Roles allowed to act on another user's time / review timesheets. A regular
// employee may always act on their own; anything targeting someone else needs
// one of these.
const TS_MANAGER_ROLES = ['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR'];
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Attendance ⇄ header check-in link (M1).
 *
 * Two time systems used to run side by side and never speak: the header
 * check-in widget logs task/shipment time into `hr_time_entries`, while the
 * /nexushr/clock-in timesheet reads attendance work sessions from
 * `hr_clock_sessions` / `hr_attendance`. You could log a whole day against a
 * shipment and still read as "never clocked in" on the timesheet.
 *
 * ensureAttendanceSessionOpen makes the first check-in of the day also open an
 * attendance session and mark you PRESENT; closeAttendanceSessionIfIdle closes
 * that session once no open time entry remains. The link lives entirely on the
 * server, so the timesheet reflects the header with no frontend coupling.
 */
async function ensureAttendanceSessionOpen(trx: any, tenantId: string, userId: string, now: Date) {
  const open = await trx.selectFrom('hr_clock_sessions')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
    .executeTakeFirst();
  if (open) return; // already clocked in — a task switch must not reopen a session

  const dateStr = isoDate(now);

  await trx.insertInto('hr_clock_sessions').values({
    tenant_id: tenantId,
    user_id: userId,
    date: dateStr,
    clock_in_at: now,
    project_name: null,
    status: 'ACTIVE',
    total_break_minutes: 0,
  }).execute();

  await syncAttendanceFromSessions(trx, tenantId, userId, dateStr, userId);
}

async function closeAttendanceSessionIfIdle(trx: any, tenantId: string, userId: string, now: Date) {
  // Still an open time entry today? The person hasn't left — keep the session.
  const stillOpen = await trx.selectFrom('hr_time_entries')
    .select('id')
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('date', '=', isoDate(now))
    .where('ended_at', 'is', null)
    .executeTakeFirst();
  if (stillOpen) return;

  const session = await trx.selectFrom('hr_clock_sessions').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('user_id', '=', userId)
    .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  if (!session) return;

  let totalBreak = session.total_break_minutes || 0;
  if (session.status === 'ON_BREAK') {
    const openBreak = await trx.selectFrom('hr_clock_breaks').selectAll()
      .where('tenant_id', '=', tenantId)
      .where('session_id', '=', session.id)
      .where('end_at', 'is', null)
      .executeTakeFirst();
    if (openBreak) {
      const dur = Math.max(1, Math.round((now.getTime() - new Date(openBreak.start_at).getTime()) / 60000));
      totalBreak += dur;
      await trx.updateTable('hr_clock_breaks').set({ end_at: now, duration_minutes: dur })
        .where('id', '=', openBreak.id).execute();
    }
  }

  const grossMs = now.getTime() - new Date(session.clock_in_at).getTime();
  const workedMins = Math.max(0, Math.round(grossMs / 60000) - totalBreak);

  await trx.updateTable('hr_clock_sessions').set({
    status: 'COMPLETED', clock_out_at: now, total_break_minutes: totalBreak,
    worked_minutes: workedMins, updated_at: now,
  }).where('id', '=', session.id).execute();

  await syncAttendanceFromSessions(trx, tenantId, userId, session.date, userId);
}

/**
 * The reverse of ensureAttendanceSessionOpen: clocking in on the /nexushr/clock-in
 * timesheet also opens a header time entry, so the top-bar check-in widget shows
 * you as checked in (it reads /hr/time/today). Without this, the two systems only
 * synced one way — the header could mark the timesheet, but not the reverse.
 */
async function ensureTimeEntryOpen(trx: any, tenantId: string, userId: string, now: Date) {
  const open = await trx.selectFrom('hr_time_entries').select('id')
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
    .where('date', '=', isoDate(now)).where('ended_at', 'is', null)
    .executeTakeFirst();
  if (open) return;
  await trx.insertInto('hr_time_entries').values({
    tenant_id: tenantId, user_id: userId, task_id: null, task_name: 'Clocked in',
    is_billable: false, entry_type: 'CHECK_IN', date: isoDate(now), is_full_day: false,
    started_at: now, last_ack_at: now, project_id: null, project_ref: null,
  }).execute();
}

async function closeOpenTimeEntries(trx: any, tenantId: string, userId: string, now: Date) {
  const open = await trx.selectFrom('hr_time_entries').select(['id', 'started_at'])
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
    .where('date', '=', isoDate(now)).where('ended_at', 'is', null)
    .execute();
  for (const e of open) {
    const dur = Math.max(0, Math.round((now.getTime() - new Date(e.started_at as any).getTime()) / 60000));
    await trx.updateTable('hr_time_entries').set({ ended_at: now, duration_minutes: dur, updated_at: now }).where('id', '=', e.id).execute();
  }
}

/** The day's shift for LATE detection: an explicit hr_shift_assignments row
 *  for that user/date, else the tenant's one `is_default` hr_shifts row,
 *  else a bare fallback for a tenant that hasn't configured shifts at all. */
async function resolveShiftFor(trx: any, tenantId: string, userId: string, dateStr: string): Promise<Shift> {
  const assigned = await trx.selectFrom('hr_shift_assignments as a')
    .innerJoin('hr_shifts as s', 's.id', 'a.shift_id')
    .select(['s.start_time', 's.end_time', 's.break_minutes', 's.grace_minutes'])
    .where('a.tenant_id', '=', tenantId).where('a.user_id', '=', userId).where('a.date', '=', dateStr)
    .executeTakeFirst();
  const row = assigned ?? await trx.selectFrom('hr_shifts')
    .select(['start_time', 'end_time', 'break_minutes', 'grace_minutes'])
    .where('tenant_id', '=', tenantId).where('is_default', '=', true)
    .executeTakeFirst();
  if (!row) return { startTime: '08:00', endTime: '17:00', breakMinutes: 0, graceMinutes: 10 };
  return { startTime: row.start_time, endTime: row.end_time, breakMinutes: row.break_minutes, graceMinutes: row.grace_minutes };
}

/**
 * Recomputes an hr_attendance row's clock_in/clock_out/worked_minutes from
 * every hr_clock_sessions row that date, instead of whichever single
 * session most recently wrote to it. A day genuinely can hold more than one
 * session — a real clock session plus a manual backfill, a missed
 * clock-out fixed by clocking in again, lunch taken outside the in-session
 * break button, or now a biometric device punch pair (source='DEVICE',
 * 379_attendance_devices.sql) — and hr_attendance is one row per day, so
 * without this the admin Attendance dashboard's number is whichever session
 * happened to write last, not the employee's real total. Called after every
 * write to hr_clock_sessions for that user/date (start, stop, manual, device).
 *
 * Status is now genuinely derived via computeAttendance() (attendance.
 * service.ts) against the day's real shift, instead of the caller always
 * passing 'PRESENT' — that made every previous call site's LATE detection
 * dead code: clock-in forced 'PRESENT' immediately, and clock-out passed no
 * override at all, so nothing ever revisited it. An explicit statusOverride
 * (a manual HR mark: ON_LEAVE, ABSENT, ...) still always wins.
 */
export async function syncAttendanceFromSessions(trx: any, tenantId: string, userId: string, dateStr: string, actorId: string, statusOverride?: string) {
  const sessions = await trx.selectFrom('hr_clock_sessions')
    .select(['clock_in_at', 'clock_out_at', 'worked_minutes', 'status', 'source'])
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('date', '=', dateStr)
    .execute();
  if (sessions.length === 0) return;

  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  let earliestIn: Date | null = null;
  let latestOut: Date | null = null;
  let totalWorked = 0;
  let hasDevice = false;
  let hasWeb = false;
  for (const s of sessions) {
    const inAt = new Date(s.clock_in_at as any);
    if (!earliestIn || inAt < earliestIn) earliestIn = inAt;
    if (s.source === 'DEVICE') hasDevice = true;
    else if (s.source !== 'MANUAL') hasWeb = true; // WEB, or the pre-migration default
    if (s.status === 'COMPLETED') {
      totalWorked += (s.worked_minutes as number) || 0;
      if (s.clock_out_at) {
        const outAt = new Date(s.clock_out_at as any);
        if (!latestOut || outAt > latestOut) latestOut = outAt;
      }
    }
  }

  // computeAttendance requires both times to classify PRESENT/LATE — pass
  // earliestIn for both when nobody has clocked out yet. lateBy/status don't
  // depend on outM once inM is non-null, so this is safe; it just means the
  // worked/overtime figures it also returns aren't meaningful mid-shift,
  // which is fine since totalWorked (summed from real sessions) is used
  // instead of computeAttendance's own gap-based total.
  const shift = await resolveShiftFor(trx, tenantId, userId, dateStr);
  const computed = computeAttendance(fmt(earliestIn as Date), fmt(latestOut ?? (earliestIn as Date)), shift);

  const existing = await trx.selectFrom('hr_attendance').select('id')
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('date', '=', dateStr)
    .executeTakeFirst();

  const patch: Record<string, unknown> = {
    clock_in: earliestIn ? fmt(earliestIn) : null,
    clock_out: latestOut ? fmt(latestOut) : null,
    worked_minutes: totalWorked,
    status: statusOverride ?? computed.status,
    // A day mixing sources (rare) counts as BIOMETRIC/WEB over MANUAL — the
    // more automated source is the more trustworthy record of what happened.
    method: hasDevice ? 'BIOMETRIC' : hasWeb ? 'WEB' : 'MANUAL',
    recorded_by: actorId,
    updated_at: new Date(),
  };
  if (existing) {
    await trx.updateTable('hr_attendance').set(patch).where('id', '=', existing.id).execute();
  } else {
    await trx.insertInto('hr_attendance').values({
      tenant_id: tenantId, user_id: userId, date: dateStr, ...patch,
    }).execute();
  }
}

export async function hrRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  // ── Departments ───────────────────────────────────────────────

  fastify.get('/departments', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx
        .selectFrom('hr_departments as d')
        .leftJoin('users as u', 'u.id', 'd.head_user_id')
        .select([
          'd.id', 'd.name', 'd.status', 'd.created_at', 'd.head_user_id',
          'u.name as head_name',
        ])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.name')
        .execute();
      return rows.map(r => ({ ...r, employee_count: 0 }));
    });
  });

  fastify.post('/departments', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      head_user_id: z.string().uuid().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_departments').values({
        tenant_id: user.tenant_id,
        name: body.name,
        head_user_id: body.head_user_id || null,
        status: body.status || 'ACTIVE',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/departments/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      head_user_id: z.string().uuid().nullable().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name !== undefined)         allowed.name = body.name;
      if (body.head_user_id !== undefined) allowed.head_user_id = body.head_user_id;
      if (body.status !== undefined)       allowed.status = body.status;
      allowed.updated_at = new Date();
      return trx.updateTable('hr_departments').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/departments/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_departments')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Designations ──────────────────────────────────────────────

  fastify.get('/designations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_designations as d')
        .leftJoin('hr_departments as dept', 'dept.id', 'd.department_id')
        .select(['d.id', 'd.title', 'd.department_id', 'd.created_at', 'dept.name as department_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.title')
        .execute();
    });
  });

  fastify.post('/designations', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      title: z.string().trim().min(1).max(200),
      department_id: z.string().uuid().optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_designations').values({
        tenant_id: user.tenant_id,
        title: body.title,
        department_id: body.department_id || null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/designations/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({
      title: z.string().trim().min(1).max(200).optional(),
      department_id: z.string().uuid().nullable().optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.title         !== undefined) allowed.title         = body.title;
      if (body.department_id !== undefined) allowed.department_id = body.department_id || null;
      return trx.updateTable('hr_designations').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/designations/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_designations')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Shifts ────────────────────────────────────────────────────

  fastify.get('/shifts', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_shifts')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('start_time')
        .execute();
    });
  });

  fastify.post('/shifts', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      name: z.string().trim().min(1).max(100),
      start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'start_time must be HH:MM'),
      end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'end_time must be HH:MM'),
      break_minutes: z.number().int().min(0).optional(),
      color: z.string().max(20).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_shifts').values({
        tenant_id: user.tenant_id,
        name: body.name,
        start_time: body.start_time,
        end_time: body.end_time,
        break_minutes: body.break_minutes ?? 0,
        color: body.color || '#0891b2',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/shifts/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_shifts')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Shift Assignments ─────────────────────────────────────────

  fastify.get('/shift-assignments', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_shift_assignments as sa')
        .innerJoin('users as u', 'u.id', 'sa.user_id')
        .innerJoin('hr_shifts as s', 's.id', 'sa.shift_id')
        .select([
          'sa.id', 'sa.user_id', 'sa.shift_id', 'sa.date',
          'u.name as user_name',
          's.name as shift_name', 's.start_time', 's.end_time', 's.color',
        ])
        .where('sa.tenant_id', '=', user.tenant_id);
      if (q.from) query = query.where('sa.date', '>=', q.from);
      if (q.to)   query = query.where('sa.date', '<=', q.to);
      return query.orderBy('sa.date').execute();
    });
  });

  fastify.post('/shift-assignments', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req, reply) => {
    const user = req.user;
    const body = z.object({
      user_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      shift_id: z.string().uuid().optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      if (body.shift_id) {
        const [target, shift] = await Promise.all([
          trx.selectFrom('users').select('id').where('id', '=', body.user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
          trx.selectFrom('hr_shifts').select('id').where('id', '=', body.shift_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        ]);
        if (!target) return reply.status(404).send({ error: 'Employee not found' });
        if (!shift) return reply.status(404).send({ error: 'Shift not found' });
      }
      await trx.deleteFrom('hr_shift_assignments')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('date', '=', body.date)
        .execute();
      if (body.shift_id) {
        return trx.insertInto('hr_shift_assignments').values({
          tenant_id: user.tenant_id,
          user_id: body.user_id,
          shift_id: body.shift_id,
          date: body.date,
        }).returningAll().executeTakeFirstOrThrow();
      }
      return { ok: true };
    });
  });

  // ── Attendance ────────────────────────────────────────────────

  fastify.get('/attendance', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_attendance as a')
        .innerJoin('users as u', 'u.id', 'a.user_id')
        .select([
          'a.id', 'a.user_id', 'a.date', 'a.status',
          'a.clock_in', 'a.clock_out', 'a.notes', 'a.updated_at',
          'u.name as user_name',
        ])
        .where('a.tenant_id', '=', user.tenant_id);
      if (q.user_id) query = query.where('a.user_id', '=', q.user_id);
      if (q.from)    query = query.where('a.date', '>=', q.from);
      if (q.to)      query = query.where('a.date', '<=', q.to);
      return query.orderBy('a.date', 'desc').execute();
    });
  });

  fastify.post('/attendance', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = z.object({
      user_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE']).optional(),
      clock_in: z.string().optional().nullable(),
      clock_out: z.string().optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(req.body);
    const dateStr: string = body.date;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_attendance')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('date', '=', dateStr)
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('hr_attendance').set({
          status: body.status || existing.status,
          clock_in: body.clock_in ?? existing.clock_in,
          clock_out: body.clock_out ?? existing.clock_out,
          notes: body.notes ?? existing.notes,
          recorded_by: user.sub,
          updated_at: new Date(),
        }).where('id', '=', existing.id)
          .returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('hr_attendance').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id,
        date: dateStr,
        status: body.status || 'PRESENT',
        clock_in: body.clock_in || null,
        clock_out: body.clock_out || null,
        notes: body.notes || null,
        recorded_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.post('/attendance/bulk', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = z.object({
      user_ids: z.array(z.string().uuid()).min(1),
      from_date: z.string(),
      to_date: z.string(),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE']).optional(),
      clock_in: z.string().optional().nullable(),
      clock_out: z.string().optional().nullable(),
    }).parse(req.body);
    const status = body.status ?? 'PRESENT';
    return withTenant(user.tenant_id, async (trx) => {
      const userIds: string[] = body.user_ids;
      const from = new Date(body.from_date);
      const to   = new Date(body.to_date);
      let count = 0;
      for (const uid of userIds) {
        const d = new Date(from);
        while (d <= to) {
          const dateStr = d.toISOString().split('T')[0];
          const existing = await trx.selectFrom('hr_attendance').select('id')
            .where('tenant_id', '=', user.tenant_id)
            .where('user_id', '=', uid).where('date', '=', dateStr)
            .executeTakeFirst();
          if (existing) {
            await trx.updateTable('hr_attendance').set({
              status, clock_in: body.clock_in || null,
              clock_out: body.clock_out || null, recorded_by: user.sub, updated_at: new Date(),
            }).where('id', '=', existing.id).execute();
          } else {
            await trx.insertInto('hr_attendance').values({
              tenant_id: user.tenant_id, user_id: uid, date: dateStr,
              status, clock_in: body.clock_in || null,
              clock_out: body.clock_out || null, recorded_by: user.sub,
            }).execute();
          }
          count++;
          d.setDate(d.getDate() + 1);
        }
      }
      return { ok: true, count };
    });
  });

  // Attendance dashboard aggregates over a date range (defaults to last 30 days).
  fastify.get('/attendance/summary', async (req) => {
    const user = req.user;
    const q = req.query as any;
    const to = q.to ? isoDate(q.to) : isoDate(new Date());
    const from = q.from ? isoDate(q.from) : isoDate(new Date(Date.now() - 29 * 86400000));

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_attendance')
        .select(['status', 'worked_minutes'])
        .where('tenant_id', '=', user.tenant_id)
        .where('date', '>=', from)
        .where('date', '<=', to)
        .execute();

      const byStatus: Record<string, number> = {};
      let workedSum = 0, workedCount = 0;
      for (const r of rows) {
        const s = String(r.status || 'UNKNOWN').toUpperCase();
        byStatus[s] = (byStatus[s] || 0) + 1;
        if (r.worked_minutes != null) { workedSum += r.worked_minutes; workedCount++; }
      }
      const total = rows.length;
      const present = (byStatus['PRESENT'] || 0) + (byStatus['LATE'] || 0)
        + (byStatus['HALF_DAY'] || 0) + (byStatus['HALFDAY'] || 0);

      const staff = await trx.selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .where('role', '<>', 'CUSTOMER')
        .executeTakeFirst();

      return {
        from, to,
        total_records: total,
        staff_count: Number(staff?.n || 0),
        by_status: byStatus,
        present_count: byStatus['PRESENT'] || 0,
        absent_count: byStatus['ABSENT'] || 0,
        late_count: byStatus['LATE'] || 0,
        on_leave_count: (byStatus['ON_LEAVE'] || 0) + (byStatus['LEAVE'] || 0),
        // Null, never a number, when there are no records — a rate over zero
        // observations is not 100%, it is no measurement (matches KPIResponse).
        present_rate_pct: total > 0 ? Math.round((present / total) * 100) : null,
        avg_worked_minutes: workedCount > 0 ? Math.round(workedSum / workedCount) : null,
      };
    });
  });

  // ── Clock-in & Weekly Timesheets ───────────────────────────────

  fastify.get('/clock-in/active', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const session = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (!session) {
        return { active: false, session: null, activeBreak: null };
      }

      let activeBreak = null;
      if (session.status === 'ON_BREAK') {
        activeBreak = await trx.selectFrom('hr_clock_breaks')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('session_id', '=', session.id)
          .where('end_at', 'is', null)
          .orderBy('created_at', 'desc')
          .executeTakeFirst();
      }

      return {
        active: true,
        session,
        activeBreak,
      };
    });
  });

  fastify.post('/clock-in/start', async (req, reply) => {
    const user = req.user;
    const body = req.body as any || {};
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .executeTakeFirst();

      if (existing) {
        return reply.status(400).send({ error: 'You are already clocked in' });
      }

      const now = new Date();
      const dateStr = isoDate(now);
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const session = await trx.insertInto('hr_clock_sessions').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        date: dateStr,
        clock_in_at: now,
        project_name: body.project_name || null,
        status: 'ACTIVE',
        total_break_minutes: 0,
      }).returningAll().executeTakeFirstOrThrow();

      await syncAttendanceFromSessions(trx, user.tenant_id, user.sub, dateStr, user.sub);

      // Also open a header time entry so the top-bar check-in widget reflects it.
      await ensureTimeEntryOpen(trx, user.tenant_id, user.sub, now);

      return { ok: true, session };
    });
  });

  fastify.post('/clock-in/break', async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const session = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (!session) {
        return reply.status(400).send({ error: 'No active clock-in session found' });
      }

      const now = new Date();

      if (session.status === 'ACTIVE') {
        await trx.insertInto('hr_clock_breaks').values({
          session_id: session.id,
          tenant_id: user.tenant_id,
          start_at: now,
        }).execute();

        const updated = await trx.updateTable('hr_clock_sessions').set({
          status: 'ON_BREAK',
          updated_at: now,
        }).where('id', '=', session.id).returningAll().executeTakeFirstOrThrow();

        return { ok: true, session: updated, breakStatus: 'ON_BREAK' };
      } else {
        const openBreak = await trx.selectFrom('hr_clock_breaks')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('session_id', '=', session.id)
          .where('end_at', 'is', null)
          .executeTakeFirst();

        let addedMinutes = 0;
        if (openBreak) {
          const breakStart = new Date(openBreak.start_at).getTime();
          addedMinutes = Math.max(1, Math.round((now.getTime() - breakStart) / 60000));
          await trx.updateTable('hr_clock_breaks').set({
            end_at: now,
            duration_minutes: addedMinutes,
          }).where('id', '=', openBreak.id).execute();
        }

        const totalBreak = (session.total_break_minutes || 0) + addedMinutes;

        const updated = await trx.updateTable('hr_clock_sessions').set({
          status: 'ACTIVE',
          total_break_minutes: totalBreak,
          updated_at: now,
        }).where('id', '=', session.id).returningAll().executeTakeFirstOrThrow();

        return { ok: true, session: updated, breakStatus: 'ACTIVE' };
      }
    });
  });

  // Read-only preview of what /clock-in/stop would record right now — the
  // pre-clock-out confirmation dialog's data source (AttendanceStatusBanner
  // and, wherever else a header check-in wraps a clock session, the same
  // confirm step). Mirrors that handler's own worked-minutes and
  // tasks-completed computation exactly, just against `now` instead of a
  // real clock_out_at, and writes nothing.
  fastify.get('/clock-in/preview', async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const session = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();
      if (!session) return reply.status(400).send({ error: 'No active clock-in session found' });

      const now = new Date();
      let totalBreak = session.total_break_minutes || 0;
      if (session.status === 'ON_BREAK') {
        const openBreak = await trx.selectFrom('hr_clock_breaks').select('start_at')
          .where('tenant_id', '=', user.tenant_id).where('session_id', '=', session.id).where('end_at', 'is', null)
          .executeTakeFirst();
        if (openBreak) totalBreak += Math.max(1, Math.round((now.getTime() - new Date(openBreak.start_at).getTime()) / 60000));
      }
      const workedMins = Math.max(0, Math.round((now.getTime() - new Date(session.clock_in_at).getTime()) / 60000) - totalBreak);

      const finishedTasks = await trx.selectFrom('tasks')
        .select(['id', 'title', 'completed_at'])
        .where('tenant_id', '=', user.tenant_id).where('deleted_at', 'is', null).where('completed', '=', true)
        .where('completed_at', '>=', session.clock_in_at).where('completed_at', '<=', now)
        .where((eb: any) => eb.or([eb('user_id', '=', user.sub), eb('assignee_id', '=', user.sub)]))
        .orderBy('completed_at', 'asc')
        .execute();

      return {
        worked_minutes: workedMins,
        clock_in_at: session.clock_in_at,
        tasks_completed_count: finishedTasks.length,
        tasks_completed: finishedTasks.map(t => ({ id: t.id, title: t.title, completed_at: t.completed_at })),
      };
    });
  });

  fastify.post('/clock-in/stop', async (req, reply) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const session = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('status', 'in', ['ACTIVE', 'ON_BREAK'])
        .orderBy('created_at', 'desc')
        .executeTakeFirst();

      if (!session) {
        return reply.status(400).send({ error: 'No active clock-in session found' });
      }

      const now = new Date();
      let totalBreak = session.total_break_minutes || 0;

      if (session.status === 'ON_BREAK') {
        const openBreak = await trx.selectFrom('hr_clock_breaks')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('session_id', '=', session.id)
          .where('end_at', 'is', null)
          .executeTakeFirst();

        if (openBreak) {
          const breakStart = new Date(openBreak.start_at).getTime();
          const duration = Math.max(1, Math.round((now.getTime() - breakStart) / 60000));
          totalBreak += duration;
          await trx.updateTable('hr_clock_breaks').set({
            end_at: now,
            duration_minutes: duration,
          }).where('id', '=', openBreak.id).execute();
        }
      }

      const startMs = new Date(session.clock_in_at).getTime();
      const grossMs = now.getTime() - startMs;
      const workedMins = Math.max(0, Math.round(grossMs / 60000) - totalBreak);

      const completed = await trx.updateTable('hr_clock_sessions').set({
        status: 'COMPLETED',
        clock_out_at: now,
        total_break_minutes: totalBreak,
        worked_minutes: workedMins,
        updated_at: now,
      }).where('id', '=', session.id).returningAll().executeTakeFirstOrThrow();

      const dateStr = session.date;

      // A day can hold several clock-in/out cycles (a real lunch break not
      // taken via the in-session break button, a missed clock-out fixed by
      // clocking in again, simple double-clicks) — hr_attendance used to be
      // set from just *this* session's own clock_out/duration, so completing
      // a second session silently overwrote (not added to) whatever the
      // first one had already recorded, and the admin Attendance dashboard's
      // number stopped tallying with the employee's own real total the
      // moment a day had more than one session. syncAttendanceFromSessions
      // recomputes clock_in (earliest)/clock_out (latest)/worked_minutes
      // (sum) from every session that date, `completed` above included.
      await syncAttendanceFromSessions(trx, user.tenant_id, user.sub, dateStr, user.sub);

      // Close the matching header time entry so the widget flips back to idle.
      await closeOpenTimeEntries(trx, user.tenant_id, user.sub, now);

      // Clock-out summary — real tasks this person actually finished during
      // the session just closed, not an estimate. Owner or assignee, either
      // one, since both mean "this person did the work".
      const finishedTasks = await trx.selectFrom('tasks')
        .select(['id', 'title', 'completed_at'])
        .where('tenant_id', '=', user.tenant_id)
        .where('deleted_at', 'is', null)
        .where('completed', '=', true)
        .where('completed_at', '>=', session.clock_in_at)
        .where('completed_at', '<=', now)
        .where((eb: any) => eb.or([
          eb('user_id', '=', user.sub),
          eb('assignee_id', '=', user.sub),
        ]))
        .orderBy('completed_at', 'asc')
        .execute();

      return {
        ok: true,
        session: completed,
        summary: {
          worked_minutes: workedMins,
          clock_in_at: session.clock_in_at,
          clock_out_at: now,
          tasks_completed_count: finishedTasks.length,
          tasks_completed: finishedTasks.map(t => ({ id: t.id, title: t.title, completed_at: t.completed_at })),
          // Flagged, never blocked or altered — a stray double-click is the
          // person's own record and their own call to fix (a real 90-second
          // errand exists too), so this is a note for the UI, not a rule.
          is_short_shift: workedMins < MIN_SHIFT_MINUTES,
        },
      };
    });
  });

  fastify.get('/clock-in/weekly', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;

    const targetUserId = q.user_id || user.sub;
    // A user may always read their own timesheet; reading a colleague's
    // requires a manager/HR role. Without this any employee could pull any
    // other user's sessions, breaks and attendance simply by passing ?user_id=.
    if (targetUserId !== user.sub &&
        !['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR'].includes(user.role)) {
      return reply.status(403).send({ error: 'You can only view your own timesheet' });
    }
    const toDate = q.to ? new Date(q.to) : new Date();
    const fromDate = q.from ? new Date(q.from) : new Date(toDate.getTime() - 6 * 86400000);

    const fromIso = isoDate(fromDate);
    const toIso = isoDate(toDate);

    return withTenant(user.tenant_id, async (trx) => {
      const userObj = await trx.selectFrom('users')
        .select(['id', 'name', 'email', 'role', 'avatar_url'])
        .where('id', '=', targetUserId)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();

      const sessions = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId)
        .where('date', '>=', fromIso)
        .where('date', '<=', toIso)
        .orderBy('date', 'desc')
        .execute();

      const sessionIds = sessions.map(s => s.id);
      let breaks: any[] = [];
      if (sessionIds.length > 0) {
        breaks = await trx.selectFrom('hr_clock_breaks')
          .selectAll()
          .where('tenant_id', '=', user.tenant_id)
          .where('session_id', 'in', sessionIds)
          .execute();
      }

      const attendance = await trx.selectFrom('hr_attendance')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId)
        .where('date', '>=', fromIso)
        .where('date', '<=', toIso)
        .execute();

      let workedMinutesTotal = 0;
      sessions.forEach(s => {
        workedMinutesTotal += (s.worked_minutes || 0);
      });

      return {
        user: userObj || { id: targetUserId, name: user.name || 'Employee' },
        fromDate: fromIso,
        toDate: toIso,
        plannedHours: 40,
        plannedDays: 5,
        workedMinutesTotal,
        sessions,
        breaks,
        attendance,
      };
    });
  });

  fastify.post('/clock-in/manual', async (req, reply) => {
    const user = req.user;
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      clock_in: z.string().regex(/^\d{1,2}:\d{2}$/, 'clock_in must be HH:MM'),
      clock_out: z.string().regex(/^\d{1,2}:\d{2}$/, 'clock_out must be HH:MM'),
      user_id: z.string().uuid().optional(),
      break_minutes: z.number().min(0).optional(),
      project_name: z.string().max(200).optional(),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE']).optional(),
    }).parse(req.body);

    const targetUserId = body.user_id || user.sub;
    // Same guard as /weekly: a user records their own time freely, but only a
    // manager/HR role may enter time on another user's behalf — otherwise any
    // employee could forge a colleague's attendance by passing user_id.
    if (targetUserId !== user.sub &&
        !['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR'].includes(user.role)) {
      return reply.status(403).send({ error: 'You can only record your own time' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      if (targetUserId !== user.sub) {
        const target = await trx.selectFrom('users').select('id').where('id', '=', targetUserId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!target) return reply.status(404).send({ error: 'Employee not found' });
      }
      const dateStr = body.date;

      const inParts = body.clock_in.split(':');
      const outParts = body.clock_out.split(':');

      // No trailing 'Z': a manual "09:00" is the wall-clock time the user typed,
      // so it must be read in the SAME zone the live clock path uses (start/stop
      // store `new Date()` and derive their HH:mm from now.getHours(), i.e.
      // server-local). A 'Z' here forced UTC, so a manual entry and a live one
      // for the same wall time landed at different instants — the entry drifted
      // by the server's offset on display. A bare date-time is parsed as local.
      const clockInAt = new Date(`${dateStr}T${inParts[0].padStart(2, '0')}:${inParts[1].padStart(2, '0')}:00`);
      const clockOutAt = new Date(`${dateStr}T${outParts[0].padStart(2, '0')}:${outParts[1].padStart(2, '0')}:00`);

      const grossMins = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000));
      const breakMins = Number(body.break_minutes) || 0;
      const workedMins = Math.max(0, grossMins - breakMins);

      const session = await trx.insertInto('hr_clock_sessions').values({
        tenant_id: user.tenant_id,
        user_id: targetUserId,
        date: dateStr,
        clock_in_at: clockInAt,
        clock_out_at: clockOutAt,
        project_name: body.project_name || 'Manual Entry',
        status: 'COMPLETED',
        total_break_minutes: breakMins,
        worked_minutes: workedMins,
        source: 'MANUAL',
      }).returningAll().executeTakeFirstOrThrow();

      // Same fix as /clock-in/stop: a day can already hold a real clocked
      // session (or an earlier manual entry) before this one is added, so
      // hr_attendance has to be recomputed from every session that date —
      // clock_in earliest, clock_out latest, worked_minutes summed — not
      // just overwritten with this one entry's own values, or adding a
      // second entry silently erases the first one from the admin's view.
      await syncAttendanceFromSessions(trx, user.tenant_id, targetUserId, dateStr, user.sub, body.status || 'PRESENT');

      return { ok: true, session };
    });
  });

  // ── Timesheet submission & manager approval ───────────────────

  // An employee submits a week (or any date range) for review. Worked minutes
  // are snapshotted now so a later session edit can't change what was approved.
  fastify.post('/clock-in/timesheet/submit', async (req, reply) => {
    const user = req.user;
    const body = z.object({
      period_start: z.string(),
      period_end: z.string(),
      user_id: z.string().uuid().optional(),
    }).parse(req.body);
    const targetUserId = body.user_id || user.sub;
    if (targetUserId !== user.sub && !TS_MANAGER_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'You can only submit your own timesheet' });
    }
    const periodStart = isoDate(body.period_start);
    const periodEnd = isoDate(body.period_end);

    return withTenant(user.tenant_id, async (trx) => {
      const sessions = await trx.selectFrom('hr_clock_sessions')
        .select(['worked_minutes'])
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId)
        .where('date', '>=', periodStart)
        .where('date', '<=', periodEnd)
        .where('status', '=', 'COMPLETED')
        .execute();
      const totalWorked = sessions.reduce((s, r) => s + (r.worked_minutes || 0), 0);

      const existing = await trx.selectFrom('hr_timesheet_approvals')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId)
        .where('period_start', '=', periodStart)
        .executeTakeFirst();

      if (existing && existing.status === 'APPROVED') {
        return reply.status(409).send({ error: 'This period is already approved and cannot be resubmitted.' });
      }

      if (existing) {
        const updated = await trx.updateTable('hr_timesheet_approvals').set({
          period_end: periodEnd,
          status: 'SUBMITTED',
          total_worked_minutes: totalWorked,
          session_count: sessions.length,
          submitted_at: new Date(),
          reviewed_by: null,
          reviewed_at: null,
          note: null,
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
        return { ok: true, approval: updated };
      }

      const created = await trx.insertInto('hr_timesheet_approvals').values({
        tenant_id: user.tenant_id,
        user_id: targetUserId,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'SUBMITTED',
        total_worked_minutes: totalWorked,
        session_count: sessions.length,
      }).returningAll().executeTakeFirstOrThrow();
      return { ok: true, approval: created };
    });
  });

  // Current status for a user's period (for the badge on the timesheet page).
  fastify.get('/clock-in/timesheet/status', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const targetUserId = q.user_id || user.sub;
    if (targetUserId !== user.sub && !TS_MANAGER_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'You can only view your own timesheet status' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_timesheet_approvals')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId);
      if (q.period_start) query = query.where('period_start', '=', isoDate(q.period_start));
      const row = await query.orderBy('period_start', 'desc').executeTakeFirst();
      return { approval: row || null };
    });
  });

  // Manager queue: every submission for the tenant, newest first.
  fastify.get('/clock-in/timesheet/approvals',
    { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') },
    async (req) => {
      const user = req.user;
      const q = req.query as any;
      return withTenant(user.tenant_id, async (trx) => {
        let query = trx.selectFrom('hr_timesheet_approvals as a')
          .innerJoin('users as u', 'u.id', 'a.user_id')
          .leftJoin('users as r', 'r.id', 'a.reviewed_by')
          .select([
            'a.id', 'a.user_id', 'a.period_start', 'a.period_end', 'a.status',
            'a.total_worked_minutes', 'a.session_count', 'a.submitted_at',
            'a.reviewed_at', 'a.note',
            'u.name as employee_name', 'u.avatar_url as employee_avatar',
            'r.name as reviewed_by_name',
          ])
          .where('a.tenant_id', '=', user.tenant_id);
        if (q.status) query = query.where('a.status', '=', q.status);
        return query.orderBy('a.submitted_at', 'desc').limit(200).execute();
      });
    });

  // Approve or reject a submission.
  fastify.patch('/clock-in/timesheet/approvals/:id',
    { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') },
    async (req, reply) => {
      const user = req.user;
      const { id } = req.params as any;
      const body = z.object({
        action: z.enum(['approve', 'reject']),
        note: z.string().max(2000).optional(),
      }).parse(req.body);
      const action = body.action;
      return withTenant(user.tenant_id, async (trx) => {
        const row = await trx.selectFrom('hr_timesheet_approvals').selectAll()
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (!row) return reply.status(404).send({ error: 'Submission not found' });

        // A manager cannot rubber-stamp their own timesheet.
        if (row.user_id === user.sub) {
          return reply.status(403).send({ error: 'You cannot review your own timesheet.' });
        }

        const updated = await trx.updateTable('hr_timesheet_approvals').set({
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          reviewed_by: user.sub,
          reviewed_at: new Date(),
          note: body.note || null,
          updated_at: new Date(),
        }).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
          .returningAll().executeTakeFirstOrThrow();
        return { ok: true, approval: updated };
      });
    });

  // CSV export of a user's clocked sessions over a range (own, or a manager's).
  fastify.get('/clock-in/timesheet/export', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const targetUserId = q.user_id || user.sub;
    if (targetUserId !== user.sub && !TS_MANAGER_ROLES.includes(user.role)) {
      return reply.status(403).send({ error: 'You can only export your own timesheet' });
    }
    const toDate = q.to ? new Date(q.to) : new Date();
    const fromDate = q.from ? new Date(q.from) : new Date(toDate.getTime() - 6 * 86400000);
    const fromIso = isoDate(fromDate);
    const toIso = isoDate(toDate);

    return withTenant(user.tenant_id, async (trx) => {
      const sessions = await trx.selectFrom('hr_clock_sessions')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', targetUserId)
        .where('date', '>=', fromIso)
        .where('date', '<=', toIso)
        .orderBy('date', 'asc')
        .orderBy('clock_in_at', 'asc')
        .execute();

      const header = ['Date', 'Clock in', 'Clock out', 'Break (min)', 'Worked (min)', 'Worked (h)', 'Project', 'Status'];
      const lines = [header.map(csvCell).join(',')];
      for (const s of sessions) {
        lines.push([
          isoDate(s.date),
          s.clock_in_at ? hhmm(new Date(s.clock_in_at)) : '',
          s.clock_out_at ? hhmm(new Date(s.clock_out_at)) : '',
          s.total_break_minutes ?? 0,
          s.worked_minutes ?? '',
          s.worked_minutes != null ? (s.worked_minutes / 60).toFixed(2) : '',
          s.project_name ?? '',
          s.status,
        ].map(csvCell).join(','));
      }
      const totalWorked = sessions.reduce((sum, s) => sum + (s.worked_minutes || 0), 0);
      lines.push(['Total', '', '', '', totalWorked, (totalWorked / 60).toFixed(2), '', ''].map(csvCell).join(','));

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="timesheet_${fromIso}_${toIso}.csv"`);
      return lines.join('\n');
    });
  });

  // ── Leaves ────────────────────────────────────────────────────

  fastify.get('/leaves', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_leaves as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .leftJoin('users as a', 'a.id', 'l.approved_by')
        // Left, not inner: rows created before the entitlement ledger have no
        // leave_type_id, and an inner join would silently hide every one of them.
        .leftJoin('hr_leave_types as t', 't.id', 'l.leave_type_id')
        .select([
          'l.id', 'l.user_id', 'l.type', 'l.from_date', 'l.to_date',
          'l.days', 'l.reason', 'l.status', 'l.approved_at', 'l.created_at',
          'l.full_pay_days', 'l.reduced_pay_days',
          'u.name as employee_name',
          'a.name as approved_by_name',
          // The code the balance is keyed on. `type` is free text and cannot
          // be matched to an entitlement.
          't.code as type_code',
          't.name as type_name',
        ])
        .where('l.tenant_id', '=', user.tenant_id);
      if (q.status)  query = query.where('l.status', '=', q.status);
      if (q.user_id) query = query.where('l.user_id', '=', q.user_id);
      return query.orderBy('l.created_at', 'desc').execute();
    });
  });

  // At-a-glance leave figures for the LeavesPage header (defaults to this year).
  fastify.get('/leaves/summary', async (req) => {
    const user = req.user;
    const q = req.query as any;
    const year = Number(q.year) || new Date().getFullYear();
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const today = isoDate(new Date());

    return withTenant(user.tenant_id, async (trx) => {
      // Pending is the approver's queue — counted across all time, not the year.
      const pending = await trx.selectFrom('hr_leaves')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'PENDING')
        .executeTakeFirst();

      // Approved leaves overlapping this year → count + days taken.
      const approved = await trx.selectFrom('hr_leaves')
        .select(['days'])
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'APPROVED')
        .where('from_date', '<=', to)
        .where('to_date', '>=', from)
        .execute();
      const daysTaken = approved.reduce((s, r) => s + Number(r.days || 0), 0);

      // Distinct people whose approved leave covers today.
      const onLeave = await trx.selectFrom('hr_leaves')
        .select('user_id')
        .distinct()
        .where('tenant_id', '=', user.tenant_id)
        .where('status', '=', 'APPROVED')
        .where('from_date', '<=', today)
        .where('to_date', '>=', today)
        .execute();

      return {
        year,
        pending_count: Number(pending?.n || 0),
        approved_count: approved.length,
        on_leave_today: onLeave.length,
        days_taken_ytd: daysTaken,
      };
    });
  });

  fastify.post('/leaves', async (req, reply) => {
    const user = req.user;
    // hr_leaves.type is NOT NULL — previously unvalidated, an omitted type
    // would have failed with a raw DB constraint error instead of a clean 400.
    const body = z.object({
      from_date: z.string(),
      to_date: z.string(),
      user_id: z.string().uuid().optional(),
      leave_type_id: z.string().uuid().optional(),
      type: z.string().trim().min(1).max(50),
      reason: z.string().max(2000).optional(),
    }).parse(req.body);
    const from = isoDate(body.from_date), to = isoDate(body.to_date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return reply.status(400).send({ error: 'from_date and to_date are required, as YYYY-MM-DD' });
    }
    if (to < from) return reply.status(400).send({ error: 'The end of the leave cannot be before its start' });

    // The day count is computed here rather than taken from the request.
    // It used to be whatever the client sent, so a request spanning Easter
    // consumed five days of somebody's entitlement when two were public
    // holidays and one was a Sunday. The employee pays for that arithmetic,
    // so the server does it.
    const closed = await HolidaysService.nonWorkingDates(user.tenant_id, from, to);
    const { days, excluded } = workingDaysBetween(from, to, closed);

    if (days === 0) {
      return reply.status(400).send({
        error: 'That range contains no working days — nothing would be deducted.',
        excluded,
      });
    }

    const subjectId = body.user_id || user.sub;

    // Resolve the leave type, and refuse if there is not enough left.
    //
    // This is the whole point of the entitlement ledger. Until now an approver
    // was deciding on an unknown quantity of an unknown allowance, and nothing
    // stopped a person taking forty days of a twenty-eight day entitlement.
    // Checked before the insert, because a request written and then rejected
    // would still be sitting in the table.
    let leaveTypeId: string | null = null;
    let payDays: { full: number; reduced: number } | null = null;

    const type = await withTenant(user.tenant_id, trx => body.leave_type_id
      ? trx.selectFrom('hr_leave_types').selectAll()
          .where('id', '=', String(body.leave_type_id)).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
      : trx.selectFrom('hr_leave_types').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('code', '=', String(body.type ?? '').toUpperCase())
          .executeTakeFirst());

    if (type) {
      leaveTypeId = type.id;
      const check = await checkLeaveRequest(user.tenant_id, subjectId, type.id, days);
      if (!check.ok) {
        return reply.status(409).send({
          error: check.reason,
          balance: check.balance,
          requested_days: days,
          excluded_days: excluded,
        });
      }
      // Sick leave is not paid at one rate. Split now, so payroll pays what is
      // owed rather than treating every approved day as a full day's wage.
      payDays = splitPayDays(days, check.balance?.taken ?? 0,
        type.full_pay_days === null || type.full_pay_days === undefined ? null : Number(type.full_pay_days));
    }

    const created = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('hr_leaves').values({
        tenant_id: user.tenant_id,
        user_id: subjectId,
        type: body.type,
        leave_type_id: leaveTypeId,
        from_date: from,
        to_date: to,
        days,
        full_pay_days: payDays ? String(payDays.full) : null,
        reduced_pay_days: payDays ? String(payDays.reduced) : null,
        reason: body.reason || null,
      }).returningAll().executeTakeFirstOrThrow();

      // Until now NexusHR emitted nothing, so no other app could react to
      // anything that happened in HR. Operations needs to know a clearing
      // officer will be away before it assigns them next week's consignments.
      await emitDomainEvent(trx, user.tenant_id, {
        type: 'hr.leave_requested', sourceApp: 'nexushr', entityType: 'leave', entityId: row.id,
        payload: { userId: row.user_id, leaveType: row.type, fromDate: isoDate(row.from_date),
                   toDate: isoDate(row.to_date), days: Number(row.days) },
      }).catch(err => console.error('[HR] leave_requested emit failed:', err?.message));

      // The days that were not counted, and why. A request for "20th to 24th"
      // coming back as 3 days needs to say which two were free, or it reads as
      // a mistake.
      return { ...row, excluded_days: excluded };
    });

    // Computed after the transaction commits, not inside it. computeBalances
    // reads through `db` rather than the open transaction, so calling it from
    // within withTenant returned the balance as it was *before* this request
    // was inserted — the new days were invisible and the figure looked
    // unchanged. Caught by asserting the pending total moved.
    const balanceAfter = leaveTypeId
      ? (await computeLeaveBalances(user.tenant_id, subjectId)).find(b => b.leave_type_id === leaveTypeId)
      : undefined;
    return { ...created, balance_after: balanceAfter };
  });

  fastify.patch('/leaves/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_leaves').set({
        status: body.status,
        approved_by: body.status === 'APPROVED' ? user.sub : null,
        approved_at: body.status === 'APPROVED' ? new Date() : null,
        updated_at: new Date(),
      }).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      await logActivity(trx, user.tenant_id, user.sub, `${body.status === 'APPROVED' ? 'Approved' : body.status === 'REJECTED' ? 'Rejected' : 'Updated'} leave request (${updated.type})`);

      // Only the settled outcomes are events; an intermediate status change is
      // not something another app should act on.
      //
      // Two explicit calls rather than one with a ternary type: scripts/
      // check-triggers.ts reads the literal `type:` out of each emit block to
      // prove every registered trigger has a real emitter, and a computed type
      // is invisible to it. Keeping the literal visible keeps the guard honest.
      // The payload is written out in full at each call rather than shared via
      // a variable, because the same check also reads the payload KEYS from the
      // block to prove Studio's field picker won't offer a field that is always
      // empty. A variable reference hides them.
      const fromDate = isoDate(updated.from_date);
      const toDate = isoDate(updated.to_date);
      if (body.status === 'APPROVED') {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.leave_approved', sourceApp: 'nexushr', entityType: 'leave', entityId: updated.id,
          payload: {
            userId: updated.user_id, leaveType: updated.type, fromDate, toDate,
            days: Number(updated.days), decidedBy: user.sub,
          },
        }).catch(err => console.error('[HR] leave_approved emit failed:', err?.message));
      } else if (body.status === 'REJECTED') {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.leave_rejected', sourceApp: 'nexushr', entityType: 'leave', entityId: updated.id,
          payload: {
            userId: updated.user_id, leaveType: updated.type, fromDate, toDate,
            days: Number(updated.days), decidedBy: user.sub,
          },
        }).catch(err => console.error('[HR] leave_rejected emit failed:', err?.message));
      }
      return updated;
    });
  });

  // ── Payroll ───────────────────────────────────────────────────

  fastify.get('/payroll', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_payroll as p')
        .innerJoin('users as u', 'u.id', 'p.user_id')
        .select([
          'p.id', 'p.user_id', 'p.period_month', 'p.period_year',
          'p.basic_pay', 'p.allowances', 'p.deductions', 'p.status',
          'p.paid_at', 'p.notes', 'p.created_at',
          'u.name as employee_name',
        ])
        .where('p.tenant_id', '=', user.tenant_id);
      if (q.month) query = query.where('p.period_month', '=', Number(q.month));
      if (q.year)  query = query.where('p.period_year',  '=', Number(q.year));
      return query.orderBy('u.name').execute();
    });
  });

  fastify.post('/payroll', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    // user_id previously wasn't checked against this tenant at all — a
    // payroll row could be created against any user_id, including one in a
    // different tenant (hr_payroll.user_id has no CHECK tying it to
    // tenant_id, only a bare FK to users(id)).
    const body = z.object({
      user_id: z.string().uuid(),
      period_month: z.number().int().min(1).max(12),
      period_year: z.number().int().min(2000).max(2200),
      basic_pay: z.number().min(0),
      allowances: z.number().min(0).optional(),
      deductions: z.number().min(0).optional(),
      status: z.enum(['PENDING', 'PROCESSING', 'PAID']).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const target = await trx.selectFrom('users').select('id')
        .where('id', '=', body.user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'Employee not found' });

      const existing = await trx.selectFrom('hr_payroll').select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('period_month', '=', body.period_month)
        .where('period_year',  '=', body.period_year)
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('hr_payroll').set({
          basic_pay: body.basic_pay,
          allowances: body.allowances ?? 0,
          deductions: body.deductions ?? 0,
          status: body.status ?? 'PENDING',
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('hr_payroll').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id,
        period_month: body.period_month,
        period_year:  body.period_year,
        basic_pay:    body.basic_pay,
        allowances:   body.allowances ?? 0,
        deductions:   body.deductions ?? 0,
        status: body.status ?? 'PENDING',
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/payroll/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({
      status: z.enum(['PENDING', 'PROCESSING', 'PAID']).optional(),
      basic_pay: z.number().min(0).optional(),
      allowances: z.number().min(0).optional(),
      deductions: z.number().min(0).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const upd: Record<string, any> = { updated_at: new Date() };
      if (body.status !== undefined) {
        upd.status = body.status;
        if (body.status === 'PAID') upd.paid_at = new Date();
      }
      if (body.basic_pay  !== undefined) upd.basic_pay  = body.basic_pay;
      if (body.allowances !== undefined) upd.allowances = body.allowances;
      if (body.deductions !== undefined) upd.deductions = body.deductions;
      const updated = await trx.updateTable('hr_payroll').set(upd)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      if (body.status !== undefined) await logActivity(trx, user.tenant_id, user.sub, `Marked payroll ${body.status.toLowerCase()} for ${updated.period_month}/${updated.period_year}`);
      return updated;
    });
  });

  // ── Recruitment: job openings & candidate pipeline ────────────

  // GET /recruitment/interviews/upcoming — every scheduled interview across
  // every opening, for the dashboard's "Upcoming Interviews" widget. The
  // existing /openings/:id/candidates route only ever returns one opening's
  // slice; this is the flat, tenant-wide view nothing else needed until now.
  fastify.get('/recruitment/interviews/upcoming', async (req) => {
    const user = req.user;
    const limit = Math.min(Number((req.query as any)?.limit) || 6, 20);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_interviews as i')
        .innerJoin('hr_candidates as c', 'c.id', 'i.candidate_id')
        .leftJoin('users as u', 'u.id', 'i.interviewer_id')
        .select([
          'i.id', 'i.scheduled_at', 'i.mode', 'i.status',
          'c.id as candidate_id', 'c.name as candidate_name',
          'u.name as interviewer_name',
        ])
        .where('i.tenant_id', '=', user.tenant_id)
        .where('i.status', '=', 'SCHEDULED')
        .where('i.scheduled_at', '>=', new Date())
        .orderBy('i.scheduled_at', 'asc')
        .limit(limit)
        .execute();
    });
  });

  fastify.get('/recruitment/openings', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const openings = await trx.selectFrom('hr_job_openings as o')
        .leftJoin('users as c', 'c.id', 'o.created_by')
        .select(['o.id', 'o.title', 'o.department', 'o.location', 'o.employment_type',
                 'o.status', 'o.description', 'o.openings_count', 'o.created_at',
                 'c.name as created_by_name'])
        .where('o.tenant_id', '=', user.tenant_id)
        .orderBy('o.created_at', 'desc')
        .execute();

      // Candidate counts per opening so the list can show a pipeline size
      // without a second round-trip per row.
      const counts = await trx.selectFrom('hr_candidates')
        .select(['job_opening_id', (eb) => eb.fn.countAll<number>().as('n')])
        .where('tenant_id', '=', user.tenant_id)
        .groupBy('job_opening_id')
        .execute();
      const byOpening = new Map(counts.map(r => [r.job_opening_id, Number(r.n)]));
      return openings.map(o => ({ ...o, candidate_count: byOpening.get(o.id) ?? 0 }));
    });
  });

  fastify.post('/recruitment/openings', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const b = (req.body as any) || {};
    if (!b.title || !String(b.title).trim()) return reply.status(400).send({ error: 'title is required' });
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_job_openings').values({
        tenant_id: user.tenant_id,
        title: String(b.title).trim(),
        department: b.department || null,
        location: b.location || null,
        employment_type: b.employment_type || 'FULL_TIME',
        status: b.status || 'OPEN',
        description: b.description || null,
        openings_count: Number(b.openings_count) > 0 ? Number(b.openings_count) : 1,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/recruitment/openings/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.title !== undefined) { if (!String(b.title).trim()) return reply.status(400).send({ error: 'title cannot be empty' }); patch.title = String(b.title).trim(); }
    for (const k of ['department', 'location', 'employment_type', 'status', 'description'] as const) {
      if (b[k] !== undefined) patch[k] = b[k] || null;
    }
    if (b.openings_count !== undefined) patch.openings_count = Number(b.openings_count) > 0 ? Number(b.openings_count) : 1;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_job_openings').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Job opening not found' });
      return updated;
    });
  });

  fastify.get('/recruitment/openings/:id/candidates', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const candidates = await trx.selectFrom('hr_candidates')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('job_opening_id', '=', id)
        .orderBy('created_at', 'desc')
        .execute();

      const ids = candidates.map(c => c.id);
      let interviews: any[] = [];
      if (ids.length) {
        interviews = await trx.selectFrom('hr_interviews as i')
          .leftJoin('users as u', 'u.id', 'i.interviewer_id')
          .select(['i.id', 'i.candidate_id', 'i.scheduled_at', 'i.mode', 'i.status', 'i.notes', 'i.interviewer_id', 'u.name as interviewer_name'])
          .where('i.tenant_id', '=', user.tenant_id)
          .where('i.candidate_id', 'in', ids)
          .orderBy('i.scheduled_at', 'asc')
          .execute();
      }
      const byCand = new Map<string, any[]>();
      for (const iv of interviews) { if (!byCand.has(iv.candidate_id)) byCand.set(iv.candidate_id, []); byCand.get(iv.candidate_id)!.push(iv); }
      const now = Date.now();
      return candidates.map(c => {
        const list = byCand.get(c.id) || [];
        const upcoming = list.filter(x => x.status === 'SCHEDULED' && new Date(x.scheduled_at).getTime() >= now);
        return { ...c, interviews: list, next_interview: upcoming[0] || list.find(x => x.status === 'SCHEDULED') || null };
      });
    });
  });

  fastify.post('/recruitment/candidates', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const b = (req.body as any) || {};
    if (!b.job_opening_id) return reply.status(400).send({ error: 'job_opening_id is required' });
    if (!b.name || !String(b.name).trim()) return reply.status(400).send({ error: 'name is required' });
    return withTenant(user.tenant_id, async (trx) => {
      // Confirm the opening belongs to this tenant before attaching a candidate.
      const opening = await trx.selectFrom('hr_job_openings').select('id')
        .where('id', '=', b.job_opening_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!opening) return reply.status(404).send({ error: 'Job opening not found' });
      return trx.insertInto('hr_candidates').values({
        tenant_id: user.tenant_id,
        job_opening_id: b.job_opening_id,
        name: String(b.name).trim(),
        email: b.email || null,
        phone: b.phone || null,
        stage: b.stage || 'APPLIED',
        rating: b.rating != null ? Number(b.rating) : null,
        source: b.source || null,
        notes: b.notes || null,
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/recruitment/candidates/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const VALID_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.stage !== undefined) {
      if (!VALID_STAGES.includes(b.stage)) return reply.status(400).send({ error: 'invalid stage' });
      patch.stage = b.stage;
    }
    if (b.rating !== undefined) {
      const r = Number(b.rating);
      if (b.rating !== null && (!Number.isFinite(r) || r < 0 || r > 5)) return reply.status(400).send({ error: 'rating must be 0–5' });
      patch.rating = b.rating === null ? null : r;
    }
    for (const k of ['name', 'email', 'phone', 'source', 'notes'] as const) {
      if (b[k] !== undefined) patch[k] = b[k] || null;
    }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_candidates').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Candidate not found' });
      return updated;
    });
  });

  // Schedule an interview for a candidate.
  fastify.post('/recruitment/candidates/:id/interviews', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    if (!b.scheduled_at || Number.isNaN(new Date(b.scheduled_at).getTime())) return reply.status(400).send({ error: 'a valid scheduled_at is required' });
    return withTenant(user.tenant_id, async (trx) => {
      const cand = await trx.selectFrom('hr_candidates').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!cand) return reply.status(404).send({ error: 'Candidate not found' });
      if (b.interviewer_id) {
        const iv = await trx.selectFrom('users').select('id').where('id', '=', b.interviewer_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!iv) return reply.status(404).send({ error: 'Interviewer not found' });
      }
      return trx.insertInto('hr_interviews').values({
        tenant_id: user.tenant_id, candidate_id: id,
        interviewer_id: b.interviewer_id || null,
        scheduled_at: new Date(b.scheduled_at),
        mode: ['PHONE', 'VIDEO', 'ONSITE'].includes(b.mode) ? b.mode : 'VIDEO',
        status: 'SCHEDULED', notes: b.notes || null, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  // Update an interview (reschedule, complete, cancel, note).
  fastify.patch('/recruitment/interviews/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const b = (req.body as any) || {};
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (b.status !== undefined) {
      if (!['SCHEDULED', 'COMPLETED', 'CANCELLED'].includes(b.status)) return reply.status(400).send({ error: 'invalid status' });
      patch.status = b.status;
    }
    if (b.scheduled_at !== undefined) {
      if (Number.isNaN(new Date(b.scheduled_at).getTime())) return reply.status(400).send({ error: 'invalid scheduled_at' });
      patch.scheduled_at = new Date(b.scheduled_at);
    }
    if (b.mode !== undefined && ['PHONE', 'VIDEO', 'ONSITE'].includes(b.mode)) patch.mode = b.mode;
    if (b.notes !== undefined) patch.notes = b.notes || null;
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('hr_interviews').set(patch as any)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Interview not found' });
      return updated;
    });
  });

  // ── AI insights (HR) ──────────────────────────────────────────
  // A narrative digest over REAL, computed HR figures. The model is told to use
  // only the numbers given and never invent — same contract as /v1/ai/insights.
  fastify.get('/ai-insights', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;

    const settings = await withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      return (row?.settings as any) ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings › Integrations › AI Integration.' });
    }

    const todayStr = isoDate(new Date());
    const from30 = isoDate(new Date(Date.now() - 29 * 86400000));
    const year = new Date().getFullYear();

    const signals = await withTenant(user.tenant_id, async (trx) => {
      const staff = await trx.selectFrom('users').select(['role', 'active'])
        .where('tenant_id', '=', user.tenant_id).where('role', '<>', 'CUSTOMER').execute();
      const byRole: Record<string, number> = {};
      staff.forEach(s => { byRole[s.role] = (byRole[s.role] || 0) + 1; });

      const att = await trx.selectFrom('hr_attendance').select(['status', 'worked_minutes'])
        .where('tenant_id', '=', user.tenant_id).where('date', '>=', from30).where('date', '<=', todayStr).execute();
      const attByStatus: Record<string, number> = {};
      let workedSum = 0, workedN = 0;
      att.forEach(a => { const s = String(a.status).toUpperCase(); attByStatus[s] = (attByStatus[s] || 0) + 1; if (a.worked_minutes != null) { workedSum += a.worked_minutes; workedN++; } });
      const present = (attByStatus['PRESENT'] || 0) + (attByStatus['LATE'] || 0);

      const pendingLeave = await trx.selectFrom('hr_leaves').select((eb) => eb.fn.countAll<number>().as('n'))
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING').executeTakeFirst();
      const onLeaveToday = await trx.selectFrom('hr_leaves').select('user_id').distinct()
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'APPROVED')
        .where('from_date', '<=', todayStr).where('to_date', '>=', todayStr).execute();
      const approvedYtd = await trx.selectFrom('hr_leaves').select(['days'])
        .where('tenant_id', '=', user.tenant_id).where('status', '=', 'APPROVED')
        .where('from_date', '<=', `${year}-12-31`).where('to_date', '>=', `${year}-01-01`).execute();
      const daysTakenYtd = approvedYtd.reduce((s, r) => s + Number(r.days || 0), 0);

      const run = await trx.selectFrom('payroll_runs')
        .select(['name', 'status', 'total_net', 'total_remitted', 'total_employer_cost'])
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('period_year', 'desc').orderBy('period_month', 'desc').executeTakeFirst();

      return {
        headcount: { active: staff.filter(s => s.active).length, total: staff.length, by_role: byRole },
        attendance_last_30_days: { records: att.length, by_status: attByStatus, present_rate_pct: att.length > 0 ? Math.round((present / att.length) * 100) : null, avg_worked_minutes: workedN > 0 ? Math.round(workedSum / workedN) : null },
        leave: { pending_requests: Number(pendingLeave?.n || 0), on_leave_today: onLeaveToday.length, days_taken_ytd: daysTakenYtd },
        latest_payroll_run: run ? { name: run.name, status: run.status, net_to_employees: Number(run.total_net || 0), remitted_to_authorities: Number(run.total_remitted || 0), employer_cost: Number(run.total_employer_cost || 0) } : null,
      };
    });

    try {
      const digest = await callAI(
        aiCfg.apiKey,
        aiCfg.model || 'claude-sonnet-4-6',
        aiCfg.provider || 'anthropic',
        [{
          role: 'user',
          content: `You are an HR analyst for a logistics company. Given this real, computed HR data (JSON below), write a short digest (3-5 bullet points, plain text with "- " prefixes, no markdown headers) covering workforce, attendance, leave and payroll — what an HR manager should notice this month. Use only the numbers provided; never invent figures, names, or trends the data does not contain. If a section is empty or null, skip it rather than noting its absence.\n\n${JSON.stringify(signals, null, 2)}`,
        }],
        512, 0.3,
      );
      return { digest, signals };
    } catch (e: any) {
      return reply.status(500).send({ error: e?.message || 'AI request failed' });
    }
  });

  // ── Announcements ─────────────────────────────────────────────

  fastify.get('/announcements', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_announcements as a')
        .leftJoin('users as u', 'u.id', 'a.author_id')
        .select([
          'a.id', 'a.title', 'a.body', 'a.category', 'a.audience',
          'a.created_at', 'a.updated_at',
          'u.name as author_name',
        ])
        .where('a.tenant_id', '=', user.tenant_id)
        .orderBy('a.created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/announcements', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      title: z.string().trim().min(1).max(300),
      body: z.string().trim().min(1).max(10_000),
      category: z.string().max(50).optional(),
      audience: z.string().max(50).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_announcements').values({
        tenant_id: user.tenant_id,
        title: body.title,
        body: body.body,
        category: body.category || 'General',
        audience: body.audience || 'All Staff',
        author_id: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/announcements/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({
      title: z.string().trim().min(1).max(300).optional(),
      body: z.string().trim().min(1).max(10_000).optional(),
      category: z.string().max(50).optional(),
      audience: z.string().max(50).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const upd: Record<string, any> = { updated_at: new Date() };
      if (body.title    !== undefined) upd.title    = body.title;
      if (body.body     !== undefined) upd.body     = body.body;
      if (body.category !== undefined) upd.category = body.category;
      if (body.audience !== undefined) upd.audience = body.audience;
      return trx.updateTable('hr_announcements').set(upd)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/announcements/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_announcements')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Holidays ──────────────────────────────────────────────────

  fastify.get('/holidays', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_holidays')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .orderBy('date')
        .execute();
    });
  });

  fastify.post('/holidays', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      name: z.string().trim().min(1).max(200),
      type: z.enum(['Public', 'Company']).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_holidays').values({
        tenant_id: user.tenant_id,
        date: body.date,
        name: body.name,
        type: body.type || 'Public',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/holidays/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('hr_holidays')
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  fastify.post('/holidays/sync', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req) => {
    const user = req.user;
    const q = req.query as any;
    const report = await HolidaysService.syncTenantHolidays(user.tenant_id, {
      // Observances are off by default: they are not days off, and a tenant
      // should opt into seeing twenty extra rows on its calendar.
      includeInternational: q.international === 'true' || q.international === '1',
    });

    await emitDomainEventStandalone(user.tenant_id, {
      type: 'hr.holidays_synced',
      sourceApp: 'nexushr',
      entityType: 'hr_holidays',
      entityId: null,
      payload: { countries: report.countries, years: report.years, added: report.added, updated: report.updated },
    });

    // `ok` reflects whether holidays actually landed, not whether the loop
    // finished. The previous version returned success after fetching nothing.
    return { ...report, synced_count: report.added + report.updated };
  });

  // ── Task Types ───────────────────────────────────────────────

  fastify.get('/tasks', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_tasks')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .orderBy('name')
        .execute();
      // Seed defaults if empty
      if (rows.length === 0) {
        const defaults = [
          { name: 'Customs Filing',        category: 'Operations',     is_billable: true,  color: '#0891b2' },
          { name: 'Documentation Review',  category: 'Operations',     is_billable: true,  color: '#7c3aed' },
          { name: 'Port Operations',       category: 'Operations',     is_billable: true,  color: '#16a34a' },
          { name: 'Client Meeting',        category: 'Client',         is_billable: true,  color: '#d97706' },
          { name: 'Internal Meeting',      category: 'Admin',          is_billable: false, color: '#6b7280' },
          { name: 'Administrative Work',   category: 'Admin',          is_billable: false, color: '#6b7280' },
          { name: 'Training',              category: 'Learning',       is_billable: false, color: '#8b5cf6' },
          { name: 'Break',                 category: 'Other',          is_billable: false, color: '#9ca3af' },
        ];
        const seeded = await trx.insertInto('hr_tasks')
          .values(defaults.map(d => ({ ...d, tenant_id: user.tenant_id })))
          .returningAll().execute();
        return seeded;
      }
      return rows;
    });
  });

  fastify.post('/tasks', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      category: z.string().max(50).optional(),
      is_billable: z.boolean().optional(),
      color: z.string().max(20).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_tasks').values({
        tenant_id: user.tenant_id,
        name: body.name,
        category: body.category || 'General',
        is_billable: body.is_billable ?? false,
        color: body.color || '#0891b2',
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/tasks/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      category: z.string().max(50).optional(),
      is_billable: z.boolean().optional(),
      color: z.string().max(20).optional(),
      active: z.boolean().optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name        !== undefined) allowed.name        = body.name;
      if (body.category    !== undefined) allowed.category    = body.category;
      if (body.is_billable !== undefined) allowed.is_billable = body.is_billable;
      if (body.color       !== undefined) allowed.color       = body.color;
      if (body.active      !== undefined) allowed.active      = body.active;
      allowed.updated_at = new Date();
      return trx.updateTable('hr_tasks').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Time Entries / Check-in ───────────────────────────────────

  fastify.get('/time/today', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      return trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('date', '=', today)
        .orderBy('started_at')
        .execute();
    });
  });

  fastify.get('/time/summary', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      const date = q.date || new Date().toISOString().split('T')[0];
      const entries = await trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('date', '=', date)
        .execute();

      const billable = entries.filter(e => e.is_billable);
      const unbillable = entries.filter(e => !e.is_billable);
      const totalMin = entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);
      const billableMin = billable.reduce((s, e) => s + (e.duration_minutes ?? 0), 0);

      return {
        date,
        total_entries: entries.length,
        total_minutes: totalMin,
        billable_minutes: billableMin,
        unbillable_minutes: totalMin - billableMin,
        entries,
      };
    });
  });

  fastify.post('/time/start', async (req) => {
    const user = req.user;
    const body = z.object({
      task_id: z.string().uuid().optional(),
      task_name: z.string().max(200).optional(),
      is_billable: z.boolean().optional(),
      entry_type: z.string().max(30).optional(),
      is_full_day: z.boolean().optional(),
      project_id: z.string().uuid().optional(),
      project_ref: z.string().max(100).optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      // Close any open entries first
      await trx.updateTable('hr_time_entries')
        .set({
          ended_at: new Date(),
          updated_at: new Date(),
        })
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', user.sub)
        .where('date', '=', today)
        .where('ended_at', 'is', null)
        .execute();

      const created = await trx.insertInto('hr_time_entries').values({
        tenant_id: user.tenant_id,
        user_id: user.sub,
        task_id: body.task_id || null,
        task_name: body.task_name || null,
        is_billable: body.is_billable ?? false,
        entry_type: body.entry_type || 'TASK',
        date: today,
        is_full_day: body.is_full_day ?? false,
        started_at: new Date(),
        last_ack_at: new Date(),
        project_id: body.project_id || null,
        project_ref: body.project_ref || null,
      }).returningAll().executeTakeFirstOrThrow();

      // Logging task/shipment time from the header also marks you present on the
      // /nexushr/clock-in timesheet (no-op if a session is already open).
      await ensureAttendanceSessionOpen(trx, user.tenant_id, user.sub, new Date());

      return created;
    });
  });

  fastify.patch('/time/:id/stop', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const entry = await trx.selectFrom('hr_time_entries')
        .selectAll()
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!entry) throw Object.assign(new Error('Entry not found'), { statusCode: 404 });

      // A shift that ran past the statutory maximum working day was not ended
      // by anyone — recording `now - started_at` would have written 650 hours
      // of work onto a timesheet from one click. settleEntry stores the real
      // elapsed time for a normal shift and leaves it blank, with a note, for
      // one that was never clocked out.
      const endedAt = new Date();
      const settled = settleEntry(entry.started_at as any, endedAt, entry.notes ?? null);

      const stopped = await trx.updateTable('hr_time_entries')
        .set({ ended_at: settled.ended_at, duration_minutes: settled.duration_minutes,
               notes: settled.notes, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();

      // Checking out of your last task closes the attendance session too, so the
      // timesheet's clock-out matches when you actually stopped working.
      await closeAttendanceSessionIfIdle(trx, user.tenant_id, user.sub, new Date());

      return stopped;
    });
  });

  fastify.patch('/time/:id/ack', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_time_entries')
        .set({ last_ack_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/time/:id/extend', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_time_entries')
        .set({ is_full_day: true, is_extended: true, last_ack_at: new Date(), updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Profile Avatar ───────────────────────────────────────────

  fastify.patch('/profile/avatar', async (req) => {
    const user = req.user;
    const body = req.body as { avatar_url: string };
    if (!body.avatar_url) throw { statusCode: 400, message: 'avatar_url required' };
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('users')
        .set({ avatar_url: body.avatar_url, updated_at: new Date() })
        .where('id', '=', user.sub)
        .where('tenant_id', '=', user.tenant_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const { password_hash: _, ...safe } = updated as any;
      return safe;
    });
  });

  // Patch another staff member's avatar (admin only)
  fastify.patch('/staff/:id/avatar', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'SUPER_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const body = req.body as { avatar_url: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('users')
        .set({ avatar_url: body.avatar_url, updated_at: new Date() })
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .execute();
      return { ok: true };
    });
  });

  // ── Staff Management ─────────────────────────────────────────

  fastify.get('/staff', async (req) => {
    const user = req.user;
    // Optional ?search= — used by EntityPicker-driven people-pickers (e.g.
    // Sign's "tag a person" recipient picker) so a large staff list doesn't
    // have to ship in full just to search it; existing callers that omit
    // the param keep getting the full tenant list unchanged.
    const { search } = req.query as { search?: string };
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const [users, onLeaveRows] = await Promise.all([
        trx.selectFrom('users')
          // avatar_url was not selected, which is why every staff row fell back
          // to initials while the header — reading the same column through
          // /auth/me — showed the picture.
          .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at',
                   'last_login_at', 'avatar_url'])
          .where('tenant_id', '=', user.tenant_id)
          .$if(!!search?.trim(), qb => qb.where(eb => eb.or([
            eb('name', 'ilike', `%${search!.trim()}%`),
            eb('email', 'ilike', `%${search!.trim()}%`),
          ])))
          .orderBy('name')
          .execute(),
        trx.selectFrom('hr_leaves')
          .select('user_id')
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'APPROVED')
          .where('from_date', '<=', today)
          .where('to_date', '>=', today)
          .execute(),
      ]);
      const onLeaveIds = new Set(onLeaveRows.map(r => r.user_id));
      return users.map(u => ({
        ...u,
        status: !u.active ? 'INACTIVE' : onLeaveIds.has(u.id) ? 'ON_LEAVE' : 'ACTIVE',
        hireDate: u.created_at instanceof Date
          ? u.created_at.toISOString().split('T')[0]
          : String(u.created_at).split('T')[0],
        dept: '',
        designation: '',
      }));
    });
  });

  fastify.get('/staff/:id', async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const staff = await trx.selectFrom('users')
        // Same omission as the staff list had: without avatar_url the profile
        // header falls back to initials for someone who has a picture.
        .select(['id', 'name', 'email', 'phone', 'role', 'active', 'created_at',
                 'last_login_at', 'profile', 'avatar_url',
                 // Statutory identity and pay. Selected here rather than behind a
                 // second endpoint because the profile screen is the only place
                 // they are ever entered, and a field nobody can see is a field
                 // nobody fills in.
                 'hire_date', 'tax_residency', 'national_id', 'tax_id',
                 'social_security_no', 'health_insurance_no', 'pension_fund',
                 'basic_salary', 'pay_currency', 'pay_method',
                 'bank_name', 'bank_branch', 'bank_account_no', 'bank_account_name',
                 'mobile_money_provider', 'mobile_money_number'])
        .where('id', '=', id)
        .where('tenant_id', '=', user.tenant_id)
        .executeTakeFirst();
      if (!staff) throw Object.assign(new Error('Staff not found'), { statusCode: 404 });

      const today = new Date().toISOString().split('T')[0];
      const [leaveSummary, attendanceSummary, recentLeaves, onLeaveNow] = await Promise.all([
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'APPROVED').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'PRESENT').executeTakeFirst(),
        trx.selectFrom('hr_leaves')
          .select(['id', 'type', 'from_date', 'to_date', 'status', 'reason'])
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .orderBy('from_date', 'desc').limit(10).execute(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id)
          .where('status', '=', 'APPROVED')
          .where('from_date', '<=', today).where('to_date', '>=', today)
          .executeTakeFirst(),
      ]);

      return {
        ...staff,
        status: !staff.active ? 'INACTIVE' : Number(onLeaveNow?.c ?? 0) > 0 ? 'ON_LEAVE' : 'ACTIVE',
        // The real hire date if one has been entered, and only then the row's
        // creation date. These are not interchangeable: the leave cycle is
        // counted from the employment anniversary, so showing "joined" as the
        // day somebody's account was made tells an approver the wrong date to
        // reset an allowance on. `hire_date_is_estimated` says which one this
        // is rather than letting the screen present a guess as a fact.
        hireDate: staff.hire_date
          ? String(staff.hire_date).split('T')[0]
          : staff.created_at instanceof Date
            ? staff.created_at.toISOString().split('T')[0]
            : String(staff.created_at).split('T')[0],
        hire_date_is_estimated: !staff.hire_date,
        stats: {
          approved_leaves: Number(leaveSummary?.c ?? 0),
          present_days: Number(attendanceSummary?.c ?? 0),
        },
        recent_leaves: recentLeaves,
      };
    });
  });

  /**
   * Statutory identity and payment details, which the payroll engine reads and
   * until now could only be set by SQL.
   *
   * Two rules the shape of this handler exists to enforce:
   *
   * 1. Everything is validated *before* anything is written. `withTenant` runs
   *    its callback in a transaction, and returning a 4xx from inside that
   *    callback returns normally — so the transaction commits and the rejected
   *    write is kept. A refusal that leaves half a change behind is worse than
   *    no validation at all, so the checks run outside it.
   *
   * 2. Pay is not the same permission as a phone number. A MANAGER may keep a
   *    team's contact and identity details current; setting what somebody earns
   *    or which account it lands in is an admin action. Splitting these means
   *    the field is editable by the people who should edit it rather than by
   *    everyone who can reach the screen.
   */
  const PAY_FIELDS = new Set([
    'basic_salary', 'pay_currency', 'pay_method', 'bank_name', 'bank_branch',
    'bank_account_no', 'bank_account_name', 'mobile_money_provider', 'mobile_money_number',
  ]);
  const IDENTITY_FIELDS = new Set([
    'tax_residency', 'national_id', 'tax_id', 'social_security_no',
    'health_insurance_no', 'pension_fund', 'hire_date',
  ]);
  const ENUMS: Record<string, readonly string[]> = {
    tax_residency: ['RESIDENT', 'NON_RESIDENT'],
    pension_fund: ['NSSF', 'PSSSF'],
    pay_method: ['BANK', 'MOBILE_MONEY', 'CASH'],
  };
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  fastify.patch('/staff/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;

    const allowed: Record<string, any> = {};
    if (body.name  !== undefined) allowed.name  = body.name;
    if (body.phone !== undefined) allowed.phone = body.phone;

    const canSetPay = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);
    for (const field of [...IDENTITY_FIELDS, ...PAY_FIELDS]) {
      if (body[field] === undefined) continue;
      if (PAY_FIELDS.has(field) && !canSetPay) {
        return reply.status(403).send({
          error: `Changing ${field} requires an administrator — a manager can edit identity and contact details, but not pay.`,
        });
      }
      const raw = body[field];
      // '' from an untouched form field means "cleared", not "set to empty".
      const value = raw === '' || raw === null ? null : raw;

      if (value !== null && ENUMS[field] && !ENUMS[field].includes(String(value))) {
        return reply.status(400).send({
          error: `${field} must be one of ${ENUMS[field].join(', ')} — got "${value}".`,
        });
      }
      if (field === 'hire_date' && value !== null && !ISO_DATE.test(String(value))) {
        return reply.status(400).send({ error: 'hire_date must be YYYY-MM-DD.' });
      }
      if (field === 'basic_salary' && value !== null) {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(400).send({ error: 'basic_salary must be a number and cannot be negative.' });
        }
        allowed[field] = String(n);
        continue;
      }
      if (field === 'pay_currency' && value !== null) {
        const code = String(value).trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(code)) {
          return reply.status(400).send({ error: 'pay_currency must be a three-letter code, such as TZS.' });
        }
        allowed[field] = code;
        continue;
      }
      allowed[field] = typeof value === 'string' ? value.trim() || null : value;
    }

    return withTenant(user.tenant_id, async (trx) => {
      if (body.profile !== undefined) {
        // Deep merge the profile json if it already exists, or just set it.
        // Tenant-scoped: without it this reads another tenant's profile and
        // merges the caller's keys into a copy of it.
        const current = await trx.selectFrom('users').select('profile')
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        allowed.profile = JSON.stringify({ ...(current?.profile as any || {}), ...body.profile });
      }
      allowed.updated_at = new Date();
      const updated = await trx.updateTable('users').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'phone', 'role', 'active', 'profile',
                    'hire_date', 'tax_residency', 'national_id', 'tax_id',
                    'social_security_no', 'health_insurance_no', 'pension_fund',
                    'basic_salary', 'pay_currency', 'pay_method',
                    'bank_name', 'bank_branch', 'bank_account_no', 'bank_account_name',
                    'mobile_money_provider', 'mobile_money_number'])
        .executeTakeFirstOrThrow();
      return { ...updated, hire_date_is_estimated: !updated.hire_date };
    });
  });

  fastify.patch('/staff/:id/role', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    // CUSTOMER/ORG excluded — those have their own creation paths and a
    // fundamentally different auth shape (CUSTOMER ties to a customers.id,
    // ORG carries no tenant_id claim at all), not something to hand-set here.
    const { role } = z.object({
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'TENANT_ADMIN', 'OFFICER']),
    }).parse(req.body);
    // An unvalidated role here previously let an ADMIN/TENANT_ADMIN (both
    // allowed to call this route) set SUPER_ADMIN on anyone in their own
    // tenant — platform-wide access self-granted from a single-tenant role.
    if (role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can grant SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('users').set({ role, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'role'])
        .executeTakeFirstOrThrow();
      await logActivity(trx, user.tenant_id, user.sub, `Changed role for ${updated.name} to ${role}`);
      // Role drives what a person can reach in every app on the platform, so
      // this is the one HR change other apps most need to hear about.
      await emitDomainEvent(trx, user.tenant_id, {
        type: 'hr.staff_role_changed', sourceApp: 'nexushr', entityType: 'user', entityId: updated.id,
        payload: { userId: updated.id, name: updated.name, email: updated.email, role: updated.role, changedBy: user.sub },
        actorId: user.sub,
      }).catch(err => console.error('[HR] staff_role_changed emit failed:', err?.message));
      return updated;
    });
  });

  fastify.patch('/staff/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const updated = await trx.updateTable('users').set({ active, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'active'])
        .executeTakeFirstOrThrow();
      await logActivity(trx, user.tenant_id, user.sub, `${active ? 'Reactivated' : 'Deactivated'} staff member ${updated.name}`);
      // Deactivation has consequences elsewhere — open shipments and tasks
      // still assigned to this person need reassigning, which is exactly the
      // kind of hand-off a Studio automation should own. Split for the same
      // reason as the leave decision above: the literal type has to be visible
      // to check-triggers.ts.
      if (active) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.staff_reactivated', sourceApp: 'nexushr', entityType: 'user', entityId: updated.id,
          payload: { userId: updated.id, name: updated.name, active: updated.active, changedBy: user.sub },
        actorId: user.sub,
        }).catch(err => console.error('[HR] staff_reactivated emit failed:', err?.message));
      } else {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.staff_deactivated', sourceApp: 'nexushr', entityType: 'user', entityId: updated.id,
          payload: { userId: updated.id, name: updated.name, active: updated.active, changedBy: user.sub },
        actorId: user.sub,
        }).catch(err => console.error('[HR] staff_deactivated emit failed:', err?.message));
      }
      return updated;
    });
  });

  // ── One person's record, tab by tab ──────────────────────────────────────
  //
  // The staff profile had twelve tabs and made two API calls. Everything past
  // Profile, Attendance, Leaves and Payroll rendered a placeholder, which reads
  // to a user as "there is nothing here" rather than "this was never built" —
  // and several of them do have real data behind them.
  //
  // Two of the twelve are deliberately not wired, and say so on screen rather
  // than showing an empty table:
  //
  //   Tasks     — `tasks` is a private to-do list, scoped to `user.sub`
  //               everywhere else in the app. Putting somebody's personal
  //               notes-to-self on an HR screen for their manager to read is a
  //               different product decision from showing their work, and not
  //               one to make silently while wiring up tabs.
  //   Projects  — derived here from time entries, which is the only real record
  //               of who worked on what. There is no projects table.

  /**
   * Your own record, or somebody whose record you are entitled to read.
   * Everything below is HR data about one person, so "the caller's tenant" is
   * necessary but not sufficient — a colleague is in your tenant too.
   */
  const HR_VIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];
  const mayViewStaffRecord = (req: any, targetId: string) =>
    req.user.sub === targetId || HR_VIEWER_ROLES.includes(req.user.role);

  /** Wraps a per-person read with the access rule and the tenant filter. */
  function staffRecordRoute(
    path: string,
    handler: (trx: any, req: any, targetId: string) => Promise<unknown>,
  ) {
    fastify.get(`/staff/:id${path}`, async (req: any, reply) => {
      const { id } = req.params as { id: string };
      if (!mayViewStaffRecord(req, id)) {
        return reply.status(403).send({ error: 'You can only open your own record.' });
      }
      return withTenant(req.user.tenant_id, async (trx) => {
        // Confirm the person is in this tenant before reading anything keyed on
        // their id — otherwise every query below trusts an id from the URL.
        const exists = await trx.selectFrom('users').select('id')
          .where('id', '=', id).where('tenant_id', '=', req.user.tenant_id)
          .executeTakeFirst();
        if (!exists) return reply.status(404).send({ error: 'Staff not found' });
        return handler(trx, req, id);
      });
    });
  }

  staffRecordRoute('/timesheet', async (trx, req, id) => {
    const q = req.query as { from?: string; to?: string };
    let query = trx.selectFrom('hr_time_entries')
      .select(['id', 'date', 'task_name', 'project_ref', 'is_billable', 'duration_minutes',
               'started_at', 'ended_at', 'entry_type', 'notes'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id);
    if (q.from) query = query.where('date', '>=', q.from);
    if (q.to) query = query.where('date', '<=', q.to);
    return query.orderBy('date', 'desc').orderBy('started_at', 'desc').limit(200).execute();
  });

  staffRecordRoute('/projects', async (trx, req, id) => {
    // No projects table — this is what the time entries actually say. Entries
    // with no project are grouped as such rather than dropped, so the totals
    // here reconcile with the timesheet tab instead of quietly disagreeing.
    const rows = await trx.selectFrom('hr_time_entries')
      .select(['project_ref', 'is_billable', 'duration_minutes', 'date'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id)
      .execute();
    const byProject = new Map<string, { project: string; minutes: number; billable_minutes: number; entries: number; last_worked: string | null }>();
    for (const r of rows as any[]) {
      const key = r.project_ref || '(no project)';
      const acc = byProject.get(key) ?? { project: key, minutes: 0, billable_minutes: 0, entries: 0, last_worked: null };
      const mins = Number(r.duration_minutes ?? 0);
      acc.minutes += mins;
      if (r.is_billable) acc.billable_minutes += mins;
      acc.entries += 1;
      const d = r.date ? String(r.date).slice(0, 10) : null;
      if (d && (!acc.last_worked || d > acc.last_worked)) acc.last_worked = d;
      byProject.set(key, acc);
    }
    return [...byProject.values()].sort((a, b) => b.minutes - a.minutes);
  });

  staffRecordRoute('/documents', async (trx, req, id) =>
    trx.selectFrom('hr_documents')
      .select(['id', 'name', 'type', 'status', 'storage_key', 'created_at', 'updated_at'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute());

  // Read-only view of a person's saved signature(s)/stamp(s) (sign_stamps,
  // migration 277) — self always allowed via the shared mayViewStaffRecord
  // check above, a manager/admin sees a colleague's the same way they see
  // any other staff-record tab. Writing is always self-only, by construction
  // (POST/DELETE /v1/sign/stamps/mine key off the caller's own JWT, not a
  // URL param), so there's no write route here.
  staffRecordRoute('/signature', async (trx, req, id) =>
    trx.selectFrom('sign_stamps').selectAll()
      .where('tenant_id', '=', req.user.tenant_id)
      .where('owner_type', '=', 'user').where('owner_user_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute());

  staffRecordRoute('/tickets', async (trx, req, id) =>
    // Tickets assigned to this person — their workload, not tickets they raised.
    trx.selectFrom('support_tickets')
      .select(['id', 'ref_number', 'subject', 'status', 'priority', 'category',
               'created_at', 'resolved_at', 'sla_deadline'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('assigned_to', '=', id)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute());

  staffRecordRoute('/shift-roster', async (trx, req, id) => {
    const q = req.query as { from?: string; to?: string };
    let query = trx.selectFrom('hr_shift_assignments as a')
      .innerJoin('hr_shifts as s', 's.id', 'a.shift_id')
      .select(['a.id', 'a.date', 's.name as shift_name', 's.start_time', 's.end_time',
               's.break_minutes', 's.color', 's.grace_minutes'])
      .where('a.tenant_id', '=', req.user.tenant_id)
      .where('a.user_id', '=', id);
    if (q.from) query = query.where('a.date', '>=', q.from);
    if (q.to) query = query.where('a.date', '<=', q.to);
    return query.orderBy('a.date', 'desc').limit(120).execute();
  });

  staffRecordRoute('/activity', async (trx, req, id) =>
    trx.selectFrom('hr_activity_log')
      .select(['id', 'action', 'module', 'created_at'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute());

  /**
   * What this person's role actually lets them do.
   *
   * Derived from the role lists the route handlers really check, not from a
   * separate permissions model — there isn't one, and inventing a prettier
   * display of capabilities the code does not enforce would be worse than
   * showing nothing. If a `requireRole` list changes, this must change with it.
   */
  staffRecordRoute('/permissions', async (trx, req, id) => {
    const person = await trx.selectFrom('users').select(['role', 'active'])
      .where('id', '=', id).where('tenant_id', '=', req.user.tenant_id)
      .executeTakeFirstOrThrow();
    const role = person.role as string;
    const capabilities = [
      { label: 'Edit staff identity and contact details', roles: ['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN'] },
      { label: 'Set pay and payment details',             roles: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] },
      { label: 'Change a colleague’s role',           roles: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] },
      { label: 'Activate or deactivate staff',            roles: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] },
      { label: 'Approve or reject leave',                 roles: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] },
      { label: 'Open another person’s HR record',     roles: HR_VIEWER_ROLES },
    ].map(c => ({ label: c.label, granted: c.roles.includes(role) }));
    return { role, active: person.active, capabilities };
  });

  // ── Contracts and emergency contacts ─────────────────────────────────────

  const CONTRACT_TYPES = ['PERMANENT', 'FIXED_TERM', 'PROBATION', 'CASUAL', 'INTERNSHIP'];
  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  staffRecordRoute('/contracts', async (trx, req, id) =>
    trx.selectFrom('hr_contracts')
      .select(['id', 'contract_type', 'start_date', 'end_date', 'reference', 'document_id', 'notes', 'created_at'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id)
      .orderBy('start_date', 'desc')
      .execute());

  staffRecordRoute('/emergency-contacts', async (trx, req, id) =>
    trx.selectFrom('hr_emergency_contacts')
      .select(['id', 'name', 'relationship', 'phone', 'alt_phone', 'address', 'is_primary'])
      .where('tenant_id', '=', req.user.tenant_id)
      .where('user_id', '=', id)
      .orderBy('is_primary', 'desc')
      .orderBy('name')
      .execute());

  fastify.post<{ Params: { id: string } }>('/staff/:id/contracts',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (req, reply) => {
      const user = req.user;
      const { id } = req.params;
      const b = (req.body ?? {}) as any;

      // Everything checked before the transaction opens — a 4xx returned from
      // inside withTenant returns normally, so the transaction commits.
      const type = String(b.contract_type ?? '').toUpperCase();
      if (!CONTRACT_TYPES.includes(type)) {
        return reply.status(400).send({ error: `contract_type must be one of ${CONTRACT_TYPES.join(', ')}.` });
      }
      if (!ISO.test(String(b.start_date ?? ''))) {
        return reply.status(400).send({ error: 'start_date must be YYYY-MM-DD.' });
      }
      const end = b.end_date ? String(b.end_date) : null;
      if (end && !ISO.test(end)) return reply.status(400).send({ error: 'end_date must be YYYY-MM-DD.' });
      // The rule the whole table turns on, refused here with a reason rather
      // than surfacing as a CHECK violation the caller cannot act on.
      if (type !== 'PERMANENT' && !end) {
        return reply.status(400).send({
          error: `A ${type.toLowerCase().replace('_', '-')} contract must say when it ends — that is what makes it not permanent.`,
        });
      }
      if (type === 'PERMANENT' && end) {
        return reply.status(400).send({ error: 'A permanent contract has no end date. Use fixed-term if it ends.' });
      }
      if (end && end < String(b.start_date)) {
        return reply.status(400).send({ error: 'end_date cannot be before start_date.' });
      }

      return withTenant(user.tenant_id, async (trx) => {
        const person = await trx.selectFrom('users').select('id')
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!person) return reply.status(404).send({ error: 'Staff not found' });

        return trx.insertInto('hr_contracts').values({
          tenant_id: user.tenant_id, user_id: id,
          contract_type: type as any,
          start_date: String(b.start_date),
          end_date: end,
          reference: b.reference ? String(b.reference).trim() : null,
          notes: b.notes ? String(b.notes).trim() : null,
        }).returningAll().executeTakeFirstOrThrow();
      });
    });

  fastify.post<{ Params: { id: string } }>('/staff/:id/emergency-contacts',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (req, reply) => {
      const user = req.user;
      const { id } = req.params;
      const b = (req.body ?? {}) as any;
      const name = String(b.name ?? '').trim();
      const phone = String(b.phone ?? '').trim();
      if (!name) return reply.status(400).send({ error: 'A name is required.' });
      // A contact with no number is not a contact.
      if (!phone) return reply.status(400).send({ error: 'A phone number is required — that is the point of the record.' });

      return withTenant(user.tenant_id, async (trx) => {
        const person = await trx.selectFrom('users').select('id')
          .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!person) return reply.status(404).send({ error: 'Staff not found' });

        // One primary per person, cleared here rather than by a partial unique
        // index that would make a routine save fail mid-edit.
        if (b.is_primary) {
          await trx.updateTable('hr_emergency_contacts').set({ is_primary: false })
            .where('tenant_id', '=', user.tenant_id).where('user_id', '=', id).execute();
        }
        return trx.insertInto('hr_emergency_contacts').values({
          tenant_id: user.tenant_id, user_id: id, name, phone,
          relationship: b.relationship ? String(b.relationship).trim() : null,
          alt_phone: b.alt_phone ? String(b.alt_phone).trim() : null,
          address: b.address ? String(b.address).trim() : null,
          is_primary: !!b.is_primary,
        }).returningAll().executeTakeFirstOrThrow();
      });
    });

  fastify.delete<{ Params: { id: string; contractId: string } }>('/staff/:id/contracts/:contractId',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') },
    async (req, reply) => {
      const user = req.user;
      return withTenant(user.tenant_id, async (trx) => {
        const res = await trx.deleteFrom('hr_contracts')
          .where('id', '=', req.params.contractId)
          .where('user_id', '=', req.params.id)
          .where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (!Number(res.numDeletedRows)) return reply.status(404).send({ error: 'Contract not found' });
        return reply.status(204).send();
      });
    });

  fastify.delete<{ Params: { id: string; contactId: string } }>('/staff/:id/emergency-contacts/:contactId',
    { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') },
    async (req, reply) => {
      const user = req.user;
      return withTenant(user.tenant_id, async (trx) => {
        const res = await trx.deleteFrom('hr_emergency_contacts')
          .where('id', '=', req.params.contactId)
          .where('user_id', '=', req.params.id)
          .where('tenant_id', '=', user.tenant_id)
          .executeTakeFirst();
        if (!Number(res.numDeletedRows)) return reply.status(404).send({ error: 'Contact not found' });
        return reply.status(204).send();
      });
    });

  /**
   * GET /v1/hr/contracts/expiring?days=30
   *
   * The query the table exists for. A fixed-term contract that quietly runs out
   * is a person working without one, which is an employment-law problem rather
   * than a data one — so already-expired contracts are included, not filtered
   * out for being in the past. Those are the urgent ones.
   */
  fastify.get('/contracts/expiring', async (req) => {
    const user = req.user;
    const days = Math.min(Math.max(Number((req.query as any)?.days) || 30, 1), 365);
    const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('hr_contracts as c')
        .innerJoin('users as u', 'u.id', 'c.user_id')
        .select(['c.id', 'c.contract_type', 'c.start_date', 'c.end_date', 'c.reference',
                 'u.id as user_id', 'u.name as user_name', 'u.email as user_email'])
        .where('c.tenant_id', '=', user.tenant_id)
        .where('c.end_date', 'is not', null)
        .where('c.end_date', '<=', horizon)
        // Only people still employed here — a former employee's expired
        // contract is not something anyone needs to act on.
        .where('u.active', '=', true)
        .orderBy('c.end_date', 'asc')
        .execute();

      return rows.map(r => {
        const end = String(r.end_date);
        const daysLeft = Math.round((new Date(end).getTime() - new Date(today).getTime()) / 86400000);
        return { ...r, days_left: daysLeft, already_expired: daysLeft < 0 };
      });
    });
  });

  // ── My Active Shipments (for check-in widget) ────────────────

  fastify.get('/my-shipments', async (req) => {
    const user = req.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('shipment_cases')
        .leftJoin('customers', 'customers.id', 'shipment_cases.customer_id')
        .select([
          'shipment_cases.id', 'shipment_cases.ref_number', 'shipment_cases.goods_desc',
          'shipment_cases.stage', 'shipment_cases.type',
          'customers.name as customer_name',
        ])
        .where('shipment_cases.tenant_id', '=', user.tenant_id)
        .where('shipment_cases.assigned_to', '=', user.sub)
        .where('shipment_cases.stage', '!=', 'completed' as any)
        .orderBy('shipment_cases.created_at', 'desc')
        .limit(20)
        .execute();
      return rows;
    });
  });

  // ── Ops Summary (CommandCenter dashboard) ─────────────────────

  fastify.get('/ops-summary', async (req) => {
    const user = req.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const [checkedIn, activeShipments, pendingTasks] = await Promise.all([
        trx.selectFrom('hr_time_entries')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('date', '=', today)
          .where('ended_at', 'is', null)
          .executeTakeFirst(),
        trx.selectFrom('shipment_cases')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('stage', '!=', 'completed' as any)
          .where('stage', '!=', 'cancelled' as any)
          .executeTakeFirst(),
        trx.selectFrom('shipment_tasks')
          .select((eb) => eb.fn.countAll<number>().as('count'))
          .where('tenant_id', '=', user.tenant_id)
          .where('status', '=', 'open')
          .executeTakeFirst(),
      ]);
      return {
        checked_in: Number(checkedIn?.count ?? 0),
        active_shipments: Number(activeShipments?.count ?? 0),
        pending_tasks: Number(pendingTasks?.count ?? 0),
      };
    });
  });

  // ── Tools Overview (aggregated real-time metrics) ─────────────

  fastify.get('/tools-overview', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

      const [totalStaff, activeStaff, onLeave, pendingLeaves, todayPresent, todayAbsent] = await Promise.all([
        trx.selectFrom('users').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('users').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'APPROVED')
          .where('from_date', '<=', today).where('to_date', '>=', today).executeTakeFirst(),
        trx.selectFrom('hr_leaves').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('status', '=', 'PENDING').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('date', '=', today).where('status', '=', 'PRESENT').executeTakeFirst(),
        trx.selectFrom('hr_attendance').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('date', '=', today).where('status', '=', 'ABSENT').executeTakeFirst(),
      ]);

      const [totalDocs, docsThisMonth] = await Promise.all([
        trx.selectFrom('case_documents').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('case_documents').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart).executeTakeFirst(),
      ]);

      const [totalMessages, messagesThisMonth] = await Promise.all([
        trx.selectFrom('case_messages').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('case_messages').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('created_at', '>=', monthStart).executeTakeFirst(),
      ]);

      const [totalNotifs, unreadNotifs] = await Promise.all([
        trx.selectFrom('notifications').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('notifications').select((eb) => eb.fn.count<number>('id').as('c'))
          .where('tenant_id', '=', user.tenant_id).where('read', '=', false).executeTakeFirst(),
      ]);

      return {
        hr: {
          total_staff:    Number(totalStaff?.c ?? 0),
          active_staff:   Number(activeStaff?.c ?? 0),
          on_leave:       Number(onLeave?.c ?? 0),
          pending_leaves: Number(pendingLeaves?.c ?? 0),
          today_present:  Number(todayPresent?.c ?? 0),
          today_absent:   Number(todayAbsent?.c ?? 0),
        },
        files: {
          total:      Number(totalDocs?.c ?? 0),
          this_month: Number(docsThisMonth?.c ?? 0),
        },
        chat: {
          total_messages: Number(totalMessages?.c ?? 0),
          this_month:     Number(messagesThisMonth?.c ?? 0),
        },
        support: {
          total_notifications: Number(totalNotifs?.c ?? 0),
          unread:              Number(unreadNotifs?.c ?? 0),
        },
        fetched_at: new Date().toISOString(),
      };
    });
  });

  // ── Teams ─────────────────────────────────────────────────────

  fastify.get('/teams', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      const teams = await trx.selectFrom('hr_teams as t')
        .leftJoin('users as u', 'u.id', 't.lead_user_id')
        .select(['t.id', 't.name', 't.lead_user_id', 'u.name as lead_name', 't.created_at'])
        .where('t.tenant_id', '=', user.tenant_id)
        .orderBy('t.name')
        .execute();
      const members = await trx.selectFrom('hr_team_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select(['m.team_id', 'm.user_id', 'u.name as user_name'])
        .execute();
      return teams.map(t => ({ ...t, members: members.filter(m => m.team_id === t.id) }));
    });
  });

  fastify.post('/teams', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      lead_user_id: z.string().uuid().optional(),
    }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const team = await trx.insertInto('hr_teams').values({
        tenant_id: user.tenant_id, name: body.name, lead_user_id: body.lead_user_id || null,
      }).returningAll().executeTakeFirstOrThrow();
      await logActivity(trx, user.tenant_id, user.sub, `Created team ${team.name}`);
      return team;
    });
  });

  fastify.post('/teams/:id/members', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as any;
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const team = await trx.selectFrom('hr_teams').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });
      // user_id previously wasn't checked against this tenant — hr_team_members
      // has no tenant_id of its own, only team_id, so an unvalidated user_id
      // could attach a completely unrelated tenant's user to this team.
      const member = await trx.selectFrom('users').select('id').where('id', '=', user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!member) return reply.status(404).send({ error: 'User not found' });
      return trx.insertInto('hr_team_members').values({ team_id: id, user_id })
        .onConflict(oc => oc.columns(['team_id', 'user_id']).doNothing())
        .returningAll().executeTakeFirst();
    });
  });

  fastify.delete('/teams/:id/members/:userId', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id, userId } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const team = await trx.selectFrom('hr_teams').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });
      await trx.deleteFrom('hr_team_members').where('team_id', '=', id).where('user_id', '=', userId).execute();
      return { ok: true };
    });
  });

  // ── Invitations ───────────────────────────────────────────────

  fastify.get('/invitations', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_invitations as i')
        .leftJoin('users as u', 'u.id', 'i.invited_by')
        .select(['i.id', 'i.email', 'i.role', 'i.status', 'i.expires_at', 'i.created_at', 'u.name as invited_by_name'])
        .where('i.tenant_id', '=', user.tenant_id)
        .orderBy('i.created_at', 'desc')
        .execute();
    });
  });

  fastify.post('/invitations', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req, reply) => {
    const user = req.user;
    // Same reasoning as PATCH /staff/:id/role above: this route is reachable
    // by MANAGER/ADMIN/TENANT_ADMIN, not just SUPER_ADMIN, and the invite's
    // role becomes the real role the moment it's accepted (accept-invite
    // reads it straight off this row) — an unvalidated role here was just as
    // real a SUPER_ADMIN-self-grant path as the direct role-change endpoint.
    const body = z.object({
      email: z.string().trim().email().max(320),
      role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR', 'TENANT_ADMIN', 'OFFICER']),
    }).parse(req.body);
    if (body.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({ error: 'Only a SUPER_ADMIN can invite a SUPER_ADMIN' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await trx.insertInto('hr_invitations').values({
        tenant_id: user.tenant_id, email: body.email, role: body.role,
        token, invited_by: user.sub, expires_at: expiresAt,
      }).returningAll().executeTakeFirstOrThrow();

      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${token}`;
      await MailService.enqueueTemplated(user.tenant_id, 'hr.staff_invitation', body.email, { role: body.role, acceptUrl }, 'hr')
        .catch(() => { /* invite row exists regardless; resend is available */ });

      await logActivity(trx, user.tenant_id, user.sub, `Invited ${body.email} as ${body.role}`);
      /**
       * Also to the event stream, not only the HR log.
       *
       * Role changes and deactivations already emit; an invitation did not, so
       * the one governance action that *adds* somebody to the workspace was
       * the one missing from the workspace activity feed.
       */
      await emitDomainEvent(trx, user.tenant_id, {
        type: 'hr.staff_invited', sourceApp: 'workspace', entityType: 'user', entityId: invite.id,
        payload: { email: body.email, role: body.role },
        actorId: user.sub,
      }).catch(err => console.error('[HR] staff_invited emit failed:', err?.message));
      return invite;
    });
  });

  fastify.post('/invitations/:id/resend', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      const invite = await trx.selectFrom('hr_invitations').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!invite) throw Object.assign(new Error('Invitation not found'), { statusCode: 404 });
      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${invite.token}`;
      await MailService.enqueueTemplated(user.tenant_id, 'hr.staff_invitation_reminder', invite.email, { acceptUrl }, 'hr')
        .catch(() => {});
      return { ok: true };
    });
  });

  fastify.delete('/invitations/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    return withTenant(user.tenant_id, async (trx) => {
      await trx.updateTable('hr_invitations').set({ status: 'REVOKED' })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).execute();
      return { ok: true };
    });
  });

  // ── Delete Requests ───────────────────────────────────────────

  fastify.get('/delete-requests', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_delete_requests as d')
        .innerJoin('users as u', 'u.id', 'd.user_id')
        .leftJoin('users as r', 'r.id', 'd.requested_by')
        .select(['d.id', 'd.reason', 'd.status', 'd.created_at', 'u.name as user_name', 'u.email as user_email', 'r.name as requested_by_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.created_at', 'desc')
        .execute();
    });
  });

  // A manager can request this on someone else's behalf, or a user can
  // request their own account be deactivated (Ondi's Personal ▸ Privacy
  // page — self-service, no manager needed) — same table, same approval
  // workflow either way, just two different requesters.
  fastify.post('/delete-requests', async (req, reply) => {
    const user = req.user;
    const body = z.object({ user_id: z.string().uuid(), reason: z.string().max(2000).optional() }).parse(req.body);
    const isSelf = body.user_id === user.sub;
    if (!isSelf && !['SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
      return reply.status(403).send({ error: 'You can only request deactivation for your own account.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      // user_id previously wasn't checked against this tenant before insert.
      const target = await trx.selectFrom('users').select('id').where('id', '=', body.user_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!target) return reply.status(404).send({ error: 'Employee not found' });
      const created = await trx.insertInto('hr_delete_requests').values({
        tenant_id: user.tenant_id, user_id: body.user_id, requested_by: user.sub, reason: body.reason || null,
      }).returningAll().executeTakeFirstOrThrow();
      if (isSelf) await recordAuthEvent(user.tenant_id, user.sub, 'account_deactivation_requested', { metadata: { request_id: created.id } });
      return created;
    });
  });

  // Self-scoped — the plain GET above returns every request in the tenant
  // (deliberately, for the admin-facing NexusHR queue) which would leak
  // other people's names/emails/reasons to a regular user's own Privacy
  // page if reused here.
  fastify.get('/delete-requests/mine', async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, trx => trx.selectFrom('hr_delete_requests')
      .select(['id', 'reason', 'status', 'created_at'])
      .where('tenant_id', '=', user.tenant_id)
      .where('user_id', '=', user.sub)
      .orderBy('created_at', 'desc')
      .execute());
  });

  fastify.patch('/delete-requests/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { status } = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      const reqRow = await trx.selectFrom('hr_delete_requests').selectAll()
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!reqRow) throw Object.assign(new Error('Delete request not found'), { statusCode: 404 });

      const updated = await trx.updateTable('hr_delete_requests').set({
        status, decided_by: user.sub, decided_at: new Date(),
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

      if (status === 'APPROVED') {
        await trx.updateTable('users').set({ active: false, updated_at: new Date() })
          .where('id', '=', reqRow.user_id).where('tenant_id', '=', user.tenant_id).execute();
      }
      await logActivity(trx, user.tenant_id, user.sub, `${status === 'APPROVED' ? 'Approved' : 'Rejected'} delete request for user ${reqRow.user_id}`);
      return updated;
    });
  });

  // ── Login History & Devices ───────────────────────────────────

  fastify.get('/login-history', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_login_history as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .select(['l.id', 'l.ip', 'l.user_agent', 'l.status', 'l.created_at', 'u.name as user_name'])
        .where('l.tenant_id', '=', user.tenant_id)
        .orderBy('l.created_at', 'desc')
        .limit(200)
        .execute();
    });
  });

  fastify.get('/devices', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_devices as d')
        .innerJoin('users as u', 'u.id', 'd.user_id')
        .select(['d.id', 'd.device_label', 'd.device_type', 'd.trusted', 'd.last_used_at', 'u.name as user_name'])
        .where('d.tenant_id', '=', user.tenant_id)
        .orderBy('d.last_used_at', 'desc')
        .execute();
    });
  });

  fastify.patch('/devices/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { trusted } = z.object({ trusted: z.boolean() }).parse(req.body);
    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_devices').set({ trusted })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  // ── Activity Log ──────────────────────────────────────────────

  fastify.get('/activity-log', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (req) => {
    const user = req.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('hr_activity_log as a')
        .leftJoin('users as u', 'u.id', 'a.user_id')
        .select(['a.id', 'a.action', 'a.module', 'a.created_at', 'u.name as user_name'])
        .where('a.tenant_id', '=', user.tenant_id)
        .orderBy('a.created_at', 'desc')
        .limit(200)
        .execute();
    });
  });
}
