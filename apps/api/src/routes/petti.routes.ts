import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import { PettiService, PETTI_CATEGORIES, PETTI_ADMIN_ROLES } from '../services/petti.service.js';

const createWalletSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  currency: z.string().max(5).optional(),
});

const walletStatusSchema = z.object({ status: z.enum(['active', 'closed']) });

const depositSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['manual', 'gateway']).optional(),
  gateway_provider: z.string().max(50).optional(),
  gateway_tx_ref: z.string().max(200).optional(),
  reference: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});

const withdrawalRequestSchema = z.object({
  amount: z.number().positive(),
  category: z.enum(PETTI_CATEGORIES).optional(),
  purpose: z.string().trim().min(1).max(2000),
});

const rejectSchema = z.object({ reason: z.string().max(2000).optional() });

/** Maps a thrown service error to the right HTTP status — "not found" is a
 *  404, every other thrown Error here is a validated business-rule refusal
 *  (insufficient balance, wrong state transition, etc.), a 400. */
function sendServiceError(reply: any, e: any) {
  const message = e?.message || 'Request failed';
  const status = /not found/i.test(message) ? 404 : 400;
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

  fastify.post('/wallets', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
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

  fastify.patch('/wallets/:id/status', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = walletStatusSchema.parse(request.body);
    try {
      return await PettiService.setWalletStatus(user.tenant_id, id, body.status);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Deposits ───────────────────────────────────────────────────────────
  fastify.post('/wallets/:id/deposits', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = depositSchema.parse(request.body);
    try {
      const deposit = await PettiService.recordDeposit(user.tenant_id, user.sub, {
        walletId: id, amount: body.amount, method: body.method,
        gatewayProvider: body.gateway_provider, gatewayTxRef: body.gateway_tx_ref,
        reference: body.reference, note: body.note,
      });
      return reply.status(201).send(deposit);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  // ── Withdrawal requests ────────────────────────────────────────────────
  // Requesting is deliberately open to any tenant user with Petti access —
  // "the team can withdraw for petty cash" — not just PETTI_ADMIN_ROLES.
  // Approve/reject/disburse below are the actual control point.
  fastify.post('/wallets/:id/withdrawals', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = withdrawalRequestSchema.parse(request.body);
    try {
      const req = await PettiService.requestWithdrawal(user.tenant_id, user.sub, {
        walletId: id, amount: body.amount, category: body.category, purpose: body.purpose,
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

  fastify.post('/withdrawals/:id/approve', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      return await PettiService.approveWithdrawal(user.tenant_id, user.sub, id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.post('/withdrawals/:id/reject', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = rejectSchema.parse(request.body ?? {});
    try {
      return await PettiService.rejectWithdrawal(user.tenant_id, user.sub, id, body.reason);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });

  fastify.post('/withdrawals/:id/disburse', { preHandler: requireRole(...PETTI_ADMIN_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    try {
      return await PettiService.disburseWithdrawal(user.tenant_id, user.sub, id);
    } catch (e: any) {
      return sendServiceError(reply, e);
    }
  });
}
