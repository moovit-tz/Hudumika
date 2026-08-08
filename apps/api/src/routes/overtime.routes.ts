/**
 * Overtime: claiming it, approving it, and getting it onto a payslip.
 *
 * Hours worked are a fact; hours paid at a premium are an authorisation. So a
 * claim is a separate object with a decision on it, and the decision is what
 * releases the money.
 *
 * Two things are deliberately not taken from the request body. The `kind` —
 * whether the day was ordinary, a rest day or a public holiday — is derived
 * from the tenant's calendar, because it decides whether the rate is 1.5x or
 * 2x and a form offered that choice would be filled in with the cheaper one.
 * And the multiplier is stored on the row at approval, not looked up when
 * payroll runs: the rate that applied on the day worked is a fact about that
 * day, and a later change must not rewrite what somebody earned.
 */
import type { FastifyInstance } from 'fastify';
import { withTenant, db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { HolidaysService } from '../services/holidays.service.js';
import {
  overtimeKindFor, overtimeAmount, checkOvertimeCap, fourWeekWindow,
  OVERTIME_MULTIPLIER,
} from '../services/attendance.service.js';

const APPROVERS = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const canSeeOthers = (role: string) =>
  (APPROVERS as readonly string[]).includes(role) || role === 'FINANCE';

const num = (v: unknown) => Number(v ?? 0);
function isoDate(v: unknown): string {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
}

/** Hours already approved in the four weeks ending on `dateISO`. */
async function approvedHoursInWindow(tenantId: string, userId: string, dateISO: string, excludeId?: string) {
  const w = fourWeekWindow(dateISO);
  let q = db.selectFrom('hr_overtime_requests').select(db.fn.sum('hours').as('h'))
    .where('tenant_id', '=', tenantId).where('user_id', '=', userId)
    .where('status', '=', 'APPROVED')
    .where('date', '>=', w.from as any).where('date', '<=', w.to as any);
  if (excludeId) q = q.where('id', '!=', excludeId);
  return num((await q.executeTakeFirst())?.h);
}

export async function overtimeRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  fastify.get('/overtime', async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const targetId = q.user_id ? String(q.user_id) : null;

    if (targetId && targetId !== user.sub && !canSeeOthers(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: you may only view your own overtime' });
    }

    return withTenant(user.tenant_id, async (trx) => {
      let qb = trx.selectFrom('hr_overtime_requests as o')
        .innerJoin('users as u', 'u.id', 'o.user_id')
        .leftJoin('users as a', 'a.id', 'o.approved_by')
        .select(['o.id', 'o.user_id', 'o.date', 'o.hours', 'o.kind', 'o.rate_multiplier',
                 'o.reason', 'o.status', 'o.decision_note', 'o.approved_at', 'o.paid_in_run_id',
                 'u.name as employee_name', 'a.name as approved_by_name'])
        .where('o.tenant_id', '=', user.tenant_id);

      // Somebody without an approver's role only ever sees their own.
      if (targetId) qb = qb.where('o.user_id', '=', targetId);
      else if (!canSeeOthers(user.role)) qb = qb.where('o.user_id', '=', user.sub);
      if (q.status) qb = qb.where('o.status', '=', String(q.status) as any);

      const rows = await qb.orderBy('o.date', 'desc').execute();
      return rows.map(r => ({ ...r, date: isoDate(r.date) }));
    });
  });

  /**
   * Claim overtime for a day.
   *
   * Everything is validated and derived before any write, because a 4xx
   * returned from inside withTenant returns normally and the transaction
   * commits — a rejected claim that had already been written would sit in the
   * table awaiting approval.
   */
  fastify.post('/overtime', async (req, reply) => {
    const user = req.user;
    const b = req.body as any;
    const date = isoDate(b.date);
    const hours = Number(b.hours);
    const subjectId = b.user_id ? String(b.user_id) : user.sub;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply.status(400).send({ error: 'date is required, as YYYY-MM-DD' });
    if (!Number.isFinite(hours) || hours <= 0) return reply.status(400).send({ error: 'hours must be more than zero' });
    // The constraint caps a single day at 12; say so rather than let Postgres.
    if (hours > 12) return reply.status(400).send({ error: 'A single day cannot carry more than 12 hours of overtime' });
    if (subjectId !== user.sub && !canSeeOthers(user.role)) {
      return reply.status(403).send({ error: 'Forbidden: you may only claim your own overtime' });
    }
    if (date > isoDate(new Date())) {
      // Overtime is a record of work done, not a booking.
      return reply.status(400).send({ error: 'Overtime cannot be claimed for a date in the future' });
    }

    // The rate, from the calendar rather than from the request.
    const closed = await HolidaysService.nonWorkingDates(user.tenant_id, date, date);
    const kind = overtimeKindFor(date, closed);
    const multiplier = OVERTIME_MULTIPLIER[kind];

    const already = await approvedHoursInWindow(user.tenant_id, subjectId, date);
    const cap = checkOvertimeCap(already, hours);
    if (!cap.ok) return reply.status(409).send({ error: cap.reason, approved_in_window: already, remaining: cap.remaining });

    return withTenant(user.tenant_id, async (trx) => {
      const person = await trx.selectFrom('users').select(['id', 'name'])
        .where('id', '=', subjectId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!person) return reply.status(404).send({ error: 'That person is not on this tenant' });

      const clash = await trx.selectFrom('hr_overtime_requests').select(['id', 'status', 'hours'])
        .where('tenant_id', '=', user.tenant_id).where('user_id', '=', subjectId)
        .where('date', '=', date as any).executeTakeFirst();
      if (clash) {
        return reply.status(409).send({
          error: `${person.name} already has a ${String(clash.status).toLowerCase()} claim of ${clash.hours} hour(s) for ${date}. Amend that rather than adding a second.`,
          existing_id: clash.id,
        });
      }

      const row = await trx.insertInto('hr_overtime_requests').values({
        tenant_id: user.tenant_id, user_id: subjectId, date, hours: String(hours),
        kind, rate_multiplier: String(multiplier), reason: b.reason || null,
        status: 'PENDING', requested_by: user.sub,
      } as any).returningAll().executeTakeFirstOrThrow();

      return {
        ...row, date: isoDate(row.date),
        // Said plainly, because the rate is the thing being agreed and it was
        // not chosen by whoever filled the form in.
        rate_explanation: kind === 'NORMAL'
          ? 'An ordinary working day — 1.5x the normal hourly rate.'
          : kind === 'REST_DAY'
            ? 'A weekly rest day — 2x the normal hourly rate.'
            : 'A public holiday — 2x the normal hourly rate.',
        remaining_in_window: cap.remaining,
      };
    });
  });

  /** Approve or reject. The decision is what releases the money. */
  fastify.patch('/overtime/:id/status', { preHandler: requireRole(...APPROVERS) }, async (req, reply) => {
    const user = req.user;
    const { id } = req.params as { id: string };
    const b = req.body as any;
    const status = String(b.status ?? '').toUpperCase();
    const note = String(b.decision_note ?? '').trim();

    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
      return reply.status(400).send({ error: 'status must be APPROVED, REJECTED or CANCELLED' });
    }
    // A rejection somebody cannot answer is not a decision.
    if (status === 'REJECTED' && !note) {
      return reply.status(400).send({ error: 'A reason is required when rejecting overtime' });
    }

    const existing = await db.selectFrom('hr_overtime_requests').selectAll()
      .where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
    if (!existing) return reply.status(404).send({ error: 'Overtime claim not found' });
    if (existing.paid_in_run_id) {
      return reply.status(409).send({ error: 'This overtime has already been paid and cannot be changed.' });
    }
    if (existing.status === status) return reply.status(409).send({ error: `Already ${status.toLowerCase()}` });

    // Re-checked at approval, not only at claim: other claims may have been
    // approved in between, and it is approval that spends the allowance.
    if (status === 'APPROVED') {
      const already = await approvedHoursInWindow(user.tenant_id, existing.user_id, isoDate(existing.date), id);
      const cap = checkOvertimeCap(already, num(existing.hours));
      if (!cap.ok) return reply.status(409).send({ error: cap.reason, approved_in_window: already });
    }

    return withTenant(user.tenant_id, async (trx) => {
      return trx.updateTable('hr_overtime_requests').set({
        status,
        approved_by: status === 'APPROVED' ? user.sub : null,
        approved_at: status === 'APPROVED' ? new Date() : null,
        decision_note: note || null,
        updated_at: new Date(),
      } as any).where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
    });
  });

  /**
   * What approved overtime is worth for a person in a period.
   *
   * Read by payroll, and readable on its own so somebody can see the figure
   * before a run rather than discovering it on a payslip.
   */
  fastify.get('/overtime/payable', { preHandler: requireRole(...APPROVERS, 'FINANCE') }, async (req, reply) => {
    const user = req.user;
    const q = req.query as any;
    const from = isoDate(q.from), to = isoDate(q.to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return reply.status(400).send({ error: 'from and to are required, as YYYY-MM-DD' });
    }

    const settings = { daysPerMonth: 26, hoursPerDay: 8 };
    const rows = await db.selectFrom('hr_overtime_requests as o')
      .innerJoin('users as u', 'u.id', 'o.user_id')
      .select(['o.id', 'o.user_id', 'o.date', 'o.hours', 'o.kind', 'o.rate_multiplier',
               'u.name', 'u.basic_salary'])
      .where('o.tenant_id', '=', user.tenant_id)
      .where('o.status', '=', 'APPROVED')
      .where('o.paid_in_run_id', 'is', null)
      .where('o.date', '>=', from as any).where('o.date', '<=', to as any)
      .orderBy('u.name').orderBy('o.date').execute();

    return rows.map(r => {
      const { hourlyRate, amount } = overtimeAmount(
        num(r.basic_salary), num(r.hours), num(r.rate_multiplier),
        settings.daysPerMonth, settings.hoursPerDay,
      );
      return {
        id: r.id, user_id: r.user_id, name: r.name, date: isoDate(r.date),
        hours: num(r.hours), kind: r.kind, multiplier: num(r.rate_multiplier),
        hourly_rate: hourlyRate, amount,
        // Absent, not zero: somebody with no basic salary cannot be paid for
        // overtime either, and a silent 0 hides that.
        payable: num(r.basic_salary) > 0,
        note: num(r.basic_salary) > 0 ? undefined : 'No basic salary recorded, so this cannot be valued',
      };
    });
  });
}
