import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { ComplyService } from '../services/comply.service.js';
import { AGENCY_ADAPTERS } from '../integrations/comply-agencies.js';

export async function complyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('complyos'));

  // ── Dashboard ────────────────────────────────────────────────────────────────
  fastify.get('/dashboard', async (request: any, reply) => {
    try {
      return await ComplyService.getDashboardStats(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Certificates ─────────────────────────────────────────────────────────────
  fastify.get('/certificates', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      return await ComplyService.getCertificates(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Applications ─────────────────────────────────────────────────────────────
  fastify.get('/applications', async (request: any, reply) => {
    try {
      const { status } = request.query as { status?: string };
      return await ComplyService.getApplications(request.user.tenant_id, status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/applications', async (request: any, reply) => {
    try {
      return reply.status(201).send(
        await ComplyService.createApplication(request.user.tenant_id, request.user.id, request.body),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/applications/:id', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.updateApplication(request.user.tenant_id, id, request.body);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Obligations ──────────────────────────────────────────────────────────────
  fastify.get('/obligations', async (request: any, reply) => {
    try {
      return await ComplyService.getObligations(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Renewals ─────────────────────────────────────────────────────────────────
  fastify.get('/renewals', async (request: any, reply) => {
    try {
      return await ComplyService.getRenewals(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/renewals', async (request: any, reply) => {
    try {
      const { cert_id, trigger } = request.body as { cert_id: string; trigger?: 'automatic' | 'manual' };
      return reply.status(201).send(
        await ComplyService.startRenewal(request.user.tenant_id, cert_id, trigger ?? 'manual'),
      );
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/renewals/:id/approve', async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string };
      await ComplyService.approveRenewal(request.user.tenant_id, id, request.user.id);
      return { ok: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ── Agency Sync ──────────────────────────────────────────────────────────────
  fastify.post('/sync/:agencyCode', async (request: any, reply) => {
    try {
      const { agencyCode } = request.params as { agencyCode: string };
      const { tin } = request.body as { tin: string };
      if (!tin) return reply.status(400).send({ error: 'tin is required' });
      return await ComplyService.syncAgency(request.user.tenant_id, agencyCode, tin);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // List available agency integrations (public metadata)
  fastify.get('/agencies', async (_request, _reply) => {
    return Object.values(AGENCY_ADAPTERS).map(a => ({
      code:     a.code,
      name:     a.name,
      apiReady: a.apiReady,
    }));
  });
}
