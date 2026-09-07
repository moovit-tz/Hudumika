import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { INTERNAL_ROLES, type UserRole } from '@hudumika/types';

/**
 * Backs Escalations.tsx (Bliss) — previously a page that stored every
 * escalation entirely in the calling browser's localStorage, so a junior
 * officer's escalation was invisible to anyone but themself on their own
 * machine. See migration 406.
 */

const RESOLVE_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR'];
// JUNIOR/OFFICER only ever see their own escalations — matching the page's
// existing framing ("Your escalated cases") — enforced here, not just by
// the frontend hiding the rest.
const OWN_ONLY_ROLES: UserRole[] = ['JUNIOR', 'OFFICER'];

const createSchema = z.object({
  caseId: z.string().uuid().optional(),
  caseRef: z.string().trim().min(1).max(100),
  goodsDesc: z.string().max(2000).optional(),
  reason: z.string().trim().min(1).max(200),
  note: z.string().max(5000).optional(),
});

export default async function escalationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('bliss'));
  fastify.addHook('preHandler', requireRole(...INTERNAL_ROLES));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('case_escalations').selectAll().where('tenant_id', '=', user.tenant_id);
      if (OWN_ONLY_ROLES.includes(user.role)) {
        q = q.where('escalated_by', '=', user.sub);
      }
      return q.orderBy('escalated_at', 'desc').execute();
    });
  });

  fastify.post<{ Body: z.infer<typeof createSchema> }>('/', async (request, reply) => {
    const user = request.user;
    const body = createSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid escalation' });

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('case_escalations').values({
        tenant_id: user.tenant_id,
        case_id: body.data.caseId ?? null,
        case_ref: body.data.caseRef,
        goods_desc: body.data.goodsDesc ?? null,
        reason: body.data.reason,
        note: body.data.note ?? null,
        escalated_by: user.sub,
        escalated_by_name: user.name,
        status: 'PENDING',
      }).returningAll().executeTakeFirstOrThrow();
      reply.status(201);
      return row;
    });
  });

  // Advances PENDING -> IN_PROGRESS -> RESOLVED one step, matching the
  // single "Accept & Work" / "Mark Resolved" button the frontend already
  // has — there's no separate "set to any status" control to back.
  fastify.patch<{ Params: { id: string } }>('/:id/advance', { preHandler: [requireRole(...RESOLVE_ROLES)] }, async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const esc = await trx.selectFrom('case_escalations').selectAll()
        .where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!esc) return reply.status(404).send({ error: 'Escalation not found' });
      if (esc.status === 'RESOLVED') return reply.status(409).send({ error: 'Already resolved' });

      const nextStatus = esc.status === 'PENDING' ? 'IN_PROGRESS' : 'RESOLVED';
      const updated = await trx.updateTable('case_escalations').set({
        status: nextStatus,
        ...(nextStatus === 'RESOLVED' ? { resolved_at: new Date(), resolved_by: user.sub } : {}),
        updated_at: new Date(),
      }).where('id', '=', request.params.id).where('tenant_id', '=', user.tenant_id)
        .returningAll().executeTakeFirstOrThrow();
      return updated;
    });
  });
}
