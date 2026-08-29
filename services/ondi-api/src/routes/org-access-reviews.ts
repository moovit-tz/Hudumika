import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, requirePermission, assertOrgSecurityPolicy } from '../lib/org-auth.js';
import { createAccessReviewCampaign } from '../lib/access-review.js';

/**
 * Access Review Campaigns — the JML→Identity Governance piece Entra/Okta
 * call "access reviews": snapshot every current UserRole grant in the org,
 * have a manager decide APPROVED/REVOKED per item. A REVOKED decision
 * reuses the exact same real deprovisioning path org-automation.ts's
 * OFFBOARDING flow already proves out (Ondi membership removal +
 * Authentik session revoke + deprovision) — not a second, disconnected
 * implementation. Campaigns can be started on-demand (below) or on a
 * recurring schedule (AccessReviewSchedule CRUD below + the
 * access-review-scheduler worker in plugins/queue.ts), both calling the
 * same lib/access-review.ts function.
 */
export async function orgAccessReviewRoutes(app: FastifyInstance) {

  /**
   * POST /organizations/:id/access-reviews
   * Manager-only. Body: { name?: string }. Snapshots every current
   * UserRole grant in the org into AccessReviewItem rows.
   */
  app.post('/:id/access-reviews', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access_reviews')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name } = (req.body ?? {}) as { name?: string };

    const campaign = await createAccessReviewCampaign(app, id, name, userId);
    if (!campaign) return reply.code(409).send({ error: 'no_active_grants' });

    return reply.code(201).send({ id: campaign.id, name: campaign.name, status: campaign.status, itemCount: campaign.items.length });
  });

  /**
   * GET /organizations/:id/access-reviews
   */
  app.get('/:id/access-reviews', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const campaigns = await app.prisma.accessReviewCampaign.findMany({
      where: { organizationId: id },
      include: { items: true },
      orderBy: { startedAt: 'desc' },
    });

    return reply.send({
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        startedAt: c.startedAt,
        completedAt: c.completedAt,
        itemCount: c.items.length,
        pendingCount: c.items.filter(i => i.decision === 'PENDING').length,
        approvedCount: c.items.filter(i => i.decision === 'APPROVED').length,
        revokedCount: c.items.filter(i => i.decision === 'REVOKED').length,
      })),
    });
  });

  /**
   * GET /organizations/:id/access-reviews/:campaignId
   */
  app.get('/:id/access-reviews/:campaignId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, campaignId } = req.params as { id: string; campaignId: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const campaign = await app.prisma.accessReviewCampaign.findFirst({
      where: { id: campaignId, organizationId: id },
      include: { items: { orderBy: { userName: 'asc' } } },
    });
    if (!campaign) return reply.code(404).send({ error: 'campaign_not_found' });

    return reply.send({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      items: campaign.items.map(i => ({
        id: i.id,
        userId: i.userId,
        userName: i.userName,
        roleName: i.roleName,
        decision: i.decision,
        decidedBy: i.decidedBy,
        decidedAt: i.decidedAt,
        notes: i.notes,
      })),
    });
  });

  /**
   * PATCH /organizations/:id/access-reviews/:campaignId/items/:itemId
   * Manager-only. Body: { decision: 'APPROVED' | 'REVOKED', notes?: string }
   * REVOKED triggers real deprovisioning — same chain as org-automation.ts's
   * OFFBOARDING flow: remove UserRole (if still present) + Authentik
   * session revoke + deprovision.
   */
  app.patch('/:id/access-reviews/:campaignId/items/:itemId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, campaignId, itemId } = req.params as { id: string; campaignId: string; itemId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access_reviews')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { decision, notes } = req.body as { decision?: string; notes?: string };
    if (decision !== 'APPROVED' && decision !== 'REVOKED')
      return reply.code(400).send({ error: 'invalid_decision' });

    const campaign = await app.prisma.accessReviewCampaign.findFirst({ where: { id: campaignId, organizationId: id } });
    if (!campaign) return reply.code(404).send({ error: 'campaign_not_found' });
    if (campaign.status === 'COMPLETED') return reply.code(409).send({ error: 'campaign_completed' });

    const item = await app.prisma.accessReviewItem.findFirst({ where: { id: itemId, campaignId } });
    if (!item) return reply.code(404).send({ error: 'item_not_found' });
    if (item.decision !== 'PENDING') return reply.code(409).send({ error: 'item_already_decided' });

    await app.prisma.accessReviewItem.update({
      where: { id: item.id },
      data: { decision, decidedBy: userId, decidedAt: new Date(), notes: notes?.trim() || undefined },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'IDENTITY', organizationId: id,
      performedBy: userId, metadata: { action: 'access_review_decision', campaignId, itemId, decision, subjectUserId: item.userId }, severity: decision === 'REVOKED' ? 'WARNING' : 'INFO', isRegulatory: false,
    });

    if (decision === 'REVOKED') {
      // Real JML deprovisioning — reuses the exact chain proven in
      // org-automation.ts's OFFBOARDING block. Failure here doesn't roll
      // back the review decision above; Ondi-side removal (if still a
      // member) is the source of truth regardless of Authentik reachability.
      try {
        const membership = await app.prisma.userRole.findFirst({
          where: { userId: item.userId, organizationId: id },
          include: { user: { select: { email: true, ondi: true } } },
        });
        if (membership) {
          await app.prisma.authSession.updateMany({
            where: { userId: item.userId, expiresAt: { gt: new Date() } },
            data: { expiresAt: new Date() },
          });
          await app.prisma.userRole.delete({ where: { id: membership.id } });
          await app.audit.write({
            entityType: 'ORG', entityId: id, action: 'MEMBER_REMOVED', category: 'IDENTITY', organizationId: id,
            performedBy: 'system:access_review', metadata: { memberId: item.userId, campaignId, itemId }, severity: 'WARNING', isRegulatory: false,
          });

          const userPk = await app.authentik.getUserPkByEmailOrEmployeeId(membership.user.email ?? undefined, item.userId);
          if (userPk) {
            await app.authentik.revokeSessions(membership.user.email || membership.user.ondi, userPk);
            await app.authentik.deprovisionUser(userPk);
            await app.audit.write({
              entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'ADMIN', organizationId: id,
              performedBy: 'system:access_review', metadata: { action: 'authentik_deprovision', memberId: item.userId, authentikUserId: userPk, campaignId, itemId },
              severity: 'INFO', isRegulatory: false,
            });
          }
        }
      } catch (authErr) {
        app.log.error(authErr, 'Failed to deprovision member during access review revoke');
      }
    }

    const remaining = await app.prisma.accessReviewItem.count({ where: { campaignId, decision: 'PENDING' } });
    if (remaining === 0) {
      await app.prisma.accessReviewCampaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await app.audit.write({
        entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'IDENTITY', organizationId: id,
        performedBy: userId, metadata: { action: 'access_review_completed', campaignId }, severity: 'INFO', isRegulatory: false,
      });
    }

    return reply.send({ updated: true });
  });

  const VALID_INTERVALS = [30, 60, 90, 180];

  /**
   * GET /organizations/:id/access-reviews/schedule
   */
  app.get('/:id/access-reviews/schedule', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const schedules = await app.prisma.accessReviewSchedule.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({ schedules });
  });

  /**
   * POST /organizations/:id/access-reviews/schedule
   * Requires org:manage_access_reviews. Body: { name?, intervalDays: 30|60|90|180 }
   */
  app.post('/:id/access-reviews/schedule', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access_reviews')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const { name, intervalDays } = req.body as { name?: string; intervalDays?: number };
    if (!VALID_INTERVALS.includes(intervalDays as number))
      return reply.code(400).send({ error: 'invalid_interval', allowed: VALID_INTERVALS });

    const schedule = await app.prisma.accessReviewSchedule.create({
      data: {
        organizationId: id,
        name: name?.trim() || `Recurring review — every ${intervalDays} days`,
        intervalDays: intervalDays as number,
        nextRunAt: new Date(Date.now() + (intervalDays as number) * 24 * 60 * 60 * 1000),
      },
    });

    await app.audit.write({
      entityType: 'ORG', entityId: id, action: 'ADMIN_UPDATE', category: 'IDENTITY', organizationId: id,
      performedBy: userId, metadata: { action: 'access_review_schedule_created', scheduleId: schedule.id, intervalDays }, severity: 'INFO', isRegulatory: false,
    });

    return reply.code(201).send(schedule);
  });

  /**
   * PATCH /organizations/:id/access-reviews/schedule/:scheduleId
   * Requires org:manage_access_reviews. Body: { isEnabled?, intervalDays? }
   */
  app.patch('/:id/access-reviews/schedule/:scheduleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, scheduleId } = req.params as { id: string; scheduleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access_reviews')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const schedule = await app.prisma.accessReviewSchedule.findFirst({ where: { id: scheduleId, organizationId: id } });
    if (!schedule) return reply.code(404).send({ error: 'schedule_not_found' });

    const { isEnabled, intervalDays } = req.body as { isEnabled?: boolean; intervalDays?: number };
    const data: any = {};
    if (isEnabled !== undefined) data.isEnabled = isEnabled;
    if (intervalDays !== undefined) {
      if (!VALID_INTERVALS.includes(intervalDays))
        return reply.code(400).send({ error: 'invalid_interval', allowed: VALID_INTERVALS });
      data.intervalDays = intervalDays;
      data.nextRunAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
    }
    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'no_fields_to_update' });

    await app.prisma.accessReviewSchedule.update({ where: { id: scheduleId }, data });
    return reply.send({ updated: true });
  });

  /**
   * DELETE /organizations/:id/access-reviews/schedule/:scheduleId
   */
  app.delete('/:id/access-reviews/schedule/:scheduleId', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id, scheduleId } = req.params as { id: string; scheduleId: string };
    if (!(await requirePermission(app, userId, id, 'org:manage_access_reviews')))
      return reply.code(403).send({ error: 'insufficient_permission' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    const schedule = await app.prisma.accessReviewSchedule.findFirst({ where: { id: scheduleId, organizationId: id } });
    if (!schedule) return reply.code(404).send({ error: 'schedule_not_found' });

    await app.prisma.accessReviewSchedule.delete({ where: { id: scheduleId } });
    return reply.send({ removed: true });
  });
}
