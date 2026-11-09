// Fintech & Financial Services (backlog item 29). Self-contained auth hook
// + role gate, same convention store.routes.ts already documents (a route
// plugin registered via its own server.register() must add fastify.
// authenticate itself — there is no global hook).
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../middleware/rbac.js';
import {
  recordKycCheck, openWallet, freezeWallet, unfreezeWallet, getWalletBalance,
  initiateDeposit, confirmDeposit, failDeposit, placeHold, releaseHold, captureHold,
  chargeFee, withdraw, transferBetweenWallets, reverseTransaction,
  recordSettlementBatch, resolveExceptionCase, listOpenExceptionCases,
} from '../services/fintech.service.js';

const FINTECH_OPS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

export const fintechRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate);
  app.addHook('preHandler', requireRole(...FINTECH_OPS_ROLES));

  app.post('/kyc/:customerId', async (request, reply) => {
    const { customerId } = z.object({ customerId: z.string().uuid() }).parse(request.params);
    const input = z.object({
      level: z.enum(['basic', 'enhanced']), status: z.enum(['verified', 'rejected']),
      documentRefs: z.array(z.unknown()).optional(), rejectionReason: z.string().max(1000).optional(),
    }).parse(request.body);
    reply.status(201);
    return recordKycCheck(request.user.tenant_id, customerId, request.user.sub, input);
  });

  app.post('/wallets', async (request, reply) => {
    const { customerId, currency } = z.object({ customerId: z.string().uuid(), currency: z.string().length(3).optional() }).parse(request.body);
    reply.status(201);
    return openWallet(request.user.tenant_id, customerId, currency);
  });
  app.get('/wallets/:walletId/balance', async request => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    return getWalletBalance(request.user.tenant_id, walletId);
  });
  app.post('/wallets/:walletId/freeze', async request => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);
    return freezeWallet(request.user.tenant_id, walletId, reason);
  });
  app.post('/wallets/:walletId/unfreeze', async request => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    return unfreezeWallet(request.user.tenant_id, walletId);
  });

  app.post('/wallets/:walletId/deposits', async (request, reply) => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    const input = z.object({ amount: z.number().positive(), provider: z.enum(['selcom', 'azampay', 'internal']), providerReference: z.string().max(200).nullable().optional() }).parse(request.body);
    reply.status(201);
    return initiateDeposit(request.user.tenant_id, walletId, input.amount, input.provider, input.providerReference ?? null);
  });
  app.post('/deposits/:transactionId/confirm', async request => {
    const { transactionId } = z.object({ transactionId: z.string().uuid() }).parse(request.params);
    return confirmDeposit(request.user.tenant_id, transactionId);
  });
  app.post('/deposits/:transactionId/fail', async request => {
    const { transactionId } = z.object({ transactionId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);
    return failDeposit(request.user.tenant_id, transactionId, reason);
  });

  app.post('/wallets/:walletId/holds', async (request, reply) => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    const { amount, reason } = z.object({ amount: z.number().positive(), reason: z.string().min(1).max(500) }).parse(request.body);
    reply.status(201);
    return placeHold(request.user.tenant_id, walletId, amount, reason);
  });
  app.post('/holds/:holdId/release', async request => {
    const { holdId } = z.object({ holdId: z.string().uuid() }).parse(request.params);
    return releaseHold(request.user.tenant_id, holdId);
  });
  app.post('/holds/:holdId/capture', async request => {
    const { holdId } = z.object({ holdId: z.string().uuid() }).parse(request.params);
    return captureHold(request.user.tenant_id, holdId);
  });

  app.post('/wallets/:walletId/fees', async request => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    const { amount, reason } = z.object({ amount: z.number().positive(), reason: z.string().min(1).max(500) }).parse(request.body);
    return chargeFee(request.user.tenant_id, walletId, amount, reason);
  });

  app.post('/wallets/:walletId/withdrawals', async (request, reply) => {
    const { walletId } = z.object({ walletId: z.string().uuid() }).parse(request.params);
    const input = z.object({ amount: z.number().positive(), provider: z.enum(['selcom', 'azampay']), msisdn: z.string().min(1).max(30), reference: z.string().min(1).max(200) }).parse(request.body);
    reply.status(201);
    return withdraw(request.user.tenant_id, walletId, input.amount, input.provider, input.msisdn, input.reference);
  });

  app.post('/transfers', async (request, reply) => {
    const input = z.object({ fromWalletId: z.string().uuid(), toWalletId: z.string().uuid(), amount: z.number().positive() }).parse(request.body);
    reply.status(201);
    return transferBetweenWallets(request.user.tenant_id, input.fromWalletId, input.toWalletId, input.amount);
  });

  app.post('/transactions/:transactionId/reverse', async request => {
    const { transactionId } = z.object({ transactionId: z.string().uuid() }).parse(request.params);
    const { reason } = z.object({ reason: z.string().min(1).max(1000) }).parse(request.body);
    return reverseTransaction(request.user.tenant_id, transactionId, request.user.sub, reason);
  });

  app.post('/settlements', async (request, reply) => {
    const input = z.object({
      provider: z.enum(['selcom', 'azampay']), batchReference: z.string().min(1).max(200),
      periodStart: z.string().min(1), periodEnd: z.string().min(1),
      expectedAmount: z.number(), settledAmount: z.number(),
    }).parse(request.body);
    reply.status(201);
    return recordSettlementBatch(request.user.tenant_id, input.provider, input.batchReference, input.periodStart, input.periodEnd, input.expectedAmount, input.settledAmount);
  });

  app.get('/exceptions', async request => listOpenExceptionCases(request.user.tenant_id));
  app.post('/exceptions/:caseId/resolve', async request => {
    const { caseId } = z.object({ caseId: z.string().uuid() }).parse(request.params);
    const { resolutionNotes } = z.object({ resolutionNotes: z.string().min(1).max(2000) }).parse(request.body);
    return resolveExceptionCase(request.user.tenant_id, caseId, request.user.sub, resolutionNotes);
  });
};
