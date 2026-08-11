import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/rbac.js';
import { WorkflowEngineService, registeredEntityTypes } from '../services/workflow-engine.service.js';

const OPS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SENIOR', 'JUNIOR', 'OFFICER'] as const;

/**
 * Generic workflow engine over any entity (migration 222). ClearOS shipments
 * keep their own /shipments/:id/stage endpoint; this is the same machinery for
 * everything else — a HuduFreight trip, a SEAL lot, anything with a registered
 * entity provider.
 */
export async function workflowEngineRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  /** GET /entity-types — which entity types can run a workflow here. */
  fastify.get('/entity-types', async () => ({ data: registeredEntityTypes() }));

  /** POST /:entityType/:entityId/start { workflowId } */
  fastify.post('/:entityType/:entityId/start', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const { workflowId } = request.body as { workflowId: string };
    if (!workflowId) return reply.status(400).send({ error: 'workflowId is required' });
    try {
      const inst = await WorkflowEngineService.start(user.tenant_id, { entityType, entityId, workflowId, actorId: user.sub });
      return { success: true, instance: inst };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /** POST /:entityType/:entityId/advance { toStepId, note } */
  fastify.post('/:entityType/:entityId/advance', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const { toStepId, note } = request.body as { toStepId: string; note?: string };
    if (!toStepId) return reply.status(400).send({ error: 'toStepId is required' });
    try {
      const res = await WorkflowEngineService.advance(user.tenant_id, { entityType, entityId, toStepId, actorId: user.sub, note });
      return res;
    } catch (err: any) {
      // A blocked transition is a normal, expected answer — 409, not 500.
      return reply.status(err.workflowBlocked ? 409 : 400).send({ error: err.message });
    }
  });

  /** GET /:entityType/:entityId/state */
  fastify.get('/:entityType/:entityId/state', { preHandler: requireRole(...OPS_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const state = await WorkflowEngineService.getState(user.tenant_id, entityType, entityId);
    if (!state) return reply.status(404).send({ error: 'No workflow instance for this entity.' });
    return state;
  });
}
