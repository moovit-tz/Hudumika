import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LegalMarketplaceService } from '../services/comply-legal.service.js';

// Real values — packages/types/src/comply.ts's LegalEngagementStatus / LegalMilestoneStatus.
const engagementStatusSchema = z.object({
  status: z.enum(['requested', 'quoted', 'instructed', 'in_progress', 'milestone_due', 'completed', 'cancelled']),
});
const milestoneStatusSchema = z.object({ status: z.enum(['pending', 'paid', 'released']) });
const messageCreateSchema = z.object({ body: z.string().trim().min(1) });

export async function complyLegalRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));

  fastify.get('/firms', async (_request, reply) => {
    try {
      return await LegalMarketplaceService.getFirms();
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/engagements', async (request: any, reply) => {
    try {
      return await LegalMarketplaceService.getEngagements(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/engagements', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await LegalMarketplaceService.createEngagement(request.user.tenant_id, request.user.id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/engagements/:id', async (request: any, reply) => {
    const { status } = engagementStatusSchema.parse(request.body);
    try {
      const { id } = request.params as { id: string };
      await LegalMarketplaceService.updateEngagementStatus(request.user.tenant_id, id, status);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.delete('/engagements/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await LegalMarketplaceService.deleteEngagement(request.user.tenant_id, id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/engagements/:id/messages', async (request: any, reply) => {
    const { body } = messageCreateSchema.parse(request.body);
    try {
      const { id } = request.params as { id: string };
      return reply.status(201).send(
        await LegalMarketplaceService.addMessage(request.user.tenant_id, id, request.user.id, body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/engagements/:id/milestones/:milestoneId', async (request: any, reply) => {
    const { status } = milestoneStatusSchema.parse(request.body);
    try {
      const { id, milestoneId } = request.params as { id: string; milestoneId: string };
      await LegalMarketplaceService.setMilestoneStatus(request.user.tenant_id, id, milestoneId, status);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
