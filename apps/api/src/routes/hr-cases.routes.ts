/**
 * Disciplinary / case management.
 *
 * MGMT_ROLES-only throughout, deliberately — this is HR/manager working
 * data about a person (a warning, a PIP, a grievance), not a personal
 * record the subject browses the way they do their own payslips or leave
 * balance. That's a real scope decision, not an oversight: an employee's
 * own view of cases raised against them is a separate, harder question
 * (does it show before or after resolution? redacted how?) this pass
 * doesn't answer.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from '../services/domain-events.service.js';

const MGMT = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

const CASE_TYPES = ['verbal_warning', 'written_warning', 'pip', 'suspension', 'termination', 'grievance', 'other'] as const;
const caseCreateSchema = z.object({
  employee_id: z.string().uuid(),
  case_type: z.enum(CASE_TYPES),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
});
const caseUpdateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  resolution: z.string().trim().max(4000).optional(),
});
const noteSchema = z.object({ note: z.string().trim().min(1).max(4000) });

export async function hrCasesRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('nexushr'));
  fastify.addHook('preHandler', requireRole(...MGMT));

  // GET /?employee_id=&status= — list, most recent first
  fastify.get<{ Querystring: { employee_id?: string; status?: string } }>('/', async (request) => {
    const user = request.user;
    const { employee_id, status } = request.query;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('hr_cases as c')
        .innerJoin('users as e', 'e.id', 'c.employee_id')
        .leftJoin('users as o', 'o.id', 'c.opened_by')
        .select([
          'c.id', 'c.employee_id', 'c.case_type', 'c.title', 'c.severity', 'c.status',
          'c.created_at', 'c.updated_at', 'c.resolved_at',
          'e.name as employee_name', 'o.name as opened_by_name',
        ])
        .where('c.tenant_id', '=', user.tenant_id)
        .orderBy('c.created_at', 'desc');
      if (employee_id) q = q.where('c.employee_id', '=', employee_id);
      if (status) q = q.where('c.status', '=', status as 'open' | 'in_progress' | 'resolved' | 'closed');
      return q.execute();
    });
  });

  fastify.post('/', async (request, reply) => {
    const user = request.user;
    const body = caseCreateSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const employee = await trx.selectFrom('users').select('id').where('id', '=', body.employee_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!employee) return reply.status(404).send({ error: 'Employee not found in this workspace.' });

      const created = await trx.insertInto('hr_cases').values({
        tenant_id: user.tenant_id, employee_id: body.employee_id, case_type: body.case_type,
        title: body.title, description: body.description ?? null, severity: body.severity,
        opened_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      await emitDomainEvent(trx, user.tenant_id, {
        type: 'hr.case_opened', sourceApp: 'nexushr', entityType: 'hr_case', entityId: created.id,
        actorId: user.sub, payload: { employee_id: body.employee_id, case_type: body.case_type, title: body.title },
      });

      reply.status(201);
      return created;
    });
  });

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    return withTenant(user.tenant_id, async (trx) => {
      const item = await trx.selectFrom('hr_cases as c')
        .innerJoin('users as e', 'e.id', 'c.employee_id')
        .leftJoin('users as o', 'o.id', 'c.opened_by')
        .select([
          'c.id', 'c.employee_id', 'c.case_type', 'c.title', 'c.description', 'c.severity', 'c.status',
          'c.resolution', 'c.created_at', 'c.updated_at', 'c.resolved_at',
          'e.name as employee_name', 'e.email as employee_email', 'o.name as opened_by_name',
        ])
        .where('c.id', '=', id).where('c.tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!item) return reply.status(404).send({ error: 'Case not found' });

      const notes = await trx.selectFrom('hr_case_notes as n')
        .leftJoin('users as a', 'a.id', 'n.author_id')
        .select(['n.id', 'n.note', 'n.created_at', 'a.name as author_name'])
        .where('n.case_id', '=', id).where('n.tenant_id', '=', user.tenant_id)
        .orderBy('n.created_at', 'asc').execute();

      return { ...item, notes };
    });
  });

  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const body = caseUpdateSchema.parse(request.body);
    if (Object.keys(body).length === 0) return reply.status(400).send({ error: 'Nothing to update.' });

    return withTenant(user.tenant_id, async (trx) => {
      const update: Record<string, any> = { ...body, updated_at: new Date() };
      // Resolving/closing stamps resolved_at once; reopening clears it rather
      // than leaving a stale timestamp on a case that's active again.
      if (body.status === 'resolved' || body.status === 'closed') update.resolved_at = new Date();
      else if (body.status === 'open' || body.status === 'in_progress') update.resolved_at = null;

      const updated = await trx.updateTable('hr_cases').set(update)
        .where('id', '=', id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirst();
      if (!updated) return reply.status(404).send({ error: 'Case not found' });

      if (body.status) {
        await emitDomainEvent(trx, user.tenant_id, {
          type: 'hr.case_status_changed', sourceApp: 'nexushr', entityType: 'hr_case', entityId: id,
          actorId: user.sub, payload: { employee_id: updated.employee_id, status: body.status },
        });
      }
      return updated;
    });
  });

  fastify.post<{ Params: { id: string } }>('/:id/notes', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const { note } = noteSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const kase = await trx.selectFrom('hr_cases').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!kase) return reply.status(404).send({ error: 'Case not found' });
      const created = await trx.insertInto('hr_case_notes').values({
        tenant_id: user.tenant_id, case_id: id, author_id: user.sub, note,
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return created;
    });
  });
}
