import { withTenant } from '../db/client.js';

/**
 * Trust score (Ondi M3) — ported from ondi-mvp's plugins/trust-engine.ts,
 * whose own header comment already tells this exact story once: an earlier
 * version of that engine weighted signals (mobile-money score, AI graph
 * score, utility score) the branch had no real data source for, and it was
 * never actually called from anywhere. It was rewritten to only the signals
 * genuinely observed. Same move here, one level further: of that rewritten
 * engine's 5 signals, only 3 have a real source in this platform today —
 * `creditBehavior` (no lending feature exists) and `deviceRisk` (no
 * device-risk classification exists) are dropped rather than kept as
 * permanently-inert zero-weight code. Their combined weight (0.10 + 0.10)
 * is redistributed proportionally across the 3 real signals so the weights
 * still sum to 1.0: kycTier 0.45→0.5625, phoneTenure 0.15→0.1875,
 * authConsistency 0.20→0.25.
 */
const KYC_TIER_SCORE: Record<string, number> = {
  unverified: 0,
  phone_verified: 40,
  id_verified: 70,
  enhanced: 100,
};

const WEIGHTS = { kycTier: 0.5625, phoneTenure: 0.1875, authConsistency: 0.25 };

export interface TrustScoreResult {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: { kycTierScore: number; phoneTenureScore: number; authConsistencyScore: number };
}

export async function computeTrustScore(tenantId: string, userId: string): Promise<TrustScoreResult> {
  return withTenant(tenantId, async (trx) => {
    const user = await trx.selectFrom('users').select(['verification_level', 'created_at'])
      .where('id', '=', userId).executeTakeFirst();
    if (!user) return { score: 300, tier: 'LOW' as const, signals: { kycTierScore: 0, phoneTenureScore: 0, authConsistencyScore: 0 } };

    const recentLogins = await trx.selectFrom('hr_login_history').select('status')
      .where('user_id', '=', userId).orderBy('created_at', 'desc').limit(50).execute();

    const kycTierScore = KYC_TIER_SCORE[user.verification_level] ?? 0;

    const tenureMonths = Math.floor((Date.now() - user.created_at.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const phoneTenureScore = Math.min(tenureMonths, 60) / 60 * 100;

    // Neutral default (not 0, not 100) when there's no login history yet to
    // judge — a brand-new account shouldn't be penalized for lacking a
    // track record, same reasoning the ported formula already used.
    const authConsistencyScore = recentLogins.length > 0
      ? Math.round((recentLogins.filter(l => l.status === 'SUCCESS').length / recentLogins.length) * 100)
      : 70;

    const raw =
      kycTierScore * WEIGHTS.kycTier +
      phoneTenureScore * WEIGHTS.phoneTenure +
      authConsistencyScore * WEIGHTS.authConsistency;

    const score = Math.max(300, Math.min(850, Math.round(300 + (raw / 100) * 550)));
    const tier: TrustScoreResult['tier'] = score >= 700 ? 'HIGH' : score >= 500 ? 'MEDIUM' : 'LOW';

    return { score, tier, signals: { kycTierScore, phoneTenureScore, authConsistencyScore } };
  });
}
