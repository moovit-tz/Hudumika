import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { AxisLifecycle, LifecycleError } from '../services/axis-lifecycle.service.js';
import { withTenant } from '../db/client.js';
import { reviewTimeCorrection, HR_ADMIN_ROLES } from '../services/time-correction.service.js';
import { PAYROLL_READ_ROLES } from '../lib/hr-pay-access.js';

/**
 * Axis worker lifecycle (job history) — /v1/hr/workers/... and
 * /v1/hr/assignments/... The service enforces who may do what (HR
 * administrators act; a manager may only request a move for their own team;
 * anyone may read their own history); these routes validate shape only.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');
const id = z.string().uuid();
const job = {
  worker_type: z.enum(['EMPLOYEE', 'CONTRACTOR', 'CASUAL', 'INTERN']).optional(),
  legal_entity_id: id.nullish(),
  location_id: id.nullish(),
  department_id: id.nullish(),
  designation_id: id.nullish(),
  manager_id: id.nullish(),
  job_title: z.string().trim().max(160).nullish(),
  fte: z.number().gt(0).max(1).optional(),
  notes: z.string().trim().max(2000).nullish(),
};
const endReason = z.enum(['RESIGNATION', 'TERMINATION', 'END_OF_CONTRACT', 'RETIREMENT', 'DEATH', 'REDUNDANCY', 'OTHER']);

async function run(reply: FastifyReply, fn: () => Promise<unknown>) {
  try { return { data: await fn() }; }
  catch (e: any) {
    if (e instanceof LifecycleError) return reply.status(e.statusCode).send({ error: e.message });
    if (e?.code === '23505') return reply.status(409).send({ error: 'This worker already has an open main job. End or correct it first.' });
    if (e?.code === '23514') return reply.status(400).send({ error: 'Those dates or values break a job-history rule (an end must follow its start, and a leaving reason goes with an end date).' });
    throw e;
  }
}

export async function axisLifecycleRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (['CUSTOMER', 'ORG', 'GUEST'].includes(request.user?.role)) return reply.status(403).send({ error: 'Not available for this account type.' });
  });

  fastify.get('/workers/:id/assignments', async (req, reply) => {
    const p = id.safeParse((req.params as any).id);
    if (!p.success) return reply.status(400).send({ error: 'Invalid worker id' });
    return run(reply, () => AxisLifecycle.history(req.user, p.data));
  });

  fastify.post('/workers', async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(254).nullish().or(z.literal('')), phone: z.string().trim().max(40).nullish(), start_date: date, ...job }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid worker' });
    const r = await run(reply, () => AxisLifecycle.hireWithoutLogin(req.user, { ...b.data, email: b.data.email || null }));
    if ((r as any)?.data) reply.status(201);
    return r;
  });

  fastify.post('/workers/:id/start-job', async (req, reply) => {
    const b = z.object({ start_date: date, ...job }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid job' });
    return run(reply, () => AxisLifecycle.startJob(req.user, (req.params as any).id, b.data));
  });

  fastify.post('/workers/:id/move', async (req, reply) => {
    const b = z.object({ effective_date: date, reason: z.enum(['TRANSFER', 'PROMOTION']), ...job }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid change' });
    return run(reply, () => AxisLifecycle.move(req.user, (req.params as any).id, b.data));
  });

  fastify.post('/workers/:id/extra-assignment', async (req, reply) => {
    const b = z.object({ start_date: date, end_date: date.nullish(), ...job }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid assignment' });
    return run(reply, () => AxisLifecycle.addSecondary(req.user, (req.params as any).id, b.data));
  });

  fastify.post('/workers/:id/offboard', async (req, reply) => {
    const b = z.object({ last_day: date, reason: endReason, notes: z.string().trim().max(2000).nullish() }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid offboarding' });
    return run(reply, () => AxisLifecycle.offboard(req.user, (req.params as any).id, b.data));
  });

  fastify.post('/workers/:id/sign-in', async (req, reply) => {
    const b = z.object({ can_login: z.boolean() }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: 'Say whether sign-in is on or off' });
    return run(reply, () => AxisLifecycle.setSignIn(req.user, (req.params as any).id, b.data.can_login));
  });

  fastify.get('/assignments/pending', async (req, reply) => run(reply, () => AxisLifecycle.pending(req.user)));

  fastify.post('/assignments/:id/decision', async (req, reply) => {
    const b = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: 'Choose approve or reject' });
    return run(reply, () => AxisLifecycle.approve(req.user, (req.params as any).id, b.data.decision, b.data.reason));
  });

  fastify.post('/assignments/:id/correct', async (req, reply) => {
    const b = z.object({ start_date: date.optional(), end_date: date.nullish(), reason: z.string().trim().min(3).max(500), ...job }).safeParse(req.body);
    if (!b.success) return reply.status(400).send({ error: b.error.issues[0]?.message ?? 'Invalid correction' });
    return run(reply, () => AxisLifecycle.correct(req.user, (req.params as any).id, b.data));
  });

  // ── Time corrections (migration 912) ──────────────────────────────────
  // HR and payroll see every correction; anyone else sees corrections to
  // their own time. Before/after values are the times themselves, not pay.
  fastify.get('/time-corrections', async (req, reply) => {
    const q = z.object({ status: z.enum(['NOT_NEEDED', 'PENDING', 'REVIEWED']).optional(), user_id: id.optional(), from: date.optional(), to: date.optional() }).safeParse(req.query);
    if (!q.success) return reply.status(400).send({ error: q.error.issues[0]?.message ?? 'Invalid filters' });
    const u = req.user;
    const all = HR_ADMIN_ROLES.includes(u.role) || (PAYROLL_READ_ROLES as readonly string[]).includes(u.role);
    const subject = all ? q.data.user_id : u.sub;
    const rows = await withTenant(u.tenant_id, (trx) => trx.selectFrom('hr_time_corrections as c')
      .innerJoin('users as w', (j) => j.onRef('w.id', '=', 'c.user_id').on('w.tenant_id', '=', u.tenant_id))
      .innerJoin('users as a', (j) => j.onRef('a.id', '=', 'c.corrected_by').on('a.tenant_id', '=', u.tenant_id))
      .leftJoin('users as r', (j) => j.onRef('r.id', '=', 'c.reviewed_by').on('r.tenant_id', '=', u.tenant_id))
      .leftJoin('payroll_runs as p', (j) => j.onRef('p.id', '=', 'c.payroll_run_id').on('p.tenant_id', '=', u.tenant_id))
      .selectAll('c')
      .select(['w.name as worker_name', 'w.avatar_url as worker_avatar_url', 'a.name as corrected_by_name', 'a.avatar_url as corrected_by_avatar_url',
               'r.name as reviewed_by_name', 'r.avatar_url as reviewed_by_avatar_url', 'p.name as payroll_run_name'])
      .where('c.tenant_id', '=', u.tenant_id)
      .$if(!!subject, (qb) => qb.where('c.user_id', '=', subject!))
      .$if(!!q.data.status, (qb) => qb.where('c.review_status', '=', q.data.status!))
      .$if(!!q.data.from, (qb) => qb.where('c.work_date', '>=', q.data.from! as any))
      .$if(!!q.data.to, (qb) => qb.where('c.work_date', '<=', q.data.to! as any))
      .orderBy('c.corrected_at', 'desc').limit(500).execute());
    return { data: rows, can_review: (PAYROLL_READ_ROLES as readonly string[]).includes(u.role) };
  });

  fastify.post('/time-corrections/:id/review', async (req, reply) => {
    const p = id.safeParse((req.params as any).id);
    const b = z.object({ outcome: z.enum(['NO_PAY_CHANGE', 'ADJUST_NEXT_RUN']), note: z.string().trim().max(2000).nullish() }).safeParse(req.body);
    if (!p.success || !b.success) return reply.status(400).send({ error: 'Choose an outcome for this correction' });
    try {
      return { data: await withTenant(req.user.tenant_id, (trx) => reviewTimeCorrection(trx, req.user, p.data, b.data.outcome, b.data.note ?? null)) };
    } catch (e: any) {
      if (e?.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message });
      throw e;
    }
  });
}
