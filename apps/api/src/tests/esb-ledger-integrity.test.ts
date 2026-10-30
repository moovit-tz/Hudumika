import { beforeAll, afterAll, it, expect } from 'vitest';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';
import * as EsbService from '../services/esb.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

let tenant: TestTenant;

beforeAll(async () => {
  tenant = await createTestTenant('ESB');
}, 120000);

afterAll(async () => {
  if (tenant) await tenant.cleanup();
}, 120000);

async function seedWalletWithBalance(amount: number): Promise<string> {
  return withTenant(tenant.tenantId, async (trx) => {
    const wallet = await trx.insertInto('esb_wallets')
      .values({ tenant_id: tenant.tenantId, currency: 'TZS' })
      .onConflict(oc => oc.column('tenant_id').doNothing())
      .returning('id')
      .executeTakeFirst();

    const walletId = wallet?.id ?? (
      await trx.selectFrom('esb_wallets')
        .select('id')
        .where('tenant_id', '=', tenant.tenantId)
        .executeTakeFirstOrThrow()
    ).id;

    // Clear existing postings for a clean slate
    await trx.deleteFrom('esb_postings')
      .where('tenant_id', '=', tenant.tenantId)
      .execute();

    // Seed the balance
    await trx.insertInto('esb_postings').values({
      tenant_id: tenant.tenantId,
      wallet_id: walletId,
      posting_type: 'top_up',
      amount,
      currency: 'TZS',
      reservation_id: null,
      refund_operation_id: null,
      service_kind: null,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
      gateway_provider: null,
      gateway_tx_ref: `seed-${Date.now()}`,
      gateway_tx_id: null,
      description: 'Test seed',
      initiated_by: null,
    }).execute();

    return walletId;
  });
}

async function postingsSum(): Promise<number> {
  return withTenant(tenant.tenantId, async (trx) => {
    const { total } = await trx.selectFrom('esb_postings')
      .select(sql<number>`COALESCE(SUM(amount), 0)`.as('total'))
      .where('tenant_id', '=', tenant.tenantId)
      .executeTakeFirstOrThrow();
    return Number(total);
  });
}

// Bug 1: reserve→capture cycle must deduct exactly actualAmount, not 2×actualAmount
it('capture deducts exactly the actual amount, not double', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });
  expect(reservation.success).toBe(true);

  // After reserve: balance should be 1000 - 100 = 900
  expect(await postingsSum()).toBe(900);

  const capture = await EsbService.capture({
    tenantId: tenant.tenantId,
    operationId: reservation.operationId!,
    actualAmount: 80,
  });
  expect(capture.success).toBe(true);

  // After capture: net deduction from original should be exactly 80
  // Balance: 1000 - 80 = 920
  const finalBalance = await postingsSum();
  expect(finalBalance).toBe(920);
}, 30000);

// When actual == quoted, net deduction equals the quote
it('capture at full quoted amount nets to -quotedAmount', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });
  expect(reservation.success).toBe(true);

  const capture = await EsbService.capture({
    tenantId: tenant.tenantId,
    operationId: reservation.operationId!,
    actualAmount: 100,
  });
  expect(capture.success).toBe(true);

  expect(await postingsSum()).toBe(900);
}, 30000);

// Release returns the full reservation
it('release after reserve restores full balance', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 200,
  });
  expect(reservation.success).toBe(true);
  expect(await postingsSum()).toBe(800);

  await EsbService.releaseReservation(tenant.tenantId, reservation.operationId!);

  expect(await postingsSum()).toBe(1000);
}, 30000);

// Bug 4: insufficient funds are rejected
it('rejects reserve when balance is insufficient', async () => {
  await seedWalletWithBalance(50);

  const result = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });
  expect(result.success).toBe(false);
  expect(result.code).toBe('INSUFFICIENT_FUNDS');

  // Balance unchanged
  expect(await postingsSum()).toBe(50);
}, 30000);

// Bug 2: refund requires a captured operation and caps at actual_amount
it('refund is capped at the actual charge of the referenced operation', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });
  const capture = await EsbService.capture({
    tenantId: tenant.tenantId,
    operationId: reservation.operationId!,
    actualAmount: 80,
  });
  expect(capture.success).toBe(true);

  // Partial refund — within cap
  const r1 = await EsbService.refund(tenant.tenantId, reservation.operationId!, 50, 'partial refund');
  expect(r1.success).toBe(true);

  // Second refund that would exceed the cap
  const r2 = await EsbService.refund(tenant.tenantId, reservation.operationId!, 50, 'over cap');
  expect(r2.success).toBe(false);
  expect(r2.error).toContain('cap');

  // Exact remainder is allowed
  const r3 = await EsbService.refund(tenant.tenantId, reservation.operationId!, 30, 'exact remainder');
  expect(r3.success).toBe(true);

  // Final balance: 1000 - 80 + 50 + 30 = 1000 (full refund of charge)
  expect(await postingsSum()).toBe(1000);
}, 30000);

it('refund rejects a non-captured operation', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });

  const result = await EsbService.refund(tenant.tenantId, reservation.operationId!, 50, 'not captured yet');
  expect(result.success).toBe(false);
  expect(result.error).toContain('not in captured state');
}, 30000);

// Concurrent refund race — the exact scenario from the audit:
// TZS 100 charge, two concurrent TZS 75 refunds. Only one should succeed.
it('concurrent refunds do not exceed the actual charge', async () => {
  await seedWalletWithBalance(1000);

  const reservation = await EsbService.reserve({
    tenantId: tenant.tenantId,
    serviceKind: 'ai',
    quotedAmount: 100,
  });
  await EsbService.capture({
    tenantId: tenant.tenantId,
    operationId: reservation.operationId!,
    actualAmount: 100,
  });

  // Fire two TZS 75 refunds concurrently — only one should succeed
  const [r1, r2] = await Promise.all([
    EsbService.refund(tenant.tenantId, reservation.operationId!, 75, 'refund-a'),
    EsbService.refund(tenant.tenantId, reservation.operationId!, 75, 'refund-b'),
  ]);

  const successes = [r1, r2].filter(r => r.success);
  const failures = [r1, r2].filter(r => !r.success);
  expect(successes).toHaveLength(1);
  expect(failures).toHaveLength(1);
  expect(failures[0].error).toContain('cap');

  // Balance: 1000 - 100 + 75 = 975 (not 1050)
  expect(await postingsSum()).toBe(975);
}, 30000);

// Bug 3: duplicate top-ups are idempotent
it('duplicate top-up by gateway_tx_ref returns the same posting', async () => {
  const walletId = await seedWalletWithBalance(0);
  const txRef = `dup-test-${Date.now()}`;

  // Seed a checkout request so topUp() can verify ownership
  await withTenant(tenant.tenantId, async (trx) => {
    await trx.insertInto('esb_checkout_requests').values({
      tenant_id: tenant.tenantId,
      wallet_id: walletId,
      tx_ref: txRef,
      amount: 500,
      currency: 'TZS',
      initiated_by: null,
      completed_at: null,
    }).execute();
  });

  const r1 = await EsbService.topUp({
    tenantId: tenant.tenantId,
    amount: 500,
    gatewayTxRef: txRef,
    description: 'first',
  });
  expect(r1.success).toBe(true);

  const r2 = await EsbService.topUp({
    tenantId: tenant.tenantId,
    amount: 500,
    gatewayTxRef: txRef,
    description: 'duplicate',
  });
  expect(r2.success).toBe(true);
  expect(r2.postingId).toBe(r1.postingId);

  // Only one top-up posting exists
  const count = await withTenant(tenant.tenantId, async (trx) => {
    const { c } = await trx.selectFrom('esb_postings')
      .select(sql<number>`count(*)`.as('c'))
      .where('tenant_id', '=', tenant.tenantId)
      .where('posting_type', '=', 'top_up')
      .where('gateway_tx_ref', '=', txRef)
      .executeTakeFirstOrThrow();
    return Number(c);
  });
  expect(count).toBe(1);
}, 30000);

// Payment ownership: topUp rejects a tx_ref that was never checked out by this tenant
it('topUp rejects a tx_ref with no matching checkout request', async () => {
  await seedWalletWithBalance(0);

  const result = await EsbService.topUp({
    tenantId: tenant.tenantId,
    amount: 500,
    gatewayTxRef: 'esb-unknown-ref-999',
    description: 'stolen ref',
  });
  expect(result.success).toBe(false);
  expect(result.error).toContain('No checkout request');
}, 30000);

// getBalance reports correct figures
it('getBalance available equals SUM of all postings', async () => {
  await seedWalletWithBalance(500);

  const bal = await EsbService.getBalance(tenant.tenantId);
  expect(bal.available).toBe(500);
  expect(bal.currency).toBe('TZS');
}, 30000);
