import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrivacyPolicyError, PrivacyPolicyService } from '../services/privacy-policy.service.js';

const acknowledgementSchema = z.object({
  policy_version_id: z.string().uuid(),
  locale: z.string().min(2).max(20).default('en'),
});

export async function privacyPolicyRoutes(fastify: FastifyInstance) {
  fastify.get('/current', async (_request, reply) => {
    try {
      const row = await PrivacyPolicyService.currentVersion();
      return { id: row.id, version: row.version, title: row.title, effective_at: row.effective_at, content_hash: row.content_hash };
    } catch (error) {
      if (error instanceof PrivacyPolicyError) return reply.status(error.status).send({ error: error.message });
      throw error;
    }
  });

  fastify.get('/status', { preHandler: fastify.authenticate }, async request =>
    PrivacyPolicyService.status(request.user.tenant_id, request.user.sub));

  fastify.post('/acknowledge', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = acknowledgementSchema.parse(request.body);
    try {
      await PrivacyPolicyService.acknowledge(request.user.tenant_id, request.user.sub, body.policy_version_id, 'in_app', body.locale);
      return reply.status(201).send({ success: true });
    } catch (error) {
      if (error instanceof PrivacyPolicyError) return reply.status(error.status).send({ error: error.message });
      throw error;
    }
  });
}
