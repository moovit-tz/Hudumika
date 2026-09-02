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
  /** Raw verification_level, alongside the derived kycTierScore signal — the
   *  authz-check policy engine needs the actual tier string (e.g. to require
   *  "id_verified or above"), not just its numeric contribution to the score. */
  verificationLevel: string;
}

export async function computeTrustScore(tenantId: string, userId: string): Promise<TrustScoreResult> {
  return withTenant(tenantId, async (trx) => {
    const user = await trx.selectFrom('users').select(['verification_level', 'created_at'])
      .where('id', '=', userId).executeTakeFirst();
    if (!user) return { score: 300, tier: 'LOW' as const, signals: { kycTierScore: 0, phoneTenureScore: 0, authConsistencyScore: 0 }, verificationLevel: 'unverified' };

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

    return { score, tier, signals: { kycTierScore, phoneTenureScore, authConsistencyScore }, verificationLevel: user.verification_level };
  });
}

export interface OrgTrustMember { user_id: string; name: string; email: string; role: string; score: number; tier: TrustScoreResult['tier'] }
export interface OrgTrustResult {
  average: number; tier: TrustScoreResult['tier'];
  distribution: { LOW: number; MEDIUM: number; HIGH: number };
  members: OrgTrustMember[];
}

/**
 * Enterprise ▸ Trust (Ondi M6, house-style expansion) — an aggregate over
 * the same per-user formula above, not a second scoring model. Two queries
 * total rather than looping computeTrustScore() once per member (which
 * would be 2 queries × every user in the tenant): one for every user's
 * verification_level/created_at, one for a generous recent slice of
 * hr_login_history across the whole tenant, grouped by user_id in JS and
 * capped at 50 per member — the same window the per-user version uses,
 * just computed from one shared fetch instead of N.
 */
export async function computeOrgTrust(tenantId: string): Promise<OrgTrustResult> {
  return withTenant(tenantId, async (trx) => {
    const users = await trx.selectFrom('users')
      .select(['id', 'name', 'email', 'role', 'verification_level', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .where('active', '=', true)
      .execute();

    const logins = await trx.selectFrom('hr_login_history')
      .select(['user_id', 'status', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .limit(Math.min(users.length * 50, 5000))
      .execute();

    const loginsByUser = new Map<string, typeof logins>();
    for (const l of logins) {
      const arr = loginsByUser.get(l.user_id) ?? [];
      if (arr.length < 50) arr.push(l);
      loginsByUser.set(l.user_id, arr);
    }

    const members: OrgTrustMember[] = users.map(u => {
      const kycTierScore = KYC_TIER_SCORE[u.verification_level] ?? 0;
      const tenureMonths = Math.floor((Date.now() - u.created_at.getTime()) / (30 * 24 * 60 * 60 * 1000));
      const phoneTenureScore = Math.min(tenureMonths, 60) / 60 * 100;
      const recent = loginsByUser.get(u.id) ?? [];
      const authConsistencyScore = recent.length > 0
        ? Math.round((recent.filter(l => l.status === 'SUCCESS').length / recent.length) * 100)
        : 70;
      const raw = kycTierScore * WEIGHTS.kycTier + phoneTenureScore * WEIGHTS.phoneTenure + authConsistencyScore * WEIGHTS.authConsistency;
      const score = Math.max(300, Math.min(850, Math.round(300 + (raw / 100) * 550)));
      const tier: TrustScoreResult['tier'] = score >= 700 ? 'HIGH' : score >= 500 ? 'MEDIUM' : 'LOW';
      return { user_id: u.id, name: u.name, email: u.email, role: u.role, score, tier };
    });

    const distribution = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const m of members) distribution[m.tier]++;

    const average = members.length > 0 ? Math.round(members.reduce((sum, m) => sum + m.score, 0) / members.length) : 300;
    const tier: TrustScoreResult['tier'] = average >= 700 ? 'HIGH' : average >= 500 ? 'MEDIUM' : 'LOW';

    return { average, tier, distribution, members: members.sort((a, b) => b.score - a.score) };
  });
}
