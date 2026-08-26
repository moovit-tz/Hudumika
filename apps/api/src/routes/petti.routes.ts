import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { PettiService, PETTI_CATEGORIES, PETTI_FINANCE_ROLES } from '../services/petti.service.js';
import { getActiveGateway, getConfiguredGateways } from '../lib/payment-gateway.js';

// Gateway ids petti.service.ts's getPaymentGatewayAdapter actually knows how
// to place a live charge with (VodacomMpesaAdapter/AirtelMoneyAdapter) —
// every other configured gateway still 400s on method:'gateway' via
// StubGatewayAdapter. Keep in sync with that dispatch.
const CHARGE_CAPABLE_GATEWAYS: Record<string, string> = {
  vodacom: 'Vodacom M-Pesa (TZ)',
  airtel: 'Airtel Money',
};

// The subset of Settings' full GATEWAYS catalog (apps/web/src/pages/
// Settings.tsx) that's actually relevant to a TZS petty-cash wallet — no
// Stripe/PayPal/Square here, those exist for card payments elsewhere on the
// platform. Real names, matched 1:1 against Settings' own `id`s so
// "configured" status lines up; this list is metadata only (id/name/region),
// never credentials — those stay exclusively in Settings.
const PETTI_RELEVANT_GATEWAYS: { id: string; name: string; region: string }[] = [
  { id: 'mpesa', name: 'M-Pesa (Safaricom)', region: 'Mobile Money' },
  { id: 'vodacom', name: 'Vodacom M-Pesa (TZ)', region: 'Mobile Money' },
  { id: 'tigopesa', name: 'Tigo Pesa', region: 'Mobile Money' },
  { id: 'airtel', name: 'Airtel Money', region: 'Mobile Money' },
  { id: 'selcom', name: 'Selcom', region: 'Mobile Money' },
  { id: 'halotel', name: 'Halotel (HaloPesa)', region: 'Mobile Money' },
  { id: 'bank', name: 'Bank Transfer', region: 'Bank' },
];

const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  currency: z.string().max(5).optional(),
});

const walletStatusSchema = z.object({ status: z.enum(['active', 'closed']) });
const walletUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});

const depositSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['manual', 'gateway']).optional(),
  gateway_provider: z.string().max(50).optional(),
  gateway_tx_ref: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  // Required by recordDeposit only when method:'gateway' resolves to a
  // provider that actually places a live charge (Vodacom/Airtel today) — a
  // real mobile-money "request to pay" has nowhere else to send the prompt.
  payer_msisdn: z.string().max(20).optional(),
});

const withdrawalRequestSchema = z.object({
  amount: z.number().positive(),
  category: z.enum(PETTI_CATEGORIES).optional(),
  purpose: z.string().trim().min(1).max(2000),
  payee_name: z.string().trim().max(200).optional(),
  on_behalf_of_user_id: z.string().uuid().optional(),
});

const rejectSchema = z.object({ reason: z.string().max(2000).optional() });

const flagSchema = z.object({
  subject_type: z.enum(['deposit', 'withdrawal']),
  subject_id: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});
const resolveFlagSchema = z.object({ resolution_note: z.string().max(2000).optional() });

const transferSchema = z.object({
  from_wallet_id: z.string().uuid(),
  to_wallet_id: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().max(2000).optional(),
});

const walletApproverSchema = z.object({ approver_user_id: z.string().uuid().nullable() });
const walletApproverBackupSchema = z.object({ backup_user_id: z.string().uuid().nullable() });
const walletWorkflowConfigSchema = z.object({
  default_workflow_id: z.string().uuid().nullable().optional(),
  category_overrides: z.record(z.string(), z.string()).optional(),
});

const workflowCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  requires_department_approval: z.boolean(),
});
const workflowUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  requires_department_approval: z.boolean().optional(),
});

/** Maps a thrown service error to the right HTTP status — "not found" is a
 *  404, a recognized authorization refusal (wrong person/role for this
 *  approval/backup/disburse step) is a 403, every other thrown Error here is
 *  a validated business-rule refusal (insufficient balance, wrong state
 *  transition, etc.), a 400. Matched on distinctive substrings from
 *  petti.service.ts's own error messages, not a broad prefix — a wrong-state
 *  message like "Cannot approve a request in 'approved' status" is a 400,
 *  not a permission error, even though it also contains the word "approve". */
const AUTHZ_ERROR_PATTERN = /own withdrawal request|designated (department )?approver|department approver configured|straight to finance|only finance can/i;
function sendServiceError(reply: any, e: any) {
  const message = e?.message || 'Request failed';
  const status = /not found/i.test(message) ? 404
    : AUTHZ_ERROR_PATTERN.test(message) ? 403
    : 400;
  return reply.status(status).send({ error: message });
}

export async function pettiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('petti'));

  // ── Wallets ────────────────────────────────────────────────────────────
  fastify.get('/wallets', async (request) => {
    const user = request.user;
    return { data: await PettiService.listWallets(user.tenant_id) };
  });

  fastify.get('/wallets/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const result = await PettiService.getWallet(user.tenant_id, id);
    if (!result) return reply.status(404).send({ error: 'Wallet not found' });
    return result;
  });

  fastify.post('/wallets', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = createWalletSchema.parse(request.body);
    try {
      const wallet = await PettiService.createWallet(user.tenant_id, user.sub, {
        name: body.name, description: body.description || undefined, currency: body.currency,
      });
      return reply.status(201).send(wallet);
    } catch (e: any) {
      if (/duplicate key/i.test(e?.message || '')) {
        return reply.status(409).send({ error: `A wallet named "${body.name}" already exists.` });
      }
      return sendServiceError(reply, e);
    }
  });

  fastify.patch('/wallets/:id', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletUpdateSchema.parse(request.body);
    try {
      return await PettiService.updateWallet(user.tenant_id, id, body);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.patch('/wallets/:id/status', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletStatusSchema.parse(request.body);
    try {
      return await PettiService.setWalletStatus(user.tenant_id, id, body.status);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // Assigning the primary department approver is wallet setup — finance/admin only.
  fastify.patch('/wallets/:id/approver', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletApproverSchema.parse(request.body);
    try {
      return await PettiService.setWalletApprover(user.tenant_id, id, body.approver_user_id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // Self-service: the wallet's own designated approver can name their own
  // stand-in for while they're away — no route-level role gate, the service
  // checks "is this caller the wallet's approver, or a finance admin".
  fastify.patch('/wallets/:id/approver-backup', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletApproverBackupSchema.parse(request.body);
    try {
      return await PettiService.setWalletApproverBackup(user.tenant_id, { id: user.sub, role: user.role }, id, body.backup_user_id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.patch('/wallets/:id/workflow', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletWorkflowConfigSchema.parse(request.body);
    try {
      return await PettiService.setWalletWorkflowConfig(user.tenant_id, id, {
        defaultWorkflowId: body.default_workflow_id, categoryOverrides: body.category_overrides,
      });
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Workflows ──────────────────────────────────────────────────────────
  fastify.get('/workflows', async (request) => {
    const user = request.user;
    return { data: await PettiService.listWorkflows(user.tenant_id, user.sub) };
  });

  fastify.post('/workflows', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = workflowCreateSchema.parse(request.body);
    try {
      const workflow = await PettiService.createWorkflow(user.tenant_id, user.sub, {
        name: body.name, description: body.description, requiresDepartmentApproval: body.requires_department_approval,
      });
      return reply.status(201).send(workflow);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.patch('/workflows/:id', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = workflowUpdateSchema.parse(request.body);
    try {
      return await PettiService.updateWorkflow(user.tenant_id, id, {
        name: body.name, description: body.description, requiresDepartmentApproval: body.requires_department_approval,
      });
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.delete('/workflows/:id', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      await PettiService.deleteWorkflow(user.tenant_id, id);
      return reply.status(204).send();
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Gateway status ───────────────────────────────────────────────────────
  // The real, single source of truth for "what will method:'gateway' do
  // right now" — read by the deposit forms (so the dropdown never offers a
  // provider that will just throw) and by the Gateways page (so it shows
  // this tenant's actual Settings config instead of a fabricated list).
  fastify.get('/gateway-status', async (request) => {
    const user = request.user;
    const active = await getActiveGateway(user.tenant_id);
    if (!active) return { configured: false, provider: null, label: null, sandbox: false, chargeSupported: false };
    return {
      configured: true,
      provider: active.id,
      label: CHARGE_CAPABLE_GATEWAYS[active.id] ?? active.id,
      sandbox: active.sandbox,
      chargeSupported: active.id in CHARGE_CAPABLE_GATEWAYS,
    };
  });

  // The full browsable catalog, not just the one active gateway — restores
  // the "see all our options" view PettiGateways.tsx used to fake (24
  // hardcoded providers, none of them real) with real per-tenant status
  // instead. No credentials in the response, ever — enabled/sandbox only.
  fastify.get('/gateway-catalog', async (request) => {
    const user = request.user;
    const configured = await getConfiguredGateways(user.tenant_id);
    return PETTI_RELEVANT_GATEWAYS.map(gw => ({
      ...gw,
      configured: !!configured[gw.id],
      enabled: !!configured[gw.id]?.enabled,
      sandbox: !!configured[gw.id]?.sandbox,
      chargeSupported: gw.id in CHARGE_CAPABLE_GATEWAYS,
    }));
  });

  // ── Deposits ───────────────────────────────────────────────────────────
  fastify.post('/wallets/:id/deposits', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = depositSchema.parse(request.body);
    try {
      const deposit = await PettiService.recordDeposit(user.tenant_id, user.sub, {
        walletId: id, amount: body.amount, method: body.method,
        gatewayProvider: body.gateway_provider, gatewayTxRef: body.gateway_tx_ref,
        reference: body.reference, note: body.note, payerMsisdn: body.payer_msisdn,
      });
      return reply.status(201).send(deposit);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Activity / audit log ─────────────────────────────────────────────────
  fastify.get('/activity', async (request) => {
    const user = request.user;
    const q = request.query as { wallet_id?: string; actor_id?: string; from?: string; to?: string; limit?: string; offset?: string };
    const { rows, total } = await PettiService.listActivity(user.tenant_id, {
      walletId: q.wallet_id, actorId: q.actor_id, from: q.from, to: q.to,
    }, { limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined });
    return { data: rows, total };
  });

  // ── Spend report ─────────────────────────────────────────────────────────
  fastify.get('/reports/spend', async (request) => {
    const user = request.user;
    const { from, to } = request.query as { from?: string; to?: string };
    return PettiService.getSpendReport(user.tenant_id, { from, to });
  });

  // ── Flags ────────────────────────────────────────────────────────────────
  // Raising is open to any tenant user with Petti access, same reasoning as
  // requesting a withdrawal — resolving is what's gated.
  fastify.post('/flags', async (request, reply) => {
    const user = request.user;
    const body = flagSchema.parse(request.body);
    try {
      const flag = await PettiService.raiseFlag(user.tenant_id, user.sub, {
        subjectType: body.subject_type, subjectId: body.subject_id, reason: body.reason,
      });
      return reply.status(201).send(flag);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.get('/flags', async (request) => {
    const user = request.user;
    const { wallet_id, status } = request.query as { wallet_id?: string; status?: string };
    return { data: await PettiService.listFlags(user.tenant_id, { walletId: wallet_id, status }) };
  });

  fastify.patch('/flags/:id/resolve', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = resolveFlagSchema.parse(request.body ?? {});
    try {
      return await PettiService.resolveFlag(user.tenant_id, user.sub, id, body.resolution_note);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Transfers (wallet-to-wallet) ────────────────────────────────────────
  fastify.post('/transfers', { preHandler: requireRole(...PETTI_FINANCE_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = transferSchema.parse(request.body);
    try {
      const transfer = await PettiService.transferBetweenWallets(user.tenant_id, user.sub, {
        fromWalletId: body.from_wallet_id, toWalletId: body.to_wallet_id, amount: body.amount, note: body.note,
      });
      return reply.status(201).send(transfer);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.get('/transfers', async (request) => {
    const user = request.user;
    const { wallet_id } = request.query as { wallet_id?: string };
    return { data: await PettiService.listTransfers(user.tenant_id, { walletId: wallet_id }) };
  });

  // ── Withdrawal requests ────────────────────────────────────────────────
  // Requesting is deliberately open to any tenant user with Petti access —
  // "the team can withdraw for petty cash" — not just PETTI_FINANCE_ROLES.
  // Approve/reject/disburse below check per-request authorization inside the
  // service (the resolved workflow's approver is a specific person, not a
  // platform role), so no requireRole preHandler gates them at the route.
  fastify.post('/wallets/:id/withdrawals', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = withdrawalRequestSchema.parse(request.body);
    try {
      const req = await PettiService.requestWithdrawal(user.tenant_id, { id: user.sub, role: user.role }, {
        walletId: id, amount: body.amount, category: body.category, purpose: body.purpose,
        payeeName: body.payee_name, onBehalfOfUserId: body.on_behalf_of_user_id,
      });
      return reply.status(201).send(req);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.get('/withdrawals', async (request) => {
    const user = request.user;
    const { wallet_id, status } = request.query as { wallet_id?: string; status?: string };
    return { data: await PettiService.listWithdrawalRequests(user.tenant_id, { walletId: wallet_id, status }) };
  });

  // ── Deposits (cross-wallet) ─────────────────────────────────────────────
  fastify.get('/deposits', async (request) => {
    const user = request.user;
    const { wallet_id, from, to } = request.query as { wallet_id?: string; from?: string; to?: string };
    return { data: await PettiService.listDeposits(user.tenant_id, { walletId: wallet_id, from, to }) };
  });

  // ── Unified transaction ledger ──────────────────────────────────────────
  fastify.get('/transactions', async (request) => {
    const user = request.user;
    const q = request.query as {
      wallet_id?: string; type?: 'deposit' | 'withdrawal' | 'transfer'; status?: string; category?: string;
      from?: string; to?: string; search?: string; limit?: string; offset?: string;
    };
    const { rows, total } = await PettiService.listTransactions(user.tenant_id, {
      walletId: q.wallet_id, type: q.type, status: q.status, category: q.category,
      from: q.from, to: q.to, search: q.search,
    }, { limit: q.limit ? Number(q.limit) : undefined, offset: q.offset ? Number(q.offset) : undefined });
    return { data: rows, total };
  });

  fastify.post('/withdrawals/:id/approve', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      return await PettiService.approveWithdrawal(user.tenant_id, { id: user.sub, role: user.role }, id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.post('/withdrawals/:id/reject', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = rejectSchema.parse(request.body ?? {});
    try {
      return await PettiService.rejectWithdrawal(user.tenant_id, { id: user.sub, role: user.role }, id, body.reason);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.post('/withdrawals/:id/disburse', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      return await PettiService.disburseWithdrawal(user.tenant_id, { id: user.sub, role: user.role }, id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.get('/withdrawals/:id/voucher.pdf', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      const pdf = await PettiService.renderWithdrawalVoucherPdf(user.tenant_id, id);
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="petty-cash-voucher-${id}.pdf"`);
      return reply.send(pdf);
    } catch (e: any) {
      return reply.status(404).send({ error: e.message });
    }
  });
}
