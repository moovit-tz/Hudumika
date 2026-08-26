import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

const workflowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  min_amount: z.number().min(0),
  approver_user_id: z.string().uuid(),
  approver_backup_user_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

/** AP approval workflow configuration (M9). See ap-approval.service.ts's
 * header for the opt-in flag this is gated behind. */
export async function apApprovalWorkflowRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('ap_approval_workflows').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('min_amount', 'asc').execute()
    );
  });

  fastify.post('/', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = workflowSchema.parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      try {
        const row = await trx.insertInto('ap_approval_workflows').values({
          tenant_id: user.tenant_id, name: body.name, min_amount: String(body.min_amount),
          approver_user_id: body.approver_user_id, approver_backup_user_id: body.approver_backup_user_id || null,
          active: body.active ?? true, created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(row);
      } catch (e: any) {
        if (e?.code === '23505') return reply.status(409).send({ error: 'A workflow with this name already exists.' });
        throw e;
      }
    });
  });

  fastify.patch('/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = workflowSchema.partial().parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('ap_approval_workflows').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Workflow not found' });
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.min_amount !== undefined) updates.min_amount = String(body.min_amount);
      if (body.approver_user_id !== undefined) updates.approver_user_id = body.approver_user_id;
      if (body.approver_backup_user_id !== undefined) updates.approver_backup_user_id = body.approver_backup_user_id;
      if (body.active !== undefined) updates.active = body.active;
      return trx.updateTable('ap_approval_workflows').set(updates).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });

  fastify.delete('/:id', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('ap_approval_workflows').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Workflow not found' });
      await trx.deleteFrom('ap_approval_workflows').where('id', '=', id).execute();
      return { success: true };
    });
  });
}
