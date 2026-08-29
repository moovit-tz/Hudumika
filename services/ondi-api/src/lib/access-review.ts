import type { FastifyInstance } from 'fastify';

/**
 * Snapshots every current UserRole grant in the org into a new
 * AccessReviewCampaign + AccessReviewItem rows. Shared by the on-demand
 * POST /organizations/:id/access-reviews route and the recurring scheduler
 * job (plugins/queue.ts) — one implementation, two callers, so a scheduled
 * run behaves identically to a human-triggered one.
 */
export async function createAccessReviewCampaign(
  app: FastifyInstance, organizationId: string, name: string | undefined, performedBy: string,
) {
  const grants = await app.prisma.userRole.findMany({
    where: { organizationId },
    include: { role: true, user: { select: { firstName: true, lastName: true, ondi: true } } },
  });
  if (grants.length === 0) return null;

  const campaign = await app.prisma.accessReviewCampaign.create({
    data: {
      organizationId,
      name: name?.trim() || `Access Review — ${new Date().toISOString().slice(0, 10)}`,
      startedBy: performedBy,
      items: {
        create: grants.map(g => ({
          userId: g.userId,
          userName: [g.user.firstName, g.user.lastName].filter(Boolean).join(' ') || g.user.ondi,
          roleName: g.role.name,
        })),
      },
    },
    include: { items: true },
  });

  await app.audit.write({
    entityType: 'ORG', entityId: organizationId, action: 'ADMIN_UPDATE', category: 'IDENTITY', organizationId,
    performedBy, metadata: { action: 'access_review_started', campaignId: campaign.id, itemCount: campaign.items.length, scheduled: performedBy === 'system:scheduler' },
    severity: 'INFO', isRegulatory: false,
  });

  return campaign;
}
