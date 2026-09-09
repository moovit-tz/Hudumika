import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

/**
 * Sign metrics for the platform Metric Registry (see METRICS_AND_SIGN_PLAN.md
 * §5 Phase S3). Same shape as support-metrics.service.ts's computeBlissKpis
 * and clearos-metrics.service.ts — one real calculation, registered as
 * 'special' kind in metrics-registry.service.ts rather than 'declarative',
 * so nothing here needs a matching entry in hudubi-widgets.service.ts's own
 * hardcoded HUDUBI_METRICS array (that file's runHuduBIMetric only runs
 * metrics it already knows about — adding a brand-new declarative metric
 * through the registry would need touching that array too; every Sign
 * metric below gets its own small, self-contained handler instead, the
 * same choice already made for every finops- and clearos-prefixed metric).
 *
 * "Identity verification failure rate" (§49 of the original Sign spec) is
 * deliberately NOT included: POST /public/:token/verify-otp never persists
 * a failed attempt anywhere — a wrong or expired code is only ever
 * returned as an HTTP error, with nothing written to the database. That's
 * a real gap in what's captured, not a metric that can be honestly
 * computed from existing data — instrumenting it (a real otp_attempts
 * table logging every try, success or failure) is separate follow-up work,
 * not something to approximate here.
 */
export interface SignKpis {
  created: number;
  sent: number;
  completed: number;
  declined: number;
  expired: number;
  voided: number;
  completionRatePct: number;
  avgCompletionHours: number;
  witnessedCount: number;
  certifiedCount: number;
  otpVerifiedCount: number;
}

export async function computeSignKpis(
  trx: Kysely<Database> | Transaction<Database>,
  tenantId: string,
  days: number,
): Promise<SignKpis> {
  const cutoff = new Date(Date.now() - days * 86400000);

  const envelopes = await trx.selectFrom('sign_envelopes')
    .select(['id', 'status', 'sent_at', 'completed_at'])
    .where('tenant_id', '=', tenantId)
    .where('created_at', '>=', cutoff)
    .execute();

  const created = envelopes.length;
  const sentEnvelopes = envelopes.filter(e => e.sent_at !== null);
  const sent = sentEnvelopes.length;
  const completed = envelopes.filter(e => e.status === 'completed').length;
  const declined = envelopes.filter(e => e.status === 'declined').length;
  const expired = envelopes.filter(e => e.status === 'expired').length;
  const voided = envelopes.filter(e => e.status === 'voided').length;

  const completionRatePct = sent > 0 ? Number(((completed / sent) * 100).toFixed(1)) : 0;

  const completedWithTimes = sentEnvelopes.filter(e => e.status === 'completed' && e.completed_at && e.sent_at);
  const avgCompletionHours = completedWithTimes.length > 0
    ? Number((completedWithTimes.reduce((sum, e) => sum + (e.completed_at!.getTime() - e.sent_at!.getTime()) / 3600000, 0) / completedWithTimes.length).toFixed(1))
    : 0;

  // sign_events carries its own tenant_id (migration 270) — no join needed.
  const eventCounts = await trx.selectFrom('sign_events')
    .select(['event_type', trx.fn.countAll().as('n')])
    .where('tenant_id', '=', tenantId)
    .where('created_at', '>=', cutoff)
    .where('event_type', 'in', ['witnessed', 'certified'])
    .groupBy('event_type')
    .execute();
  const witnessedCount = Number(eventCounts.find(e => e.event_type === 'witnessed')?.n ?? 0);
  const certifiedCount = Number(eventCounts.find(e => e.event_type === 'certified')?.n ?? 0);

  const otpRow = await trx.selectFrom('sign_recipients as r')
    .innerJoin('sign_envelopes as e', 'e.id', 'r.envelope_id')
    .select((eb) => eb.fn.countAll().as('n'))
    .where('e.tenant_id', '=', tenantId)
    .where('e.created_at', '>=', cutoff)
    .where('r.otp_verified_at', 'is not', null)
    .executeTakeFirst();
  const otpVerifiedCount = Number(otpRow?.n ?? 0);

  return {
    created, sent, completed, declined, expired, voided,
    completionRatePct, avgCompletionHours, witnessedCount, certifiedCount, otpVerifiedCount,
  };
}
