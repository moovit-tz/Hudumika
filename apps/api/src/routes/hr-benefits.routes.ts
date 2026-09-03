/**
 * Benefits administration — confirmed entirely absent in the audit (no
 * health insurance or retirement-plan enrollment tracking anywhere).
 * Plan management is MGMT_ROLES; enrollment is real self-service, same
 * precedent as MyHub's own payslip/leave-balance self-service — an
 * employee enrolls in or waives a plan themself, and MGMT can act on
 * anyone's behalf too (onboarding someone into benefits on their first day,
 * say).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;
const isMgmt = (role: string) => (MGMT as readonly string[]).includes(role);

const planSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['health', 'retirement', 'life', 'other']),
  provider: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  employee_cost: z.number().min(0).default(0),
  employer_cost: z.number().min(0).default(0),
  currency: z.string().trim().max(10).default('TZS'),
});

export async function hrBenefitsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));

  // ── Plans ────────────────────────────────────────────────────
  fastify.get('/plans', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx =>
      trx.selectFrom('hr_benefit_plans').selectAll()
        .where('tenant_id', '=', user.tenant_id)
        .where('active', '=', true)
        .orderBy('type').orderBy('name').execute()
    );
  });

  fastify.post('/plans', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    const body = planSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const created = await trx.insertInto('hr_benefit_plans').values({
        tenant_id: user.tenant_id, name: body.name, type: body.type,
        provider: body.provider ?? null, description: body.description ?? null,
        employee_cost: String(body.employee_cost), employer_cost: String(body.employer_cost),
        currency: body.currency,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return created;
    });
  });

  fastify.patch<{ Params: { id: string } }>('/plans/:id', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const body = planSchema.partial().extend({ active: z.boolean().optional() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const update: Record<string, any> = { updated_at: new Date() };
      for (const [k, v] of Object.entries(body)) {
        if (v === undefined) continue;
        update[k] = (k === 'employee_cost' || k === 'employer_cost') ? String(v) : v;
      }
      const updated = await trx.updateTable('hr_benefit_plans').set(update)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Plan not found' });
      return updated;
    });
  });

  fastify.delete<{ Params: { id: string } }>('/plans/:id', { preHandler: requireRole(...MGMT) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    return withTenant(user.tenant_id, async (trx) => {
      // Soft-delete: retiring a plan must not orphan or silently vanish the
      // enrollment history of anyone already on it.
      const updated = await trx.updateTable('hr_benefit_plans').set({ active: false, updated_at: new Date() })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returning('id').executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Plan not found' });
      return { success: true };
    });
  });

  // ── Enrollments ──────────────────────────────────────────────
  fastify.get<{ Querystring: { employee_id?: string; plan_id?: string } }>('/enrollments', { preHandler: requireRole(...MGMT) }, async (request) => {
    const user = request.user;
    const { employee_id, plan_id } = request.query;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('hr_benefit_enrollments as e')
        .innerJoin('users as u', 'u.id', 'e.employee_id')
        .innerJoin('hr_benefit_plans as p', 'p.id', 'e.plan_id')
        .select([
          'e.id', 'e.employee_id', 'e.plan_id', 'e.status', 'e.dependents', 'e.enrolled_at', 'e.terminated_at',
          'u.name as employee_name', 'p.name as plan_name', 'p.type as plan_type',
        ])
        .where('e.tenant_id', '=', user.tenant_id)
        .orderBy('e.enrolled_at', 'desc');
      if (employee_id) q = q.where('e.employee_id', '=', employee_id);
      if (plan_id) q = q.where('e.plan_id', '=', plan_id);
      return q.execute();
    });
  });

  // GET /my-enrollments — self-service, same MyHub precedent as payslips/leave balances
  fastify.get('/my-enrollments', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, trx =>
      trx.selectFrom('hr_benefit_enrollments as e')
        .innerJoin('hr_benefit_plans as p', 'p.id', 'e.plan_id')
        .select(['e.id', 'e.plan_id', 'e.status', 'e.dependents', 'e.enrolled_at', 'e.terminated_at', 'p.name as plan_name', 'p.type as plan_type', 'p.provider', 'p.employee_cost', 'p.currency'])
        .where('e.tenant_id', '=', user.tenant_id).where('e.employee_id', '=', user.sub)
        .execute()
    );
  });

  const enrollSchema = z.object({ plan_id: z.string().uuid(), employee_id: z.string().uuid().optional(), dependents: z.number().int().min(0).max(20).default(0), notes: z.string().trim().max(500).optional() });
  fastify.post('/enrollments', async (request, reply) => {
    const user = request.user;
    const body = enrollSchema.parse(request.body);
    // Self-enrollment is always allowed; enrolling someone ELSE requires MGMT.
    const employeeId = body.employee_id ?? user.sub;
    if (employeeId !== user.sub && !isMgmt(user.role)) {
      return reply.status(403).send({ error: 'Only a manager can enroll someone else.' });
    }
    return withTenant(user.tenant_id, async (trx) => {
      const plan = await trx.selectFrom('hr_benefit_plans').select('id').where('id', '=', body.plan_id).where('tenant_id', '=', user.tenant_id).where('active', '=', true).executeTakeFirst();
      if (!plan) return reply.status(404).send({ error: 'Plan not found or no longer offered.' });
      const employee = await trx.selectFrom('users').select('id').where('id', '=', employeeId).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!employee) return reply.status(404).send({ error: 'Employee not found.' });

      const enrollment = await trx.insertInto('hr_benefit_enrollments').values({
        tenant_id: user.tenant_id, employee_id: employeeId, plan_id: body.plan_id,
        dependents: body.dependents, notes: body.notes ?? null,
      })
        .onConflict(oc => oc.columns(['tenant_id', 'employee_id', 'plan_id']).doUpdateSet({
          status: 'enrolled', dependents: body.dependents, notes: body.notes ?? null, terminated_at: null,
        }))
        .returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return enrollment;
    });
  });

  fastify.patch<{ Params: { id: string }; Body: { status: string } }>('/enrollments/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const { status } = z.object({ status: z.enum(['enrolled', 'waived', 'terminated']) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('hr_benefit_enrollments').select('employee_id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Enrollment not found' });
      if (existing.employee_id !== user.sub && !isMgmt(user.role)) {
        return reply.status(403).send({ error: 'Only a manager can change someone else\'s enrollment.' });
      }
      const updated = await trx.updateTable('hr_benefit_enrollments')
        .set({ status, terminated_at: status === 'terminated' ? new Date() : null })
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      return updated;
    });
  });
}
