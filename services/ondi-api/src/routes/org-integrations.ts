import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

/**
 * Org integration registry. There is no live OAuth connection to
 * Google Workspace/GitHub/Slack/etc. here — wiring those up for real would
 * require registering OAuth apps with each vendor and holding their
 * credentials, which is out of scope for this codebase. What's real is the
 * registry itself: an admin records a connection, its status, and when it
 * last synced; nothing here is fabricated demo data.
 */
export async function orgIntegrationsRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/integrations
   */
  app.get('/:id/integrations', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const integrations = await app.prisma.orgIntegration.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      summary: {
        connected:    integrations.filter(i => i.status === 'CONNECTED').length,
        warning:      integrations.filter(i => i.status === 'WARNING').length,
        disconnected: integrations.filter(i => i.status === 'DISCONNECTED').length,
      },
      integrations: integrations.map(i => ({
        id:          i.id,
        name:        i.name,
        category:    i.category,
        status:      i.status,
        connectedAt: i.connectedAt,
        lastSyncAt:  i.lastSyncAt,
      })),
    });
  });

  /**
   * POST /organizations/:id/integrations
   * Owner/Admin-only. Body: { name, category }
   */
  app.post('/:id/integrations', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_integrations')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, category } = req.body as { name?: string; category?: string };
    if (!name || !category) return reply.code(400).send({ error: 'missing_fields' });

    const integration = await app.prisma.orgIntegration.create({
      data: { organizationId: id, name, category },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { integrationId: integration.id, name, action: 'added' }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ id: integration.id });
  });

  /**
   * PATCH /organizations/:id/integrations/:integrationId
   * Owner/Admin-only. Body: { status? } — connecting/disconnecting is a
   * self-attested toggle since there's no live vendor OAuth handshake.
   */
  app.patch('/:id/integrations/:integrationId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, integrationId } = req.params as { id: string; integrationId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_integrations')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const integration = await app.prisma.orgIntegration.findFirst({ where: { id: integrationId, organizationId: id } });
    if (!integration) return reply.code(404).send({ error: 'integration_not_found' });

    const { status } = req.body as { status?: string };
    if (!status) return reply.code(400).send({ error: 'missing_fields' });

    const data: any = { status };
    if (status === 'CONNECTED') { data.connectedAt = new Date(); data.lastSyncAt = new Date(); }
    if (status === 'DISCONNECTED') { data.connectedAt = null; data.lastSyncAt = null; }

    await app.prisma.orgIntegration.update({ where: { id: integrationId }, data });
    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/integrations/:integrationId
   * Owner/Admin-only.
   */
  app.delete('/:id/integrations/:integrationId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, integrationId } = req.params as { id: string; integrationId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_integrations')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const integration = await app.prisma.orgIntegration.findFirst({ where: { id: integrationId, organizationId: id } });
    if (!integration) return reply.code(404).send({ error: 'integration_not_found' });

    await app.prisma.orgIntegration.delete({ where: { id: integrationId } });
    return reply.send({ removed: true });
  });
}
