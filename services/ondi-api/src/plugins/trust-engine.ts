import fp from 'fastify-plugin';
import type { ActivityEvent, VerificationLevel } from '@ondi/db';

/**
 * Trust Engine Plugin — the one and only trust-score implementation.
 * (services/ondi-score-engine used to hold a second, weighted calculator with
 * signals Ondi has no real data source for yet — mobile-money score, AI graph
 * score, utility score. It was never called from anywhere. Rather than fake
 * those inputs to "wire it in", this engine adopts its proportional-weighting
 * approach but scoped to signals Ondi actually collects today; the dead
 * package has been removed.)
 */

const KYC_TIER_SCORE: Record<VerificationLevel, number> = {
  L0_UNVERIFIED:         0,
  L1_BASIC_KYC:          40,
  L2_GOV_VERIFIED:       70,
  L3_FINANCIAL_VERIFIED: 100,
};

// Weights sum to 1.0 — each maps to a signal Ondi genuinely observes today.
const WEIGHTS = {
  kycTier:         0.45, // government/financial identity verification level
  phoneTenure:     0.15, // account age, capped at 60 months
  authConsistency: 0.20, // recent login success ratio
  creditBehavior:  0.10, // recent credit-event success ratio
  deviceRisk:      0.10, // penalty for high-risk device-change events
};

export const trustEnginePlugin = fp(async (fastify) => {

  fastify.decorate('recalculateTrust', async (userId: string) => {
    fastify.log.info({ userId }, 'Recalculating trust score');

    const [user, events, kyc] = await Promise.all([
      fastify.prisma.user.findUnique({ where: { id: userId } }),
      fastify.prisma.activityEvent.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
      fastify.prisma.kYCRecord.findFirst({ where: { userId, status: 'VERIFIED' } }),
    ]);
    if (!user) return { score: 300, tier: 'LOW' };

    const loginEvents  = events.filter((e: ActivityEvent) => e.type === 'LOGIN');
    const creditEvents = events.filter((e: ActivityEvent) => e.type === 'CREDIT');
    const deviceEvents = events.filter((e: ActivityEvent) => e.type === 'DEVICE_CHANGE');

    const kycTierScore = KYC_TIER_SCORE[user.verificationLevel] ?? 0;

    const phoneTenureMonths = Math.floor((Date.now() - user.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const phoneTenureScore = Math.min(phoneTenureMonths, 60) / 60 * 100;

    // Neutral defaults (not 0, not 100) when there's no history yet to judge —
    // a brand-new user shouldn't be penalized for having no track record.
    const authConsistencyScore = loginEvents.length > 0
      ? Math.round((loginEvents.filter((e: ActivityEvent) => e.status === 'SUCCESS').length / loginEvents.length) * 100)
      : 70;
    const creditBehaviorScore = creditEvents.length > 0
      ? Math.round((creditEvents.filter((e: ActivityEvent) => e.status === 'SUCCESS').length / creditEvents.length) * 100)
      : 50;
    const highRiskDeviceEvents = deviceEvents.filter((e: ActivityEvent) => e.riskLevel === 'HIGH').length;
    const deviceRiskScore = Math.max(0, 100 - highRiskDeviceEvents * 25);

    const raw =
      kycTierScore           * WEIGHTS.kycTier +
      phoneTenureScore       * WEIGHTS.phoneTenure +
      authConsistencyScore   * WEIGHTS.authConsistency +
      creditBehaviorScore    * WEIGHTS.creditBehavior +
      deviceRiskScore        * WEIGHTS.deviceRisk;

    const score = Math.max(300, Math.min(850, Math.round(300 + (raw / 100) * 550)));
    const tier  = score >= 700 ? 'HIGH' : score >= 500 ? 'MEDIUM' : 'LOW';

    // Update Trust Profile
    const oldProfile = await fastify.prisma.trustProfile.findUnique({ where: { userId } });

    if (!oldProfile || oldProfile.currentScore !== score) {
      await fastify.prisma.trustProfile.upsert({
        where: { userId },
        update: {
          currentScore: score,
          trustTier: tier as any,
          lastUpdatedAt: new Date()
        },
        create: {
          userId,
          currentScore: score,
          trustTier: tier as any
        }
      });

      // Append-only record of every score change — powers the mobile app's
      // trust-velocity chart (GET /trust/history). Distinct from trustProfile
      // (current value only) and the audit log (compliance record, not meant
      // to be queried as a timeseries by the client).
      await fastify.prisma.scoreHistory.create({
        data: {
          userId,
          score,
          reason: !oldProfile ? 'Initial score' : 'Recalculated',
          metadata: {
            oldScore: oldProfile?.currentScore ?? 300,
            tier,
            signals: { kycTierScore, phoneTenureScore, authConsistencyScore, creditBehaviorScore, deviceRiskScore },
          },
        },
      });

      // LOG DECISION (Regulatory requirement)
      await fastify.audit.write({
        entityType: 'USER',
        entityId: userId,
        action: 'ADMIN_UPDATE',
        category: 'ACCESS',
        performedBy: 'system:trust-engine',
        metadata: {
          oldScore: oldProfile?.currentScore ?? 300,
          newScore: score,
          tier,
          signals: { kycTierScore, phoneTenureScore, authConsistencyScore, creditBehaviorScore, deviceRiskScore },
        },
        severity: 'INFO',
        isRegulatory: true
      });

      // Sync custom attributes to authentik
      try {
        const userPk = await fastify.authentik.getUserPkByEmailOrEmployeeId(user.email || undefined, user.id);
        if (userPk) {
          await fastify.authentik.updateAttributes(userPk, {
            ondi_trust_score: score,
            ondi_trust_tier: tier as 'LOW' | 'MEDIUM' | 'HIGH',
            ondi_kyc_verified: !!kyc,
            ondi_kyc_level: kyc ? kyc.level : undefined
          });
        }
      } catch (authErr) {
        fastify.log.error(authErr, 'Failed to sync trust attributes to authentik');
      }
    }

    return { score, tier };
  });

});

