// Telecom & Subscriptions (industry-readiness backlog item 27), scoped per
// the business's own answer: real mobile/telecom usage — airtime, data,
// SMS. The backlog's own named P0: "usage-to-invoice reconciliation and
// disputed-usage correction"; P1: duplicate-safe ingestion and
// allowance/overage rating. Every function here runs inside withTenant via
// its caller (the route layer), consistent with the rest of this file's
// sibling services (energy.service.ts, pharmacy.service.ts).
import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';

type Trx = Transaction<Database>;

export class TelecomError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function createSubscriber(
  tenantId: string, workId: string,
  input: { msisdn: string; subscriber_name: string },
) {
  return withTenant(tenantId, trx =>
    trx.insertInto('telecom_subscribers')
      .values({ tenant_id: tenantId, work_id: workId, msisdn: input.msisdn, subscriber_name: input.subscriber_name })
      .returningAll().executeTakeFirstOrThrow());
}

export async function listSubscribers(tenantId: string, workId: string) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('telecom_subscribers').selectAll()
      .where('tenant_id', '=', tenantId).where('work_id', '=', workId)
      .orderBy('created_at', 'desc').execute());
}

// Effective-dated, same discipline as energy_tariffs/tax_codes: a plan
// price/allowance change is a new row, never an edit to history.
export async function createPlan(
  tenantId: string,
  input: {
    name: string; monthly_fee?: number;
    allowance_voice_minutes?: number; allowance_data_mb?: number; allowance_sms?: number;
    overage_rate_voice?: number; overage_rate_data?: number; overage_rate_sms?: number;
    effective_from: string;
  },
) {
  return withTenant(tenantId, trx =>
    trx.insertInto('telecom_plans')
      .values({
        tenant_id: tenantId, name: input.name, monthly_fee: input.monthly_fee ?? 0,
        allowance_voice_minutes: input.allowance_voice_minutes ?? 0,
        allowance_data_mb: input.allowance_data_mb ?? 0,
        allowance_sms: input.allowance_sms ?? 0,
        overage_rate_voice: input.overage_rate_voice ?? 0,
        overage_rate_data: input.overage_rate_data ?? 0,
        overage_rate_sms: input.overage_rate_sms ?? 0,
        effective_from: input.effective_from,
      })
      .returningAll().executeTakeFirstOrThrow());
}

async function activeSubscriptionAt(trx: Trx, tenantId: string, subscriberId: string, at: Date) {
  return trx.selectFrom('telecom_subscriptions')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('subscriber_id', '=', subscriberId)
    .where('started_at', '<=', at)
    .where(eb => eb.or([eb('ended_at', 'is', null), eb('ended_at', '>', at)]))
    .executeTakeFirst();
}

// Mid-period plan change: closes any currently-active subscription (so
// usage already rated under the old plan is never rewritten) and opens a
// new one from now.
export async function subscribeToPlan(tenantId: string, subscriberId: string, planId: string) {
  return withTenant(tenantId, async trx => {
    const subscriber = await trx.selectFrom('telecom_subscribers').select('id')
      .where('tenant_id', '=', tenantId).where('id', '=', subscriberId).executeTakeFirst();
    if (!subscriber) throw new TelecomError('Subscriber not found', 404);
    const plan = await trx.selectFrom('telecom_plans').select('id')
      .where('tenant_id', '=', tenantId).where('id', '=', planId).executeTakeFirst();
    if (!plan) throw new TelecomError('Plan not found', 404);

    const current = await activeSubscriptionAt(trx, tenantId, subscriberId, new Date());
    if (current) {
      await trx.updateTable('telecom_subscriptions')
        .set({ ended_at: new Date(), status: 'changed' })
        .where('tenant_id', '=', tenantId).where('id', '=', current.id).execute();
    }
    return trx.insertInto('telecom_subscriptions')
      .values({ tenant_id: tenantId, subscriber_id: subscriberId, plan_id: planId })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function suspendSubscriber(tenantId: string, subscriberId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const result = await trx.updateTable('telecom_subscribers')
      .set({ status: 'suspended', suspended_at: new Date(), suspended_reason: reason, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', subscriberId).where('status', '=', 'active')
      .returningAll().executeTakeFirst();
    if (!result) throw new TelecomError('Subscriber not found or not active', 409);
    return result;
  });
}

export async function resumeSubscriber(tenantId: string, subscriberId: string) {
  return withTenant(tenantId, async trx => {
    const result = await trx.updateTable('telecom_subscribers')
      .set({ status: 'active', suspended_at: null, suspended_reason: null, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', subscriberId).where('status', '=', 'suspended')
      .returningAll().executeTakeFirst();
    if (!result) throw new TelecomError('Subscriber not found or not suspended', 409);
    return result;
  });
}

export async function cancelSubscriber(tenantId: string, subscriberId: string) {
  return withTenant(tenantId, async trx => {
    const result = await trx.updateTable('telecom_subscribers')
      .set({ status: 'cancelled', cancelled_at: new Date(), updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', subscriberId).where('status', '!=', 'cancelled')
      .returningAll().executeTakeFirst();
    if (!result) throw new TelecomError('Subscriber not found or already cancelled', 409);
    return result;
  });
}

function allowanceFor(plan: { allowance_voice_minutes: number; allowance_data_mb: number; allowance_sms: number }, eventType: 'voice' | 'data' | 'sms') {
  if (eventType === 'voice') return Number(plan.allowance_voice_minutes);
  if (eventType === 'data') return Number(plan.allowance_data_mb);
  return Number(plan.allowance_sms);
}

function overageRateFor(plan: { overage_rate_voice: number; overage_rate_data: number; overage_rate_sms: number }, eventType: 'voice' | 'data' | 'sms') {
  if (eventType === 'voice') return Number(plan.overage_rate_voice);
  if (eventType === 'data') return Number(plan.overage_rate_data);
  return Number(plan.overage_rate_sms);
}

function billingMonthBounds(occurredAt: Date) {
  const start = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), 1));
  const end = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth() + 1, 1));
  return { start, end };
}

// Rates a single usage event against the plan allowance for its type, as
// an estimate recorded on the event itself (shown on the subscriber's
// usage feed, used when a dispute is raised). NOT the authoritative
// billing figure — usageAmountForPeriod() recomputes that fresh from
// surviving quantities at bill time, since a later correction to an
// earlier event can't retroactively fix this stored estimate.
async function rateUsageAgainstAllowance(
  trx: Trx, tenantId: string, subscriberId: string, eventType: 'voice' | 'data' | 'sms',
  quantity: number, occurredAt: Date,
): Promise<number> {
  const subscription = await activeSubscriptionAt(trx, tenantId, subscriberId, occurredAt);
  if (!subscription) throw new TelecomError('Subscriber has no plan active at the time of this usage event', 409);
  const plan = await trx.selectFrom('telecom_plans').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', subscription.plan_id).executeTakeFirstOrThrow();

  const { start, end } = billingMonthBounds(occurredAt);
  const priorUsage = await trx.selectFrom('telecom_usage_events')
    .select(eb => eb.fn.sum<string>('quantity').as('total'))
    .where('tenant_id', '=', tenantId)
    .where('subscriber_id', '=', subscriberId)
    .where('event_type', '=', eventType)
    .where('occurred_at', '>=', start)
    .where('occurred_at', '<', end)
    .where('status', 'in', ['rated', 'disputed'])
    .executeTakeFirst();
  const priorTotal = Number(priorUsage?.total ?? 0);
  const newTotal = priorTotal + quantity;

  const allowance = allowanceFor(plan, eventType);
  const overageBefore = Math.max(0, priorTotal - allowance);
  const overageAfter = Math.max(0, newTotal - allowance);
  const overageQuantity = overageAfter - overageBefore;
  return overageQuantity * overageRateFor(plan, eventType);
}

// Duplicate-safe ingestion: external_event_id carries the tenant-unique
// index (migration 725). A replay returns the ALREADY-recorded event
// unchanged rather than silently re-rating it a second time.
export async function ingestUsageEvent(
  tenantId: string,
  input: { subscriber_id: string; event_type: 'voice' | 'data' | 'sms'; quantity: number; occurred_at: string; external_event_id: string },
) {
  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('telecom_usage_events').selectAll()
      .where('tenant_id', '=', tenantId).where('external_event_id', '=', input.external_event_id)
      .executeTakeFirst();
    if (existing) return existing;

    const subscriber = await trx.selectFrom('telecom_subscribers').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('id', '=', input.subscriber_id).executeTakeFirst();
    if (!subscriber) throw new TelecomError('Subscriber not found', 404);
    if (subscriber.status !== 'active') throw new TelecomError('Subscriber is not active', 409);

    const occurredAt = new Date(input.occurred_at);
    const rated = await rateUsageAgainstAllowance(trx, tenantId, input.subscriber_id, input.event_type, input.quantity, occurredAt);

    return trx.insertInto('telecom_usage_events')
      .values({
        tenant_id: tenantId, subscriber_id: input.subscriber_id, event_type: input.event_type,
        quantity: input.quantity, occurred_at: occurredAt, external_event_id: input.external_event_id,
        rated_amount: rated,
      })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function disputeUsageEvent(tenantId: string, eventId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const result = await trx.updateTable('telecom_usage_events')
      .set({ status: 'disputed', dispute_reason: reason })
      .where('tenant_id', '=', tenantId).where('id', '=', eventId).where('status', '=', 'rated')
      .returningAll().executeTakeFirst();
    if (!result) throw new TelecomError('Usage event not found or not in a disputable state', 409);
    return result;
  });
}

// Resolving a dispute is a real decision, not a rubber stamp: upholding
// it VOIDS the event (permanently excluded from billing); rejecting it
// RESTORES it to 'rated' so it bills as originally recorded.
export async function resolveUsageDispute(tenantId: string, eventId: string, decision: 'upheld' | 'rejected') {
  return withTenant(tenantId, async trx => {
    const result = await trx.updateTable('telecom_usage_events')
      .set({ status: decision === 'upheld' ? 'voided' : 'rated' })
      .where('tenant_id', '=', tenantId).where('id', '=', eventId).where('status', '=', 'disputed')
      .returningAll().executeTakeFirst();
    if (!result) throw new TelecomError('Usage event not found or not disputed', 409);
    return result;
  });
}

// A correction never edits the original in place: the old event is
// marked 'corrected' (kept for the audit trail) and a new event is
// inserted with the corrected quantity, re-rated against the allowance
// as of the same occurrence time.
export async function correctUsageEvent(tenantId: string, eventId: string, correctedQuantity: number, reason: string) {
  return withTenant(tenantId, async trx => {
    const original = await trx.selectFrom('telecom_usage_events').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', eventId).where('status', 'in', ['rated', 'disputed'])
      .forUpdate().executeTakeFirst();
    if (!original) throw new TelecomError('Usage event not found or not correctable', 409);

    await trx.updateTable('telecom_usage_events')
      .set({ status: 'corrected', dispute_reason: reason })
      .where('tenant_id', '=', tenantId).where('id', '=', eventId).execute();

    const rated = await rateUsageAgainstAllowance(trx, tenantId, original.subscriber_id, original.event_type, correctedQuantity, original.occurred_at);
    return trx.insertInto('telecom_usage_events')
      .values({
        tenant_id: tenantId, subscriber_id: original.subscriber_id, event_type: original.event_type,
        quantity: correctedQuantity, occurred_at: original.occurred_at,
        external_event_id: `${original.external_event_id}:correction:${Date.now()}`,
        rated_amount: rated, corrects_event_id: original.id,
      })
      .returningAll().executeTakeFirstOrThrow();
  });
}

// The authoritative overage calculation for a billed period. Deliberately
// NOT a sum of each event's own stored rated_amount: that per-event figure
// is only correct when events arrive in strict chronological order and
// nothing is corrected afterward. A correction that changes an EARLIER
// event's quantity (e.g. ev1 80->60) doesn't retroactively adjust a LATER
// event's already-stored overage (ev2 still thinks it's the one crossing
// the threshold) — summing the stale per-event figures double-counts the
// same overage band. Recomputing fresh from current surviving quantities
// per type is immune to that ordering, and is what's actually billed.
async function usageAmountForPeriod(
  trx: Trx, tenantId: string, subscriberId: string,
  periodStart: Date, periodEnd: Date,
  plan: { allowance_voice_minutes: number; allowance_data_mb: number; allowance_sms: number; overage_rate_voice: number; overage_rate_data: number; overage_rate_sms: number },
) {
  let total = 0;
  for (const eventType of ['voice', 'data', 'sms'] as const) {
    const sum = await trx.selectFrom('telecom_usage_events')
      .select(eb => eb.fn.sum<string>('quantity').as('total'))
      .where('tenant_id', '=', tenantId).where('subscriber_id', '=', subscriberId)
      .where('event_type', '=', eventType)
      .where('occurred_at', '>=', periodStart).where('occurred_at', '<', periodEnd)
      .where('status', '=', 'rated')
      .executeTakeFirst();
    const totalQty = Number(sum?.total ?? 0);
    const overage = Math.max(0, totalQty - allowanceFor(plan, eventType));
    total += overage * overageRateFor(plan, eventType);
  }
  return total;
}

// Usage-to-invoice reconciliation: the plan's monthly fee plus the
// authoritative recomputed overage for the period — the P0 the backlog
// names.
async function billUsagePeriodInTrx(trx: Trx, tenantId: string, subscriberId: string, periodStart: string, periodEnd: string) {
  {
    const existing = await trx.selectFrom('telecom_charges').select('id')
      .where('tenant_id', '=', tenantId).where('subscriber_id', '=', subscriberId)
      .where('period_start', '=', periodStart).where('period_end', '=', periodEnd)
      .where('status', '!=', 'voided')
      .executeTakeFirst();
    if (existing) throw new TelecomError('This subscriber already has a charge for this period', 409);

    const subscription = await trx.selectFrom('telecom_subscriptions').selectAll()
      .where('tenant_id', '=', tenantId).where('subscriber_id', '=', subscriberId)
      .where('started_at', '<=', new Date(periodEnd))
      .where(eb => eb.or([eb('ended_at', 'is', null), eb('ended_at', '>', new Date(periodStart))]))
      .orderBy('started_at', 'desc').executeTakeFirst();
    if (!subscription) throw new TelecomError('No subscription active during this period', 409);
    const plan = await trx.selectFrom('telecom_plans').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', subscription.plan_id).executeTakeFirstOrThrow();

    const usageAmount = await usageAmountForPeriod(trx, tenantId, subscriberId, new Date(periodStart), new Date(periodEnd), plan);
    const monthlyFee = Number(plan.monthly_fee);

    return trx.insertInto('telecom_charges')
      .values({
        tenant_id: tenantId, subscriber_id: subscriberId, period_start: periodStart, period_end: periodEnd,
        monthly_fee_amount: monthlyFee, usage_amount: usageAmount, amount: monthlyFee + usageAmount,
      })
      .returningAll().executeTakeFirstOrThrow();
  }
}

export async function billUsagePeriod(tenantId: string, subscriberId: string, periodStart: string, periodEnd: string) {
  return withTenant(tenantId, trx => billUsagePeriodInTrx(trx, tenantId, subscriberId, periodStart, periodEnd));
}

// Re-reconciliation after a dispute resolves or a correction lands: voids
// the old charge (never deletes — same discipline as energy's billReading
// correction and GLService.voidEntry) and bills the period fresh against
// the now-current usage events, all inside ONE transaction so the new
// charge's "no existing charge for this period" check actually sees the
// void — withTenant always opens a brand-new transaction, so calling the
// public billUsagePeriod() here would start a second transaction that
// can't see this one's uncommitted void.
export async function rebillUsagePeriod(tenantId: string, chargeId: string) {
  return withTenant(tenantId, async trx => {
    const old = await trx.selectFrom('telecom_charges').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', chargeId).where('status', '!=', 'voided')
      .executeTakeFirst();
    if (!old) throw new TelecomError('Charge not found or already voided', 409);
    await trx.updateTable('telecom_charges').set({ status: 'voided' })
      .where('tenant_id', '=', tenantId).where('id', '=', chargeId).execute();
    return billUsagePeriodInTrx(trx, tenantId, old.subscriber_id, old.period_start, old.period_end);
  });
}
