import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { GLService } from '../services/gl.service.js';
import { computeGiftCardBalance, normalizeGiftCardCode } from '../services/gift-card.service.js';

// Same roster POS checkout already trusts to take real money at the
// register (pos.routes.ts's POS_ROLES) — issuing or reloading a gift card
// is an ordinary register sale of a different kind of product. Voiding an
// outstanding balance (a genuine write-off, not a sale) is the narrower,
// back-office-only FINANCE_TIER the sibling customer-credits routes use.
const GIFT_CARD_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;
const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
const tenderAccounts = { CASH: '1001', CARD: '1020', MOBILE_MONEY: '1021', BANK: '1010', OTHER: '1022' } as const;
const tenderMethod = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER']);
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function generateCode(): string {
  // 4 groups of 4 — short enough to read back to a customer over a
  // counter, long enough that a 10-digit guess space makes brute-forcing
  // a real card infeasible at POS rate limits.
  return Array.from({ length: 4 }, () => crypto.randomInt(0, 36 ** 4).toString(36).toUpperCase().padStart(4, '0')).join('-');
}

export async function giftCardRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'finance.core']));

  fastify.get('/', async (request) => {
    const user = request.user;
    const { code, customer_id } = z.object({ code: z.string().optional(), customer_id: z.string().uuid().optional() }).parse(request.query);
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('gift_cards').selectAll().where('tenant_id', '=', user.tenant_id);
      if (code) q = q.where('code', '=', normalizeGiftCardCode(code));
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      const cards = await q.orderBy('created_at', 'desc').execute();
      return Promise.all(cards.map(async (card) => ({ ...card, balance: await computeGiftCardBalance(trx, user.tenant_id, card.id) })));
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(user.tenant_id, async (trx) => {
      const card = await trx.selectFrom('gift_cards').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!card) return reply.status(404).send({ error: 'Gift card not found.' });
      const balance = await computeGiftCardBalance(trx, user.tenant_id, id);
      const transactions = await trx.selectFrom('gift_card_transactions').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('gift_card_id', '=', id).orderBy('created_at', 'desc').execute();
      return { ...card, balance, transactions: transactions.map(t => ({ ...t, amount: Number(t.amount) })) };
    });
  });

  // POST /v1/gift-cards — issue a new card for real money received now
  // (a counter sale of the card itself, or a promotional/goodwill issue
  // with no corresponding cash leg — see `waive`).
  fastify.post('/', { preHandler: requireRole(...GIFT_CARD_ROLES) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      code: z.string().trim().min(4).max(40).optional(),
      initial_value: z.number().positive(),
      method: tenderMethod.optional(),
      waive: z.boolean().default(false),
      customer_id: z.string().uuid().nullable().optional(),
      expires_at: z.string().datetime().nullable().optional(),
    }).refine(v => v.waive || v.method, { message: 'A tender method is required unless this issue is explicitly waived (promotional/goodwill, no cash received).' }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      if (body.customer_id) {
        const customer = await trx.selectFrom('customers').select('id').where('id', '=', body.customer_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
        if (!customer) return reply.status(404).send({ error: 'Customer not found' });
      }
      const code = normalizeGiftCardCode(body.code || generateCode());
      const existing = await trx.selectFrom('gift_cards').select('id').where('tenant_id', '=', user.tenant_id).where('code', '=', code).executeTakeFirst();
      if (existing) return reply.status(409).send({ error: `Gift card code ${code} is already in use.` });

      let journalEntryId: string | null = null;
      if (!body.waive) {
        journalEntryId = await GLService.post(user.tenant_id, {
          entryDate: new Date().toISOString(), description: `Gift card ${code} issued`,
          sourceModule: 'MANUAL', createdBy: user.sub,
          lines: [
            { accountCode: tenderAccounts[body.method!], debit: body.initial_value, credit: 0, description: `${body.method!.toLowerCase().replace('_', ' ')} received for gift card` },
            { accountCode: '2160', debit: 0, credit: body.initial_value, description: 'Gift card liability' },
          ],
        }, trx);
      }

      const card = await trx.insertInto('gift_cards').values({
        tenant_id: user.tenant_id, code, customer_id: body.customer_id ?? null,
        expires_at: body.expires_at ? new Date(body.expires_at) : null, issued_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      await trx.insertInto('gift_card_transactions').values({
        tenant_id: user.tenant_id, gift_card_id: card.id, type: 'issue', amount: String(body.initial_value),
        journal_entry_id: journalEntryId, created_by: user.sub,
      }).execute();

      return { ...card, balance: body.initial_value };
    });
  });

  fastify.post('/:id/reload', { preHandler: requireRole(...GIFT_CARD_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ amount: z.number().positive(), method: tenderMethod }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const card = await trx.selectFrom('gift_cards').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!card) return reply.status(404).send({ error: 'Gift card not found.' });
      if (card.status !== 'active') return reply.status(409).send({ error: 'This gift card is no longer active.' });

      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: new Date().toISOString(), description: `Gift card ${card.code} reloaded`,
        sourceModule: 'MANUAL', createdBy: user.sub,
        lines: [
          { accountCode: tenderAccounts[body.method], debit: body.amount, credit: 0, description: `${body.method.toLowerCase().replace('_', ' ')} received for gift card reload` },
          { accountCode: '2160', debit: 0, credit: body.amount, description: 'Gift card liability' },
        ],
      }, trx);
      await trx.insertInto('gift_card_transactions').values({
        tenant_id: user.tenant_id, gift_card_id: id, type: 'reload', amount: String(body.amount),
        journal_entry_id: journalEntryId, created_by: user.sub,
      }).execute();

      const balance = await computeGiftCardBalance(trx, user.tenant_id, id);
      return { success: true, balance };
    });
  });

  // POST /:id/void — a genuine write-off (card reported lost, program
  // discontinued), not a sale reversal. Whatever balance remains is
  // expensed out of the liability rather than quietly disappearing.
  fastify.post('/:id/void', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ reason: z.string().trim().min(3).max(500) }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const card = await trx.selectFrom('gift_cards').selectAll().where('tenant_id', '=', user.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!card) return reply.status(404).send({ error: 'Gift card not found.' });
      if (card.status !== 'active') return reply.status(409).send({ error: 'This gift card is already void.' });

      const balance = await computeGiftCardBalance(trx, user.tenant_id, id);
      let journalEntryId: string | null = null;
      if (balance > 0.01) {
        // Writing off a liability the business will never have to redeem
        // is breakage INCOME, not an expense — debit (reduce) the
        // liability, credit "Other Revenue" (4500, already the platform's
        // generic catch-all revenue account).
        journalEntryId = await GLService.post(user.tenant_id, {
          entryDate: new Date().toISOString(), description: `Gift card ${card.code} voided: ${body.reason}`,
          sourceModule: 'MANUAL', sourceId: card.id, createdBy: user.sub,
          lines: [
            { accountCode: '2160', debit: money(balance), credit: 0, description: 'Gift card liability written off' },
            { accountCode: '4500', debit: 0, credit: money(balance), description: 'Gift card breakage income' },
          ],
        }, trx);
        await trx.insertInto('gift_card_transactions').values({
          tenant_id: user.tenant_id, gift_card_id: id, type: 'void_writeoff', amount: String(money(balance)),
          journal_entry_id: journalEntryId, created_by: user.sub,
        }).execute();
      }
      await trx.updateTable('gift_cards').set({ status: 'void' }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).execute();

      return { success: true, written_off: balance };
    });
  });
}
