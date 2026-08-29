import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';

const DEFAULT_FRAMEWORKS = ['ISO 27001', 'SOC 2 Type II', 'GDPR', 'PCI DSS'];

/** Idempotent — seeds honest NOT_STARTED rows so the page isn't empty; no fabricated certifications. */
async function ensureDefaultFrameworks(app: FastifyInstance, organizationId: string) {
  const existing = await app.prisma.complianceItem.findMany({ where: { organizationId } });
  if (existing.length > 0) return;
  await app.prisma.$transaction(
    DEFAULT_FRAMEWORKS.map(framework => app.prisma.complianceItem.upsert({
      where: { organizationId_framework: { organizationId, framework } },
      create: { organizationId, framework },
      update: {},
    })),
  );
}

export async function orgComplianceRoutes(app: FastifyInstance) {

  /**
   * GET /organizations/:id/compliance/frameworks
   */
  app.get('/:id/compliance/frameworks', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    await ensureDefaultFrameworks(app, id);

    const [items, kyb] = await Promise.all([
      app.prisma.complianceItem.findMany({ where: { organizationId: id }, orderBy: { framework: 'asc' } }),
      app.prisma.kYBRecord.findFirst({ where: { organizationId: id }, orderBy: { createdAt: 'desc' } }),
    ]);

    const complianceRate = items.length
      ? Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length)
      : 0;

    return reply.send({
      complianceRate,
      kyb: kyb ? { status: kyb.status, verifiedAt: kyb.verifiedAt } : null,
      frameworks: items.map(i => ({
        id:        i.id,
        framework: i.framework,
        status:    i.status,
        score:     i.score,
        expiresAt: i.expiresAt,
        updatedAt: i.updatedAt,
      })),
    });
  });

  /**
   * PATCH /organizations/:id/compliance/frameworks/:itemId
   * Owner/Admin-only self-attestation. Body: { status?, score?, expiresAt? }
   */
  app.patch('/:id/compliance/frameworks/:itemId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, itemId } = req.params as { id: string; itemId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_compliance')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const item = await app.prisma.complianceItem.findFirst({ where: { id: itemId, organizationId: id } });
    if (!item) return reply.code(404).send({ error: 'framework_not_found' });

    const { status, score, expiresAt } = req.body as { status?: string; score?: number; expiresAt?: string | null };
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (score !== undefined) data.score = Math.max(0, Math.min(100, score));
    if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

    await app.prisma.complianceItem.update({ where: { id: itemId }, data });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'IDENTITY',
      performedBy: userId, metadata: { framework: item.framework, ...data }, severity: 'INFO', isRegulatory: true,
    });

    return reply.send({ updated: true });
  });

  /**
   * GET /organizations/:id/compliance/events
   * Real regulatory-relevant events from the org's audit trail — replaces
   * fabricated "audited by Ernst & Young" style history with what actually
   * happened.
   */
  app.get('/:id/compliance/events', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const events = await app.prisma.auditLog.findMany({
      where: { entityType: 'ORG', entityId: id, isRegulatory: true },
      orderBy: { timestamp: 'desc' },
      take: 20,
    });

    return reply.send({
      events: events.map(e => ({
        id:        e.id,
        action:    e.action,
        severity:  e.severity,
        metadata:  e.metadata,
        timestamp: e.timestamp,
      })),
    });
  });
}
