import { withTenant } from '../db/client.js';

/**
 * Internal workplace-reliability signal — the real, buildable slice of the
 * OneID vision docs' "credit-scoring engine." This is deliberately NOT a
 * credit-bureau score: trust-score.ts's own header comment already
 * documents that no lending/loan feature exists anywhere in this platform,
 * and that remains true here — nothing below predicts loan repayment or
 * claims bureau-grade accuracy. What genuinely exists is real per-user data
 * already sitting in other Hudumika apps (payroll, petty cash, HR
 * attendance/leave) that says something honest about reliability: how long
 * someone has worked here, whether their petty-cash advances get approved
 * and retired cleanly, and whether they show up and take leave the way
 * they say they will. This composes those real signals; it invents none.
 *
 * Deliberately separate from trust-score.ts, not merged into it — that
 * score is wired directly into the login risk-engine gate (ondi-auth.
 * routes.ts's allow/otp/biometric decision), so folding unrelated
 * workplace-behavior signals into it would change what that gate is
 * actually measuring. This is a standalone, Personal-page-only signal.
 */
export interface ReliabilitySignalsResult {
  score: number; // 0-100
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  signals: {
    tenureMonths: number;
    employmentActive: boolean;
    pettyCashApprovalRate: number | null; // null = no decided requests yet
    pettyCashOutstandingCount: number;
    attendanceRate: number | null; // null = no attendance history yet
    leaveApprovalRate: number | null; // null = no decided leave requests yet
  };
}

export async function computeReliabilitySignals(tenantId: string, userId: string): Promise<ReliabilitySignalsResult> {
  return withTenant(tenantId, async (trx) => {
    const user = await trx.selectFrom('users').select(['hire_date', 'active', 'created_at']).where('id', '=', userId).executeTakeFirst();
    const referenceDate = user?.hire_date ? new Date(user.hire_date) : (user?.created_at ?? new Date());
    const tenureMonths = Math.max(0, Math.floor((Date.now() - referenceDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    const employmentActive = user?.active ?? true;

    const withdrawals = await trx.selectFrom('petti_withdrawal_requests')
      .select(['status', 'finance_expense_id'])
      .where('requested_by', '=', userId)
      .execute();
    const decided = withdrawals.filter(w => w.status === 'approved' || w.status === 'rejected' || w.status === 'disbursed');
    const pettyCashApprovalRate = decided.length > 0
      ? Math.round((decided.filter(w => w.status !== 'rejected').length / decided.length) * 100)
      : null;

    const expenseIds = withdrawals.map(w => w.finance_expense_id).filter((id): id is string => !!id);
    let pettyCashOutstandingCount = 0;
    if (expenseIds.length > 0) {
      const outstanding = await trx.selectFrom('finance_expenses')
        .select('id')
        .where('id', 'in', expenseIds)
        .where('retirement_status', 'in', ['pending', 'short'])
        .execute();
      pettyCashOutstandingCount = outstanding.length;
    }

    const attendance = await trx.selectFrom('hr_attendance')
      .select('status')
      .where('user_id', '=', userId)
      .orderBy('date', 'desc')
      .limit(90)
      .execute();
    const attendanceRate = attendance.length > 0
      ? Math.round((attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length / attendance.length) * 100)
      : null;

    const leaves = await trx.selectFrom('hr_leaves').select('status').where('user_id', '=', userId).execute();
    const decidedLeaves = leaves.filter(l => l.status === 'APPROVED' || l.status === 'REJECTED' || l.status === 'CANCELLED');
    const leaveApprovalRate = decidedLeaves.length > 0
      ? Math.round((decidedLeaves.filter(l => l.status === 'APPROVED').length / decidedLeaves.length) * 100)
      : null;

    // Neutral default (70, not 0) for a signal with no history yet — same
    // "don't penalize a lack of track record" principle trust-score.ts uses.
    const tenureScore = Math.min(tenureMonths, 36) / 36 * 100;
    const employmentScore = employmentActive ? 100 : 0;
    const pettyCashScore = pettyCashApprovalRate ?? 70;
    const outstandingScore = Math.max(0, 100 - pettyCashOutstandingCount * 25);
    const attendanceScore = attendanceRate ?? 70;
    const leaveScore = leaveApprovalRate ?? 70;

    const raw =
      tenureScore * 0.15 +
      employmentScore * 0.15 +
      pettyCashScore * 0.2 +
      outstandingScore * 0.2 +
      attendanceScore * 0.15 +
      leaveScore * 0.15;

    const score = Math.max(0, Math.min(100, Math.round(raw)));
    const tier: ReliabilitySignalsResult['tier'] = score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';

    return {
      score, tier,
      signals: { tenureMonths, employmentActive, pettyCashApprovalRate, pettyCashOutstandingCount, attendanceRate, leaveApprovalRate },
    };
  });
}
