import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { mailProviderConfigSchema, checkMailProvider } from '../services/mail-provider.service.js';
import { saveWorkspaceMailProvider, resolveWorkspaceMailProvider } from '../services/workspace-mail-provider.service.js';

export function registerWorkspaceMailProviders(fastify: FastifyInstance) {
  const admin = { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') };
  fastify.get('/mail-providers', admin, async request => {
    const rows = await withTenant(request.user.tenant_id, trx => trx.selectFrom('tenant_mail_provider_connections').select(['kind', 'updated_at'])
      .where('tenant_id', '=', request.user.tenant_id).execute());
    return rows;
  });
  fastify.put('/mail-providers', admin, async request => {
    await saveWorkspaceMailProvider(request.user.tenant_id, mailProviderConfigSchema.parse(request.body));
    return { success: true };
  });
  fastify.post('/mail-providers/:kind/check', admin, async (request, reply) => {
    const { kind } = z.object({ kind: z.enum(['cpanel', 'google', 'microsoft']) }).parse(request.params);
    const { domain } = z.object({ domain: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/) }).parse(request.body);
    const config = await resolveWorkspaceMailProvider(request.user.tenant_id, kind);
    if (!config) return reply.status(400).send({ error: 'Save the provider credentials first.' });
    try { return await checkMailProvider(config, domain); }
    catch (error) { return reply.status(400).send({ error: error instanceof Error ? error.message : 'Provider check failed' }); }
  });
}
