import { withTenant } from '../db/client.js';
import { GLService } from './gl.service.js';

// Petty-cash withdrawal categories. Deliberately its own small vocabulary
// rather than reusing financeExpenses.routes.ts's EXPENSE_CATEGORIES
// (PORT_CHARGES/CUSTOMS_DUTY/FREIGHT/...) — those are clearing/freight cost
// categories and don't describe what petty cash actually buys. Same
// no-DB-CHECK freedom applies here (finance_expenses.category is a plain
// VARCHAR), so this list only constrains what the UI offers, not the schema.
export const PETTI_CATEGORIES = [
  'OFFICE_SUPPLIES', 'TRANSPORT', 'MEALS_ENTERTAINMENT', 'UTILITIES',
  'STAFF_WELFARE', 'REPAIRS_MAINTENANCE', 'POSTAGE_COURIER', 'MISCELLANEOUS',
] as const;
export type PettiCategory = typeof PETTI_CATEGORIES[number];

// Category → GL expense account (see gl.service.ts STANDARD_COA). Only maps
// the categories that have a real dedicated account already; everything else
// (most petty cash spend) is genuinely "Other Operating Expenses" — 5900 is
// the correct account for it, not a placeholder.
const PETTI_EXPENSE_ACCOUNT: Partial<Record<PettiCategory, string>> = {
  TRANSPORT: '5002',
  UTILITIES: '5102',
};
const OTHER_OPERATING_EXPENSE_ACCOUNT = '5900';
const BANK_ACCOUNT = '1010'; // Bank Account (TZS) — see STANDARD_COA

// ── Payment gateway seam ──────────────────────────────────────────────────
// Same shape as seal-customs-adapter.ts's CustomsAdapter / carrier-adapter.ts's
// CarrierAdapter: a working manual path plus a real interface for an
// unavailable external integration that fails loudly instead of pretending.
// No real Tanzanian mobile-money/aggregator gateway is wired up anywhere in
// this codebase — integrations/payments.ts's PaymentsIntegration.simulateCharge()
// is explicitly documented as a simulator used only for onboarding signup.
// Wiring a live gateway needs real merchant credentials, a business decision
// for the platform team, not something buildable from here.
export interface PaymentGatewayAdapter {
  provider: string;
  confirmDeposit(input: { amount: number; reference?: string; gatewayTxRef?: string }): Promise<{ confirmed: true; providerRef?: string }>;
}

class ManualDepositAdapter implements PaymentGatewayAdapter {
  provider = 'manual';
  async confirmDeposit(): Promise<{ confirmed: true }> {
    // A human is recording money that has already arrived by other means
    // (bank transfer, cash drop) — the record itself is the confirmation.
    return { confirmed: true };
  }
}

class StubGatewayAdapter implements PaymentGatewayAdapter {
  constructor(public provider: string) {}
  async confirmDeposit(): Promise<never> {
    throw new Error(
      `No live "${this.provider}" payment gateway is wired up yet. Record this deposit with method: 'manual' once the funds are confirmed by other means (bank statement, mobile money SMS, etc.), or ask the platform team to wire a real gateway integration — that needs real merchant credentials, a business decision, not a code change.`
    );
  }
}

function getPaymentGatewayAdapter(method: 'manual' | 'gateway', provider?: string): PaymentGatewayAdapter {
  return method === 'manual' ? new ManualDepositAdapter() : new StubGatewayAdapter(provider || 'gateway');
}

// ── Roles ──────────────────────────────────────────────────────────────────
// Approval/disbursement is a finance-control action — narrower than the
// general finance WRITE_ROLES set (financeExpenses.routes.ts) because it
// deliberately excludes SALES: a sales officer can request petty cash but
// should not be the one approving/paying it out.
export const PETTI_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'] as const;

export class PettiService {
  static async listWallets(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const wallets = await trx.selectFrom('petti_wallets').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('created_at', 'asc')
        .execute();
      if (wallets.length === 0) return [];

      const accountIds = wallets.map(w => w.gl_account_id);
      const sums = await trx.selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', 'in', accountIds)
        .groupBy('journal_lines.account_id')
        .execute();
      const balanceMap = Object.fromEntries(sums.map(s => [s.account_id, Number(s.debits || 0) - Number(s.credits || 0)]));

      return wallets.map(w => ({ ...w, balance: balanceMap[w.gl_account_id] ?? 0 }));
    });
  }

  static async getWalletBalance(tenantId: string, glAccountId: string): Promise<number> {
    return withTenant(tenantId, async (trx) => {
      const sum = await trx.selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select([trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', '=', glAccountId)
        .executeTakeFirst();
      return Number(sum?.debits || 0) - Number(sum?.credits || 0);
    });
  }

  static async getWallet(tenantId: string, walletId: string) {
    const result = await withTenant(tenantId, async (trx) => {
      const wallet = await trx.selectFrom('petti_wallets').selectAll()
        .where('id', '=', walletId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!wallet) return null;
      const [deposits, withdrawals] = await Promise.all([
        trx.selectFrom('petti_deposits').selectAll().where('wallet_id', '=', walletId).orderBy('created_at', 'desc').limit(50).execute(),
        trx.selectFrom('petti_withdrawal_requests').selectAll().where('wallet_id', '=', walletId).orderBy('requested_at', 'desc').limit(50).execute(),
      ]);
      return { wallet, deposits, withdrawals };
    });
    if (!result) return null;
    const balance = await PettiService.getWalletBalance(tenantId, result.wallet.gl_account_id);
    return { ...result, wallet: { ...result.wallet, balance } };
  }

  /** Auto-provisions a dedicated GL asset account for the wallet, using a
   *  non-numeric 'PW-####' code so it can never collide with a tenant's own
   *  numeric chart of accounts — same reasoning as gl.service.ts's IC-AR/IC-AP
   *  intercompany clearing accounts. Marked is_system so it can't be deleted
   *  from the Chart of Accounts screen while a wallet still references it. */
  static async createWallet(tenantId: string, userId: string, data: { name: string; description?: string; currency?: string }) {
    const name = data.name.trim();
    if (!name) throw new Error('Wallet name is required.');

    return withTenant(tenantId, async (trx) => {
      const countResult = await trx.selectFrom('petti_wallets')
        .select(trx.fn.count('id').as('n')).where('tenant_id', '=', tenantId).executeTakeFirst();
      let seq = Number(countResult?.n ?? 0) + 1;
      let code = `PW-${String(seq).padStart(4, '0')}`;
      const collision = await trx.selectFrom('chart_of_accounts').select('id')
        .where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
      if (collision) { seq += 1; code = `PW-${String(seq).padStart(4, '0')}`; }

      const account = await trx.insertInto('chart_of_accounts').values({
        tenant_id: tenantId,
        code,
        name: `Petty Cash Wallet — ${name}`,
        type: 'ASSET',
        subtype: 'CURRENT_ASSET',
        normal_balance: 'DEBIT',
        is_system: true,
      }).returning('id').executeTakeFirstOrThrow();

      return trx.insertInto('petti_wallets').values({
        tenant_id: tenantId,
        name,
        description: data.description || null,
        gl_account_id: account.id,
        currency: data.currency || 'TZS',
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  static async setWalletStatus(tenantId: string, walletId: string, status: 'active' | 'closed') {
    const row = await withTenant(tenantId, (trx) =>
      trx.updateTable('petti_wallets').set({ status })
        .where('id', '=', walletId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst()
    );
    if (!row) throw new Error('Wallet not found.');
    return row;
  }

  /** Records a deposit: Dr the wallet's own GL account, Cr Bank Account (1010).
   *  method:'manual' is the only path that works today — see getPaymentGatewayAdapter. */
  static async recordDeposit(tenantId: string, userId: string, data: {
    walletId: string; amount: number; method?: 'manual' | 'gateway';
    gatewayProvider?: string; gatewayTxRef?: string; reference?: string; note?: string;
  }) {
    if (!(data.amount > 0)) throw new Error('Deposit amount must be positive.');
    const method = data.method || 'manual';

    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').selectAll()
        .where('id', '=', data.walletId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.status !== 'active') throw new Error('This wallet is closed and cannot accept deposits.');

    const confirmation = await getPaymentGatewayAdapter(method, data.gatewayProvider)
      .confirmDeposit({ amount: data.amount, reference: data.reference, gatewayTxRef: data.gatewayTxRef });

    const walletAccount = await withTenant(tenantId, (trx) =>
      trx.selectFrom('chart_of_accounts').select('code').where('id', '=', wallet.gl_account_id).executeTakeFirstOrThrow()
    );

    const journalEntryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Petti deposit: ${wallet.name}${data.reference ? ` (${data.reference})` : ''}`,
      reference: data.reference,
      sourceModule: 'MANUAL',
      sourceId: wallet.id,
      createdBy: userId,
      lines: [
        { accountCode: walletAccount.code, debit: data.amount, credit: 0, description: `Deposit to ${wallet.name}` },
        { accountCode: BANK_ACCOUNT, debit: 0, credit: data.amount, description: `To ${wallet.name}` },
      ],
    });

    return withTenant(tenantId, (trx) => trx.insertInto('petti_deposits').values({
      tenant_id: tenantId,
      wallet_id: wallet.id,
      amount: data.amount,
      method,
      gateway_provider: data.gatewayProvider || null,
      gateway_tx_ref: data.gatewayTxRef || confirmation.providerRef || null,
      reference: data.reference || null,
      note: data.note || null,
      journal_entry_id: journalEntryId,
      recorded_by: userId,
    }).returningAll().executeTakeFirstOrThrow());
  }

  static async requestWithdrawal(tenantId: string, userId: string, data: {
    walletId: string; amount: number; category?: string; purpose: string;
  }) {
    if (!(data.amount > 0)) throw new Error('Withdrawal amount must be positive.');
    const purpose = data.purpose?.trim();
    if (!purpose) throw new Error('A purpose is required for every withdrawal request.');
    const category = (data.category && (PETTI_CATEGORIES as readonly string[]).includes(data.category))
      ? data.category : 'MISCELLANEOUS';

    return withTenant(tenantId, async (trx) => {
      const wallet = await trx.selectFrom('petti_wallets').select(['id', 'status'])
        .where('id', '=', data.walletId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!wallet) throw new Error('Wallet not found.');
      if (wallet.status !== 'active') throw new Error('This wallet is closed and cannot accept withdrawal requests.');

      return trx.insertInto('petti_withdrawal_requests').values({
        tenant_id: tenantId,
        wallet_id: data.walletId,
        amount: data.amount,
        category,
        purpose,
        requested_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  static async listWithdrawalRequests(tenantId: string, filters: { walletId?: string; status?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_withdrawal_requests').selectAll().where('tenant_id', '=', tenantId);
      if (filters.walletId) q = q.where('wallet_id', '=', filters.walletId);
      if (filters.status) q = q.where('status', '=', filters.status);
      return q.orderBy('requested_at', 'desc').execute();
    });
  }

  static async approveWithdrawal(tenantId: string, userId: string, requestId: string) {
    return withTenant(tenantId, async (trx) => {
      const req = await trx.selectFrom('petti_withdrawal_requests').select(['id', 'status', 'requested_by'])
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!req) throw new Error('Withdrawal request not found.');
      if (req.status !== 'pending') throw new Error(`Cannot approve a request in '${req.status}' status.`);
      if (req.requested_by === userId) throw new Error('The requester cannot approve their own withdrawal request.');

      return trx.updateTable('petti_withdrawal_requests')
        .set({ status: 'approved', approved_by: userId, approved_at: new Date() })
        .where('id', '=', requestId)
        .returningAll().executeTakeFirstOrThrow();
    });
  }

  static async rejectWithdrawal(tenantId: string, userId: string, requestId: string, reason?: string) {
    return withTenant(tenantId, async (trx) => {
      const req = await trx.selectFrom('petti_withdrawal_requests').select(['id', 'status'])
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!req) throw new Error('Withdrawal request not found.');
      if (req.status !== 'pending') throw new Error(`Cannot reject a request in '${req.status}' status.`);

      return trx.updateTable('petti_withdrawal_requests')
        .set({ status: 'rejected', approved_by: userId, approved_at: new Date(), rejection_reason: reason || null })
        .where('id', '=', requestId)
        .returningAll().executeTakeFirstOrThrow();
    });
  }

  /**
   * Disburses an approved withdrawal request: inserts a real finance_expenses
   * row (so it shows up in FinOps's existing unified Expenses view exactly
   * like a manually-typed one), then posts Dr expense account / Cr the
   * wallet's own GL account DIRECTLY via GLService.post() — not through
   * financeExpenses.routes.ts's postExpenseToGl(), which hardcodes the credit
   * side to Bank Account 1010 rather than the specific wallet being drawn
   * down. If the GL post fails, the just-inserted expense row is rolled back
   * rather than left sitting un-posted and disconnected from the ledger —
   * for real cash-custody money movement, a "best effort" GL post (as
   * financeExpenses.routes.ts uses for ordinary expenses) would leave the
   * wallet's derived balance silently wrong.
   */
  static async disburseWithdrawal(tenantId: string, userId: string, requestId: string) {
    const req = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_withdrawal_requests').selectAll()
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!req) throw new Error('Withdrawal request not found.');
    if (req.status !== 'approved') throw new Error(`Cannot disburse a request in '${req.status}' status — it must be approved first.`);

    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').selectAll().where('id', '=', req.wallet_id).executeTakeFirstOrThrow()
    );
    const amount = Number(req.amount);
    const balance = await PettiService.getWalletBalance(tenantId, wallet.gl_account_id);
    if (balance < amount) {
      throw new Error(`Insufficient wallet balance: "${wallet.name}" has ${balance.toLocaleString()} ${wallet.currency}, but this request is for ${amount.toLocaleString()} ${wallet.currency}. Record a deposit first.`);
    }

    const walletAccount = await withTenant(tenantId, (trx) =>
      trx.selectFrom('chart_of_accounts').select('code').where('id', '=', wallet.gl_account_id).executeTakeFirstOrThrow()
    );
    const expenseAccountCode = PETTI_EXPENSE_ACCOUNT[req.category as PettiCategory] || OTHER_OPERATING_EXPENSE_ACCOUNT;

    const expenseRow = await withTenant(tenantId, (trx) => trx.insertInto('finance_expenses').values({
      tenant_id: tenantId,
      name: `Petty cash: ${req.purpose}`.slice(0, 255),
      amount,
      expense_date: new Date(),
      category: req.category,
      payment_mode: 'Petty Cash',
      reference: `Petti/${wallet.name}`,
      note: req.purpose,
      is_revenue: false,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow());

    let journalEntryId: string;
    try {
      journalEntryId = await GLService.post(tenantId, {
        entryDate: new Date().toISOString(),
        description: `Petty cash disbursement: ${req.purpose} (${wallet.name})`,
        sourceModule: 'EXPENSE',
        sourceId: expenseRow.id,
        createdBy: userId,
        lines: [
          { accountCode: expenseAccountCode, debit: amount, credit: 0, description: req.purpose },
          { accountCode: walletAccount.code, debit: 0, credit: amount, description: `From ${wallet.name}` },
        ],
      });
    } catch (e) {
      await withTenant(tenantId, (trx) => trx.deleteFrom('finance_expenses').where('id', '=', expenseRow.id).execute());
      throw e;
    }

    return withTenant(tenantId, (trx) =>
      trx.updateTable('petti_withdrawal_requests').set({
        status: 'disbursed',
        disbursed_by: userId,
        disbursed_at: new Date(),
        finance_expense_id: expenseRow.id,
        journal_entry_id: journalEntryId,
      }).where('id', '=', requestId).returningAll().executeTakeFirstOrThrow()
    );
  }
}
