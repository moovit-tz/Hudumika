import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

/**
 * Dividends (M6 of the corporate-tax build-out) — declared and paid as two
 * distinct dated events, feeding GLService.statementOfChangesInEquity()'s
 * real-FK movement attribution.
 */
export async function dividendRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('dividends').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('declared_date', 'desc').execute()
    );
  });

  // POST /v1/dividends — declares a dividend: debit 3100 Retained Earnings,
  // credit 2600 Dividends Payable.
  fastify.post('/', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      declared_date: z.string(), amount: z.number().positive(), description: z.string().max(2000).optional(),
    }).parse(request.body);

    const journalEntryId = await GLService.post(user.tenant_id, {
      entryDate: body.declared_date,
      description: `Dividend declared${body.description ? `: ${body.description}` : ''}`,
      sourceModule: 'MANUAL', createdBy: user.sub,
      lines: [
        { accountCode: '3100', debit: body.amount, credit: 0, description: 'Dividend declared' },
        { accountCode: '2600', debit: 0, credit: body.amount, description: 'Dividend declared' },
      ],
    });

    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.insertInto('dividends').values({
        tenant_id: user.tenant_id, declared_date: body.declared_date, amount: String(body.amount),
        description: body.description || null, status: 'DECLARED', journal_entry_id: journalEntryId, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();
      return reply.status(201).send(row);
    });
  });

  // POST /v1/dividends/:id/pay — the actual cash payment: debit 2600, credit cash.
  fastify.post('/:id/pay', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { paid_at, reference, account_code } = z.object({
      paid_at: z.string().optional(), reference: z.string().max(200).optional(), account_code: z.string().max(20).optional(),
    }).parse(request.body ?? {});

    const dividend = await withTenant(user.tenant_id, (trx) =>
      trx.selectFrom('dividends').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst()
    );
    if (!dividend) return reply.status(404).send({ error: 'Dividend not found' });
    if (dividend.status === 'PAID') return reply.status(409).send({ error: 'This dividend has already been paid.' });

    const amount = Number(dividend.amount);
    const journalEntryId = await GLService.post(user.tenant_id, {
      entryDate: paid_at ? new Date(paid_at).toISOString() : new Date().toISOString(),
      description: `Dividend paid${dividend.description ? `: ${dividend.description}` : ''}`,
      reference: reference || `DIV-${dividend.id.slice(0, 8).toUpperCase()}`,
      sourceModule: 'MANUAL', sourceId: dividend.id, createdBy: user.sub,
      lines: [
        { accountCode: '2600', debit: amount, credit: 0, description: 'Dividend paid' },
        { accountCode: account_code || '1010', debit: 0, credit: amount, description: 'Cash paid' },
      ],
    });

    return withTenant(user.tenant_id, (trx) =>
      trx.updateTable('dividends').set({
        status: 'PAID', paid_at: paid_at ? paid_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
        paid_journal_entry_id: journalEntryId, reference: reference || null,
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow()
    );
  });
}
