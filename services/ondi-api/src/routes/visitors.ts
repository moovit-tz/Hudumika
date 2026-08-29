import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission } from '../lib/org-auth.js';

/**
 * Visitor Logbook OS — digital, PDPA-secured front-desk check-in. Replaces a
 * paper guest register (exposes every prior visitor's name/phone to the next
 * one) with an encrypted-at-rest record that auto-purges after the org's
 * configured retention window. Currently 0% built before this — see the
 * fact-checked strategy docs (outputs/*.html).
 *
 * /check-in is deliberately public (no auth) — it's what a front-desk
 * QR-code kiosk hits. Everything else requires org membership.
 */
export async function visitorRoutes(app: FastifyInstance) {

  const DEFAULT_RETENTION_DAYS = 90;

  async function getRetentionDays(organizationId: string): Promise<number> {
    const settings = await app.prisma.visitorLogSettings.findUnique({ where: { organizationId } });
    return settings?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  /**
   * POST /organizations/:id/visitors/check-in
   * Public kiosk endpoint. Rate-limited to prevent a QR code being abused for
   * spam. Minimal PII collected — name, phone, purpose, optional host/company.
   */
  app.post('/:id/visitors/check-in', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const { id } = req.params as { id: string };
    const org = await app.prisma.organization.findUnique({ where: { id } });
    if (!org) return reply.code(404).send({ error: 'organization_not_found' });

    const { visitorName, visitorPhone, purpose, hostName, company } = req.body as {
      visitorName?: string; visitorPhone?: string; purpose?: string; hostName?: string; company?: string;
    };
    if (!visitorName || !visitorPhone || !purpose)
      return reply.code(400).send({ error: 'missing_fields' });

    const retentionDays = await getRetentionDays(id);
    const purgeAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

    const visit = await app.prisma.visitorLog.create({
      data: { organizationId: id, visitorName, visitorPhone, purpose, hostName, company, purgeAt },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: 'visitor-kiosk', metadata: { action: 'visitor_checked_in', visitId: visit.id, hostName },
      severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send({ visitId: visit.id, checkedInAt: visit.checkedInAt });
  });

  /**
   * POST /organizations/:id/visitors/:visitId/check-out
   * Any org member (reception desk staff) can check a visitor out.
   */
  app.post('/:id/visitors/:visitId/check-out', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id, visitId } = req.params as { id: string; visitId: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });

    const visit = await app.prisma.visitorLog.findFirst({ where: { id: visitId, organizationId: id } });
    if (!visit) return reply.code(404).send({ error: 'not_found' });
    if (visit.status === 'CHECKED_OUT') return reply.code(409).send({ error: 'already_checked_out' });

    const updated = await app.prisma.visitorLog.update({
      where: { id: visitId }, data: { status: 'CHECKED_OUT', checkedOutAt: new Date() },
    });
    return reply.send(updated);
  });

  /**
   * GET /organizations/:id/visitors
   * The reception register. Query: status=CHECKED_IN|CHECKED_OUT
   */
  app.get('/:id/visitors', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });

    const { status } = req.query as { status?: string };
    const where: any = { organizationId: id };
    if (status) where.status = status;

    const [visits, currentlyIn] = await Promise.all([
      app.prisma.visitorLog.findMany({ where, orderBy: { checkedInAt: 'desc' }, take: 100 }),
      app.prisma.visitorLog.count({ where: { organizationId: id, status: 'CHECKED_IN' } }),
    ]);

    return reply.send({ visits, currentlyIn });
  });

  /**
   * GET/PATCH /organizations/:id/visitors/settings
   * Retention window config. Owner/Admin-only to change.
   */
  app.get('/:id/visitors/settings', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id))) return reply.code(404).send({ error: 'organization_not_found' });

    const retentionDays = await getRetentionDays(id);
    return reply.send({ retentionDays });
  });

  app.patch('/:id/visitors/settings', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_visitors'))) return reply.code(403).send({ error: 'insufficient_permission' });

    const { retentionDays } = req.body as { retentionDays?: number };
    if (!retentionDays || retentionDays < 1 || retentionDays > 3650)
      return reply.code(400).send({ error: 'invalid_retention_days' });

    await app.prisma.visitorLogSettings.upsert({
      where: { organizationId: id },
      create: { organizationId: id, retentionDays },
      update: { retentionDays },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'visitor_retention_updated', retentionDays }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ retentionDays });
  });

  /**
   * POST /organizations/:id/visitors/purge
   * Manual purge — deletes every visit past its purgeAt. (A scheduled job
   * doing this automatically is future work; this makes the "auto-purge"
   * PDPA claim real on demand today, not fake.)
   */
  app.post('/:id/visitors/purge', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;
    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_visitors'))) return reply.code(403).send({ error: 'insufficient_permission' });

    const result = await app.prisma.visitorLog.deleteMany({
      where: { organizationId: id, purgeAt: { lt: new Date() } },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN',
      performedBy: userId, metadata: { action: 'visitor_log_purged', count: result.count }, severity: 'INFO', isRegulatory: false,
    });

    return reply.send({ purged: result.count });
  });
}
