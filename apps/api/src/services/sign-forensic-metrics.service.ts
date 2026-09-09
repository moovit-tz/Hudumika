import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Digital Execution Seal, Phase 7 — the forensics feature's own real
 * numbers, registered into the same cross-app Metric Registry every other
 * domain already uses (see sign-metrics.service.ts's own header, and
 * 418_sign_metrics_registry.sql). One real calculation here, 'special'
 * kind in metrics-registry.service.ts, exactly the shape computeSignKpis
 * and computeBlissKpis already established — not a second, parallel
 * numbers system for this one feature.
 *
 * openCasesCount is deliberately NOT period-scoped by `days` — it is the
 * current backlog, a gauge, not a rate over a window (the same choice
 * metrics-registry.service.ts already made for nexushr.pending_leave_requests).
 * Every other KPI here IS scoped by `days`, matching the rest of the registry.
 */
export interface ForensicKpis {
  casesOpened: number;
  casesResolved: number;
  avgResolutionHours: number;
  openCasesCount: number;
  verificationAttempts: number;
  nonCleanVerdictRatePct: number;
}

const NEEDS_CASE_VERDICTS = ['SEAL_VERIFIED_CONTENT_DIFFERENCE', 'SEAL_INVALID', 'DOCUMENT_MISMATCH', 'INCONCLUSIVE'];

export async function computeForensicKpis(
  trx: Kysely<Database> | Transaction<Database>,
  tenantId: string,
  days: number,
): Promise<ForensicKpis> {
  const cutoff = new Date(Date.now() - days * 86400000);

  const cases = await trx.selectFrom('sign_forensic_cases')
    .select(['id', 'status', 'opened_at', 'resolved_at'])
    .where('tenant_id', '=', tenantId)
    .where('opened_at', '>=', cutoff)
    .execute();
  const casesOpened = cases.length;

  const resolved = cases.filter(c => (c.status === 'resolved' || c.status === 'dismissed') && c.resolved_at);
  const casesResolved = resolved.length;
  const avgResolutionHours = resolved.length > 0
    ? Number((resolved.reduce((sum, c) => sum + (c.resolved_at!.getTime() - c.opened_at.getTime()) / 3600000, 0) / resolved.length).toFixed(1))
    : 0;

  // Current backlog — not period-scoped (see header comment).
  const openRow = await trx.selectFrom('sign_forensic_cases')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('tenant_id', '=', tenantId)
    .where('status', 'in', ['open', 'reviewing'])
    .executeTakeFirst();
  const openCasesCount = Number(openRow?.n ?? 0);

  // sign_verifications (424) — every upload-comparison attempt, clean or
  // not, is a permanent row here regardless of whether a case ever opened
  // from it (a case only opens for the non-clean subset — see
  // sign-forensic-case.service.ts's verdictNeedsCase). Denominator for a
  // real rate, not the case count itself.
  const verifications = await trx.selectFrom('sign_verifications')
    .select(['content_verdict'])
    .where('tenant_id', '=', tenantId)
    .where('method', '=', 'upload')
    .where('looked_up_at', '>=', cutoff)
    .execute();
  const verificationAttempts = verifications.length;
  const nonCleanCount = verifications.filter(v => v.content_verdict && NEEDS_CASE_VERDICTS.includes(v.content_verdict)).length;
  const nonCleanVerdictRatePct = verificationAttempts > 0 ? Number(((nonCleanCount / verificationAttempts) * 100).toFixed(1)) : 0;

  return { casesOpened, casesResolved, avgResolutionHours, openCasesCount, verificationAttempts, nonCleanVerdictRatePct };
}
