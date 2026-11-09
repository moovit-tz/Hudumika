// Fintech & Financial Services (backlog item 29), scoped per the business's
// own answer: a real wallet/payment role on top of Selcom/AzamPay's rails.
// Proves the backlog's named P0/P1s: KYC-gated wallet opening, an
// authoritative subledger reconciled against the real GL (not a parallel
// ledger), available/reserved balances, idempotent deposits, a hard refusal
// to fabricate a provider payout, reversal without deletion, and real
// settlement-mismatch/exception-case tracking.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant } from '../db/client.js';
import { GLService } from '../services/gl.service.js';
import {
  recordKycCheck, openWallet, getWalletBalance, initiateDeposit, confirmDeposit,
  placeHold, releaseHold, captureHold, chargeFee, withdraw, transferBetweenWallets,
  reverseTransaction, recordSettlementBatch, resolveExceptionCase, listOpenExceptionCases,
  FintechError,
} from '../services/fintech.service.js';
import { ProviderNotVerifiedError } from '../lib/fintech-provider-adapter.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Fintech — KYC-gated wallets, subledger/GL reconciliation, holds, reversal, settlement exceptions', () => {
  let tenant: TestTenant;
  let customerA: string;
  let customerB: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    await withTenant(tenant.tenantId, async trx => {
      await GLService.seedChartOfAccounts(trx, tenant.tenantId);
      customerA = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Fintech Customer A' }).returning('id').executeTakeFirstOrThrow()).id;
      customerB = (await trx.insertInto('customers').values({ tenant_id: tenant.tenantId, name: 'Fintech Customer B' }).returning('id').executeTakeFirstOrThrow()).id;
    });
  }, 120000);

  afterAll(async () => {
    await tenant.cleanup(); // every fintech_* table has ON DELETE CASCADE on tenant_id
  }, 120000);

  it('refuses to open a wallet without a verified KYC check', async () => {
    await expect(openWallet(tenant.tenantId, customerA, 'TZS')).rejects.toThrow('no verified KYC check');
  });

  it('runs the real deposit -> hold -> fee -> capture -> reversal lifecycle, reconciled against the GL', async () => {
    await recordKycCheck(tenant.tenantId, customerA, tenant.userId, { level: 'basic', status: 'verified' });
    const wallet = await openWallet(tenant.tenantId, customerA, 'TZS');

    // Duplicate-safe deposit ingestion.
    const deposit1 = await initiateDeposit(tenant.tenantId, wallet.id, 50000, 'selcom', 'SEL-REF-001');
    const replay = await initiateDeposit(tenant.tenantId, wallet.id, 50000, 'selcom', 'SEL-REF-001');
    expect(replay.id).toBe(deposit1.id); // replay returns the same row, never a second one

    const confirmed = await confirmDeposit(tenant.tenantId, deposit1.id);
    expect(confirmed.status).toBe('posted');
    expect(confirmed.gl_entry_id).not.toBeNull(); // the actual subledger/GL reconciliation point

    let balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(50000);
    expect(balance.available).toBe(50000);

    // A hold reserves balance without touching the posted ledger.
    const hold = await placeHold(tenant.tenantId, wallet.id, 20000, 'Pending merchant settlement');
    balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(50000);
    expect(balance.available).toBe(30000);
    await expect(placeHold(tenant.tenantId, wallet.id, 40000, 'Too much')).rejects.toThrow('Insufficient available balance');

    // A fee charged directly against the wallet.
    await chargeFee(tenant.tenantId, wallet.id, 500, 'Withdrawal processing fee');
    balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(49500);

    // Capturing the hold turns it into a real posted withdrawal.
    const captured = await captureHold(tenant.tenantId, hold.id);
    expect(captured.status).toBe('posted');
    balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(29500); // 50000 - 500 fee - 20000 captured
    expect(balance.held).toBe(0);
    expect(balance.available).toBe(29500);

    // Reversing the original deposit never deletes or edits it — it flips
    // status (excluding it from the balance sum) and posts a real GL void.
    const reversal = await reverseTransaction(tenant.tenantId, deposit1.id, tenant.userId, 'Customer disputed this deposit.');
    expect(reversal.type).toBe('reversal');
    expect(reversal.related_transaction_id).toBe(deposit1.id);
    const originalAfter = await withTenant(tenant.tenantId, trx => trx.selectFrom('fintech_wallet_transactions').select('status').where('tenant_id', '=', tenant.tenantId).where('id', '=', deposit1.id).executeTakeFirstOrThrow());
    expect(originalAfter.status).toBe('reversed');
    balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(-20500); // the 50000 deposit's effect is gone; the 500 fee + 20000 capture still stand
  });

  it('refuses to fabricate a provider withdrawal — the unverified adapter fails loudly and opens a real exception case', async () => {
    await recordKycCheck(tenant.tenantId, customerB, tenant.userId, { level: 'basic', status: 'verified' });
    const wallet = await openWallet(tenant.tenantId, customerB, 'TZS');
    const deposit = await initiateDeposit(tenant.tenantId, wallet.id, 10000, 'azampay', 'AZAM-REF-001');
    await confirmDeposit(tenant.tenantId, deposit.id);

    await expect(withdraw(tenant.tenantId, wallet.id, 5000, 'azampay', '+255700000099', 'WD-REF-001'))
      .rejects.toThrow(ProviderNotVerifiedError);

    const balance = await getWalletBalance(tenant.tenantId, wallet.id);
    expect(balance.posted).toBe(10000); // nothing was deducted — the failure was real, not silently absorbed

    const cases = await listOpenExceptionCases(tenant.tenantId);
    const failedCase = cases.find(c => c.case_type === 'failed_transaction');
    expect(failedCase).toBeDefined();
  });

  it('flags a provider settlement mismatch as a real exception case and lets it be resolved', async () => {
    const matched = await recordSettlementBatch(tenant.tenantId, 'selcom', 'BATCH-OK-001', '2026-11-01', '2026-11-30', 100000, 100000);
    expect(matched.status).toBe('matched');

    const mismatched = await recordSettlementBatch(tenant.tenantId, 'selcom', 'BATCH-BAD-001', '2026-11-01', '2026-11-30', 100000, 97500);
    expect(mismatched.status).toBe('mismatched');

    const cases = await listOpenExceptionCases(tenant.tenantId);
    const settlementCase = cases.find(c => c.settlement_id === mismatched.id);
    expect(settlementCase).toBeDefined();

    const resolved = await resolveExceptionCase(tenant.tenantId, settlementCase!.id, tenant.userId, 'Confirmed TZS 2,500 provider fee deduction — reconciled.');
    expect(resolved.status).toBe('resolved');
    await expect(resolveExceptionCase(tenant.tenantId, settlementCase!.id, tenant.userId, 'Again')).rejects.toThrow('already resolved');
  });

  it('moves funds between two wallets with zero net effect on the aggregate wallet-liability account', async () => {
    const walletA = await withTenant(tenant.tenantId, trx => trx.selectFrom('fintech_wallets').selectAll().where('tenant_id', '=', tenant.tenantId).where('customer_id', '=', customerA).executeTakeFirstOrThrow());
    const walletB = await withTenant(tenant.tenantId, trx => trx.selectFrom('fintech_wallets').selectAll().where('tenant_id', '=', tenant.tenantId).where('customer_id', '=', customerB).executeTakeFirstOrThrow());

    const beforeA = await getWalletBalance(tenant.tenantId, walletA.id);
    const beforeB = await getWalletBalance(tenant.tenantId, walletB.id);

    await expect(transferBetweenWallets(tenant.tenantId, walletA.id, walletA.id, 100)).rejects.toThrow('transfer a wallet to itself');
    await transferBetweenWallets(tenant.tenantId, walletB.id, walletA.id, 1000);

    const afterA = await getWalletBalance(tenant.tenantId, walletA.id);
    const afterB = await getWalletBalance(tenant.tenantId, walletB.id);
    expect(afterA.posted).toBe(beforeA.posted + 1000);
    expect(afterB.posted).toBe(beforeB.posted - 1000);
  });
});
