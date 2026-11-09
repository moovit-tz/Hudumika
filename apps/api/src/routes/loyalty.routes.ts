import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import { GLService } from '../services/gl.service.js';
import { computeLoyaltyBalance, getLoyaltyProgram } from '../services/loyalty.service.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function loyaltyRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAnyEntitlement(['finops', 'finance.core']));

  fastify.get('/program', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const program = await getLoyaltyProgram(trx, user.tenant_id);
      return program ?? { tenantId: user.tenant_id, enabled: false, pointsPerCurrencyUnit: 0.01, redemptionValuePerPoint: 1 };
    });
  });

  fastify.put('/program', { preHandler: requireRole(...FINANCE_TIER) }, async (request) => {
    const user = request.user;
    const body = z.object({
      enabled: z.boolean(),
      points_per_currency_unit: z.number().min(0),
      redemption_value_per_point: z.number().positive(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('loyalty_programs').values({
        tenant_id: user.tenant_id, enabled: body.enabled,
        points_per_currency_unit: String(body.points_per_currency_unit), redemption_value_per_point: String(body.redemption_value_per_point),
        updated_by: user.sub,
      }).onConflict(oc => oc.column('tenant_id').doUpdateSet({
        enabled: body.enabled, points_per_currency_unit: String(body.points_per_currency_unit),
        redemption_value_per_point: String(body.redemption_value_per_point), updated_by: user.sub, updated_at: new Date(),
      })).execute();
      return getLoyaltyProgram(trx, user.tenant_id);
    });
  });

  fastify.get('/customers/:id/balance', async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(user.tenant_id, async (trx) => {
      const customer = await trx.selectFrom('customers').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });
      const balance = await computeLoyaltyBalance(trx, user.tenant_id, id);
      const transactions = await trx.selectFrom('loyalty_transactions').selectAll()
        .where('tenant_id', '=', user.tenant_id).where('customer_id', '=', id).orderBy('created_at', 'desc').execute();
      return { customer_id: id, balance, transactions: transactions.map(t => ({ ...t, points: Number(t.points), value: Number(t.value) })) };
    });
  });

  // POST /:id/adjust — a genuine manual correction (goodwill points, a
  // mis-earned award corrected by support), not a sale event. Always
  // GL-booked for real — a positive adjustment costs the business exactly
  // what an earned point would; a negative one reverses that cost.
  fastify.post('/customers/:id/adjust', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ points: z.number().positive(), direction: z.enum(['add', 'subtract']), reason: z.string().trim().min(3).max(500) }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const customer = await trx.selectFrom('customers').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });
      const program = await getLoyaltyProgram(trx, user.tenant_id);
      const rate = program?.redemptionValuePerPoint ?? 1;
      const value = money(body.points * rate);

      if (body.direction === 'subtract') {
        const balance = await computeLoyaltyBalance(trx, user.tenant_id, id);
        if (body.points > balance + 1e-9) return reply.status(400).send({ error: `This customer only has ${balance} points.` });
      }

      const type = body.direction === 'add' ? 'adjust_add' : 'adjust_subtract';
      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: new Date().toISOString(), description: `Loyalty points ${body.direction === 'add' ? 'awarded' : 'removed'}: ${body.reason}`,
        sourceModule: 'MANUAL', createdBy: user.sub,
        lines: body.direction === 'add'
          ? [{ accountCode: '5910', debit: value, credit: 0, description: 'Loyalty points manually awarded' }, { accountCode: '2170', debit: 0, credit: value, description: 'Loyalty points liability' }]
          : [{ accountCode: '2170', debit: value, credit: 0, description: 'Loyalty points liability reversed' }, { accountCode: '5910', debit: 0, credit: value, description: 'Loyalty points manually removed' }],
      }, trx);

      await trx.insertInto('loyalty_transactions').values({
        tenant_id: user.tenant_id, customer_id: id, type, points: String(body.points), value: String(value),
        journal_entry_id: journalEntryId, created_by: user.sub, note: body.reason,
      }).execute();

      return { success: true, balance: await computeLoyaltyBalance(trx, user.tenant_id, id) };
    });
  });
}
