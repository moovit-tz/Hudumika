import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';

const lineSchema = z.object({
  account_code: z.string().min(1).max(20),
  period_month: z.number().int().min(1).max(12),
  amount: z.number(),
});

export async function budgetRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      return trx.selectFrom('budgets').selectAll().where('tenant_id', '=', user.tenant_id).orderBy('fiscal_year', 'desc').execute();
    });
  });

  fastify.post('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const body = z.object({ name: z.string().trim().min(1).max(300), fiscal_year: z.number().int(), entity_id: z.string().uuid().optional(), notes: z.string().max(2000).optional() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      try {
        const budget = await trx.insertInto('budgets').values({
          tenant_id: user.tenant_id, name: body.name, fiscal_year: body.fiscal_year,
          entity_id: body.entity_id || null, notes: body.notes || null, created_by: user.sub,
        }).returningAll().executeTakeFirstOrThrow();
        return reply.status(201).send(budget);
      } catch (err: any) {
        if (err.code === '23505') return reply.status(409).send({ error: 'A budget already exists for this fiscal year (and entity, if set).' });
        throw err;
      }
    });
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const budget = await trx.selectFrom('budgets').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!budget) return reply.status(404).send({ error: 'Budget not found' });
      const lines = await trx.selectFrom('budget_lines').selectAll().where('budget_id', '=', id).execute();
      return { ...budget, lines };
    });
  });

  // PUT /:id/lines — bulk replace. A budget is edited as a whole grid
  // (account x month), not one cell at a time, so a full replace per save
  // is simpler and safer than diffing individual cells.
  fastify.put('/:id/lines', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { lines } = z.object({ lines: z.array(lineSchema) }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      const budget = await trx.selectFrom('budgets').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!budget) return reply.status(404).send({ error: 'Budget not found' });
      await trx.deleteFrom('budget_lines').where('budget_id', '=', id).execute();
      const nonZero = lines.filter(l => l.amount !== 0);
      if (nonZero.length > 0) {
        await trx.insertInto('budget_lines').values(nonZero.map(l => ({ budget_id: id, account_code: l.account_code, period_month: l.period_month, amount: l.amount }))).execute();
      }
      return { success: true, saved: nonZero.length };
    });
  });

  fastify.delete('/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('budgets').select('id').where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!existing) return reply.status(404).send({ error: 'Budget not found' });
      await trx.deleteFrom('budgets').where('id', '=', id).execute();
      return { success: true };
    });
  });

  // GET /:id/vs-actuals — real actuals from journal_lines/journal_entries,
  // signed by each account's own normal_balance (a REVENUE account's
  // "actual" is CR-DR; an EXPENSE account's is DR-CR) so a budget line and
  // its actual are always comparable on the same footing.
  fastify.get('/:id/vs-actuals', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const budget = await trx.selectFrom('budgets').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!budget) return reply.status(404).send({ error: 'Budget not found' });
      const lines = await trx.selectFrom('budget_lines').selectAll().where('budget_id', '=', id).execute();
      const accountCodes = [...new Set(lines.map(l => l.account_code))];
      if (accountCodes.length === 0) return { budget, rows: [] };

      const accounts = await trx.selectFrom('chart_of_accounts').select(['code', 'name', 'normal_balance'])
        .where('tenant_id', '=', user.tenant_id).where('code', 'in', accountCodes).execute();
      const accountByCode = new Map(accounts.map(a => [a.code, a]));

      const yearStart = `${budget.fiscal_year}-01-01`;
      const yearEnd = `${budget.fiscal_year}-12-31`;
      const actualRows = await trx.selectFrom('journal_lines as jl')
        .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
        .innerJoin('chart_of_accounts as coa', 'coa.id', 'jl.account_id')
        .select(['coa.code as account_code', 'je.entry_date', 'jl.debit', 'jl.credit'])
        .where('je.tenant_id', '=', user.tenant_id)
        .where('je.status', '!=', 'VOIDED')
        .where('coa.code', 'in', accountCodes)
        .where('je.entry_date', '>=', yearStart)
        .where('je.entry_date', '<=', yearEnd)
        .execute();

      const actualByAccountMonth = new Map<string, number>();
      for (const r of actualRows) {
        const month = new Date(r.entry_date).getMonth() + 1;
        const key = `${r.account_code}-${month}`;
        const acct = accountByCode.get(r.account_code);
        const signed = acct?.normal_balance === 'CREDIT' ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit);
        actualByAccountMonth.set(key, (actualByAccountMonth.get(key) ?? 0) + signed);
      }

      const rows = accountCodes.map(code => {
        const acct = accountByCode.get(code);
        const monthly = Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          const budgeted = lines.find(l => l.account_code === code && l.period_month === month)?.amount ?? 0;
          const actual = actualByAccountMonth.get(`${code}-${month}`) ?? 0;
          return { month, budgeted: Number(budgeted), actual, variance: actual - Number(budgeted) };
        });
        return {
          account_code: code,
          account_name: acct?.name ?? code,
          months: monthly,
          total_budgeted: monthly.reduce((s, m) => s + m.budgeted, 0),
          total_actual: monthly.reduce((s, m) => s + m.actual, 0),
        };
      });

      return { budget, rows };
    });
  });
}
