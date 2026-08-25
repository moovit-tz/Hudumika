import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';

const RETAINED_EARNINGS_ACCOUNT = '3100';

export async function glPeriodRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('gl_periods').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('period_start', 'desc').execute();
    });
  });

  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      period_type: z.enum(['MONTH', 'YEAR']).default('MONTH'),
      period_start: z.string(),
      period_end: z.string(),
    }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      try {
        const period = await trx.insertInto('gl_periods').values({
          tenant_id: user.tenant_id, name: body.name, period_type: body.period_type,
          period_start: body.period_start, period_end: body.period_end,
        }).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(period);
      } catch (err: any) {
        if (err.code === '23505') return reply.status(409).send({ error: 'A period with these exact dates already exists.' });
        throw err;
      }
    });
  });

  // POST /:id/close — snapshots the trial balance; a YEAR period also posts
  // real closing entries zeroing every REVENUE/EXPENSE account's movement
  // for the period into Retained Earnings, same "recomputing it later must
  // never give a different answer" reasoning vat-period.service.ts's own
  // return_snapshot already established. A MONTH period just locks, exactly
  // like a VAT period close never touching revenue/expense at all.
  fastify.post('/:id/close', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const period = await trx.selectFrom('gl_periods').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status === 'closed') return reply.status(409).send({ error: 'This period is already closed.' });

      const tb = await GLService.trialBalance(user.tenant_id, period.period_start, period.period_end);

      let closingEntryId: string | null = null;
      if (period.period_type === 'YEAR') {
        const revenueRows = tb.rows.filter(r => r.account_type === 'REVENUE' && (r.period_debit !== 0 || r.period_credit !== 0));
        const expenseRows = tb.rows.filter(r => r.account_type === 'EXPENSE' && (r.period_debit !== 0 || r.period_credit !== 0));
        if (revenueRows.length > 0 || expenseRows.length > 0) {
          const revenueNet = revenueRows.reduce((s, r) => s + (r.period_credit - r.period_debit), 0);
          const expenseNet = expenseRows.reduce((s, r) => s + (r.period_debit - r.period_credit), 0);
          const netIncome = revenueNet - expenseNet;

          const lines = [
            ...revenueRows.map(r => ({ accountCode: r.account_code, debit: r.period_credit - r.period_debit, credit: 0, description: `Close ${r.account_name}` })),
            ...expenseRows.map(r => ({ accountCode: r.account_code, debit: 0, credit: r.period_debit - r.period_credit, description: `Close ${r.account_name}` })),
            netIncome >= 0
              ? { accountCode: RETAINED_EARNINGS_ACCOUNT, debit: 0, credit: netIncome, description: 'Net income transferred to Retained Earnings' }
              : { accountCode: RETAINED_EARNINGS_ACCOUNT, debit: -netIncome, credit: 0, description: 'Net loss transferred to Retained Earnings' },
          ].filter(l => l.debit > 0 || l.credit > 0);

          // Posted before the period is marked closed — GLService.post()'s
          // own closed-period guard checks entryDate against gl_periods at
          // write time, and this entry's date falls inside the period
          // that's *about* to close, not one that already has.
          closingEntryId = await GLService.post(user.tenant_id, {
            entryDate: period.period_end,
            description: `Year-end close: ${period.name}`,
            sourceModule: 'MANUAL',
            createdBy: user.sub,
            lines,
          });
        }
      }

      const updated = await trx.updateTable('gl_periods').set({
        status: 'closed', trial_balance_snapshot: JSON.stringify(tb) as any,
        closing_entry_id: closingEntryId, closed_at: new Date(), closed_by: user.sub,
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

      return updated;
    });
  });

  fastify.post('/:id/reopen', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const period = await trx.selectFrom('gl_periods').select(['id', 'status']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status === 'open') return reply.status(409).send({ error: 'This period is already open.' });
      // A reopen is a new fact about the period, not an erasure of the old
      // one — the closing snapshot and closing entry stay exactly as they
      // were, same rule vat-period.service.ts's own reopen already follows.
      const updated = await trx.updateTable('gl_periods').set({
        status: 'open', reopened_at: new Date(), reopened_by: user.sub, reopen_reason: reason,
      }).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
      return updated;
    });
  });

  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const period = await trx.selectFrom('gl_periods').select(['id', 'status', 'closed_at']).where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.closed_at) return reply.status(409).send({ error: 'A period that has ever been closed cannot be deleted — reopen or leave it as a record.' });
      await trx.deleteFrom('gl_periods').where('id', '=', id).execute();
      return { success: true };
    });
  });
}
