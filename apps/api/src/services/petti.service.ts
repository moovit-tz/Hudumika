import type { UserRole } from '@hudumika/types';
import PDFDocument from 'pdfkit';
import { randomUUID } from 'node:crypto';
import * as nodeCrypto from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { getActiveGateway, type ActiveGateway } from '../lib/payment-gateway.js';

const PETTI_REF_PREFIX: Record<string, string> = { wallet: 'PW', deposit: 'DEP', withdrawal: 'WD', transfer: 'TRF' };

/** Next human-readable reference for a tenant+type — DEP-0001, WD-0001,
 *  TRF-0001, PW-0001 — as one atomic upsert-and-increment, not
 *  count(*)+1 (petti_wallets' own PW-#### numbering used to be exactly
 *  that, and the same pattern already caused a real production bug
 *  elsewhere in this codebase once a row was deleted — see 318's own
 *  migration comment). Must run inside the same transaction as the insert
 *  it's numbering, so a rolled-back insert doesn't leave a burned number. */
async function nextPettiRef(trx: Transaction<Database>, tenantId: string, type: 'wallet' | 'deposit' | 'withdrawal' | 'transfer'): Promise<string> {
  const row = await sql<{ seq: number }>`
    INSERT INTO petti_counters (tenant_id, counter_type, next_seq) VALUES (${tenantId}, ${type}, 2)
    ON CONFLICT (tenant_id, counter_type) DO UPDATE SET next_seq = petti_counters.next_seq + 1
    RETURNING next_seq - 1 AS seq
  `.execute(trx);
  const seq = row.rows[0].seq;
  return `${PETTI_REF_PREFIX[type]}-${String(seq).padStart(4, '0')}`;
}

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

const PETTI_CATEGORY_LABEL: Record<string, string> = {
  OFFICE_SUPPLIES: 'Office supplies', TRANSPORT: 'Transport', MEALS_ENTERTAINMENT: 'Meals & entertainment',
  UTILITIES: 'Utilities', STAFF_WELFARE: 'Staff welfare', REPAIRS_MAINTENANCE: 'Repairs & maintenance',
  POSTAGE_COURIER: 'Postage & courier', MISCELLANEOUS: 'Miscellaneous',
};

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
  confirmDeposit(input: { amount: number; reference?: string; gatewayTxRef?: string; payerMsisdn?: string }): Promise<{ confirmed: true; providerRef?: string }>;
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

/** Tanzanian MSISDN → the bare-digits "2557XXXXXXXX" / "2556XXXXXXXX" shape
 *  every TZ mobile-money API on this page expects — accepts the three ways a
 *  human actually types a number (07..., +2557..., 2557...) so the deposit
 *  form doesn't need its own format-policing on top of the provider's. */
function normalizeTzMsisdn(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '255' + digits.slice(1);
  if (digits.length === 9) return '255' + digits;
  throw new Error(`"${raw}" doesn't look like a Tanzanian phone number (expected e.g. 0712345678 or 255712345678).`);
}

/**
 * Vodacom M-Pesa (Tanzania, OpenAPI) — a real C2B Single Stage charge.
 *
 * Same RSA-encrypted-bearer session handshake as settings.routes.ts's
 * `POST /payment-gateways/vodacom/test` (that endpoint only opens a session
 * to prove the credentials work; this reuses the identical handshake and
 * then actually places the charge). Config fields come from Settings ▸
 * Finance ▸ Payment Gateways' `vodacom` card: apiKey, publicKey, serviceId
 * (the merchant's Vodacom-issued service/shortcode).
 *
 * Not yet verified against a real Vodacom sandbox account — no live
 * credentials were available while building this. The request/response
 * shape matches Vodacom's published OpenAPI C2B Single Stage spec and reuses
 * the session handshake already proven live in settings.routes.ts, but the
 * charge call itself needs a real merchant sandbox run before this is
 * trusted for production traffic. Tracked in Lens.
 *
 * KNOWN SIMPLIFICATION: a C2B Single Stage response of INS-0 means Vodacom
 * *accepted the request*, not that the customer has approved the USSD/PIN
 * prompt yet — this adapter treats that acceptance as final confirmation
 * and recordDeposit() posts to the GL immediately. A real go-live wants a
 * webhook/callback receiver that only confirms the deposit once Vodacom's
 * own result callback arrives, so a declined or timed-out prompt can't leave
 * a deposit posted that never actually landed. No such receiver exists yet.
 * Tracked in Lens.
 */
class VodacomMpesaAdapter implements PaymentGatewayAdapter {
  provider = 'vodacom';
  constructor(private gateway: ActiveGateway) {}

  private async getSessionId(): Promise<string> {
    const { apiKey, publicKey } = this.gateway.config;
    if (!apiKey || !publicKey) throw new Error('Vodacom M-Pesa is configured without an API key or public key — check Settings → Finance → Payment Gateways.');
    let bearer: string;
    try {
      const pem = `-----BEGIN PUBLIC KEY-----\n${String(publicKey).replace(/\s+/g, '').replace(/(.{64})/g, '$1\n')}\n-----END PUBLIC KEY-----\n`;
      bearer = nodeCrypto.publicEncrypt({ key: pem, padding: nodeCrypto.constants.RSA_PKCS1_PADDING }, Buffer.from(String(apiKey))).toString('base64');
    } catch {
      throw new Error('Vodacom M-Pesa\'s stored public key could not be read. Re-enter it at Settings → Finance → Payment Gateways.');
    }
    const host = this.gateway.sandbox
      ? 'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomTZN/getSession/'
      : 'https://openapi.m-pesa.com/openapi/ipg/v2/vodacomTZN/getSession/';
    const res = await fetch(host, { headers: { Authorization: `Bearer ${bearer}`, Origin: '*', 'Content-Type': 'application/json' } });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body?.output_SessionID) {
      throw new Error(`Vodacom M-Pesa refused to open a session${body?.output_ResponseDesc ? `: ${body.output_ResponseDesc}` : '.'}`);
    }
    return body.output_SessionID;
  }

  async confirmDeposit(input: { amount: number; reference?: string; payerMsisdn?: string }): Promise<{ confirmed: true; providerRef?: string }> {
    if (!input.payerMsisdn) throw new Error('A payer phone number is required to push a Vodacom M-Pesa payment request.');
    const { serviceId } = this.gateway.config;
    if (!serviceId) throw new Error('Vodacom M-Pesa is configured without a Service ID — check Settings → Finance → Payment Gateways.');
    const msisdn = normalizeTzMsisdn(input.payerMsisdn);
    const sessionId = await this.getSessionId();
    const conversationId = randomUUID().replace(/-/g, '').slice(0, 20);
    const host = this.gateway.sandbox
      ? 'https://openapi.m-pesa.com/sandbox/ipg/v2/vodacomTZN/c2bPayment/singleStage/'
      : 'https://openapi.m-pesa.com/openapi/ipg/v2/vodacomTZN/c2bPayment/singleStage/';
    const res = await fetch(host, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionId}`, Origin: '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_Amount: String(input.amount),
        input_Country: 'TZN',
        input_Currency: 'TZS',
        input_CustomerMSISDN: msisdn,
        input_ServiceProviderCode: serviceId,
        input_ThirdPartyConversationID: conversationId,
        input_TransactionReference: input.reference || conversationId,
        input_PurchasedItemsDesc: 'Petty cash wallet deposit',
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.output_ResponseCode !== 'INS-0') {
      throw new Error(`Vodacom M-Pesa declined the charge${body?.output_ResponseDesc ? `: ${body.output_ResponseDesc}` : '.'}`);
    }
    return { confirmed: true, providerRef: body.output_TransactionID };
  }
}

/**
 * Airtel Money (Africa Collections API) — a real "Request to Pay" charge.
 *
 * Same OAuth2 client-credentials handshake as settings.routes.ts's
 * `POST /payment-gateways/airtel/test`. Config fields come from Settings ▸
 * Finance ▸ Payment Gateways' `airtel` card: clientId, clientSecret,
 * country, currency. The charge itself pushes a USSD approval prompt to the
 * payer's phone and returns immediately with a pending transaction id —
 * Airtel Money is asynchronous, so `confirmed: true` here means "the request
 * was accepted," not "the customer has already approved it."
 *
 * Not yet verified against a real Airtel sandbox account — no live
 * credentials were available while building this. The request/response
 * shape matches Airtel's published Collections API spec and reuses the
 * OAuth handshake already proven live in settings.routes.ts, but needs a
 * real merchant sandbox run before this is trusted for production traffic.
 * Tracked in Lens.
 *
 * KNOWN SIMPLIFICATION: same caveat as VodacomMpesaAdapter — a successful
 * `status.success` here means Airtel accepted the push, not that the
 * customer has approved it. recordDeposit() posts to the GL on acceptance,
 * not on actual settlement. A real go-live wants a webhook/callback
 * receiver for Airtel's async transaction result before this is trusted.
 * Tracked in Lens.
 */
class AirtelMoneyAdapter implements PaymentGatewayAdapter {
  provider = 'airtel';
  constructor(private gateway: ActiveGateway) {}

  private async getAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.gateway.config;
    if (!clientId || !clientSecret) throw new Error('Airtel Money is configured without a client ID or client secret — check Settings → Finance → Payment Gateways.');
    const res = await fetch('https://openapi.airtel.africa/auth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || !body?.access_token) {
      throw new Error(`Airtel Money rejected these credentials${body?.error_description ? `: ${body.error_description}` : '.'}`);
    }
    return body.access_token;
  }

  async confirmDeposit(input: { amount: number; reference?: string; payerMsisdn?: string }): Promise<{ confirmed: true; providerRef?: string }> {
    if (!input.payerMsisdn) throw new Error('A payer phone number is required to push an Airtel Money payment request.');
    const country = this.gateway.config.country || 'TZ';
    const currency = this.gateway.config.currency || 'TZS';
    const msisdn = normalizeTzMsisdn(input.payerMsisdn).replace(/^255/, '');
    const token = await this.getAccessToken();
    const txId = randomUUID();
    const res = await fetch('https://openapi.airtel.africa/merchant/v1/payments/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '*/*',
        'X-Country': country, 'X-Currency': currency,
      },
      body: JSON.stringify({
        reference: input.reference || 'Petti wallet deposit',
        subscriber: { country, currency, msisdn },
        transaction: { amount: input.amount, country, currency, id: txId },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.status?.success !== true) {
      throw new Error(`Airtel Money declined the charge${body?.status?.message ? `: ${body.status.message}` : '.'}`);
    }
    return { confirmed: true, providerRef: body?.data?.transaction?.id || txId };
  }
}

async function getPaymentGatewayAdapter(tenantId: string, method: 'manual' | 'gateway'): Promise<PaymentGatewayAdapter> {
  if (method === 'manual') return new ManualDepositAdapter();
  const configured = await getActiveGateway(tenantId);
  if (configured?.id === 'vodacom') return new VodacomMpesaAdapter(configured);
  if (configured?.id === 'airtel') return new AirtelMoneyAdapter(configured);
  return new StubGatewayAdapter(configured);
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

export interface PettiActivityEvent { id: string; action: string; walletId: string; amount: number; actorId: string | null; at: string; ref: string | null; }

export interface PettiSpendBucket { total: number; count: number; }
export interface PettiCurrencySpendReport {
  currency: string; total: number; count: number;
  byCategory: (PettiSpendBucket & { category: string })[];
  byWallet: (PettiSpendBucket & { walletId: string; walletName: string })[];
}

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
      const code = await nextPettiRef(trx, tenantId, 'wallet');

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

  /** Renames a wallet / edits its description. Currency is deliberately not
   *  editable here — it's baked into every past deposit/withdrawal/transfer
   *  amount and the wallet's derived balance math; changing it after the
   *  fact would silently mismatch old records against a new currency label,
   *  not actually convert anything. */
  static async updateWallet(tenantId: string, walletId: string, data: { name?: string; description?: string | null }) {
    const name = data.name?.trim();
    if (data.name !== undefined && !name) throw new Error('Wallet name is required.');

    return withTenant(tenantId, async (trx) => {
      const wallet = await trx.selectFrom('petti_wallets').selectAll()
        .where('id', '=', walletId).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!wallet) throw new Error('Wallet not found.');

      if (name && name !== wallet.name) {
        await trx.updateTable('chart_of_accounts').set({ name: `Petty Cash Wallet — ${name}` })
          .where('id', '=', wallet.gl_account_id).execute();
      }

      return trx.updateTable('petti_wallets').set({
        ...(name !== undefined ? { name } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
      }).where('id', '=', walletId).where('tenant_id', '=', tenantId).returningAll().executeTakeFirstOrThrow();
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
    gatewayProvider?: string; gatewayTxRef?: string; reference?: string; note?: string; payerMsisdn?: string;
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
    const confirmation = await adapter.confirmDeposit({ amount: data.amount, reference: data.reference, gatewayTxRef: data.gatewayTxRef, payerMsisdn: data.payerMsisdn });

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
        { accountCode: walletAccount.code, debit: data.amount, credit: 0, description: `Deposit to ${wallet.name}`, currency: wallet.currency },
        { accountCode: BANK_ACCOUNT, debit: 0, credit: data.amount, description: `To ${wallet.name}`, currency: wallet.currency },
      ],
    });

    return withTenant(tenantId, async (trx) => {
      const ref = await nextPettiRef(trx, tenantId, 'deposit');
      return trx.insertInto('petti_deposits').values({
        tenant_id: tenantId,
        wallet_id: wallet.id,
        amount: data.amount,
        method,
        gateway_provider: data.gatewayProvider || null,
        gateway_tx_ref: data.gatewayTxRef || confirmation.providerRef || null,
        reference: data.reference || null,
        ref,
        note: data.note || null,
        journal_entry_id: journalEntryId,
        recorded_by: userId,
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  /** Moves funds between two of a tenant's own wallets — one balanced
   *  journal entry (Dr destination wallet account / Cr source wallet
   *  account), same single-entry shape recordDeposit already uses. Never
   *  touches Bank Account 1010 or an expense account: the cash never leaves
   *  tenant custody, it just moves which wallet is custodian. Restricted to
   *  same-currency pairs for now — crediting N out of a USD wallet and
   *  debiting N into a TZS wallet would silently misstate value transferred
   *  by the exchange rate; cross-currency transfer is a later feature, not a
   *  silent bug. */
  static async transferBetweenWallets(tenantId: string, userId: string, data: {
    fromWalletId: string; toWalletId: string; amount: number; note?: string;
  }) {
    if (!(data.amount > 0)) throw new Error('Transfer amount must be positive.');
    if (data.fromWalletId === data.toWalletId) throw new Error('Source and destination wallets must be different.');

    const [fromWallet, toWallet] = await Promise.all([
      withTenant(tenantId, (trx) => trx.selectFrom('petti_wallets').selectAll().where('id', '=', data.fromWalletId).where('tenant_id', '=', tenantId).executeTakeFirst()),
      withTenant(tenantId, (trx) => trx.selectFrom('petti_wallets').selectAll().where('id', '=', data.toWalletId).where('tenant_id', '=', tenantId).executeTakeFirst()),
    ]);
    if (!fromWallet) throw new Error('Source wallet not found.');
    if (!toWallet) throw new Error('Destination wallet not found.');
    if (fromWallet.status !== 'active') throw new Error(`"${fromWallet.name}" is closed and cannot send a transfer.`);
    if (toWallet.status !== 'active') throw new Error(`"${toWallet.name}" is closed and cannot receive a transfer.`);
    if (fromWallet.currency !== toWallet.currency) {
      throw new Error(`Cannot transfer between wallets in different currencies (${fromWallet.currency} → ${toWallet.currency}) yet.`);
    }

    const balance = await PettiService.getWalletBalance(tenantId, fromWallet.gl_account_id);
    if (balance < data.amount) {
      throw new Error(`Insufficient balance: "${fromWallet.name}" has ${balance.toLocaleString()} ${fromWallet.currency}, but this transfer is for ${data.amount.toLocaleString()} ${fromWallet.currency}.`);
    }

    const [fromAccount, toAccount] = await Promise.all([
      withTenant(tenantId, (trx) => trx.selectFrom('chart_of_accounts').select('code').where('id', '=', fromWallet.gl_account_id).executeTakeFirstOrThrow()),
      withTenant(tenantId, (trx) => trx.selectFrom('chart_of_accounts').select('code').where('id', '=', toWallet.gl_account_id).executeTakeFirstOrThrow()),
    ]);

    const journalEntryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Petti transfer: ${fromWallet.name} → ${toWallet.name}${data.note ? ` (${data.note})` : ''}`,
      sourceModule: 'MANUAL',
      sourceId: fromWallet.id,
      createdBy: userId,
      lines: [
        { accountCode: toAccount.code, debit: data.amount, credit: 0, description: `Transfer from ${fromWallet.name}`, currency: fromWallet.currency },
        { accountCode: fromAccount.code, debit: 0, credit: data.amount, description: `Transfer to ${toWallet.name}`, currency: fromWallet.currency },
      ],
    });

    return withTenant(tenantId, async (trx) => {
      const ref = await nextPettiRef(trx, tenantId, 'transfer');
      return trx.insertInto('petti_transfers').values({
        tenant_id: tenantId,
        from_wallet_id: fromWallet.id,
        to_wallet_id: toWallet.id,
        amount: data.amount,
        note: data.note || null,
        journal_entry_id: journalEntryId,
        created_by: userId,
        ref,
      }).returningAll().executeTakeFirstOrThrow();
    });
  }

  static async listTransfers(tenantId: string, filters: { walletId?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_transfers').selectAll().where('tenant_id', '=', tenantId);
      if (filters.walletId) q = q.where((eb) => eb.or([eb('from_wallet_id', '=', filters.walletId!), eb('to_wallet_id', '=', filters.walletId!)]));
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  /**
   * The unified ledger: deposits + withdrawal requests + transfers, merged
   * into one chronological, filterable, paginated feed via a Kysely
   * unionAll. Each leg is normalized to the same output shape before
   * unioning — deposits and transfers have no 'category'/'status' of their
   * own, so those columns are literal NULLs (deposits) or a fixed literal
   * ('completed' for transfers, which have no pending/approved states).
   * Transfers match a wallet filter on EITHER from_wallet_id or
   * to_wallet_id (so a transfer shows up from both the sending and
   * receiving wallet's own view) but are never duplicated in the
   * unfiltered, all-wallets view, since each transfer is still exactly one
   * row here, not two.
   */
  static async listTransactions(tenantId: string, filters: {
    walletId?: string; type?: 'deposit' | 'withdrawal' | 'transfer'; status?: string; category?: string;
    from?: string; to?: string; search?: string;
  } = {}, pagination: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(pagination.limit ?? 50, 200);
    const offset = pagination.offset ?? 0;

    return withTenant(tenantId, async (trx) => {
      // Every leg is explicitly widened ($castTo) to one shared column-type
      // set (type/status/category/description/actor_id: string | null),
      // since unionAll requires an exact type match across legs and the raw
      // source columns differ in nullability (e.g. withdrawal_requests.purpose
      // is NOT NULL, deposits.reference is nullable) — a real SQL UNION ALL
      // doesn't care, but Kysely's type system does.
      let deposits = trx.selectFrom('petti_deposits')
        .select(({ ref, val }) => [
          'id', val<string | null>('deposit').as('type'), 'wallet_id', 'amount',
          val<string | null>(null).as('status'), val<string | null>(null).as('category'),
          ref('reference').$castTo<string | null>().as('description'),
          ref('recorded_by').$castTo<string | null>().as('actor_id'),
          ref('created_at').as('occurred_at'),
          ref('ref').$castTo<string | null>().as('ref'),
        ])
        .where('tenant_id', '=', tenantId);

      let withdrawals = trx.selectFrom('petti_withdrawal_requests')
        .select(({ ref, val }) => [
          'id', val<string | null>('withdrawal').as('type'), 'wallet_id', 'amount',
          ref('status').$castTo<string | null>().as('status'),
          ref('category').$castTo<string | null>().as('category'),
          ref('purpose').$castTo<string | null>().as('description'),
          ref('requested_by').$castTo<string | null>().as('actor_id'),
          ref('requested_at').as('occurred_at'),
          ref('ref').$castTo<string | null>().as('ref'),
        ])
        .where('tenant_id', '=', tenantId);

      let transfersQ = trx.selectFrom('petti_transfers')
        .select(({ ref, val }) => [
          'id', val<string | null>('transfer').as('type'), ref('from_wallet_id').as('wallet_id'), 'amount',
          val<string | null>('completed').as('status'), val<string | null>(null).as('category'),
          ref('note').$castTo<string | null>().as('description'),
          ref('created_by').$castTo<string | null>().as('actor_id'),
          ref('created_at').as('occurred_at'),
          ref('ref').$castTo<string | null>().as('ref'),
        ])
        .where('tenant_id', '=', tenantId);

      if (filters.walletId) {
        deposits = deposits.where('wallet_id', '=', filters.walletId);
        withdrawals = withdrawals.where('wallet_id', '=', filters.walletId);
        transfersQ = transfersQ.where((eb) => eb.or([eb('from_wallet_id', '=', filters.walletId!), eb('to_wallet_id', '=', filters.walletId!)]));
      }
      if (filters.category) withdrawals = withdrawals.where('category', '=', filters.category);
      if (filters.status) withdrawals = withdrawals.where('status', '=', filters.status);
      if (filters.search) {
        deposits = deposits.where((eb) => eb.or([eb('reference', 'ilike', `%${filters.search}%`), eb('note', 'ilike', `%${filters.search}%`)]));
        withdrawals = withdrawals.where('purpose', 'ilike', `%${filters.search}%`);
        transfersQ = transfersQ.where('note', 'ilike', `%${filters.search}%`);
      }
      if (filters.from) {
        deposits = deposits.where('created_at', '>=', new Date(filters.from));
        withdrawals = withdrawals.where('requested_at', '>=', new Date(filters.from));
        transfersQ = transfersQ.where('created_at', '>=', new Date(filters.from));
      }
      if (filters.to) {
        deposits = deposits.where('created_at', '<=', new Date(filters.to));
        withdrawals = withdrawals.where('requested_at', '<=', new Date(filters.to));
        transfersQ = transfersQ.where('created_at', '<=', new Date(filters.to));
      }

      // A type filter just picks which leg(s) to union — cheaper and
      // simpler than unioning all three and filtering afterward.
      const combined =
        filters.type === 'deposit' ? deposits
        : filters.type === 'withdrawal' ? withdrawals
        : filters.type === 'transfer' ? transfersQ
        : deposits.unionAll(withdrawals).unionAll(transfersQ);

      const rows = await trx.selectFrom(combined.as('t')).selectAll()
        .orderBy('occurred_at', 'desc').limit(limit).offset(offset).execute();

      // total count for pagination — same filtered union, just counted
      const countRow = await trx.selectFrom(combined.as('t')).select(trx.fn.countAll().as('n')).executeTakeFirst();

      return { rows, total: Number(countRow?.n ?? 0) };
    });
  }

  /**
   * The activity/audit feed — one row per real state transition, not per
   * transaction (a withdrawal can produce up to 3 rows: requested, then
   * approved/rejected, then disbursed). Deliberately built from the
   * timestamp+actor columns petti_deposits/petti_withdrawal_requests already
   * carry rather than a new audit-log table — every fact needed already
   * exists, and a parallel log risks drifting from it, the same reasoning
   * this file already applies to deriving wallet balance from journal_lines
   * instead of caching it. Since one source row can fan out to several
   * activity rows, this expands in application code rather than SQL —
   * pagination applies to the expanded, sorted event list.
   */
  static async listActivity(tenantId: string, filters: { walletId?: string; actorId?: string; from?: string; to?: string } = {}, pagination: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(pagination.limit ?? 50, 200);
    const offset = pagination.offset ?? 0;

    const [deposits, withdrawals] = await Promise.all([
      PettiService.listDeposits(tenantId, { walletId: filters.walletId, from: filters.from, to: filters.to }),
      PettiService.listWithdrawalRequests(tenantId, { walletId: filters.walletId }),
    ]);

    const events: PettiActivityEvent[] = [];
    for (const d of deposits) {
      events.push({ id: `dep-${d.id}-recorded`, action: 'deposit_recorded', walletId: d.wallet_id, amount: Number(d.amount), actorId: d.recorded_by, at: d.created_at as unknown as string, ref: d.ref });
    }
    for (const w of withdrawals) {
      events.push({ id: `wd-${w.id}-requested`, action: 'withdrawal_requested', walletId: w.wallet_id, amount: Number(w.amount), actorId: w.requested_by, at: w.requested_at as unknown as string, ref: w.ref });
      if (w.approved_at && (w.status === 'approved' || w.status === 'disbursed')) {
        events.push({ id: `wd-${w.id}-approved`, action: 'withdrawal_approved', walletId: w.wallet_id, amount: Number(w.amount), actorId: w.approved_by, at: w.approved_at as unknown as string, ref: w.ref });
      } else if (w.approved_at && w.status === 'rejected') {
        events.push({ id: `wd-${w.id}-rejected`, action: 'withdrawal_rejected', walletId: w.wallet_id, amount: Number(w.amount), actorId: w.approved_by, at: w.approved_at as unknown as string, ref: w.ref });
      }
      if (w.disbursed_at && w.status === 'disbursed') {
        events.push({ id: `wd-${w.id}-disbursed`, action: 'withdrawal_disbursed', walletId: w.wallet_id, amount: Number(w.amount), actorId: w.disbursed_by, at: w.disbursed_at as unknown as string, ref: w.ref });
      }
    }

    let filtered = events;
    if (filters.actorId) filtered = filtered.filter(e => e.actorId === filters.actorId);
    if (filters.from) filtered = filtered.filter(e => new Date(e.at) >= new Date(filters.from!));
    if (filters.to) filtered = filtered.filter(e => new Date(e.at) <= new Date(filters.to!));

    filtered.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { rows: filtered.slice(offset, offset + limit), total: filtered.length };
  }

  /** Any authenticated staff member can flag a specific deposit or
   *  withdrawal after the fact — same "raising is open, resolving is
   *  gated" shape as requestWithdrawal itself. Verifies the subject really
   *  belongs to this tenant (and derives its wallet_id) rather than trusting
   *  a client-supplied wallet_id, since a flag is otherwise not tenant-
   *  checkable on its own (subject_id alone doesn't carry tenant scope). */
  static async raiseFlag(tenantId: string, userId: string, data: { subjectType: 'deposit' | 'withdrawal'; subjectId: string; reason: string }) {
    const reason = data.reason?.trim();
    if (!reason) throw new Error('A reason is required to raise a flag.');

    const walletId = await withTenant(tenantId, async (trx) => {
      if (data.subjectType === 'deposit') {
        const row = await trx.selectFrom('petti_deposits').select('wallet_id').where('id', '=', data.subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
        return row?.wallet_id ?? null;
      }
      const row = await trx.selectFrom('petti_withdrawal_requests').select('wallet_id').where('id', '=', data.subjectId).where('tenant_id', '=', tenantId).executeTakeFirst();
      return row?.wallet_id ?? null;
    });
    if (!walletId) throw new Error(`${data.subjectType === 'deposit' ? 'Deposit' : 'Withdrawal request'} not found.`);

    return withTenant(tenantId, (trx) => trx.insertInto('petti_flags').values({
      tenant_id: tenantId,
      subject_type: data.subjectType,
      subject_id: data.subjectId,
      wallet_id: walletId,
      reason,
      raised_by: userId,
    }).returningAll().executeTakeFirstOrThrow());
  }

  static async listFlags(tenantId: string, filters: { walletId?: string; status?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_flags').selectAll().where('tenant_id', '=', tenantId);
      if (filters.walletId) q = q.where('wallet_id', '=', filters.walletId);
      if (filters.status) q = q.where('status', '=', filters.status);
      return q.orderBy('created_at', 'desc').execute();
    });
  }

  static async resolveFlag(tenantId: string, userId: string, flagId: string, resolutionNote?: string) {
    const row = await withTenant(tenantId, (trx) =>
      trx.updateTable('petti_flags')
        .set({ status: 'resolved', resolved_by: userId, resolved_at: new Date(), resolution_note: resolutionNote || null })
        .where('id', '=', flagId).where('tenant_id', '=', tenantId).where('status', '=', 'open')
        .returningAll().executeTakeFirst()
    );
    if (!row) throw new Error('Flag not found, or it has already been resolved.');
    return row;
  }

  /** Disbursed-spend breakdown for a date range — by category and by
   *  wallet, grouped by currency (one report block per currency actually
   *  present) rather than one blended total — the same reasoning the
   *  dashboard's per-currency balance cards already apply: summing
   *  differently-denominated wallets into a single number would silently
   *  misstate spend the moment a tenant has more than one wallet currency.
   *  Deliberately scoped to disbursed withdrawals only (real cash that
   *  actually left a wallet), not pending/approved requests, which aren't
   *  real spend yet. */
  static async getSpendReport(tenantId: string, filters: { from?: string; to?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_withdrawal_requests')
        .innerJoin('petti_wallets', 'petti_wallets.id', 'petti_withdrawal_requests.wallet_id')
        .select([
          'petti_withdrawal_requests.category as category',
          'petti_withdrawal_requests.wallet_id as wallet_id',
          'petti_wallets.name as wallet_name',
          'petti_wallets.currency as currency',
          'petti_withdrawal_requests.amount as amount',
        ])
        .where('petti_withdrawal_requests.tenant_id', '=', tenantId)
        .where('petti_withdrawal_requests.status', '=', 'disbursed');
      if (filters.from) q = q.where('petti_withdrawal_requests.disbursed_at', '>=', new Date(filters.from));
      if (filters.to) q = q.where('petti_withdrawal_requests.disbursed_at', '<=', new Date(filters.to));
      const rows = await q.execute();

      const byCurrency = new Map<string, {
        total: number; count: number;
        byCategory: Map<string, PettiSpendBucket & { category: string }>;
        byWallet: Map<string, PettiSpendBucket & { walletId: string; walletName: string }>;
      }>();

      for (const r of rows) {
        const amount = Number(r.amount);
        const c = byCurrency.get(r.currency) ?? { total: 0, count: 0, byCategory: new Map(), byWallet: new Map() };
        c.total += amount; c.count += 1;

        const cat = c.byCategory.get(r.category) ?? { category: r.category, total: 0, count: 0 };
        cat.total += amount; cat.count += 1;
        c.byCategory.set(r.category, cat);

        const w = c.byWallet.get(r.wallet_id) ?? { walletId: r.wallet_id, walletName: r.wallet_name, total: 0, count: 0 };
        w.total += amount; w.count += 1;
        c.byWallet.set(r.wallet_id, w);

        byCurrency.set(r.currency, c);
      }

      const currencies: PettiCurrencySpendReport[] = Array.from(byCurrency.entries()).map(([currency, c]) => ({
        currency, total: c.total, count: c.count,
        byCategory: Array.from(c.byCategory.values()).sort((a, b) => b.total - a.total),
        byWallet: Array.from(c.byWallet.values()).sort((a, b) => b.total - a.total),
      }));

      return { currencies };
    });
  }

  static async requestWithdrawal(tenantId: string, actor: PettiActor, data: {
    walletId: string; amount: number; category?: string; purpose: string;
    payeeName?: string; onBehalfOfUserId?: string;
  }) {
    if (!(data.amount > 0)) throw new Error('Withdrawal amount must be positive.');
    const purpose = data.purpose?.trim();
    if (!purpose) throw new Error('A purpose is required for every withdrawal request.');
    const category = (data.category && (PETTI_CATEGORIES as readonly string[]).includes(data.category))
      ? data.category : 'MISCELLANEOUS';
    if (data.onBehalfOfUserId && !(PETTI_FINANCE_ROLES as readonly string[]).includes(actor.role)) {
      throw new Error('Only Finance can submit a withdrawal request on behalf of someone else.');
    }
    const userId = actor.id;

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

    return withTenant(tenantId, async (trx) => {
      const ref = await nextPettiRef(trx, tenantId, 'withdrawal');
      return trx.insertInto('petti_withdrawal_requests').values({
        tenant_id: tenantId,
        wallet_id: data.walletId,
        amount: data.amount,
        category,
        purpose,
        requested_by: userId,
        workflow_id: workflow.id,
        payee_name: data.payeeName?.trim() || null,
        on_behalf_of_user_id: data.onBehalfOfUserId || null,
        ref,
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

  /** Cross-wallet deposit list — mirrors listWithdrawalRequests's filter
   *  shape. getWallet() already returns a per-wallet deposit list (capped at
   *  50), but nothing lets a dashboard/ledger/report see deposits across
   *  every wallet at once; this is that. */
  static async listDeposits(tenantId: string, filters: { walletId?: string; from?: string; to?: string } = {}) {
    return withTenant(tenantId, async (trx) => {
      let q = trx.selectFrom('petti_deposits').selectAll().where('tenant_id', '=', tenantId);
      if (filters.walletId) q = q.where('wallet_id', '=', filters.walletId);
      if (filters.from) q = q.where('created_at', '>=', new Date(filters.from));
      if (filters.to) q = q.where('created_at', '<=', new Date(filters.to));
      return q.orderBy('created_at', 'desc').execute();
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
          { accountCode: expenseAccountCode, debit: amount, credit: 0, description: req.purpose, currency: wallet.currency },
          { accountCode: walletAccount.code, debit: 0, credit: amount, description: `From ${wallet.name}`, currency: wallet.currency },
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

  /** A simple, printable petty-cash voucher for one withdrawal request — the
   *  full trail (requested/approved/disbursed, who and when), following the
   *  same direct-pdfkit pattern dangerous-goods.service.ts's
   *  renderDgDeclarationPdf already uses, rather than a shared template
   *  helper (each PDF-generating service in this codebase owns its own
   *  renderer). */
  static async renderWithdrawalVoucherPdf(tenantId: string, requestId: string): Promise<Buffer> {
    const req = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_withdrawal_requests').selectAll()
        .where('id', '=', requestId).where('tenant_id', '=', tenantId).executeTakeFirst()
    );
    if (!req) throw new Error('Withdrawal request not found.');

    const wallet = await withTenant(tenantId, (trx) =>
      trx.selectFrom('petti_wallets').select(['name', 'currency']).where('id', '=', req.wallet_id).executeTakeFirstOrThrow()
    );

    const actorIds = [req.requested_by, req.approved_by, req.disbursed_by, req.on_behalf_of_user_id].filter((v): v is string => !!v);
    const actors = actorIds.length > 0
      ? await withTenant(tenantId, (trx) => trx.selectFrom('users').select(['id', 'name']).where('id', 'in', actorIds).execute())
      : [];
    const nameOf = (userId: string | null) => actorIds.length > 0 ? (actors.find(a => a.id === userId)?.name ?? '—') : '—';

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A5', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(13).font('Helvetica-Bold').text('PETTY CASH VOUCHER', { align: 'center' });
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#0d7a6b').text(req.ref || req.id, { align: 'center' });
      doc.fontSize(8).font('Helvetica').fillColor('#555').text(wallet.name, { align: 'center' });
      doc.fillColor('#000').moveDown(1);

      const row = (label: string, value: string) => {
        doc.font('Helvetica-Bold').fontSize(9).text(label, { continued: true }).font('Helvetica').text(`  ${value || '—'}`);
        doc.moveDown(0.35);
      };

      row('Purpose:', req.purpose);
      row('Category:', PETTI_CATEGORY_LABEL[req.category] || req.category);
      row('Amount:', `${Number(req.amount).toLocaleString()} ${wallet.currency}`);
      if (req.payee_name) row('Paid to:', req.payee_name);
      row('Status:', req.status.toUpperCase());
      doc.moveDown(0.5);

      doc.font('Helvetica-Bold').fontSize(10).text('Trail');
      doc.moveDown(0.3);
      row('Requested by:', `${nameOf(req.requested_by)}${req.on_behalf_of_user_id ? ` (on behalf of ${nameOf(req.on_behalf_of_user_id)})` : ''}`);
      row('Requested at:', new Date(req.requested_at).toLocaleString('en-GB'));
      if (req.approved_at) {
        row(req.status === 'rejected' ? 'Rejected by:' : 'Approved by:', nameOf(req.approved_by));
        row(req.status === 'rejected' ? 'Rejected at:' : 'Approved at:', new Date(req.approved_at).toLocaleString('en-GB'));
      }
      if (req.rejection_reason) row('Rejection reason:', req.rejection_reason);
      if (req.disbursed_at) {
        row('Disbursed by:', nameOf(req.disbursed_by));
        row('Disbursed at:', new Date(req.disbursed_at).toLocaleString('en-GB'));
      }

      doc.moveDown(1.2);
      doc.fontSize(8).fillColor('#888').text(`Voucher generated ${new Date().toLocaleString('en-GB')}`, { align: 'center' });

      doc.end();
    });
  }
}
