/**
 * Risk assessment (Ondi M3) — ported from ondi-mvp's plugins/risk.ts as a
 * pure decision function (no queue/session-id machinery to port; those
 * belonged to that branch's own OAuth session model, not this platform's
 * JWT+hr_devices one).
 *
 * `decision` is a recommendation, not an enforcement point on its own — see
 * ondi-auth.routes.ts's /otp/verify for the one place this is actually
 * wired in. Honest caveat, checked rather than assumed: with only the 3
 * risk factors this platform can genuinely observe today (new device, new
 * IP, recent failures — the branch's original also had a device-fingerprint
 * signal this platform has no equivalent of), the maximum reachable
 * riskScore is 30+25+20=75. Combined with the trust floor of 300 that
 * trust-score.ts's computeTrustScore() always returns, `'block'` can never
 * actually be produced by this input set — `trustScore >= 300 && riskScore
 * < 80` is always true once the higher bands miss, so the worst reachable
 * decision is `'biometric'`. Kept in the ported decision tree rather than
 * simplified away: it documents the real threshold, and a future signal
 * (e.g. real device-fingerprint risk, geo-IP distance) could push riskScore
 * past 80 without this function needing to change at all.
 */
export interface RiskInput {
  trustScore: number;
  isNewDevice: boolean;
  ipAddress: string;
  lastKnownIp: string | null;
  recentFailedAttempts: number;
}

export interface RiskAssessment {
  riskScore: number;
  factors: string[];
  decision: 'allow' | 'otp' | 'biometric' | 'block';
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const factors: string[] = [];
  let riskScore = 0;

  if (input.isNewDevice) { riskScore += 30; factors.push('new_device'); }
  if (input.lastKnownIp && input.ipAddress !== input.lastKnownIp) { riskScore += 25; factors.push('unusual_location'); }
  if (input.recentFailedAttempts >= 3) { riskScore += 20; factors.push('failed_attempts'); }

  const decision: RiskAssessment['decision'] =
    input.trustScore >= 700 && riskScore < 20 ? 'allow' :
    input.trustScore >= 500 && riskScore < 50 ? 'otp' :
    input.trustScore >= 300 && riskScore < 80 ? 'biometric' :
    'block';

  return { riskScore, factors, decision };
}
