import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { EmailIntegration } from '../integrations/email.js';
import { emitDomainEvent, emitDomainEventStandalone } from '../services/domain-events.service.js';
import { HolidaysService } from '../services/holidays.service.js';
import { workingDaysBetween } from '../services/holiday-calendar.service.js';
import { checkRequest as checkLeaveRequest, splitPayDays, computeBalances as computeLeaveBalances } from '../services/leave-entitlement.service.js';
import { env } from '../config/env.js';

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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_shifts').values({
        tenant_id: user.tenant_id,
        name: body.name,
        start_time: body.start_time,
        end_time: body.end_time,
        break_minutes: Number(body.break_minutes) || 0,
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

  fastify.post('/shift-assignments', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN', 'SENIOR') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
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
    const body = req.body as any;
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
    const body = req.body as any;
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
              status: body.status, clock_in: body.clock_in || null,
              clock_out: body.clock_out || null, recorded_by: user.sub, updated_at: new Date(),
            }).where('id', '=', existing.id).execute();
          } else {
            await trx.insertInto('hr_attendance').values({
              tenant_id: user.tenant_id, user_id: uid, date: dateStr,
              status: body.status, clock_in: body.clock_in || null,
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

  // ── Leaves ────────────────────────────────────────────────────

  fastify.get('/leaves', async (req) => {
    const user = req.user;
    const q = req.query as any;
    return withTenant(user.tenant_id, async (trx) => {
      let query = trx.selectFrom('hr_leaves as l')
        .innerJoin('users as u', 'u.id', 'l.user_id')
        .leftJoin('users as a', 'a.id', 'l.approved_by')
        .select([
          'l.id', 'l.user_id', 'l.type', 'l.from_date', 'l.to_date',
          'l.days', 'l.reason', 'l.status', 'l.approved_at', 'l.created_at',
          'u.name as employee_name',
          'a.name as approved_by_name',
        ])
        .where('l.tenant_id', '=', user.tenant_id);
      if (q.status)  query = query.where('l.status', '=', q.status);
      if (q.user_id) query = query.where('l.user_id', '=', q.user_id);
      return query.orderBy('l.created_at', 'desc').execute();
    });
  });

  fastify.post('/leaves', async (req, reply) => {
    const user = req.user;
    const body = req.body as any;
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

    const type = body.leave_type_id
      ? await db.selectFrom('hr_leave_types').selectAll()
          .where('id', '=', String(body.leave_type_id)).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
      : await db.selectFrom('hr_leave_types').selectAll()
          .where('tenant_id', '=', user.tenant_id).where('code', '=', String(body.type ?? '').toUpperCase())
          .executeTakeFirst();

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
    const body = req.body as any;
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

  fastify.post('/payroll', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_payroll').select('id')
        .where('tenant_id', '=', user.tenant_id)
        .where('user_id', '=', body.user_id)
        .where('period_month', '=', Number(body.period_month))
        .where('period_year',  '=', Number(body.period_year))
        .executeTakeFirst();
      if (existing) {
        return trx.updateTable('hr_payroll').set({
          basic_pay: Number(body.basic_pay),
          allowances: Number(body.allowances) || 0,
          deductions: Number(body.deductions) || 0,
          status: body.status || 'PENDING',
          updated_at: new Date(),
        }).where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow();
      }
      return trx.insertInto('hr_payroll').values({
        tenant_id: user.tenant_id,
        user_id: body.user_id,
        period_month: Number(body.period_month),
        period_year:  Number(body.period_year),
        basic_pay:    Number(body.basic_pay),
        allowances:   Number(body.allowances) || 0,
        deductions:   Number(body.deductions) || 0,
        status: body.status || 'PENDING',
        created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/payroll/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const upd: Record<string, any> = { updated_at: new Date() };
      if (body.status !== undefined) {
        upd.status = body.status;
        if (body.status === 'PAID') upd.paid_at = new Date();
      }
      if (body.basic_pay  !== undefined) upd.basic_pay  = Number(body.basic_pay);
      if (body.allowances !== undefined) upd.allowances = Number(body.allowances);
      if (body.deductions !== undefined) upd.deductions = Number(body.deductions);
      const updated = await trx.updateTable('hr_payroll').set(upd)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      if (body.status !== undefined) await logActivity(trx, user.tenant_id, user.sub, `Marked payroll ${body.status.toLowerCase()} for ${updated.period_month}/${updated.period_year}`);
      return updated;
    });
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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
    const body = req.body as any;
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

      return trx.insertInto('hr_time_entries').values({
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

      const endedAt = new Date();
      const durationMin = entry.started_at
        ? Math.round((endedAt.getTime() - new Date(entry.started_at).getTime()) / 60000)
        : 0;

      return trx.updateTable('hr_time_entries')
        .set({ ended_at: endedAt, duration_minutes: durationMin, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
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
                 'last_login_at', 'profile', 'avatar_url'])
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
        hireDate: staff.created_at instanceof Date
          ? staff.created_at.toISOString().split('T')[0]
          : String(staff.created_at).split('T')[0],
        stats: {
          approved_leaves: Number(leaveSummary?.c ?? 0),
          present_days: Number(attendanceSummary?.c ?? 0),
        },
        recent_leaves: recentLeaves,
      };
    });
  });

  fastify.patch('/staff/:id', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const allowed: Record<string, any> = {};
      if (body.name  !== undefined) allowed.name  = body.name;
      if (body.phone !== undefined) allowed.phone = body.phone;
      if (body.profile !== undefined) {
        // Deep merge the profile json if it already exists, or just set it
        const current = await trx.selectFrom('users').select('profile').where('id', '=', id).executeTakeFirst();
        allowed.profile = JSON.stringify({ ...(current?.profile as any || {}), ...body.profile });
      }
      allowed.updated_at = new Date();
      return trx.updateTable('users').set(allowed)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning(['id', 'name', 'email', 'phone', 'role', 'active', 'profile'])
        .executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/staff/:id/role', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { role } = req.body as any;
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
      }).catch(err => console.error('[HR] staff_role_changed emit failed:', err?.message));
      return updated;
    });
  });

  fastify.patch('/staff/:id/status', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { active } = req.body as any;
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
        }).catch(err => console.error('[HR] staff_reactivated emit failed:', err?.message));
      } else {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.staff_deactivated', sourceApp: 'nexushr', entityType: 'user', entityId: updated.id,
          payload: { userId: updated.id, name: updated.name, active: updated.active, changedBy: user.sub },
        }).catch(err => console.error('[HR] staff_deactivated emit failed:', err?.message));
      }
      return updated;
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
    const body = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const team = await trx.insertInto('hr_teams').values({
        tenant_id: user.tenant_id, name: body.name, lead_user_id: body.lead_user_id || null,
      }).returningAll().executeTakeFirstOrThrow();
      await logActivity(trx, user.tenant_id, user.sub, `Created team ${team.name}`);
      return team;
    });
  });

  fastify.post('/teams/:id/members', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { user_id } = req.body as any;
    return withTenant(user.tenant_id, async (trx) => {
      const team = await trx.selectFrom('hr_teams').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 });
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

  fastify.post('/invitations', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as { email: string; role: string };
    return withTenant(user.tenant_id, async (trx) => {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invite = await trx.insertInto('hr_invitations').values({
        tenant_id: user.tenant_id, email: body.email, role: body.role,
        token, invited_by: user.sub, expires_at: expiresAt,
      }).returningAll().executeTakeFirstOrThrow();

      const acceptUrl = `${env.OPS_BOARD_URL}/accept-invite?token=${token}`;
      await EmailIntegration.sendEmail({
        to: body.email,
        subject: "You're invited to join Hudumika",
        bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p>You've been invited to join Hudumika as <strong>${body.role}</strong>.</p>
          <p><a href="${acceptUrl}">Accept the invitation</a> to set up your account. This link expires in 7 days.</p>
        </div>`,
        tenantId: user.tenant_id,
      }).catch(() => { /* invite row exists regardless; resend is available */ });

      await logActivity(trx, user.tenant_id, user.sub, `Invited ${body.email} as ${body.role}`);
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
      await EmailIntegration.sendEmail({
        to: invite.email,
        subject: "Reminder: you're invited to join Hudumika",
        bodyHtml: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
          <p><a href="${acceptUrl}">Accept the invitation</a> to set up your account.</p>
        </div>`,
        tenantId: user.tenant_id,
      }).catch(() => {});
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

  fastify.post('/delete-requests', { preHandler: requireRole('SUPER_ADMIN', 'MANAGER', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const body = req.body as { user_id: string; reason?: string };
    return withTenant(user.tenant_id, async (trx) => {
      return trx.insertInto('hr_delete_requests').values({
        tenant_id: user.tenant_id, user_id: body.user_id, requested_by: user.sub, reason: body.reason || null,
      }).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.patch('/delete-requests/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (req) => {
    const user = req.user;
    const { id } = req.params as any;
    const { status } = req.body as { status: 'APPROVED' | 'REJECTED' };
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
    const { trusted } = req.body as { trusted: boolean };
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
