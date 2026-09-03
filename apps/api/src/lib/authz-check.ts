import { withTenant } from '../db/client.js';
import { verifyTotp } from './totp.js';
import { computeTrustScore } from './trust-score.js';

/**
 * A real, callable policy-decision point — "the fork's benchmark doc calls
 * out `POST /authz/check` (ALLOW/DENY/STEP_UP) as a real differentiator";
 * the only trace of it in the integrated system before this was UI *copy*
 * in OndiSSO.tsx describing the idea, never a working endpoint. This is
 * that endpoint's real logic, plus the one thing that keeps a policy check
 * from being decorative: an actual caller. Wallet reveal (security.routes.ts
 * GET /wallet/:id/reveal) calls evaluateAccess() with requireFreshAuth,
 * making it the platform's first real STEP_UP consumer.
 *
 * Kept intentionally narrow to what this platform can genuinely evaluate —
 * trust score, KYC/verification tier, and a fresh-TOTP-proof check. No
 * device-trust factor: trust-score.ts's own header comment already explains
 * why device-risk classification was dropped rather than kept as permanently
 * inert (no real signal exists for it). Same reasoning here.
 */
export type AuthzDecision = 'ALLOW' | 'DENY' | 'STEP_UP';

const VERIFICATION_RANK: Record<string, number> = { unverified: 0, phone_verified: 1, id_verified: 2, enhanced: 3 };

export interface AuthzCheckInput {
  tenantId: string;
  userId: string;
  /** Minimum trust score (300–850) the caller requires for this action. */
  minScore?: number;
  /** Minimum KYC/verification tier the caller requires. */
  minVerificationLevel?: 'phone_verified' | 'id_verified' | 'enhanced';
  /** Whether this action additionally requires proof the caller is
   *  present right now, not just that their standing score is high enough —
   *  e.g. revealing an already-saved secret is "you're allowed to have this
   *  item at all" (score/verification) plus "prove it's really you, right
   *  now" (fresh auth), which are different questions. */
  requireFreshAuth?: boolean;
  /** A just-entered TOTP code offered as fresh-auth proof. Only checked when
   *  requireFreshAuth is true; ignored otherwise. */
  freshAuthTotp?: string;
}

export interface AuthzCheckResult {
  decision: AuthzDecision;
  reason: string;
  score: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  verificationLevel: string;
}

/** True if a fresh TOTP proof was required and supplied and correct, OR the
 *  caller has no 2FA configured at all — a step-up that nobody can ever
 *  clear because they never set up 2FA would make this a net-new lockout on
 *  a feature (wallet reveal) that worked without it a moment ago, so an
 *  account with 2FA off degrades to the pre-existing behavior instead. */
async function freshAuthSatisfied(tenantId: string, userId: string, totp?: string): Promise<boolean> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('user_totp').select(['secret', 'enabled'])
      .where('user_id', '=', userId).executeTakeFirst();
    if (!row?.enabled) return true;
    if (!totp) return false;
    return verifyTotp(row.secret, totp);
  });
}

export async function evaluateAccess(input: AuthzCheckInput): Promise<AuthzCheckResult> {
  const trust = await computeTrustScore(input.tenantId, input.userId);
  const { score, tier, verificationLevel } = trust;

  if (input.minVerificationLevel && (VERIFICATION_RANK[verificationLevel] ?? 0) < VERIFICATION_RANK[input.minVerificationLevel]) {
    return { decision: 'DENY', reason: `Requires ${input.minVerificationLevel.replace('_', ' ')} identity verification (currently ${verificationLevel.replace('_', ' ')})`, score, tier, verificationLevel };
  }
  if (input.minScore !== undefined && score < input.minScore) {
    return { decision: 'DENY', reason: `Trust score ${score} is below the required minimum of ${input.minScore}`, score, tier, verificationLevel };
  }
  if (input.requireFreshAuth) {
    const ok = await freshAuthSatisfied(input.tenantId, input.userId, input.freshAuthTotp);
    if (!ok) return { decision: 'STEP_UP', reason: 'Enter your current 2FA code to continue', score, tier, verificationLevel };
  }
  return { decision: 'ALLOW', reason: 'Meets policy requirements', score, tier, verificationLevel };
}
