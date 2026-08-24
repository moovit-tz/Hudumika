import { requireEntitlement } from '../middleware/entitlement.js';
import { requireRole } from '../middleware/rbac.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CostPostingService } from '../services/cost-posting.service.js';
import { GLService } from '../services/gl.service.js';
import { withTenant } from '../db/client.js';
import { toDateParam } from '../utils/dates.js';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
const accountCreateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().max(50).optional(),
  parent_id: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  normal_balance: z.enum(['DEBIT', 'CREDIT']).optional(),
});
// GLService.post() already enforces the real business rule (debits must
// equal credits, account codes resolved tenant-scoped) — this is only the
// shape guard in front of it, so a non-array `lines` fails with a clean
// 400 instead of the service's own reduce() throwing a raw TypeError.
const journalEntrySchema = z.object({
  entryDate: z.string(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().max(200).optional(),
  sourceModule: z.enum(['AR', 'AP', 'EXPENSE', 'MANUAL', 'PAYROLL']),
  sourceId: z.string().optional(),
  lines: z.array(z.object({
    accountCode: z.string().min(1),
    debit: z.number().min(0),
    credit: z.number().min(0),
    description: z.string().max(500).optional(),
    currency: z.string().max(10).optional(),
    exchangeRate: z.number().optional(),
    dimensions: z.record(z.string()).optional(),
  })).min(1),
});
const accountPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  subtype: z.string().max(50).nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function glRoutes(fastify: FastifyInstance) {
  // Ensure user is authenticated for all GL routes
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));
  // Every route in this file reads or writes GL data — gate the whole
  // plugin by role once here rather than per-route, so a new report
  // endpoint added later doesn't silently ship without one (as every GET
  // report endpoint here originally did — only authenticate + entitlement,
  // no role check at all).
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'));

  // Chart of Accounts
  fastify.get('/chart-of-accounts', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const accounts = await withTenant(tenantId, trx => trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'subtype', 'parent_id', 'description', 'is_system', 'is_active', 'normal_balance', 'currency'])
        .where('tenant_id', '=', tenantId)
        .orderBy('code', 'asc')
        .execute());

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

  const COA_WRITE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

  // POST /v1/finance/chart-of-accounts — create a new account
  fastify.post('/chart-of-accounts', { preHandler: requireRole(...COA_WRITE_ROLES) }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const b = accountCreateSchema.parse(request.body);

    try {
      const account = await withTenant(tenantId, trx => trx.insertInto('chart_of_accounts').values({
        tenant_id: tenantId,
        code: b.code,
        name: b.name,
        type: b.type,
        subtype: b.subtype ?? null,
        parent_id: b.parent_id || null,
        description: b.description ?? null,
        normal_balance: b.normal_balance ?? (b.type === 'ASSET' || b.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
        is_system: false,
      }).returningAll().executeTakeFirstOrThrow());
      reply.status(201);
      return account;
    } catch (err: any) {
      if (err.code === '23505') return reply.status(409).send({ error: `Account code "${b.code}" already exists` });
      return reply.status(500).send({ error: err.message });
    }
  });

  // PATCH /v1/finance/chart-of-accounts/:id
  fastify.patch('/chart-of-accounts/:id', { preHandler: requireRole(...COA_WRITE_ROLES) }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params as { id: string };
    const b = accountPatchSchema.parse(request.body);
    const editable = ['name', 'description', 'subtype', 'parent_id', 'is_active'] as const;
    const patch: Record<string, any> = { updated_at: new Date() };
    for (const key of editable) if (key in b) patch[key] = b[key];

    const account = await withTenant(tenantId, trx => trx.updateTable('chart_of_accounts')
      .set(patch)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId)
      .returningAll()
      .executeTakeFirst());
    if (!account) return reply.status(404).send({ error: 'Account not found' });
    return account;
  });

  // DELETE /v1/finance/chart-of-accounts/:id — system accounts can never be removed
  // (GLService.post() posts against fixed codes like 1010/1100/2200 by convention).
  fastify.delete('/chart-of-accounts/:id', { preHandler: requireRole(...COA_WRITE_ROLES) }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const { id } = request.params as { id: string };

    return withTenant(tenantId, async (trx) => {
      const account = await trx.selectFrom('chart_of_accounts').selectAll()
        .where('id', '=', id).where('tenant_id', '=', tenantId).executeTakeFirst();
      if (!account) return reply.status(404).send({ error: 'Account not found' });
      if (account.is_system) return reply.status(400).send({ error: 'System accounts cannot be deleted' });

      const usedInJournal = await trx.selectFrom('journal_lines').select('id')
        .where('account_id', '=', id).executeTakeFirst();
      if (usedInJournal) return reply.status(400).send({ error: 'Account has journal activity and cannot be deleted' });

      const hasChildren = await trx.selectFrom('chart_of_accounts').select('id')
        .where('parent_id', '=', id).executeTakeFirst();
      if (hasChildren) return reply.status(400).send({ error: 'Account has sub-accounts and cannot be deleted' });

      await trx.deleteFrom('chart_of_accounts').where('id', '=', id).where('tenant_id', '=', tenantId).execute();
      reply.status(204);
      return null;
    });
  });

  /**
   * Post operational costs that live in another app into the ledger.
   *
   * Demurrage charges sat in container_tracking, visible in the Demurrage app
   * and invisible to every finance report, because nothing ever turned them
   * into a journal entry. `?dry_run=1` reports what would post without
   * writing — worth using before the first real run.
   */
  fastify.post('/post-costs/demurrage', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const tenantId = request.user.tenant_id;
    const dryRun = request.query?.dry_run === '1' || request.query?.dry_run === 'true';
    try {
      const result = await CostPostingService.postDemurrage(tenantId, request.user.sub ?? null, dryRun);
      return { dry_run: dryRun, posted_count: result.posted.length, skipped_count: result.skipped.length, ...result };
    } catch (err: any) {
      reply.status(400);
      return { error: err?.message ?? 'Failed to post demurrage costs' };
    }
  });

  // Recharges a recoverable, already-posted demurrage charge onto a real
  // invoice line — the piece cost-posting.service.ts's own header comment
  // flagged as not yet built (the receivable was recognised in the GL, but
  // nothing ever added it to a customer's actual invoice).
  fastify.post('/post-costs/demurrage/:containerId/recharge', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const { containerId } = request.params as { containerId: string };
    const { invoice_id } = z.object({ invoice_id: z.string().uuid() }).parse(request.body);
    try {
      const result = await CostPostingService.rechargeDemurrage(request.user.tenant_id, containerId, invoice_id);
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Journal Entries
  fastify.post('/journal-entries', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const body = journalEntrySchema.parse(request.body);
      const entryId = await GLService.post(tenantId, {
        ...body,
        createdBy: request.user.sub
      });
      return { id: entryId, success: true };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // A manually-posted entry previously had no way to be undone through the
  // API at all — this posts the mirror-image reversal and marks the
  // original VOIDED, same reversal-not-deletion shape invoices/bills
  // already use when voiding their own postings.
  fastify.post('/journal-entries/:id/void', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = z.object({ reason: z.string().trim().min(1).max(500) }).parse(request.body);
    try {
      const tenantId = request.user.tenant_id;
      const reversalId = await GLService.voidEntry(tenantId, id, request.user.sub, reason);
      return { success: true, reversal_id: reversalId };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/journal-entries', async (request: any, reply) => {
    try {
      const tenantId = request.user.tenant_id;
      const result = await withTenant(tenantId, async (trx) => {
        const entries = await trx
          .selectFrom('journal_entries')
          .select(['id', 'entry_number', 'entry_date', 'reference', 'description', 'status', 'source_module', 'source_id', 'created_by', 'posted_at', 'voided_at', 'void_reason'])
          .where('tenant_id', '=', tenantId)
          .orderBy('entry_date', 'desc')
          .orderBy('entry_number', 'desc')
          .execute();

        const entryIds = entries.map(e => e.id);
        let lines: any[] = [];
        if (entryIds.length > 0) {
          lines = await trx
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

        return entries.map(e => ({
          ...e,
          // entry_date is a DATE — already 'YYYY-MM-DD' from the driver (see the
          // type parser in db/client.ts). posted_at is a TIMESTAMPTZ and really
          // is an instant, so it stays a Date and keeps toISOString().
          entry_date: String(e.entry_date).slice(0, 10),
          posted_at: e.posted_at ? e.posted_at.toISOString() : null,
          lines: lines.filter(l => l.journal_entry_id === e.id)
        }));
      });

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
      const { from, to, entity_id } = request.query as { from: string; to: string; entity_id?: string };
      if (!from || !to) {
        return reply.status(400).send({ error: 'Missing from or to date query parameters' });
      }
      const report = await GLService.profitLoss(tenantId, from, to, entity_id || undefined);
      return report;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Multi-entity accounting (M8) ────────────────────────────────────────
  fastify.get('/entities', async (request: any, reply) => {
    try {
      return await GLService.listEntities(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/entities', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      entityCode: z.string().trim().min(1).max(20),
      countryCode: z.string().length(2).optional(),
      currency: z.string().max(5).optional(),
      taxId: z.string().max(100).optional(),
      registeredAddress: z.string().max(1000).optional(),
    }).parse(request.body);
    try {
      return reply.status(201).send(await GLService.createEntity(request.user.tenant_id, request.user.sub, body));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/entities/:id', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      countryCode: z.string().length(2).nullable().optional(),
      currency: z.string().max(5).optional(),
      taxId: z.string().max(100).nullable().optional(),
      registeredAddress: z.string().max(1000).nullable().optional(),
      active: z.boolean().optional(),
    }).parse(request.body);
    try {
      return await GLService.updateEntity(request.user.tenant_id, id, body);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/consolidated-profit-loss', async (request: any, reply) => {
    try {
      const { from, to } = request.query as { from: string; to: string };
      if (!from || !to) return reply.status(400).send({ error: 'Missing from or to date query parameters' });
      return await GLService.consolidatedProfitLoss(request.user.tenant_id, from, to);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get('/intercompany-transactions', async (request: any, reply) => {
    try {
      return await GLService.listIntercompanyTransactions(request.user.tenant_id);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/intercompany-transactions', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE') }, async (request: any, reply) => {
    const body = z.object({
      fromEntityId: z.string().uuid(),
      toEntityId: z.string().uuid(),
      description: z.string().trim().min(1).max(500),
      amount: z.number().positive(),
      currency: z.string().max(5).optional(),
      fromAccountCode: z.string().trim().min(1).max(20),
      toAccountCode: z.string().trim().min(1).max(20),
      entryDate: z.string().optional(),
    }).parse(request.body);
    try {
      return reply.status(201).send(await GLService.postIntercompanyTransaction(request.user.tenant_id, request.user.sub, body));
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
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
      
      const { opening_cash, closing_cash, arReceipts, apPayments, directExpenses } = await withTenant(tenantId, async (trx) => {
        // Query TZS bank (1010), USD bank (1011) and Cash on hand (1001)
        const cashAccounts = await trx
          .selectFrom('chart_of_accounts')
          .select(['id', 'code'])
          .where('tenant_id', '=', tenantId)
          .where('code', 'in', ['1001', '1010', '1011'])
          .execute();

        const cashAccountIds = cashAccounts.map(a => a.id);

        let opening_cash = 0;
        let closing_cash = 0;

        if (cashAccountIds.length > 0) {
          const openingSum = await trx
            .selectFrom('journal_lines')
            .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
            .select([trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
            .where('journal_entries.tenant_id', '=', tenantId)
            .where('journal_lines.account_id', 'in', cashAccountIds)
            .where('journal_entries.entry_date', '<', toDateParam(new Date(from)))
            .executeTakeFirst();

          opening_cash = Number(openingSum?.debits || 0) - Number(openingSum?.credits || 0);

          const closingSum = await trx
            .selectFrom('journal_lines')
            .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
            .select([trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
            .where('journal_entries.tenant_id', '=', tenantId)
            .where('journal_lines.account_id', 'in', cashAccountIds)
            .where('journal_entries.entry_date', '<=', toDateParam(new Date(to)))
            .executeTakeFirst();

          closing_cash = Number(closingSum?.debits || 0) - Number(closingSum?.credits || 0);
        }

        // Receipts from AR (Operating)
        const arReceipts = await trx
          .selectFrom('journal_lines')
          .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
          .select(trx.fn.sum('journal_lines.debit').as('total'))
          .where('journal_entries.tenant_id', '=', tenantId)
          .where('journal_lines.account_id', 'in', cashAccountIds)
          .where('journal_entries.source_module', '=', 'AR')
          .where('journal_entries.entry_date', '>=', toDateParam(new Date(from)))
          .where('journal_entries.entry_date', '<=', toDateParam(new Date(to)))
          .executeTakeFirst();

        // Payments to AP (Operating)
        const apPayments = await trx
          .selectFrom('journal_lines')
          .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
          .select(trx.fn.sum('journal_lines.credit').as('total'))
          .where('journal_entries.tenant_id', '=', tenantId)
          .where('journal_lines.account_id', 'in', cashAccountIds)
          .where('journal_entries.source_module', '=', 'AP')
          .where('journal_entries.entry_date', '>=', toDateParam(new Date(from)))
          .where('journal_entries.entry_date', '<=', toDateParam(new Date(to)))
          .executeTakeFirst();

        // Direct Expenses (Operating)
        const directExpenses = await trx
          .selectFrom('journal_lines')
          .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
          .select(trx.fn.sum('journal_lines.credit').as('total'))
          .where('journal_entries.tenant_id', '=', tenantId)
          .where('journal_lines.account_id', 'in', cashAccountIds)
          .where('journal_entries.source_module', '=', 'EXPENSE')
          .where('journal_entries.entry_date', '>=', toDateParam(new Date(from)))
          .where('journal_entries.entry_date', '<=', toDateParam(new Date(to)))
          .executeTakeFirst();

        return { cashAccountIds, opening_cash, closing_cash, arReceipts, apPayments, directExpenses };
      });

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
