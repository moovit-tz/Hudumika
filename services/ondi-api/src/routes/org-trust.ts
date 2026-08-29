import { FastifyInstance } from 'fastify';
import { extractUserId, requireMember, assertOrgSecurityPolicy } from '../lib/org-auth.js';
import { ensureDefaultPolicies } from './org-policies.js';

const TIER_LABEL: Record<string, string> = { LOW: 'Low Trust', MEDIUM: 'Medium Trust', HIGH: 'High Trust' };

function avg(nums: number[]): number {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

/**
 * Org-level trust intelligence. There's no "department" field anywhere in
 * the schema, so the breakdown here is by real org role (Owner/Admin/Member)
 * rather than fabricated department names — every number below is derived
 * from this org's actual members, devices, credentials, and audit trail.
 */
export async function orgTrustRoutes(app: FastifyInstance) {

  app.get('/:id/trust', async (req: any, reply) => {
    const userId = await extractUserId(req, reply);
    if (!userId) return;

    const { id } = req.params as { id: string };
    if (!(await requireMember(app, userId, id)))
      return reply.code(404).send({ error: 'organization_not_found' });
    if (!(await assertOrgSecurityPolicy(app, req, reply, userId, id))) return;

    await ensureDefaultPolicies(app, id);

    const memberships = await app.prisma.userRole.findMany({
      where: { organizationId: id },
      include: { role: true, user: { include: { trustProfile: true } } },
    });
    const memberIds = memberships.map(m => m.userId);

    if (memberIds.length === 0) {
      return reply.send({
        orgTrust: { score: 0, label: 'No Data', max: 1000 },
        byRole: [],
        factors: [],
        alerts: [],
      });
    }

    const scores = memberships.map(m => m.user.trustProfile?.currentScore ?? 300);
    const orgScore = avg(scores);
    const tier = orgScore >= 750 ? 'HIGH' : orgScore >= 500 ? 'MEDIUM' : 'LOW';

    // By-role breakdown with a lightweight 30-day trend from ScoreHistory.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const roleGroups = new Map<string, { userIds: string[]; scores: number[] }>();
    for (const m of memberships) {
      const g = roleGroups.get(m.role.name) || { userIds: [], scores: [] };
      g.userIds.push(m.userId);
      g.scores.push(m.user.trustProfile?.currentScore ?? 300);
      roleGroups.set(m.role.name, g);
    }
    const earliestHistory = await app.prisma.scoreHistory.findMany({
      where: { userId: { in: memberIds }, timestamp: { gte: thirtyDaysAgo } },
      orderBy: { timestamp: 'asc' },
    });
    const earliestScoreByUser = new Map<string, number>();
    for (const h of earliestHistory) if (!earliestScoreByUser.has(h.userId)) earliestScoreByUser.set(h.userId, h.score);

    const byRole = Array.from(roleGroups.entries()).map(([name, g]) => {
      const currentAvg = avg(g.scores);
      const priorScores = g.userIds.map(uid => earliestScoreByUser.get(uid)).filter((s): s is number => s !== undefined);
      const priorAvg = priorScores.length ? avg(priorScores) : currentAvg;
      const delta = currentAvg - priorAvg;
      return {
        name,
        members: g.userIds.length,
        score: currentAvg,
        trend: delta >= 0 ? 'up' : 'down',
        delta,
      };
    }).sort((a, b) => b.score - a.score);

    // Factors — each computed from real data, not guessed.
    const [mfaCount, verifiedCount, devices, policies, openAlerts30d, auditDays] = await Promise.all([
      app.prisma.credential.count({ where: { userId: { in: memberIds }, type: 'MFA_APP', verified: true } }),
      app.prisma.user.count({ where: { id: { in: memberIds }, verificationLevel: { in: ['L2_GOV_VERIFIED', 'L3_FINANCIAL_VERIFIED'] } } }),
      app.prisma.device.findMany({ where: { userId: { in: memberIds } }, select: { isTrusted: true } }),
      app.prisma.orgPolicy.findMany({ where: { organizationId: id } }),
      app.prisma.fraudAlert.count({ where: { userId: { in: memberIds }, status: 'OPEN', createdAt: { gte: thirtyDaysAgo } } }),
      app.prisma.auditLog.findMany({ where: { entityType: 'ORG', entityId: id, timestamp: { gte: thirtyDaysAgo } }, select: { timestamp: true } }),
    ]);

    const mfaAdoption = Math.round((mfaCount / memberIds.length) * 100);
    const identityVerification = Math.round((verifiedCount / memberIds.length) * 100);
    const accessPolicyCompliance = policies.length ? avg(policies.map(p => p.coverage)) : 0;
    const deviceHealth = devices.length ? Math.round((devices.filter(d => d.isTrusted).length / devices.length) * 100) : 0;
    const distinctAuditDays = new Set(auditDays.map(a => a.timestamp.toISOString().slice(0, 10))).size;
    const auditLogCoverage = Math.round((distinctAuditDays / 30) * 100);
    const threatScore = Math.max(0, 100 - openAlerts30d * 25);

    const statusFor = (score: number) => score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Fair' : 'Poor';
    const factors = [
      { name: 'MFA Adoption',                   score: mfaAdoption,            weight: '20%', status: statusFor(mfaAdoption) },
      { name: 'Identity Verification',          score: identityVerification,   weight: '25%', status: statusFor(identityVerification) },
      { name: 'Access Policy Compliance',       score: accessPolicyCompliance, weight: '20%', status: statusFor(accessPolicyCompliance) },
      { name: 'Device Health',                  score: deviceHealth,           weight: '15%', status: statusFor(deviceHealth) },
      { name: 'Audit Log Coverage',             score: auditLogCoverage,       weight: '10%', status: statusFor(auditLogCoverage) },
      { name: 'Threat Incidents (last 30d)',    score: threatScore,            weight: '10%', status: statusFor(threatScore) },
    ];

    const alerts: { group: string; issue: string; severity: string }[] = [];
    for (const g of byRole) {
      const groupMfa = memberships.filter(m => m.role.name === g.name);
      const mfaEnrolledInGroup = await app.prisma.credential.count({
        where: { userId: { in: groupMfa.map(m => m.userId) }, type: 'MFA_APP', verified: true },
      });
      const groupMfaPct = Math.round((mfaEnrolledInGroup / g.members) * 100);
      if (groupMfaPct < 60) alerts.push({ group: g.name, issue: `Low MFA adoption (${groupMfaPct}%)`, severity: groupMfaPct < 30 ? 'High' : 'Medium' });
    }
    if (openAlerts30d > 0) alerts.push({ group: 'Organization', issue: `${openAlerts30d} open fraud alert${openAlerts30d === 1 ? '' : 's'} in the last 30 days`, severity: openAlerts30d > 3 ? 'High' : 'Medium' });

    return reply.send({
      orgTrust: { score: orgScore, label: TIER_LABEL[tier], max: 1000 },
      byRole,
      factors,
      alerts,
    });
  });
}
