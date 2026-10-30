import { withTenant, dbPlatform } from '../db/client.js';
import type { EsbPostingType, EsbOperationStatus } from '../db/client.js';
import { PaymentGateway } from '../integrations/payment-gateway.js';
import { sql } from 'kysely';

// ---------------------------------------------------------------------------
// Wallet — auto-created per tenant, one per tenant
// ---------------------------------------------------------------------------

async function ensureWallet(tenantId: string): Promise<string> {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('esb_wallets')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (existing) return existing.id;
    const row = await trx.insertInto('esb_wallets')
      .values({ tenant_id: tenantId, currency: 'TZS' })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  });
}

// ---------------------------------------------------------------------------
// Balance — available = SUM of all posted amounts minus pending reserves
// ---------------------------------------------------------------------------

export interface EsbBalance {
  available: number;
  reserved: number;
  total: number;
  currency: string;
}

export async function getBalance(tenantId: string): Promise<EsbBalance> {
  return withTenant(tenantId, async (trx) => {
    const wallet = await trx.selectFrom('esb_wallets')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!wallet) return { available: 0, reserved: 0, total: 0, currency: 'TZS' };

    // SUM(all postings) is the true balance: top-ups are positive, reserves
    // are negative, captures are negative, releases/refunds are positive.
    // After a reserve→capture→release cycle the net is -actualAmount. Correct.
    const { total } = await trx.selectFrom('esb_postings')
      .select(sql<number>`COALESCE(SUM(amount), 0)`.as('total'))
      .where('wallet_id', '=', wallet.id)
      .where('tenant_id', '=', tenantId)
      .executeTakeFirstOrThrow();

    // "Reserved" is the display-only sum of quoted_amount on operations that
    // haven't settled yet (their reserve posting is already in `total`).
    const { reserved } = await trx.selectFrom('esb_operations')
      .select(sql<number>`COALESCE(SUM(quoted_amount), 0)`.as('reserved'))
      .where('tenant_id', '=', tenantId)
      .where('wallet_id', '=', wallet.id)
      .where('status', 'in', ['reserved', 'dispatched', 'reconciling'])
      .executeTakeFirstOrThrow();

    const t = Number(total);
    const r = Number(reserved);

    return {
      available: Math.max(0, t),
      reserved: Math.max(0, r),
      total: t,
      currency: 'TZS',
    };
  });
}

/**
 * Computes available balance atomically within a transaction.
 * Used inside reserve() to enforce sufficient funds.
 */
async function availableBalanceInTrx(trx: any, walletId: string, tenantId: string): Promise<number> {
  // Total of all postings (top-ups positive, reserves negative, captures negative, releases positive)
  const { total } = await trx.selectFrom('esb_postings')
    .select(sql<number>`COALESCE(SUM(amount), 0)`.as('total'))
    .where('wallet_id', '=', walletId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirstOrThrow();
  return Number(total);
}

// ---------------------------------------------------------------------------
// Top-up — fund the wallet via payment gateway or manual credit
// ---------------------------------------------------------------------------

export interface TopUpRequest {
  tenantId: string;
  amount: number;
  gatewayTxRef: string;
  gatewayTxId?: string;
  gatewayProvider?: string;
  description?: string;
  initiatedBy?: string;
}

export interface TopUpResult {
  success: boolean;
  error?: string;
  postingId?: string;
  newBalance?: number;
}

export async function topUp(req: TopUpRequest): Promise<TopUpResult> {
  if (req.amount <= 0) return { success: false, error: 'Amount must be positive' };

  const walletId = await ensureWallet(req.tenantId);

  return withTenant(req.tenantId, async (trx) => {
    // Verify this tx_ref belongs to a checkout initiated by this tenant.
    // Without this, a crafted tx_ref could credit the wrong wallet.
    if (req.gatewayTxRef) {
      const checkout = await trx.selectFrom('esb_checkout_requests')
        .select(['id', 'amount', 'status'])
        .where('tx_ref', '=', req.gatewayTxRef)
        .where('tenant_id', '=', req.tenantId)
        .executeTakeFirst();

      if (!checkout) {
        return { success: false, error: 'No checkout request found for this payment reference' };
      }
      if (checkout.status === 'completed') {
        // Already processed — find the existing posting for idempotency
        const dup = await trx.selectFrom('esb_postings')
          .select('id')
          .where('tenant_id', '=', req.tenantId)
          .where('posting_type', '=', 'top_up')
          .where('gateway_tx_ref', '=', req.gatewayTxRef)
          .executeTakeFirst();
        if (dup) return { success: true, postingId: dup.id };
      }
    }

    // Verify the payment with the gateway if configured
    if (req.gatewayTxRef && PaymentGateway.isConfigured()) {
      const verification = await PaymentGateway.verifyByReference(req.gatewayTxRef);
      if (!verification.ok) {
        return { success: false, error: `Payment verification failed: ${verification.error ?? verification.status}` };
      }
      if (verification.amount !== req.amount || verification.currency !== 'TZS') {
        return { success: false, error: `Amount/currency mismatch: expected TZS ${req.amount}, gateway reports ${verification.currency} ${verification.amount}` };
      }
    }

    // Idempotency guard (backed by unique partial index)
    if (req.gatewayTxRef) {
      const dup = await trx.selectFrom('esb_postings')
        .select('id')
        .where('tenant_id', '=', req.tenantId)
        .where('posting_type', '=', 'top_up')
        .where('gateway_tx_ref', '=', req.gatewayTxRef)
        .executeTakeFirst();
      if (dup) return { success: true, postingId: dup.id };
    }

    const posting = await trx.insertInto('esb_postings').values({
      tenant_id: req.tenantId,
      wallet_id: walletId,
      posting_type: 'top_up' as EsbPostingType,
      amount: req.amount,
      currency: 'TZS',
      gateway_provider: req.gatewayProvider ?? 'flutterwave',
      gateway_tx_ref: req.gatewayTxRef,
      gateway_tx_id: req.gatewayTxId ?? null,
      description: req.description ?? `Top-up TZS ${req.amount.toLocaleString()}`,
      initiated_by: req.initiatedBy ?? null,
      reservation_id: null,
      refund_operation_id: null,
      service_kind: null,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
    }).returning('id').executeTakeFirstOrThrow();

    // Mark the checkout request as completed (inside the same transaction)
    if (req.gatewayTxRef) {
      await trx.updateTable('esb_checkout_requests')
        .set({ status: 'completed', completed_at: new Date() })
        .where('tx_ref', '=', req.gatewayTxRef)
        .where('tenant_id', '=', req.tenantId)
        .execute();
    }

    const bal = await availableBalanceInTrx(trx, walletId, req.tenantId);
    return { success: true, postingId: posting.id, newBalance: bal };
  });
}

// ---------------------------------------------------------------------------
// Reserve — atomically hold funds for an in-flight service call
// ---------------------------------------------------------------------------

export interface ReserveRequest {
  tenantId: string;
  serviceKind: string;
  quotedAmount: number;
  providerDetail?: Record<string, unknown>;
  initiatedBy?: string;
  sourceApp?: string;
  sourceRef?: string;
}

export interface ReserveResult {
  success: boolean;
  error?: string;
  code?: 'INSUFFICIENT_FUNDS' | 'WALLET_NOT_FOUND';
  operationId?: string;
  reservePostingId?: string;
}

export async function reserve(req: ReserveRequest): Promise<ReserveResult> {
  if (req.quotedAmount <= 0) return { success: false, error: 'Quoted amount must be positive' };

  return withTenant(req.tenantId, async (trx) => {
    // Lock the wallet row to prevent concurrent reserves from both
    // passing on a stale balance (Bug 4 fix).
    const wallet = await trx.selectFrom('esb_wallets')
      .select('id')
      .where('tenant_id', '=', req.tenantId)
      .where('is_active', '=', true)
      .forUpdate()
      .executeTakeFirst();

    if (!wallet) return { success: false, error: 'No active wallet', code: 'WALLET_NOT_FOUND' as const };

    const available = await availableBalanceInTrx(trx, wallet.id, req.tenantId);
    if (available < req.quotedAmount) {
      return {
        success: false,
        error: `Insufficient funds: available TZS ${available.toLocaleString()}, needed TZS ${req.quotedAmount.toLocaleString()}`,
        code: 'INSUFFICIENT_FUNDS' as const,
      };
    }

    const posting = await trx.insertInto('esb_postings').values({
      tenant_id: req.tenantId,
      wallet_id: wallet.id,
      posting_type: 'reserve' as EsbPostingType,
      amount: -req.quotedAmount,
      currency: 'TZS',
      service_kind: req.serviceKind,
      description: `Reserve for ${req.serviceKind}`,
      initiated_by: req.initiatedBy ?? null,
      reservation_id: null,
      refund_operation_id: null,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
      gateway_provider: null,
      gateway_tx_ref: null,
      gateway_tx_id: null,
    }).returning('id').executeTakeFirstOrThrow();

    // Create the operation tracking record
    const op = await trx.insertInto('esb_operations').values({
      tenant_id: req.tenantId,
      wallet_id: wallet.id,
      service_kind: req.serviceKind,
      status: 'reserved' as EsbOperationStatus,
      quoted_amount: req.quotedAmount,
      actual_amount: null,
      supplier_amount: null,
      supplier_currency: null,
      provider_detail: req.providerDetail ?? {},
      reserve_posting_id: posting.id,
      capture_posting_id: null,
      release_posting_id: null,
      initiated_by: req.initiatedBy ?? null,
      source_app: req.sourceApp ?? null,
      source_ref: req.sourceRef ?? null,
      settled_at: null,
    }).returning('id').executeTakeFirstOrThrow();

    return { success: true, operationId: op.id, reservePostingId: posting.id };
  });
}

// ---------------------------------------------------------------------------
// Capture — settle an operation with the actual charge
// ---------------------------------------------------------------------------

export interface CaptureRequest {
  tenantId: string;
  operationId: string;
  actualAmount: number;
  supplierAmount?: number;
  supplierCurrency?: string;
  serviceRef?: string;
  providerDetail?: Record<string, unknown>;
}

export interface CaptureResult {
  success: boolean;
  error?: string;
  capturePostingId?: string;
  releasePostingId?: string;
  releasedAmount?: number;
}

export async function capture(req: CaptureRequest): Promise<CaptureResult> {
  if (req.actualAmount < 0) return { success: false, error: 'Actual amount cannot be negative' };

  return withTenant(req.tenantId, async (trx) => {
    const op = await trx.selectFrom('esb_operations')
      .selectAll()
      .where('id', '=', req.operationId)
      .where('tenant_id', '=', req.tenantId)
      .where('status', 'in', ['reserved', 'dispatched'])
      .executeTakeFirst();

    if (!op) return { success: false, error: 'Operation not found or already settled' };

    // The reserve posting already deducted -quotedAmount.
    // To settle: release the full reservation (+quotedAmount), then post
    // the actual charge (-actualAmount).  Net = -actualAmount.  The old
    // code posted -actualAmount *on top of* the existing -quotedAmount
    // reserve and only released the surplus, producing -2×actualAmount.
    const quotedAmount = Number(op.quoted_amount);

    const releasePosting = await trx.insertInto('esb_postings').values({
      tenant_id: req.tenantId,
      wallet_id: op.wallet_id,
      posting_type: 'release' as EsbPostingType,
      amount: quotedAmount,
      currency: 'TZS',
      reservation_id: op.reserve_posting_id,
      service_kind: op.service_kind,
      description: `Release reservation for ${op.service_kind}: TZS ${quotedAmount}`,
      initiated_by: null,
      refund_operation_id: null,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
      gateway_provider: null,
      gateway_tx_ref: null,
      gateway_tx_id: null,
    }).returning('id').executeTakeFirstOrThrow();

    const capturePosting = await trx.insertInto('esb_postings').values({
      tenant_id: req.tenantId,
      wallet_id: op.wallet_id,
      posting_type: 'capture' as EsbPostingType,
      amount: -req.actualAmount,
      currency: 'TZS',
      reservation_id: op.reserve_posting_id,
      service_kind: op.service_kind,
      service_ref: req.serviceRef ?? null,
      supplier_amount: req.supplierAmount ?? null,
      supplier_currency: req.supplierCurrency ?? null,
      description: `Capture ${op.service_kind}: TZS ${req.actualAmount}`,
      initiated_by: null,
      refund_operation_id: null,
      gateway_provider: null,
      gateway_tx_ref: null,
      gateway_tx_id: null,
    }).returning('id').executeTakeFirstOrThrow();

    const releasePostingId: string | undefined = releasePosting.id;
    const surplus = quotedAmount - req.actualAmount;

    // Merge new provider detail into existing
    const mergedDetail = { ...(op.provider_detail as Record<string, unknown>), ...(req.providerDetail ?? {}) };

    await trx.updateTable('esb_operations')
      .set({
        status: 'captured' as EsbOperationStatus,
        actual_amount: req.actualAmount,
        supplier_amount: req.supplierAmount ?? null,
        supplier_currency: req.supplierCurrency ?? null,
        provider_detail: mergedDetail,
        capture_posting_id: capturePosting.id,
        release_posting_id: releasePosting.id,
        settled_at: new Date(),
      })
      .where('id', '=', req.operationId)
      .where('tenant_id', '=', req.tenantId)
      .execute();

    return {
      success: true,
      capturePostingId: capturePosting.id,
      releasePostingId,
      releasedAmount: surplus > 0 ? surplus : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Release — fully release a reservation (call failed or was cancelled)
// ---------------------------------------------------------------------------

export async function releaseReservation(tenantId: string, operationId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  return withTenant(tenantId, async (trx) => {
    const op = await trx.selectFrom('esb_operations')
      .selectAll()
      .where('id', '=', operationId)
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', ['reserved', 'dispatched', 'failed'])
      .executeTakeFirst();

    if (!op) return { success: false, error: 'Operation not found or already settled' };

    const releasePosting = await trx.insertInto('esb_postings').values({
      tenant_id: tenantId,
      wallet_id: op.wallet_id,
      posting_type: 'release' as EsbPostingType,
      amount: Number(op.quoted_amount),
      currency: 'TZS',
      reservation_id: op.reserve_posting_id,
      service_kind: op.service_kind,
      description: reason ?? `Released: ${op.service_kind} call cancelled/failed`,
      initiated_by: null,
      refund_operation_id: null,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
      gateway_provider: null,
      gateway_tx_ref: null,
      gateway_tx_id: null,
    }).returning('id').executeTakeFirstOrThrow();

    await trx.updateTable('esb_operations')
      .set({
        status: 'released' as EsbOperationStatus,
        actual_amount: 0,
        release_posting_id: releasePosting.id,
        settled_at: new Date(),
      })
      .where('id', '=', operationId)
      .where('tenant_id', '=', tenantId)
      .execute();

    return { success: true };
  });
}

// ---------------------------------------------------------------------------
// Refund — manual correction/provider credit
// ---------------------------------------------------------------------------

export async function refund(
  tenantId: string,
  operationId: string,
  amount: number,
  description: string,
  initiatedBy?: string,
): Promise<{ success: boolean; error?: string; postingId?: string }> {
  if (amount <= 0) return { success: false, error: 'Refund amount must be positive' };

  return withTenant(tenantId, async (trx) => {
    // Lock the operation row to serialize concurrent refunds against it.
    // Without this, two concurrent refunds both read SUM(prior) = 0 and
    // both pass the cap check, over-refunding.
    const op = await trx.selectFrom('esb_operations')
      .select(['id', 'wallet_id', 'service_kind', 'actual_amount', 'reserve_posting_id'])
      .where('id', '=', operationId)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'captured')
      .forUpdate()
      .executeTakeFirst();

    if (!op) return { success: false, error: 'Operation not found or not in captured state' };

    const actualCharge = Number(op.actual_amount);

    const { already } = await trx.selectFrom('esb_postings')
      .select(sql<number>`COALESCE(SUM(amount), 0)`.as('already'))
      .where('tenant_id', '=', tenantId)
      .where('refund_operation_id', '=', operationId)
      .where('posting_type', '=', 'refund')
      .executeTakeFirstOrThrow();

    const alreadyRefunded = Number(already);
    const refundable = actualCharge - alreadyRefunded;

    if (amount > refundable) {
      return { success: false, error: `Refund exceeds cap: max refundable TZS ${refundable}, requested TZS ${amount}` };
    }

    const posting = await trx.insertInto('esb_postings').values({
      tenant_id: tenantId,
      wallet_id: op.wallet_id,
      posting_type: 'refund' as EsbPostingType,
      amount,
      currency: 'TZS',
      description,
      initiated_by: initiatedBy ?? null,
      reservation_id: op.reserve_posting_id,
      refund_operation_id: operationId,
      service_kind: op.service_kind,
      service_ref: null,
      supplier_amount: null,
      supplier_currency: null,
      gateway_provider: null,
      gateway_tx_ref: null,
      gateway_tx_id: null,
    }).returning('id').executeTakeFirstOrThrow();

    return { success: true, postingId: posting.id };
  });
}

// ---------------------------------------------------------------------------
// Statement — paginated list of postings for the tenant
// ---------------------------------------------------------------------------

export interface StatementEntry {
  id: string;
  posting_type: EsbPostingType;
  amount: number;
  currency: string;
  service_kind: string | null;
  description: string | null;
  gateway_tx_ref: string | null;
  created_at: Date;
}

export async function getStatement(tenantId: string, limit = 50, offset = 0): Promise<StatementEntry[]> {
  return withTenant(tenantId, async (trx) => {
    const wallet = await trx.selectFrom('esb_wallets')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();
    if (!wallet) return [];

    const rows = await trx.selectFrom('esb_postings')
      .select(['id', 'posting_type', 'amount', 'currency', 'service_kind', 'description', 'gateway_tx_ref', 'created_at'])
      .where('wallet_id', '=', wallet.id)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    return rows.map(r => ({ ...r, amount: Number(r.amount) }));
  });
}

// ---------------------------------------------------------------------------
// Pending operations — operations that haven't settled yet
// ---------------------------------------------------------------------------

export async function getPendingOperations(tenantId: string): Promise<Array<{
  id: string; service_kind: string; status: string; quoted_amount: number; created_at: Date;
}>> {
  return withTenant(tenantId, async (trx) => {
    return trx.selectFrom('esb_operations')
      .select(['id', 'service_kind', 'status', 'quoted_amount', 'created_at'])
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', ['reserved', 'dispatched', 'reconciling'])
      .orderBy('created_at', 'desc')
      .execute()
      .then(rows => rows.map(r => ({ ...r, quoted_amount: Number(r.quoted_amount) })));
  });
}

// ---------------------------------------------------------------------------
// Create checkout — generate a gateway payment link for a top-up
// ---------------------------------------------------------------------------

export interface TopUpCheckoutRequest {
  tenantId: string;
  amount: number;
  email: string;
  name: string;
  redirectUrl: string;
  initiatedBy?: string;
}

export async function createTopUpCheckout(req: TopUpCheckoutRequest): Promise<{ url: string; txRef: string }> {
  if (req.amount < 1000) throw new Error('Minimum top-up is TZS 1,000');
  if (req.amount > 10_000_000) throw new Error('Maximum single top-up is TZS 10,000,000');

  const walletId = await ensureWallet(req.tenantId);
  const txRef = `esb-${req.tenantId.slice(0, 8)}-${Date.now()}`;

  // Persist the checkout request so topUp() can verify this tenant
  // initiated the payment.  Without this, a crafted tx_ref could
  // credit the wrong wallet.
  await withTenant(req.tenantId, async (trx) => {
    await trx.insertInto('esb_checkout_requests').values({
      tenant_id: req.tenantId,
      wallet_id: walletId,
      tx_ref: txRef,
      amount: req.amount,
      currency: 'TZS',
      initiated_by: req.initiatedBy ?? null,
      completed_at: null,
    }).execute();
  });

  const { url } = await PaymentGateway.createCheckout({
    txRef,
    amount: req.amount,
    currency: 'TZS',
    email: req.email,
    name: req.name,
    redirectUrl: req.redirectUrl,
    title: 'Hudumika External Services Top-up',
    meta: { tenant_id: req.tenantId, purpose: 'esb_topup' },
  });

  return { url, txRef };
}
