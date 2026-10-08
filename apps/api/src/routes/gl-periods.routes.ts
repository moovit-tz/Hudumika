import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { requireFinanceCapability } from '../middleware/finance-capability.js';
import { GLService } from '../services/gl.service.js';
import { sql } from 'kysely';
import { CLOSE_CHECKS, closeDiagnostics, hasCloseBlockers } from '../services/finance-close.service.js';

const RETAINED_EARNINGS_ACCOUNT = '3100';

export async function glPeriodRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));
  fastify.addHook('preHandler', requireFinanceCapability('finance.accounting.advanced', { preserveReadAccess: true }));

  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('gl_periods').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('period_start', 'desc').execute();
    });
  });

  fastify.get('/:id/review', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      const period = await trx.selectFrom('gl_periods').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      const diagnostics = await closeDiagnostics(trx, request.user.tenant_id, period.period_start, period.period_end);
      const reviews = await trx.selectFrom('finance_close_reviews').selectAll().where('tenant_id', '=', request.user.tenant_id).where('period_id', '=', id).orderBy('created_at', 'desc').limit(20).execute();
      return { period, diagnostics, checks: CLOSE_CHECKS, reviews, blocked: hasCloseBlockers(diagnostics) };
    });
  });
  fastify.post('/:id/review', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ checklist: z.record(z.string(), z.boolean()), note: z.string().trim().min(1).max(2000) }).parse(request.body);
    if (CLOSE_CHECKS.some(check => body.checklist[check] !== true)) return reply.status(422).send({ error: 'Review every close area before signing off.' });
    return withTenant(request.user.tenant_id, async trx => {
      const period = await trx.selectFrom('gl_periods').selectAll().where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).forUpdate().executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status !== 'open') return reply.status(409).send({ error: 'Only open periods accept review.' });
      const diagnostics = await closeDiagnostics(trx, request.user.tenant_id, period.period_start, period.period_end);
      if (hasCloseBlockers(diagnostics)) return reply.status(409).send({ error: 'Resolve the close exceptions before signing off.', diagnostics });
      return reply.status(201).send(await trx.insertInto('finance_close_reviews').values({ tenant_id: request.user.tenant_id, period_id: id, reviewer_id: request.user.sub, checklist: body.checklist, note: body.note, diagnostics }).returningAll().executeTakeFirstOrThrow());
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
      await sql`select pg_advisory_xact_lock(hashtextextended(${`gl:${user.tenant_id}`}, 0))`.execute(trx);
      const period = await trx.selectFrom('gl_periods').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!period) return reply.status(404).send({ error: 'Period not found' });
      if (period.status === 'closed') return reply.status(409).send({ error: 'This period is already closed.' });
      const diagnostics = await closeDiagnostics(trx, user.tenant_id, period.period_start, period.period_end);
      const review = await trx.selectFrom('finance_close_reviews').selectAll().where('tenant_id', '=', user.tenant_id).where('period_id', '=', id).orderBy('created_at', 'desc').executeTakeFirst();
      if (hasCloseBlockers(diagnostics)) return reply.status(409).send({ error: 'Resolve the close-review exceptions before closing.', diagnostics });
      if (!review || CLOSE_CHECKS.some(check => review.checklist[check] !== true) || Object.entries(diagnostics).some(([key, value]) => review.diagnostics[key] !== value) || (period.reopened_at && review.created_at <= period.reopened_at)) return reply.status(409).send({ error: 'Record a current close-review sign-off before closing. New transactions or a reopened period require a new review.' });

      // Tax must be prepared separately; closing must not invent a reviewed tax liability.
      if (period.period_type === 'YEAR') {
        const citReturn = await trx.selectFrom('cit_returns').select(['id', 'status']).where('tenant_id', '=', user.tenant_id)
          .where('period_start', '=', period.period_start).where('period_end', '=', period.period_end).executeTakeFirst();
        if (!citReturn || citReturn.status !== 'ACCRUED') return reply.status(409).send({ error: 'Prepare, review and accrue the income-tax return before closing a year.' });
      }

      const tb = await GLService.trialBalance(user.tenant_id, period.period_start, period.period_end, trx);

      let closingEntryId: string | null = null;
      if (period.period_type === 'YEAR') {
        const revenueRows = tb.rows.filter(r => r.account_type === 'REVENUE' && (r.period_debit !== 0 || r.period_credit !== 0));
        const expenseRows = tb.rows.filter(r => r.account_type === 'EXPENSE' && (r.period_debit !== 0 || r.period_credit !== 0));
        if (revenueRows.length > 0 || expenseRows.length > 0) {
          const revenueNet = revenueRows.reduce((s, r) => s + (r.period_credit - r.period_debit), 0);
          const expenseNet = expenseRows.reduce((s, r) => s + (r.period_debit - r.period_credit), 0);
          const netIncome = revenueNet - expenseNet;

          const lines = [
            ...revenueRows.map(r => ({ accountCode: r.account_code, debit: Math.max(0, r.period_credit - r.period_debit), credit: Math.max(0, r.period_debit - r.period_credit), description: `Close ${r.account_name}` })),
            ...expenseRows.map(r => ({ accountCode: r.account_code, debit: Math.max(0, r.period_credit - r.period_debit), credit: Math.max(0, r.period_debit - r.period_credit), description: `Close ${r.account_name}` })),
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
          }, trx);
        }
      }

      const updated = await trx.updateTable('gl_periods').set({
        status: 'closed', trial_balance_snapshot: JSON.stringify(tb) as any,
        closing_entry_id: closingEntryId, closed_at: new Date(), closed_by: user.sub,
      }).where('tenant_id', '=', user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();

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
