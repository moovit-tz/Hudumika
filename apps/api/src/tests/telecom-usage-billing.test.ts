// Telecom & Subscriptions (industry-readiness backlog item 27), scoped per
// the business's own answer: real mobile/telecom usage. The named P0 this
// proves: usage-to-invoice reconciliation and disputed-usage correction;
// the named P1: duplicate-safe ingestion and allowance/overage rating.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { createIndustryWork } from '../services/finance-industry-work.service.js';
import {
  createSubscriber, createPlan, subscribeToPlan, suspendSubscriber,
  ingestUsageEvent, disputeUsageEvent, resolveUsageDispute, correctUsageEvent,
  billUsagePeriod, rebillUsagePeriod, TelecomError,
} from '../services/telecom.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Telecom — usage ingestion, allowance rating, disputes/corrections, billing reconciliation', () => {
  let tenant: TestTenant;
  let customerId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    await withTenant(tenant.tenantId, async trx => {
      customerId = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Telecom Test Client' }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('telecom_charges').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('telecom_usage_events').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('telecom_subscriptions').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('telecom_plans').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('telecom_subscribers').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('finance_industry_work').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await tenant.cleanup();
  }, 120000);

  async function activeWork(name: string) {
    const work = await createIndustryWork(tenant.tenantId, tenant.userId, {
      industry: 'telecom', name, customer_id: customerId, currency: 'TZS', budget: 0, specifications: {},
    });
    await withTenant(tenant.tenantId, trx => trx.updateTable('finance_industry_work').set({ status: 'active' }).where('id', '=', work.id).execute());
    return work;
  }

  it('ingests duplicate-safe usage, rates overage correctly, disputes/corrects an event, and reconciles billing', async () => {
    const work = await activeWork('Mobile Usage Billing');
    const subscriber = await createSubscriber(tenant.tenantId, work.id, { msisdn: '+255700000001', subscriber_name: 'Jane Doe' });
    const plan = await createPlan(tenant.tenantId, {
      name: 'Basic 100', monthly_fee: 5000,
      allowance_voice_minutes: 100, overage_rate_voice: 50,
      effective_from: '2026-01-01',
    });
    await subscribeToPlan(tenant.tenantId, subscriber.id, plan.id);

    const now = new Date();
    const laterSameMonth = new Date(now.getTime() + 60_000);
    const periodStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    const periodEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const periodEnd = periodEndDate.toISOString().slice(0, 10);

    // Within allowance (80 of 100 minutes) — no overage charge.
    const ev1 = await ingestUsageEvent(tenant.tenantId, {
      subscriber_id: subscriber.id, event_type: 'voice', quantity: 80,
      occurred_at: now.toISOString(), external_event_id: 'CDR-001',
    });
    expect(Number(ev1.rated_amount)).toBe(0);

    // Crosses the allowance: 80 -> 130, so only the 30 minutes beyond 100 are billed.
    const ev2 = await ingestUsageEvent(tenant.tenantId, {
      subscriber_id: subscriber.id, event_type: 'voice', quantity: 50,
      occurred_at: laterSameMonth.toISOString(), external_event_id: 'CDR-002',
    });
    expect(Number(ev2.rated_amount)).toBe(30 * 50);

    // Duplicate-safe ingestion: replaying the same external_event_id returns
    // the ORIGINAL event unchanged, not a second rating.
    const replay = await ingestUsageEvent(tenant.tenantId, {
      subscriber_id: subscriber.id, event_type: 'voice', quantity: 50,
      occurred_at: laterSameMonth.toISOString(), external_event_id: 'CDR-002',
    });
    expect(replay.id).toBe(ev2.id);
    expect(Number(replay.rated_amount)).toBe(30 * 50);

    // Dispute the second event, reject the dispute — it bills as originally recorded.
    const disputed = await disputeUsageEvent(tenant.tenantId, ev2.id, 'Customer claims this call never happened.');
    expect(disputed.status).toBe('disputed');
    const rejected = await resolveUsageDispute(tenant.tenantId, ev2.id, 'rejected');
    expect(rejected.status).toBe('rated');

    // Correct the first event's quantity from 80 to 60 — old is superseded,
    // not edited; the new event is re-rated against the allowance.
    const corrected = await correctUsageEvent(tenant.tenantId, ev1.id, 60, 'CDR replay showed 60 minutes, not 80.');
    expect(Number(corrected.quantity)).toBe(60);
    expect(corrected.corrects_event_id).toBe(ev1.id);
    const originalAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('telecom_usage_events').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', ev1.id).executeTakeFirstOrThrow());
    expect(originalAfter.status).toBe('corrected');

    // Usage-to-invoice reconciliation: monthly fee + billed overage only
    // (60 corrected + 50 = 110 total voice, so 10 minutes of overage).
    const charge = await billUsagePeriod(tenant.tenantId, subscriber.id, periodStart, periodEnd);
    expect(Number(charge.monthly_fee_amount)).toBe(5000);
    expect(Number(charge.usage_amount)).toBe(10 * 50);
    expect(Number(charge.amount)).toBe(5000 + 10 * 50);

    // Billing the same period again is refused — a charge already exists.
    await expect(billUsagePeriod(tenant.tenantId, subscriber.id, periodStart, periodEnd)).rejects.toThrow('already has a charge');

    // A later dispute resolution changes the picture: upholding a dispute on
    // the still-rated ev2 voids it, and rebilling must reconcile to the new
    // total, not silently stack a second charge.
    await disputeUsageEvent(tenant.tenantId, ev2.id, 'Escalated — carrier confirms no connection.');
    const upheld = await resolveUsageDispute(tenant.tenantId, ev2.id, 'upheld');
    expect(upheld.status).toBe('voided');

    const rebilled = await rebillUsagePeriod(tenant.tenantId, charge.id);
    expect(rebilled.id).not.toBe(charge.id);
    expect(Number(rebilled.usage_amount)).toBe(0); // only the corrected 60-minute event remains, within allowance
    expect(Number(rebilled.amount)).toBe(5000);
    const oldChargeAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('telecom_charges').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', charge.id).executeTakeFirstOrThrow());
    expect(oldChargeAfter.status).toBe('voided');
  });

  it('refuses usage ingestion for a suspended subscriber', async () => {
    const work = await activeWork('Suspension Test');
    const subscriber = await createSubscriber(tenant.tenantId, work.id, { msisdn: '+255700000002', subscriber_name: 'John Roe' });
    const plan = await createPlan(tenant.tenantId, { name: 'Data 500', allowance_data_mb: 500, overage_rate_data: 2, effective_from: '2026-01-01' });
    await subscribeToPlan(tenant.tenantId, subscriber.id, plan.id);
    await suspendSubscriber(tenant.tenantId, subscriber.id, 'Non-payment.');

    await expect(ingestUsageEvent(tenant.tenantId, {
      subscriber_id: subscriber.id, event_type: 'data', quantity: 10,
      occurred_at: '2026-11-07T10:00:00Z', external_event_id: 'CDR-100',
    })).rejects.toThrow('not active');
  });
});
