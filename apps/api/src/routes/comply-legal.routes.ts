import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LegalMarketplaceService } from '../services/comply-legal.service.js';
import { requireRoleOrOrgPermission, ORG_PERMISSIONS } from '../lib/org-rbac.js';
import type { UserRole } from '@hudumika/types';

// Real values — packages/types/src/comply.ts's LegalEngagementStatus / LegalMilestoneStatus.
const engagementStatusSchema = z.object({
  status: z.enum(['requested', 'quoted', 'instructed', 'in_progress', 'milestone_due', 'completed', 'cancelled']),
});
const milestoneStatusSchema = z.object({ status: z.enum(['pending', 'paid', 'released']) });
const messageCreateSchema = z.object({ body: z.string().trim().min(1) });

// Same role set as comply.routes.ts's own MGMT_ROLES (and the frontend's
// MGMT_ROLES in apps/web/src/lib/permissions.ts) — kept local for the same
// reason that file does.
const MGMT_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'];

export async function complyLegalRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('complyos'));
  // Production-readiness audit HUD-0024: this file had nothing beyond the
  // entitlement check — any authenticated tenant user (including a
  // CUSTOMER-portal account) could create/cancel legal engagements, message
  // a law firm on the tenant's behalf, and flip milestone payment status.
  // comply.routes.ts (the sibling ComplyOS file) already carries this exact
  // guard from an earlier audit pass; this file was missed.
  fastify.addHook('preHandler', requireRoleOrOrgPermission(ORG_PERMISSIONS.COMPLY_MANAGE, ...MGMT_ROLES));

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
        await LegalMarketplaceService.createEngagement(request.user.tenant_id, request.user.sub, request.body),
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
        await LegalMarketplaceService.addMessage(request.user.tenant_id, id, request.user.sub, body),
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
