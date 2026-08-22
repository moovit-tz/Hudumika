import type { UserRole } from '@hudumika/types';
import { withTenant } from '../db/client.js';
import { GLService } from './gl.service.js';
import { getActiveGateway, type ActiveGateway } from '../lib/payment-gateway.js';

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
// for the platform team, not something buildable from here. What IS real:
// which gateway a tenant has switched on at Settings ▸ Finance ▸ Payment
// Gateways (lib/payment-gateway.ts) — that config is now the source of
// truth this seam reads, rather than trusting whatever provider string the
// request happened to send.
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
  provider: string;
  constructor(private configured: ActiveGateway | null) {
    this.provider = configured?.id ?? 'gateway';
  }
  async confirmDeposit(): Promise<never> {
    if (!this.configured) {
      throw new Error(
        `No payment gateway is configured for this workspace yet. An admin can enable one at Settings → Finance → Payment Gateways, or record this deposit with method: 'manual' once the funds are confirmed by other means (bank statement, mobile money SMS, etc.).`
      );
    }
    throw new Error(
      `"${this.configured.id}" is configured at Settings → Finance → Payment Gateways, but no live charge-processing integration for it is wired into the platform yet — that needs a real provider SDK and merchant credentials, a separate engineering task. Record this deposit with method: 'manual' once the funds are confirmed by other means.`
    );
  }
}

async function getPaymentGatewayAdapter(tenantId: string, method: 'manual' | 'gateway'): Promise<PaymentGatewayAdapter> {
  if (method === 'manual') return new ManualDepositAdapter();
  return new StubGatewayAdapter(await getActiveGateway(tenantId));
}

// ── Roles ──────────────────────────────────────────────────────────────────
// Wallet administration (create/close a wallet, record deposits, configure
// workflows and approvers) is "the finance manager acts as admin" — the same
// set that gets to release funds, deliberately narrower than the old flat
// PETTI_ADMIN_ROLES (which used to lump MANAGER in here too). A department
// manager administers *their own approval step*, not the wallet itself.
export const PETTI_FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
// Platform/tenant admins can always act on an approve/reject/disburse step as
// a safety valve, same as they can override most things elsewhere — this is
// not "department manager" or "finance" access, just an escape hatch so a
// misconfigured wallet (no approver set) never fully blocks money movement.
const PETTI_OVERRIDE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

export interface PettiActor { id: string; role: UserRole; }

// A workflow's only real behavioural knob today: does this request need a
// department-manager approval step before Finance can release it, or does it
// go straight to Finance? Kept as a named, persisted, tenant-editable row
// (petti_workflows) rather than a bare boolean on the wallet, because the
// product ask is explicitly "multiple workflows depending on the nature of
// employees and their expenses" — a set of things an admin can list, name
// and pick between, not just a checkbox.
const SYSTEM_WORKFLOWS = [
  {
    name: 'Department approval + finance release',
    description: "A department manager (the wallet's designated approver) reviews the request first; Finance then releases the funds.",
    requiresDepartmentApproval: true,
  },
  {
    name: 'Finance only',
    description: 'Finance reviews and releases the request directly — no separate department approval step.',
    requiresDepartmentApproval: false,
  },
] as const;

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

  // ── Workflows ─────────────────────────────────────────────────────────
  /** Idempotent — inserts the two built-in system workflows for a tenant if
   *  they don't already exist (ON CONFLICT on the tenant_id+name unique
   *  index). Called lazily wherever a workflow might need to be resolved,
   *  same self-healing "ensure on read" pattern default-workflow.service.ts
   *  established for ClearOS, rather than requiring a separate bootstrap step. */
  static async ensureSystemWorkflows(tenantId: string, userId?: string | null) {
    return withTenant(tenantId, async (trx) => {
      for (const wf of SYSTEM_WORKFLOWS) {
        await trx.insertInto('petti_workflows').values({
          tenant_id: tenantId,
          name: wf.name,
          description: wf.description,
          requires_department_approval: wf.requiresDepartmentApproval,
          is_system: true,
          created_by: userId || null,
        }).onConflict((oc) => oc.columns(['tenant_id', 'name']).doNothing()).execute();
      }
    });
  }

  static async listWorkflows(tenantId: string, userId?: string | null) {
    await PettiService.ensureSystemWorkflows(tenantId, userId);
    return withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_workflows').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('is_system', 'desc').orderBy('name', 'asc')
        .execute()
    );
  }

  static async createWorkflow(tenantId: string, userId: string, data: { name: string; description?: string; requiresDepartmentApproval: boolean }) {
    const name = data.name.trim();
    if (!name) throw new Error('Workflow name is required.');
    try {
      return await withTenant(tenantId, (trx) =>
        trx.insertInto('petti_workflows').values({
          tenant_id: tenantId,
          name,
          description: data.description || null,
          requires_department_approval: data.requiresDepartmentApproval,
          is_system: false,
          created_by: userId,
        }).returningAll().executeTakeFirstOrThrow()
      );
    } catch (e: any) {
      if (/duplicate key/i.test(e?.message || '')) throw new Error(`A workflow named "${name}" already exists.`);
      throw e;
    }
  }

  static async updateWorkflow(tenantId: string, workflowId: string, patch: { name?: string; description?: string | null; requiresDepartmentApproval?: boolean }) {
    const set: Record<string, unknown> = { updated_at: new Date() };
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error('Workflow name is required.');
      set.name = name;
    }
    if (patch.description !== undefined) set.description = patch.description || null;
    if (patch.requiresDepartmentApproval !== undefined) set.requires_department_approval = patch.requiresDepartmentApproval;

    const row = await withTenant(tenantId, (trx) =>
      trx.updateTable('petti_workflows').set(set as any)
        .where('id', '=', workflowId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst()
    );
    if (!row) throw new Error('Workflow not found.');
    return row;
  }

  static async deleteWorkflow(tenantId: string, workflowId: string) {
    const row = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_workflows').select(['id', 'is_system'])
        .where('id', '=', workflowId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!row) throw new Error('Workflow not found.');
    if (row.is_system) throw new Error('The built-in system workflows cannot be deleted — create a new one for a different process instead.');
    await withTenant(tenantId, (trx) => trx.deleteFrom('petti_workflows').where('id', '=', workflowId).execute());
  }

  /** Resolves which workflow governs a request: the wallet's per-category
   *  override, else the wallet's default, else the tenant's system default
   *  (department approval required) — the same precedence the user asked
   *  for ("wallet default, category can override"). Falls back to the
   *  system default rather than throwing so a wallet nobody has configured
   *  yet still behaves (safely, on the stricter of the two options). */
  static async resolveWorkflow(tenantId: string, userId: string | null | undefined, wallet: { default_workflow_id: string | null; category_workflow_overrides: unknown }, category: string) {
    const overrides = typeof wallet.category_workflow_overrides === 'string'
      ? JSON.parse(wallet.category_workflow_overrides || '{}')
      : (wallet.category_workflow_overrides as Record<string, string> | null) || {};
    const targetId: string | null = overrides[category] || wallet.default_workflow_id || null;

    if (targetId) {
      const wf = await withTenant(tenantId, (trx) =>
        trx.selectFrom('petti_workflows').selectAll()
          .where('id', '=', targetId).where('tenant_id', '=', tenantId).executeTakeFirst()
      );
      if (wf) return wf;
    }

    await PettiService.ensureSystemWorkflows(tenantId, userId);
    const fallback = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_workflows').selectAll()
        .where('tenant_id', '=', tenantId).where('is_system', '=', true).where('requires_department_approval', '=', true)
        .executeTakeFirst()
    );
    if (!fallback) throw new Error('No workflow could be resolved for this wallet.');
    return fallback;
  }

  /** Assigning the primary department approver is a wallet-setup action
   *  (finance/admin only). Clears any previously-named backup — a new
   *  approver should name their own stand-in, not inherit the last one's. */
  static async setWalletApprover(tenantId: string, walletId: string, approverUserId: string | null) {
    const row = await withTenant(tenantId, (trx) =>
      trx.updateTable('petti_wallets')
        .set({ approver_user_id: approverUserId, approver_backup_user_id: null })
        .where('id', '=', walletId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst()
    );
    if (!row) throw new Error('Wallet not found.');
    return row;
  }

  /** Self-service: the wallet's own designated approver can name who covers
   *  for them while absent, without needing a finance admin to intervene —
   *  finance/admin roles can still set it directly as an override. */
  static async setWalletApproverBackup(tenantId: string, actor: PettiActor, walletId: string, backupUserId: string | null) {
    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').select(['id', 'approver_user_id'])
        .where('id', '=', walletId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!wallet) throw new Error('Wallet not found.');
    const isSelf = wallet.approver_user_id === actor.id;
    const isOverride = (PETTI_FINANCE_ROLES as readonly string[]).includes(actor.role);
    if (!isSelf && !isOverride) throw new Error("Only this wallet's designated approver (or a finance admin) can set a backup approver.");

    return withTenant(tenantId, (trx) =>
      trx.updateTable('petti_wallets').set({ approver_backup_user_id: backupUserId })
        .where('id', '=', walletId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow()
    );
  }

  static async setWalletWorkflowConfig(tenantId: string, walletId: string, data: { defaultWorkflowId?: string | null; categoryOverrides?: Record<string, string> }) {
    const set: Record<string, unknown> = {};
    if (data.defaultWorkflowId !== undefined) set.default_workflow_id = data.defaultWorkflowId;
    if (data.categoryOverrides !== undefined) set.category_workflow_overrides = JSON.stringify(data.categoryOverrides);
    if (Object.keys(set).length === 0) throw new Error('Nothing to update.');

    const row = await withTenant(tenantId, (trx) =>
      trx.updateTable('petti_wallets').set(set as any)
        .where('id', '=', walletId).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirst()
    );
    if (!row) throw new Error('Wallet not found.');
    return row;
  }

  /** Only this wallet's designated approver/backup (or an override role) may
   *  act on the department-approval step; only Finance may act when the
   *  resolved workflow skips that step. Not a route-level requireRole check
   *  — the approver is a specific person, not a platform role, so the check
   *  needs to look up the wallet/workflow, not just the caller's JWT role. */
  private static async assertCanActOnApprovalStep(tenantId: string, actor: PettiActor, req: { wallet_id: string; workflow_id: string | null }) {
    if ((PETTI_OVERRIDE_ROLES as readonly string[]).includes(actor.role)) return;

    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').select(['approver_user_id', 'approver_backup_user_id'])
        .where('id', '=', req.wallet_id).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()
    );
    const workflow = req.workflow_id
      ? await withTenant(tenantId, (trx) =>
          trx.selectFrom('petti_workflows').select(['requires_department_approval'])
            .where('id', '=', req.workflow_id as string).where('tenant_id', '=', tenantId).executeTakeFirst()
        )
      : null;
    // Legacy requests submitted before workflows existed have no workflow_id
    // stamped — keep the original two-step behaviour for those.
    const requiresDept = workflow ? workflow.requires_department_approval : true;

    if (requiresDept) {
      const designated = [wallet.approver_user_id, wallet.approver_backup_user_id].filter((v): v is string => !!v);
      if (designated.length > 0) {
        if (!designated.includes(actor.id)) {
          throw new Error("Only this wallet's designated department approver (or their backup) can approve or reject this request.");
        }
        return;
      }
      // Not configured yet — fall back to the old coarse role check so an
      // un-configured wallet never fully blocks approval.
      if (actor.role === 'MANAGER' || (PETTI_FINANCE_ROLES as readonly string[]).includes(actor.role)) return;
      throw new Error('This wallet has no department approver configured yet — ask a finance admin to set one, or have a Manager or Finance user approve.');
    }

    if (!(PETTI_FINANCE_ROLES as readonly string[]).includes(actor.role)) {
      throw new Error("This wallet's workflow sends requests straight to Finance — only a Finance user can approve or reject this request.");
    }
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

    const adapter = await getPaymentGatewayAdapter(tenantId, method);
    const confirmation = await adapter.confirmDeposit({ amount: data.amount, reference: data.reference, gatewayTxRef: data.gatewayTxRef });

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

    // Two separate withTenant calls, not one wallet fetch nested inside the
    // insert's transaction — resolveWorkflow opens its own withTenant calls
    // internally, and a still-open outer transaction wouldn't be visible to
    // those (each withTenant is a genuinely separate transaction).
    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').selectAll()
        .where('id', '=', data.walletId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!wallet) throw new Error('Wallet not found.');
    if (wallet.status !== 'active') throw new Error('This wallet is closed and cannot accept withdrawal requests.');

    const workflow = await PettiService.resolveWorkflow(tenantId, userId, wallet, category);

    return withTenant(tenantId, (trx) =>
      trx.insertInto('petti_withdrawal_requests').values({
        tenant_id: tenantId,
        wallet_id: data.walletId,
        amount: data.amount,
        category,
        purpose,
        requested_by: userId,
        workflow_id: workflow.id,
      }).returningAll().executeTakeFirstOrThrow()
    );
  }

  static async listWithdrawalRequests(tenantId: string, filters: { walletId?: string; status?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_withdrawal_requests').selectAll().where('tenant_id', '=', tenantId);
      if (filters.walletId) q = q.where('wallet_id', '=', filters.walletId);
      if (filters.status) q = q.where('status', '=', filters.status);
      return q.orderBy('requested_at', 'desc').execute();
    });
  }

  static async approveWithdrawal(tenantId: string, actor: PettiActor, requestId: string) {
    const req = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_withdrawal_requests').select(['id', 'status', 'requested_by', 'wallet_id', 'workflow_id'])
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!req) throw new Error('Withdrawal request not found.');
    if (req.status !== 'pending') throw new Error(`Cannot approve a request in '${req.status}' status.`);
    if (req.requested_by === actor.id) throw new Error('The requester cannot approve their own withdrawal request.');
    await PettiService.assertCanActOnApprovalStep(tenantId, actor, req);

    return withTenant(tenantId, (trx) =>
      trx.updateTable('petti_withdrawal_requests')
        .set({ status: 'approved', approved_by: actor.id, approved_at: new Date() })
        .where('id', '=', requestId)
        .returningAll().executeTakeFirstOrThrow()
    );
  }

  static async rejectWithdrawal(tenantId: string, actor: PettiActor, requestId: string, reason?: string) {
    const req = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_withdrawal_requests').select(['id', 'status', 'wallet_id', 'workflow_id'])
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!req) throw new Error('Withdrawal request not found.');
    if (req.status !== 'pending') throw new Error(`Cannot reject a request in '${req.status}' status.`);
    await PettiService.assertCanActOnApprovalStep(tenantId, actor, req);

    return withTenant(tenantId, (trx) =>
      trx.updateTable('petti_withdrawal_requests')
        .set({ status: 'rejected', approved_by: actor.id, approved_at: new Date(), rejection_reason: reason || null })
        .where('id', '=', requestId)
        .returningAll().executeTakeFirstOrThrow()
    );
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
  static async disburseWithdrawal(tenantId: string, actor: PettiActor, requestId: string) {
    if (!(PETTI_FINANCE_ROLES as readonly string[]).includes(actor.role)) {
      throw new Error('Only Finance can release petty cash funds for an approved request.');
    }
    const userId = actor.id;
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
      // A petty-cash disbursement is a cash advance, not a paid-in-full
      // expense — it starts life needing to be retired (receipts submitted,
      // any shortfall accounted for). See financeExpenses.routes.ts's
      // /expenses/:id/retire.
      retirement_status: 'pending',
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
