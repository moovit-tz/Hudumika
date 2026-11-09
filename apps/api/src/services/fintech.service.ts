// Fintech & Financial Services (backlog item 29). Scope confirmed by the
// business: a real wallet/payment role, operating on Selcom's and
// AzamPay's own licensed rails (see lib/fintech-provider-adapter.ts for why
// those adapters' actual network calls are hard-gated behind manual
// verification rather than guessed at). This file is the authoritative
// OPERATIONAL SUBLEDGER — every posted transaction also creates a real
// GLService journal entry (gl_entry_id), satisfying the backlog's P0:
// "distinguish operational subledger from authoritative FinOps GL and
// reconcile them." Deliberately NO stored wallet balance column — balance
// is always derived from posted transactions minus active holds, the same
// discipline Petti's wallet service already proved out.
import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { GLService } from './gl.service.js';

type Trx = Transaction<Database>;

export class FintechError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const WALLET_LIABILITY = '2720'; // Customer Wallet Liability
const MOBILE_MONEY_CLEARING = '1021'; // Mobile Money Clearing (Selcom/AzamPay settle into this)
const FEE_INCOME = '4600'; // Fintech Transaction Fee Income

// ── Verified customer checks (P1) ─────────────────────────────────────────

export async function recordKycCheck(
  tenantId: string, customerId: string, checkedBy: string,
  input: { level: 'basic' | 'enhanced'; status: 'verified' | 'rejected'; documentRefs?: unknown[]; rejectionReason?: string },
) {
  return withTenant(tenantId, trx =>
    trx.insertInto('fintech_kyc_checks')
      .values({
        tenant_id: tenantId, customer_id: customerId, level: input.level, status: input.status,
        document_refs: JSON.stringify(input.documentRefs ?? []), checked_by: checkedBy, checked_at: new Date(),
        rejection_reason: input.status === 'rejected' ? (input.rejectionReason ?? null) : null,
      })
      .returningAll().executeTakeFirstOrThrow());
}

async function latestKycStatus(trx: Trx, tenantId: string, customerId: string) {
  const row = await trx.selectFrom('fintech_kyc_checks').select('status')
    .where('tenant_id', '=', tenantId).where('customer_id', '=', customerId)
    .orderBy('created_at', 'desc').executeTakeFirst();
  return row?.status ?? null;
}

// ── Wallets ────────────────────────────────────────────────────────────────

// A wallet cannot be opened without a currently-verified KYC check — "no
// invented compliance claims" means this gate is real, not cosmetic.
export async function openWallet(tenantId: string, customerId: string, currency = 'TZS') {
  return withTenant(tenantId, async trx => {
    const kyc = await latestKycStatus(trx, tenantId, customerId);
    if (kyc !== 'verified') throw new FintechError('Customer has no verified KYC check — cannot open a wallet', 403);

    const existing = await trx.selectFrom('fintech_wallets').select('id')
      .where('tenant_id', '=', tenantId).where('customer_id', '=', customerId).where('currency', '=', currency)
      .executeTakeFirst();
    if (existing) throw new FintechError('A wallet already exists for this customer in this currency', 409);

    return trx.insertInto('fintech_wallets')
      .values({ tenant_id: tenantId, customer_id: customerId, currency })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function freezeWallet(tenantId: string, walletId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const row = await trx.updateTable('fintech_wallets')
      .set({ status: 'frozen', frozen_reason: reason, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', walletId).where('status', '=', 'active')
      .returningAll().executeTakeFirst();
    if (!row) throw new FintechError('Wallet not found or not active', 409);
    return row;
  });
}

export async function unfreezeWallet(tenantId: string, walletId: string) {
  return withTenant(tenantId, async trx => {
    const row = await trx.updateTable('fintech_wallets')
      .set({ status: 'active', frozen_reason: null, updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', walletId).where('status', '=', 'frozen')
      .returningAll().executeTakeFirst();
    if (!row) throw new FintechError('Wallet not found or not frozen', 409);
    return row;
  });
}

// Balance is always derived, never stored: posted transactions (signed by
// type) minus active holds. A reversed transaction's status flips away
// from 'posted' (excluded here) — the paired 'reversal' audit row itself
// contributes zero, since the real balance effect is already carried by
// excluding the original.
async function walletBalances(trx: Trx, tenantId: string, walletId: string) {
  const posted = await sql<{ total: string }>`
    SELECT COALESCE(SUM(
      CASE WHEN type IN ('deposit', 'transfer_in') THEN amount
           WHEN type IN ('withdrawal', 'transfer_out', 'fee') THEN -amount
           ELSE 0 END
    ), 0) AS total
    FROM fintech_wallet_transactions
    WHERE tenant_id = ${tenantId} AND wallet_id = ${walletId} AND status = 'posted'
  `.execute(trx);
  const held = await trx.selectFrom('fintech_wallet_holds')
    .select(eb => eb.fn.sum<string>('amount').as('total'))
    .where('tenant_id', '=', tenantId).where('wallet_id', '=', walletId).where('status', '=', 'held')
    .executeTakeFirst();
  const postedTotal = Number(posted.rows[0]?.total ?? 0);
  const heldTotal = Number(held?.total ?? 0);
  return { posted: postedTotal, held: heldTotal, available: postedTotal - heldTotal };
}

export async function getWalletBalance(tenantId: string, walletId: string) {
  return withTenant(tenantId, trx => walletBalances(trx, tenantId, walletId));
}

async function lockWallet(trx: Trx, tenantId: string, walletId: string) {
  const wallet = await trx.selectFrom('fintech_wallets').selectAll()
    .where('tenant_id', '=', tenantId).where('id', '=', walletId).forUpdate().executeTakeFirst();
  if (!wallet) throw new FintechError('Wallet not found', 404);
  if (wallet.status !== 'active') throw new FintechError(`Wallet is ${wallet.status}, not active`, 409);
  return wallet;
}

async function openExceptionCase(trx: Trx, tenantId: string, caseType: 'uncertain_transaction' | 'failed_transaction' | 'settlement_mismatch' | 'kyc_flag', opts: { walletTransactionId?: string; settlementId?: string; evidence?: Record<string, unknown> }) {
  await trx.insertInto('fintech_exception_cases')
    .values({
      tenant_id: tenantId, case_type: caseType,
      wallet_transaction_id: opts.walletTransactionId ?? null, settlement_id: opts.settlementId ?? null,
      evidence: JSON.stringify(opts.evidence ?? {}),
    }).execute();
}

// ── Deposits (provider -> wallet) ───────────────────────────────────────────

// Deliberately two-phase: initiate records the attempt (idempotent on
// provider+reference, so a webhook/poll replay can never double-record),
// confirm is the ONLY path that actually credits the wallet and posts GL —
// never collapsed into one step, since a real payment provider's own
// confirmation can arrive asynchronously and out of order with the
// initiating request.
export async function initiateDeposit(tenantId: string, walletId: string, amount: number, provider: 'selcom' | 'azampay' | 'internal', providerReference: string | null) {
  return withTenant(tenantId, async trx => {
    if (providerReference) {
      const existing = await trx.selectFrom('fintech_wallet_transactions').selectAll()
        .where('tenant_id', '=', tenantId).where('provider', '=', provider).where('provider_reference', '=', providerReference)
        .executeTakeFirst();
      if (existing) return existing; // replay — return what's already recorded, never re-record
    }
    await lockWallet(trx, tenantId, walletId);
    return trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: walletId, type: 'deposit', amount, provider, provider_reference: providerReference })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function confirmDeposit(tenantId: string, transactionId: string) {
  return withTenant(tenantId, async trx => {
    const txn = await trx.selectFrom('fintech_wallet_transactions').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', transactionId).where('status', '=', 'pending')
      .executeTakeFirst();
    if (!txn) throw new FintechError('Deposit not found or not pending', 409);
    await lockWallet(trx, tenantId, txn.wallet_id);

    const entryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Fintech wallet deposit (${txn.provider}${txn.provider_reference ? `, ref ${txn.provider_reference}` : ''})`,
      reference: txn.provider_reference ?? undefined,
      sourceModule: 'MANUAL', sourceId: txn.id,
      lines: [
        { accountCode: MOBILE_MONEY_CLEARING, debit: Number(txn.amount), credit: 0, description: 'Deposit received', currency: txn.currency },
        { accountCode: WALLET_LIABILITY, debit: 0, credit: Number(txn.amount), description: 'Credited to customer wallet', currency: txn.currency },
      ],
    }, trx);

    return trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'posted', posted_at: new Date(), gl_entry_id: entryId })
      .where('tenant_id', '=', tenantId).where('id', '=', transactionId)
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function failDeposit(tenantId: string, transactionId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const txn = await trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'failed', failed_at: new Date(), failed_reason: reason })
      .where('tenant_id', '=', tenantId).where('id', '=', transactionId).where('status', '=', 'pending')
      .returningAll().executeTakeFirst();
    if (!txn) throw new FintechError('Deposit not found or not pending', 409);
    await openExceptionCase(trx, tenantId, 'failed_transaction', { walletTransactionId: txn.id, evidence: { reason } });
    return txn;
  });
}

// ── Holds (reserved balance) ────────────────────────────────────────────────

export async function placeHold(tenantId: string, walletId: string, amount: number, reason: string) {
  return withTenant(tenantId, async trx => {
    await lockWallet(trx, tenantId, walletId);
    const balances = await walletBalances(trx, tenantId, walletId);
    if (balances.available < amount) throw new FintechError('Insufficient available balance to place this hold', 409);
    return trx.insertInto('fintech_wallet_holds')
      .values({ tenant_id: tenantId, wallet_id: walletId, amount, reason })
      .returningAll().executeTakeFirstOrThrow();
  });
}

export async function releaseHold(tenantId: string, holdId: string) {
  return withTenant(tenantId, async trx => {
    const row = await trx.updateTable('fintech_wallet_holds')
      .set({ status: 'released', released_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', holdId).where('status', '=', 'held')
      .returningAll().executeTakeFirst();
    if (!row) throw new FintechError('Hold not found or not active', 409);
    return row;
  });
}

// Captures the hold as a real, posted withdrawal from the wallet (e.g.
// funds released to settle something external) — never silently drops it.
export async function captureHold(tenantId: string, holdId: string) {
  return withTenant(tenantId, async trx => {
    const hold = await trx.selectFrom('fintech_wallet_holds').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', holdId).where('status', '=', 'held')
      .executeTakeFirst();
    if (!hold) throw new FintechError('Hold not found or not active', 409);
    await lockWallet(trx, tenantId, hold.wallet_id);

    const txn = await trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: hold.wallet_id, type: 'withdrawal', amount: hold.amount, provider: 'internal', status: 'pending' })
      .returningAll().executeTakeFirstOrThrow();

    const entryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Fintech wallet hold captured: ${hold.reason}`,
      sourceModule: 'MANUAL', sourceId: txn.id,
      lines: [
        { accountCode: WALLET_LIABILITY, debit: Number(hold.amount), credit: 0, description: 'Debited from customer wallet', currency: txn.currency },
        { accountCode: MOBILE_MONEY_CLEARING, debit: 0, credit: Number(hold.amount), description: 'Hold captured', currency: txn.currency },
      ],
    }, trx);

    const posted = await trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'posted', posted_at: new Date(), gl_entry_id: entryId })
      .where('tenant_id', '=', tenantId).where('id', '=', txn.id).returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('fintech_wallet_holds').set({ status: 'captured', captured_transaction_id: txn.id })
      .where('tenant_id', '=', tenantId).where('id', '=', holdId).execute();
    return posted;
  });
}

// Charges a fee directly against the wallet (e.g. a withdrawal or transfer
// fee) — its own posted transaction and GL entry, not folded invisibly
// into another transaction's amount.
export async function chargeFee(tenantId: string, walletId: string, amount: number, reason: string) {
  return withTenant(tenantId, async trx => {
    await lockWallet(trx, tenantId, walletId);
    const balances = await walletBalances(trx, tenantId, walletId);
    if (balances.available < amount) throw new FintechError('Insufficient available balance to charge this fee', 409);

    const txn = await trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: walletId, type: 'fee', amount, provider: 'internal', status: 'pending' })
      .returningAll().executeTakeFirstOrThrow();

    const entryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(), description: `Fintech wallet fee: ${reason}`,
      sourceModule: 'MANUAL', sourceId: txn.id,
      lines: [
        { accountCode: WALLET_LIABILITY, debit: amount, credit: 0, description: 'Fee debited from customer wallet', currency: txn.currency },
        { accountCode: FEE_INCOME, debit: 0, credit: amount, description: reason, currency: txn.currency },
      ],
    }, trx);

    return trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'posted', posted_at: new Date(), gl_entry_id: entryId })
      .where('tenant_id', '=', tenantId).where('id', '=', txn.id).returningAll().executeTakeFirstOrThrow();
  });
}

// ── Withdrawals (wallet -> provider payout) ─────────────────────────────────

// Calls the named partner's real adapter. Until that adapter is verified
// (see fintech-provider-adapter.ts), this will throw ProviderNotVerifiedError
// — which this function treats as a real failure (opens an exception case),
// never as a silent success. No money is fabricated as moved.
export async function withdraw(tenantId: string, walletId: string, amount: number, provider: 'selcom' | 'azampay', msisdn: string, reference: string) {
  const { getProviderAdapter } = await import('../lib/fintech-provider-adapter.js');

  // Phase 1: lock, check balance, record the pending attempt — then commit.
  // The network call to the provider deliberately happens OUTSIDE any open
  // DB transaction (never hold a row lock across slow I/O), and phase 2
  // below runs in its OWN transaction so a failure's record genuinely
  // commits instead of rolling back together with the error that reports it.
  const txn = await withTenant(tenantId, async trx => {
    await lockWallet(trx, tenantId, walletId);
    const balances = await walletBalances(trx, tenantId, walletId);
    if (balances.available < amount) throw new FintechError('Insufficient available balance for this withdrawal', 409);
    return trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: walletId, type: 'withdrawal', amount, provider, provider_reference: reference, status: 'pending' })
      .returningAll().executeTakeFirstOrThrow();
  });

  try {
    const adapter = getProviderAdapter(tenantId, provider);
    const result = await adapter.disburse({ amount, currency: txn.currency, msisdn, reference });
    if (result.status !== 'success') throw new FintechError(`Provider reported status: ${result.status}`, 502);
  } catch (err) {
    await withTenant(tenantId, async trx => {
      await trx.updateTable('fintech_wallet_transactions')
        .set({ status: 'failed', failed_at: new Date(), failed_reason: (err as Error).message })
        .where('tenant_id', '=', tenantId).where('id', '=', txn.id).execute();
      await openExceptionCase(trx, tenantId, 'failed_transaction', { walletTransactionId: txn.id, evidence: { error: (err as Error).message } });
    });
    throw err;
  }

  return withTenant(tenantId, async trx => {
    const entryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Fintech wallet withdrawal via ${provider} (ref ${reference})`,
      reference, sourceModule: 'MANUAL', sourceId: txn.id,
      lines: [
        { accountCode: WALLET_LIABILITY, debit: amount, credit: 0, description: 'Debited from customer wallet', currency: txn.currency },
        { accountCode: MOBILE_MONEY_CLEARING, debit: 0, credit: amount, description: 'Disbursed to provider', currency: txn.currency },
      ],
    }, trx);

    return trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'posted', posted_at: new Date(), gl_entry_id: entryId })
      .where('tenant_id', '=', tenantId).where('id', '=', txn.id).returningAll().executeTakeFirstOrThrow();
  });
}

// ── Internal transfers (wallet -> wallet) ───────────────────────────────────

// Both sides post to the SAME wallet-liability account (2720) — there is no
// per-wallet GL sub-account, so a transfer's two lines net to zero on that
// account, which is the correct aggregate effect: total funds owed to all
// customers combined doesn't change, only which wallet it's attributed to.
export async function transferBetweenWallets(tenantId: string, fromWalletId: string, toWalletId: string, amount: number) {
  if (fromWalletId === toWalletId) throw new FintechError('Cannot transfer a wallet to itself', 400);
  return withTenant(tenantId, async trx => {
    // Lock in a deterministic order (by id) to avoid deadlocking against a
    // concurrent transfer going the opposite direction between the same
    // two wallets.
    const [first, second] = [fromWalletId, toWalletId].sort();
    await lockWallet(trx, tenantId, first);
    await lockWallet(trx, tenantId, second);

    const balances = await walletBalances(trx, tenantId, fromWalletId);
    if (balances.available < amount) throw new FintechError('Insufficient available balance for this transfer', 409);

    const out = await trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: fromWalletId, type: 'transfer_out', amount, provider: 'internal', status: 'pending' })
      .returningAll().executeTakeFirstOrThrow();
    const inn = await trx.insertInto('fintech_wallet_transactions')
      .values({ tenant_id: tenantId, wallet_id: toWalletId, type: 'transfer_in', amount, provider: 'internal', status: 'pending', related_transaction_id: out.id })
      .returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('fintech_wallet_transactions').set({ related_transaction_id: inn.id })
      .where('tenant_id', '=', tenantId).where('id', '=', out.id).execute();

    const entryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(), description: 'Fintech wallet-to-wallet transfer',
      sourceModule: 'MANUAL', sourceId: out.id,
      lines: [
        { accountCode: WALLET_LIABILITY, debit: amount, credit: 0, description: 'Transfer out', currency: out.currency },
        { accountCode: WALLET_LIABILITY, debit: 0, credit: amount, description: 'Transfer in', currency: out.currency },
      ],
    }, trx);

    await trx.updateTable('fintech_wallet_transactions')
      .set({ status: 'posted', posted_at: new Date(), gl_entry_id: entryId })
      .where('tenant_id', '=', tenantId).where('id', 'in', [out.id, inn.id]).execute();
    return trx.selectFrom('fintech_wallet_transactions').selectAll()
      .where('tenant_id', '=', tenantId).where('id', 'in', [out.id, inn.id]).execute();
  });
}

// ── Reversal (never delete, never edit) ─────────────────────────────────────

export async function reverseTransaction(tenantId: string, transactionId: string, actorId: string, reason: string) {
  return withTenant(tenantId, async trx => {
    const original = await trx.selectFrom('fintech_wallet_transactions').selectAll()
      .where('tenant_id', '=', tenantId).where('id', '=', transactionId).where('status', '=', 'posted')
      .forUpdate().executeTakeFirst();
    if (!original) throw new FintechError('Transaction not found or not posted', 409);
    if (!original.gl_entry_id) throw new FintechError('Transaction has no linked GL entry to reverse', 409);

    await trx.updateTable('fintech_wallet_transactions').set({ status: 'reversed', reversed_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', transactionId).execute();

    const voidEntryId = await GLService.voidEntry(tenantId, original.gl_entry_id, actorId, reason, trx);

    return trx.insertInto('fintech_wallet_transactions')
      .values({
        tenant_id: tenantId, wallet_id: original.wallet_id, type: 'reversal', amount: original.amount,
        provider: 'internal', related_transaction_id: original.id, status: 'posted', posted_at: new Date(), gl_entry_id: voidEntryId,
      })
      .returningAll().executeTakeFirstOrThrow();
  });
}

// ── Provider settlement reconciliation (P1) ─────────────────────────────────

export async function recordSettlementBatch(
  tenantId: string, provider: 'selcom' | 'azampay', batchReference: string,
  periodStart: string, periodEnd: string, expectedAmount: number, settledAmount: number,
) {
  return withTenant(tenantId, async trx => {
    const status = Math.abs(expectedAmount - settledAmount) > 0.01 ? 'mismatched' : 'matched';
    const settlement = await trx.insertInto('fintech_provider_settlements')
      .values({ tenant_id: tenantId, provider, batch_reference: batchReference, period_start: periodStart, period_end: periodEnd, expected_amount: expectedAmount, settled_amount: settledAmount, status })
      .returningAll().executeTakeFirstOrThrow();
    if (status === 'mismatched') {
      await openExceptionCase(trx, tenantId, 'settlement_mismatch', { settlementId: settlement.id, evidence: { expectedAmount, settledAmount, diff: expectedAmount - settledAmount } });
    }
    return settlement;
  });
}

export async function resolveExceptionCase(tenantId: string, caseId: string, actorId: string, resolutionNotes: string) {
  return withTenant(tenantId, async trx => {
    const row = await trx.updateTable('fintech_exception_cases')
      .set({ status: 'resolved', resolved_by: actorId, resolved_at: new Date(), resolution_notes: resolutionNotes })
      .where('tenant_id', '=', tenantId).where('id', '=', caseId).where('status', '!=', 'resolved')
      .returningAll().executeTakeFirst();
    if (!row) throw new FintechError('Exception case not found or already resolved', 409);
    return row;
  });
}

export async function listOpenExceptionCases(tenantId: string) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('fintech_exception_cases').selectAll()
      .where('tenant_id', '=', tenantId).where('status', 'in', ['open', 'investigating', 'escalated'])
      .orderBy('opened_at', 'desc').execute());
}
