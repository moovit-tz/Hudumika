import { requireAppEnabled } from '../middleware/appGate.js';
import type { FastifyInstance } from 'fastify';
import { GLService } from '../services/gl.service.js';
import { db } from '../db/client.js';

export async function glRoutes(fastify: FastifyInstance) {
  // Ensure user is authenticated for all GL routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireAppEnabled('finops'));

  // Chart of Accounts
  fastify.get('/chart-of-accounts', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const accounts = await db
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'subtype', 'parent_id', 'description', 'is_system', 'is_active', 'normal_balance', 'currency'])
        .where('tenant_id', '=', tenantId)
        .orderBy('code', 'asc')
        .execute();

      // Build hierarchical tree
      const accountMap = new Map<string, any>();
      accounts.forEach(a => {
        accountMap.set(a.id, { ...a, children: [] });
      });

      const rootAccounts: any[] = [];
      accounts.forEach(a => {
        const mapped = accountMap.get(a.id);
        if (a.parent_id && accountMap.has(a.parent_id)) {
          accountMap.get(a.parent_id).children.push(mapped);
        } else {
          rootAccounts.push(mapped);
        }
      });

      return { accounts: rootAccounts };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Journal Entries
  fastify.post('/journal-entries', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const entryId = await GLService.post(tenantId, {
        ...request.body,
        createdBy: request.user.sub
      });
      return { id: entryId, success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/journal-entries', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const entries = await db
        .selectFrom('journal_entries')
        .select(['id', 'entry_number', 'entry_date', 'reference', 'description', 'status', 'source_module', 'source_id', 'created_by', 'posted_at'])
        .where('tenant_id', '=', tenantId)
        .orderBy('entry_date', 'desc')
        .orderBy('entry_number', 'desc')
        .execute();

      const entryIds = entries.map(e => e.id);
      let lines: any[] = [];
      if (entryIds.length > 0) {
        lines = await db
          .selectFrom('journal_lines')
          .innerJoin('chart_of_accounts', 'chart_of_accounts.id', 'journal_lines.account_id')
          .select([
            'journal_lines.id',
            'journal_lines.journal_entry_id',
            'journal_lines.account_id',
            'chart_of_accounts.code as account_code',
            'chart_of_accounts.name as account_name',
            'journal_lines.debit',
            'journal_lines.credit',
            'journal_lines.description',
            'journal_lines.currency',
            'journal_lines.exchange_rate',
            'journal_lines.dimensions'
          ])
          .where('journal_lines.journal_entry_id', 'in', entryIds)
          .orderBy('journal_lines.sort_order', 'asc')
          .execute();
    }

      const result = entries.map(e => ({
        ...e,
        entry_date: e.entry_date.toISOString().split('T')[0],
        posted_at: e.posted_at ? e.posted_at.toISOString() : null,
        lines: lines.filter(l => l.journal_entry_id === e.id)
      }));

      return { journal_entries: result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Financial Reports
  fastify.get('/trial-balance', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { from, to } = request.query as { from: string; to: string };
      if (!from || !to) {
        return reply.status(400).send({ error: 'Missing from or to date query parameters' });
      }
      const report = await GLService.trialBalance(tenantId, from, to);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/balance-sheet', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { date } = request.query as { date: string };
      if (!date) {
        return reply.status(400).send({ error: 'Missing date query parameter' });
      }
      const report = await GLService.balanceSheet(tenantId, date);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/profit-loss', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { from, to } = request.query as { from: string; to: string };
      if (!from || !to) {
        return reply.status(400).send({ error: 'Missing from or to date query parameters' });
      }
      const report = await GLService.profitLoss(tenantId, from, to);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/ledger', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { account, from, to } = request.query as { account: string; from: string; to: string };
      if (!account || !from || !to) {
        return reply.status(400).send({ error: 'Missing account, from, or to query parameters' });
      }
      const report = await GLService.ledger(tenantId, account, from, to);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/aged-receivables', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const report = await GLService.agedReceivables(tenantId);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/aged-payables', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const report = await GLService.agedPayables(tenantId);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/cash-flow', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const { from, to } = request.query as { from: string; to: string };
      if (!from || !to) {
        return reply.status(400).send({ error: 'Missing from or to query parameters' });
      }
      
      // Query TZS bank (1010), USD bank (1011) and Cash on hand (1001)
      const cashAccounts = await db
        .selectFrom('chart_of_accounts')
        .select(['id', 'code'])
        .where('tenant_id', '=', tenantId)
        .where('code', 'in', ['1001', '1010', '1011'])
        .execute();
      
      const cashAccountIds = cashAccounts.map(a => a.id);

      let opening_cash = 0;
      let closing_cash = 0;

      if (cashAccountIds.length > 0) {
        const openingSum = await db
          .selectFrom('journal_lines')
          .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
          .select([db.fn.sum('journal_lines.debit').as('debits'), db.fn.sum('journal_lines.credit').as('credits')])
          .where('journal_entries.tenant_id', '=', tenantId)
          .where('journal_lines.account_id', 'in', cashAccountIds)
          .where('journal_entries.entry_date', '<', new Date(from))
          .executeTakeFirst();

        opening_cash = Number(openingSum?.debits || 0) - Number(openingSum?.credits || 0);

        const closingSum = await db
          .selectFrom('journal_lines')
          .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
          .select([db.fn.sum('journal_lines.debit').as('debits'), db.fn.sum('journal_lines.credit').as('credits')])
          .where('journal_entries.tenant_id', '=', tenantId)
          .where('journal_lines.account_id', 'in', cashAccountIds)
          .where('journal_entries.entry_date', '<=', new Date(to))
          .executeTakeFirst();

        closing_cash = Number(closingSum?.debits || 0) - Number(closingSum?.credits || 0);
      }

      // Receipts from AR (Operating)
      const arReceipts = await db
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(db.fn.sum('journal_lines.debit').as('total'))
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', 'in', cashAccountIds)
        .where('journal_entries.source_module', '=', 'AR')
        .where('journal_entries.entry_date', '>=', new Date(from))
        .where('journal_entries.entry_date', '<=', new Date(to))
        .executeTakeFirst();

      // Payments to AP (Operating)
      const apPayments = await db
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(db.fn.sum('journal_lines.credit').as('total'))
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', 'in', cashAccountIds)
        .where('journal_entries.source_module', '=', 'AP')
        .where('journal_entries.entry_date', '>=', new Date(from))
        .where('journal_entries.entry_date', '<=', new Date(to))
        .executeTakeFirst();

      // Direct Expenses (Operating)
      const directExpenses = await db
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(db.fn.sum('journal_lines.credit').as('total'))
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', 'in', cashAccountIds)
        .where('journal_entries.source_module', '=', 'EXPENSE')
        .where('journal_entries.entry_date', '>=', new Date(from))
        .where('journal_entries.entry_date', '<=', new Date(to))
        .executeTakeFirst();

      const receiptsVal = Number(arReceipts?.total || 0);
      const paymentsVal = Number(apPayments?.total || 0);
      const expensesVal = Number(directExpenses?.total || 0);

      const items = [
        { label: 'Cash Receipts from Customers', amount: receiptsVal, category: 'OPERATING' as const },
        { label: 'Cash Paid to Suppliers', amount: -paymentsVal, category: 'OPERATING' as const },
        { label: 'Operating Expenses Paid', amount: -expensesVal, category: 'OPERATING' as const }
      ];

      const netOperating = receiptsVal - paymentsVal - expensesVal;

      return {
        period: { from, to },
        items,
        totals: {
          operating: netOperating,
          investing: 0,
          financing: 0,
          net: netOperating
        },
        opening_cash,
        closing_cash
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
