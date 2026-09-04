import { withTenant } from '../db/client.js';

/**
 * Trust score (Ondi M3) — ported from ondi-mvp's plugins/trust-engine.ts,
 * whose own header comment already tells this exact story once: an earlier
 * version of that engine weighted signals (mobile-money score, AI graph
 * score, utility score) the branch had no real data source for, and it was
 * never actually called from anywhere. It was rewritten to only the signals
 * genuinely observed.
 *
 * That rewrite dropped `creditBehavior` and `deviceRisk` (no lending feature,
 * no device-risk classification existed at the time) and redistributed their
 * weight across the remaining 3. Two of those gaps have since closed: MFA
 * enrollment (`user_totp.enabled`) and passkey registration (`ondi_credentials`
 * row count) are both real, already-captured signals — the OndiPersonal.tsx
 * "Identity Trust Score" card was displaying them as if they already
 * contributed points, when the formula silently ignored both. Restored to
 * the original 5-signal weighting instead of inventing new numbers:
 * kycTier 0.45, phoneTenure 0.15, authConsistency 0.20, mfaEnabled 0.10,
 * passkeyRegistered 0.10 (sums to 1.0). This is a real behavior change, not
 * just cosmetic — it feeds the login risk-engine gate (ondi-auth.routes.ts),
 * so an account with no MFA/passkey now scores lower and may be asked for
 * OTP/biometric step-up more readily than before.
 */
const KYC_TIER_SCORE: Record<string, number> = {
  unverified: 0,
  phone_verified: 40,
  id_verified: 70,
  enhanced: 100,
};

const WEIGHTS = { kycTier: 0.45, phoneTenure: 0.15, authConsistency: 0.20, mfaEnabled: 0.10, passkeyRegistered: 0.10 };
/** The full 300–850 range is 550 points wide — a signal's max possible
 *  contribution to the shown score is its weight × 550, used below to turn
 *  each 0-100 signal score into an actual point value the UI can display
 *  instead of a hardcoded, unrelated number. */
const SCORE_RANGE = 550;

export interface TrustSignal { score: number; weight: number; points: number }
export interface TrustScoreResult {
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    kycTier: TrustSignal;
    phoneTenure: TrustSignal;
    authConsistency: TrustSignal;
    mfaEnabled: TrustSignal;
    passkeyRegistered: TrustSignal;
  };
  /** Raw verification_level, alongside the derived kycTier signal — the
   *  authz-check policy engine needs the actual tier string (e.g. to require
   *  "id_verified or above"), not just its numeric contribution to the score. */
  verificationLevel: string;
  /** Raw month count behind the phoneTenure signal (account age, capped at
   *  60 for scoring purposes but not for display) — so a UI showing that
   *  signal can say "14 months" instead of just its points contribution. */
  accountTenureMonths: number;
}

function toSignal(rawScore: number, weight: number): TrustSignal {
  return { score: Math.round(rawScore), weight, points: Math.round((rawScore / 100) * weight * SCORE_RANGE) };
}

function emptySignals(): TrustScoreResult['signals'] {
  return {
    kycTier: toSignal(0, WEIGHTS.kycTier),
    phoneTenure: toSignal(0, WEIGHTS.phoneTenure),
    authConsistency: toSignal(0, WEIGHTS.authConsistency),
    mfaEnabled: toSignal(0, WEIGHTS.mfaEnabled),
    passkeyRegistered: toSignal(0, WEIGHTS.passkeyRegistered),
  };
}

export async function computeTrustScore(tenantId: string, userId: string): Promise<TrustScoreResult> {
  return withTenant(tenantId, async (trx) => {
    const user = await trx.selectFrom('users').select(['verification_level', 'created_at'])
      .where('id', '=', userId).executeTakeFirst();
    if (!user) return { score: 300, tier: 'LOW' as const, signals: emptySignals(), verificationLevel: 'unverified', accountTenureMonths: 0 };

    const [recentLogins, totp, credentials] = await Promise.all([
      trx.selectFrom('hr_login_history').select('status')
        .where('user_id', '=', userId).orderBy('created_at', 'desc').limit(50).execute(),
      trx.selectFrom('user_totp').select('enabled').where('user_id', '=', userId).executeTakeFirst(),
      trx.selectFrom('ondi_credentials').select(({ fn }) => fn.countAll().as('n')).where('user_id', '=', userId).executeTakeFirst(),
    ]);

    const kycTierScore = KYC_TIER_SCORE[user.verification_level] ?? 0;

    const tenureMonths = Math.floor((Date.now() - user.created_at.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const phoneTenureScore = Math.min(tenureMonths, 60) / 60 * 100;

    // Neutral default (not 0, not 100) when there's no login history yet to
    // judge — a brand-new account shouldn't be penalized for lacking a
    // track record, same reasoning the ported formula already used.
    const authConsistencyScore = recentLogins.length > 0
      ? Math.round((recentLogins.filter(l => l.status === 'SUCCESS').length / recentLogins.length) * 100)
      : 70;

    const mfaEnabledScore = totp?.enabled ? 100 : 0;
    const passkeyRegisteredScore = Number(credentials?.n ?? 0) > 0 ? 100 : 0;

    const raw =
      kycTierScore * WEIGHTS.kycTier +
      phoneTenureScore * WEIGHTS.phoneTenure +
      authConsistencyScore * WEIGHTS.authConsistency +
      mfaEnabledScore * WEIGHTS.mfaEnabled +
      passkeyRegisteredScore * WEIGHTS.passkeyRegistered;

    const score = Math.max(300, Math.min(850, Math.round(300 + (raw / 100) * 550)));
    const tier: TrustScoreResult['tier'] = score >= 700 ? 'HIGH' : score >= 500 ? 'MEDIUM' : 'LOW';

    return {
      score, tier,
      signals: {
        kycTier: toSignal(kycTierScore, WEIGHTS.kycTier),
        phoneTenure: toSignal(phoneTenureScore, WEIGHTS.phoneTenure),
        authConsistency: toSignal(authConsistencyScore, WEIGHTS.authConsistency),
        mfaEnabled: toSignal(mfaEnabledScore, WEIGHTS.mfaEnabled),
        passkeyRegistered: toSignal(passkeyRegisteredScore, WEIGHTS.passkeyRegistered),
      },
      verificationLevel: user.verification_level,
      accountTenureMonths: tenureMonths,
    };
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
 * the same per-user formula above, not a second scoring model. Four queries
 * total rather than looping computeTrustScore() once per member (which
 * would be 3 queries × every user in the tenant): one for every user's
 * verification_level/created_at, one for a generous recent slice of
 * hr_login_history across the whole tenant (grouped by user_id in JS, capped
 * at 50 per member — the same window the per-user version uses), and one
 * each for every tenant member's MFA-enabled flag and passkey count, so the
 * same 5-signal weighting in computeTrustScore() above stays the single
 * source of truth instead of drifting into a second, partial formula here.
 */
export async function computeOrgTrust(tenantId: string): Promise<OrgTrustResult> {
  return withTenant(tenantId, async (trx) => {
    const users = await trx.selectFrom('users')
      .select(['id', 'name', 'email', 'role', 'verification_level', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .where('active', '=', true)
      .execute();

    const [logins, totps, credentials] = await Promise.all([
      trx.selectFrom('hr_login_history')
        .select(['user_id', 'status', 'created_at'])
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'desc')
        .limit(Math.min(users.length * 50, 5000))
        .execute(),
      trx.selectFrom('user_totp').select(['user_id', 'enabled']).where('tenant_id', '=', tenantId).execute(),
      trx.selectFrom('ondi_credentials')
        .select('user_id')
        .select(({ fn }) => fn.countAll().as('n'))
        .where('tenant_id', '=', tenantId)
        .groupBy('user_id')
        .execute(),
    ]);

    const loginsByUser = new Map<string, typeof logins>();
    for (const l of logins) {
      const arr = loginsByUser.get(l.user_id) ?? [];
      if (arr.length < 50) arr.push(l);
      loginsByUser.set(l.user_id, arr);
    }
    const mfaByUser = new Map(totps.map(t => [t.user_id, t.enabled]));
    const passkeyCountByUser = new Map(credentials.map(c => [c.user_id, Number(c.n)]));

    const members: OrgTrustMember[] = users.map(u => {
      const kycTierScore = KYC_TIER_SCORE[u.verification_level] ?? 0;
      const tenureMonths = Math.floor((Date.now() - u.created_at.getTime()) / (30 * 24 * 60 * 60 * 1000));
      const phoneTenureScore = Math.min(tenureMonths, 60) / 60 * 100;
      const recent = loginsByUser.get(u.id) ?? [];
      const authConsistencyScore = recent.length > 0
        ? Math.round((recent.filter(l => l.status === 'SUCCESS').length / recent.length) * 100)
        : 70;
      const mfaEnabledScore = mfaByUser.get(u.id) ? 100 : 0;
      const passkeyRegisteredScore = (passkeyCountByUser.get(u.id) ?? 0) > 0 ? 100 : 0;
      const raw =
        kycTierScore * WEIGHTS.kycTier +
        phoneTenureScore * WEIGHTS.phoneTenure +
        authConsistencyScore * WEIGHTS.authConsistency +
        mfaEnabledScore * WEIGHTS.mfaEnabled +
        passkeyRegisteredScore * WEIGHTS.passkeyRegistered;
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
