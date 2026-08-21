import { withTenant, type Database } from '../db/client.js';
import type { Kysely, Transaction } from 'kysely';
import { toDateParam } from '../utils/dates.js';
import type {
  PostingRequest,
  TrialBalanceReport,
  BalanceSheetReport,
  ProfitLossReport,
  LedgerReport,
  AgedReport
} from '@hudumika/types';

// Standard chart of accounts every tenant needs for GLService.post() to be
// able to resolve the account codes it posts against (AR/cash/VAT/etc.) —
// same set migration 021_finance_gl.sql seeded for tenants that existed at
// the time, but nothing seeds this for a tenant created afterward. Every
// tenant onboarded since then has had zero chart_of_accounts rows, meaning
// any GL posting (recording an invoice or bill payment) throws a 500
// ("null value in column account_id violates not-null constraint") the
// first time it's attempted.
const STANDARD_COA: { code: string; name: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'; subtype: string; parentCode?: string; normalBalance: 'DEBIT' | 'CREDIT' }[] = [
  { code: '1000', name: 'Cash and Cash Equivalents', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1001', name: 'Cash on Hand', type: 'ASSET', subtype: 'CURRENT_ASSET', parentCode: '1000', normalBalance: 'DEBIT' },
  { code: '1010', name: 'Bank Account (TZS)', type: 'ASSET', subtype: 'CURRENT_ASSET', parentCode: '1000', normalBalance: 'DEBIT' },
  { code: '1011', name: 'Bank Account (USD)', type: 'ASSET', subtype: 'CURRENT_ASSET', parentCode: '1000', normalBalance: 'DEBIT' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  // Recoverable input tax is money the revenue authority owes you, so it is an
  // asset in its own right. It used to be posted as a debit against 2200 (the
  // output-tax liability), which netted the two halves of a VAT return into one
  // balance and made neither reportable. See migration 181.
  { code: '1150', name: 'VAT Input (Recoverable)', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1200', name: 'Prepaid Expenses', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1300', name: 'Inventory', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1500', name: 'Fixed Assets (net)', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT' },
  { code: '1501', name: 'Office Equipment', type: 'ASSET', subtype: 'FIXED_ASSET', parentCode: '1500', normalBalance: 'DEBIT' },
  { code: '1502', name: 'Motor Vehicles', type: 'ASSET', subtype: 'FIXED_ASSET', parentCode: '1500', normalBalance: 'DEBIT' },
  { code: '1503', name: 'Accumulated Depreciation', type: 'ASSET', subtype: 'FIXED_ASSET', parentCode: '1500', normalBalance: 'CREDIT' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2100', name: 'Accrued Liabilities', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2200', name: 'VAT Output (Payable)', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2300', name: 'Withholding Tax Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2500', name: 'Long-term Loans', type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY', normalBalance: 'CREDIT' },
  { code: '3000', name: 'Share Capital', type: 'EQUITY', subtype: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subtype: 'RETAINED_EARNINGS', normalBalance: 'CREDIT' },
  { code: '4000', name: 'Freight Revenue', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normalBalance: 'CREDIT' },
  { code: '4100', name: 'Customs Clearance Fees', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normalBalance: 'CREDIT' },
  { code: '4200', name: 'Port Handling Revenue', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normalBalance: 'CREDIT' },
  { code: '4300', name: 'Transport Revenue', type: 'REVENUE', subtype: 'OPERATING_REVENUE', normalBalance: 'CREDIT' },
  { code: '4500', name: 'Other Revenue', type: 'REVENUE', subtype: 'OTHER_REVENUE', normalBalance: 'CREDIT' },
  { code: '5000', name: 'Port & Customs Charges', type: 'EXPENSE', subtype: 'COST_OF_SERVICES', normalBalance: 'DEBIT' },
  { code: '5001', name: 'Freight Costs', type: 'EXPENSE', subtype: 'COST_OF_SERVICES', normalBalance: 'DEBIT' },
  { code: '5002', name: 'Transport Costs', type: 'EXPENSE', subtype: 'COST_OF_SERVICES', normalBalance: 'DEBIT' },
  { code: '5003', name: 'Storage & Demurrage', type: 'EXPENSE', subtype: 'COST_OF_SERVICES', normalBalance: 'DEBIT' },
  { code: '5100', name: 'Salaries & Wages', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
  { code: '5101', name: 'Office Rent', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
  { code: '5102', name: 'Utilities', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
  { code: '5200', name: 'Bank Charges', type: 'EXPENSE', subtype: 'FINANCE_COST', normalBalance: 'DEBIT' },
  { code: '5201', name: 'Interest Expense', type: 'EXPENSE', subtype: 'FINANCE_COST', normalBalance: 'DEBIT' },
  // Catch-all for a directly-recorded expense whose category maps to nothing
  // more specific (e.g. "Miscellaneous"). Without it those expenses would have
  // no GL account to post to. Backfilled to existing tenants by migration 216.
  { code: '5900', name: 'Other Operating Expenses', type: 'EXPENSE', subtype: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
];

export class GLService {
  /**
   * Seeds the standard chart of accounts for a tenant. Idempotent — safe to
   * call on every tenant creation and re-runnable via backfill migration,
   * since (tenant_id, code) is unique and conflicts are ignored.
   */
  static async seedChartOfAccounts(trx: Transaction<Database> | Kysely<Database>, tenantId: string): Promise<void> {
    const existing = await trx.selectFrom('chart_of_accounts').select('code').where('tenant_id', '=', tenantId).execute();
    if (existing.length > 0) return;

    const codeToId = new Map<string, string>();
    for (const acc of STANDARD_COA) {
      const row = await trx.insertInto('chart_of_accounts').values({
        tenant_id: tenantId,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        parent_id: acc.parentCode ? (codeToId.get(acc.parentCode) ?? null) : null,
        normal_balance: acc.normalBalance,
        is_system: true,
      }).onConflict(oc => oc.columns(['tenant_id', 'code']).doNothing())
        .returning('id')
        .executeTakeFirst();
      if (row) codeToId.set(acc.code, row.id);
    }
  }

  /** Core posting engine — the ONLY path that writes to journal_lines */
  static async post(tenantId: string, req: PostingRequest): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      // 1. Validate: lines must balance
      const totalDebit  = req.lines.reduce((s, l) => s + (l.debit || 0), 0);
      const totalCredit = req.lines.reduce((s, l) => s + (l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Journal entry does not balance: DR ${totalDebit} ≠ CR ${totalCredit}`);
      }

      // 2. Resolve account IDs from codes
      const codes = req.lines.map(l => l.accountCode);
      const accounts = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code'])
        .where('tenant_id', '=', tenantId)
        .where('code', 'in', codes)
        .execute();
      
      const codeToId = Object.fromEntries(accounts.map(a => [a.code, a.id]));

      // 3. Generate entry number (JE-YYYY-NNNN)
      const year = new Date(req.entryDate).getFullYear();
      const countResult = await trx
        .selectFrom('journal_entries')
        .select(trx.fn.count('id').as('n'))
        .where('tenant_id', '=', tenantId)
        .where('entry_number', 'like', `JE-${year}-%`)
        .executeTakeFirst();
      
      const seq = String(Number(countResult?.n ?? 0) + 1).padStart(4, '0');
      const entryNumber = `JE-${year}-${seq}`;

      // 4. Insert header
      const [entry] = await trx
        .insertInto('journal_entries')
        .values({
          tenant_id:     tenantId,
          entry_number:  entryNumber,
          entry_date:    new Date(req.entryDate),
          reference:     req.reference ?? null,
          description:   req.description,
          status:        'POSTED',
          source_module: req.sourceModule,
          source_id:     req.sourceId ?? null,
          created_by:    req.createdBy ?? null,
          entity_id:     req.entityId ?? null,
          posted_at:     new Date(),
        })
        .returning('id')
        .execute();

      // 5. Insert lines
      await trx
        .insertInto('journal_lines')
        .values(
          req.lines.map((l, i) => ({
            journal_entry_id: entry.id,
            account_id:       codeToId[l.accountCode],
            debit:            l.debit || 0,
            credit:           l.credit || 0,
            description:      l.description ?? null,
            currency:         l.currency ?? 'TZS',
            exchange_rate:    l.exchangeRate ?? 1,
            dimensions:       l.dimensions ?? {},
            sort_order:       i,
          }))
        )
        .execute();

      return entry.id;
    });
  }

  /**
   * Remove every journal entry (and its lines) previously posted for a given
   * source record, so the caller can re-post the corrected figures without
   * double-counting. Used when a source document is edited or deleted — e.g.
   * an expense's amount changes, or it is removed entirely. Scoped to the one
   * source, so it can never touch another module's entries.
   */
  static async reverseBySource(tenantId: string, sourceModule: string, sourceId: string): Promise<void> {
    return withTenant(tenantId, async (trx) => {
      const entries = await trx.selectFrom('journal_entries').select('id')
        .where('tenant_id', '=', tenantId)
        .where('source_module', '=', sourceModule)
        .where('source_id', '=', sourceId)
        .execute();
      if (entries.length === 0) return;
      const ids = entries.map(e => e.id);
      await trx.deleteFrom('journal_lines').where('journal_entry_id', 'in', ids).execute();
      await trx.deleteFrom('journal_entries').where('id', 'in', ids).execute();
    });
  }

  /** Trial balance — net movement per account for the period */
  static async trialBalance(tenantId: string, fromStr: string, toStr: string): Promise<TrialBalanceReport> {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    return withTenant(tenantId, async (trx) => {
      // Get all accounts
      const accounts = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'normal_balance'])
        .where('tenant_id', '=', tenantId)
        .orderBy('code', 'asc')
        .execute();

      // Get opening balances (before 'from' date)
      const openingBalances = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_entries.entry_date', '<', toDateParam(from))
        .groupBy('journal_lines.account_id')
        .execute();

      const openingMap = Object.fromEntries(openingBalances.map(b => [b.account_id, {
        debit: Number(b.debits || 0),
        credit: Number(b.credits || 0)
      }]));

      // Get period movements
      const periodMovements = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_entries.entry_date', '>=', toDateParam(from))
        .where('journal_entries.entry_date', '<=', toDateParam(to))
        .groupBy('journal_lines.account_id')
        .execute();

      const periodMap = Object.fromEntries(periodMovements.map(m => [m.account_id, {
        debit: Number(m.debits || 0),
        credit: Number(m.credits || 0)
      }]));

      const rows = accounts.map(a => {
        const op = openingMap[a.id] || { debit: 0, credit: 0 };
        const pe = periodMap[a.id] || { debit: 0, credit: 0 };

        const opening_debit = op.debit;
        const opening_credit = op.credit;
        const period_debit = pe.debit;
        const period_credit = pe.credit;
        const closing_debit = opening_debit + period_debit;
        const closing_credit = opening_credit + period_credit;

        return {
          account_id: a.id,
          account_code: a.code,
          account_name: a.name,
          account_type: a.type,
          opening_debit,
          opening_credit,
          period_debit,
          period_credit,
          closing_debit,
          closing_credit
        };
      });

      const totals = {
        debit: rows.reduce((s, r) => s + r.closing_debit, 0),
        credit: rows.reduce((s, r) => s + r.closing_credit, 0)
      };

      return {
        period: { from: fromStr, to: toStr },
        rows,
        totals
      };
    });
  }

  /** Balance sheet — cumulative balances as at a date */
  static async balanceSheet(tenantId: string, dateStr: string): Promise<BalanceSheetReport> {
    const date = new Date(dateStr);

    return withTenant(tenantId, async (trx) => {
      // Get asset, liability, equity accounts
      const accounts = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'subtype', 'normal_balance'])
        .where('tenant_id', '=', tenantId)
        .where('type', 'in', ['ASSET', 'LIABILITY', 'EQUITY'])
        .orderBy('code', 'asc')
        .execute();

      // Get cumulative balances
      const balances = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_entries.entry_date', '<=', toDateParam(date))
        .groupBy('journal_lines.account_id')
        .execute();

      const balanceMap = Object.fromEntries(balances.map(b => [b.account_id, {
        debit: Number(b.debits || 0),
        credit: Number(b.credits || 0)
      }]));

      const assets: any[] = [];
      const liabilities: any[] = [];
      const equity: any[] = [];

      accounts.forEach(a => {
        const bal = balanceMap[a.id] || { debit: 0, credit: 0 };
        // Net balance depending on normal balance type
        const netBalance = a.normal_balance === 'CREDIT'
          ? bal.credit - bal.debit
          : bal.debit - bal.credit;

        const row = {
          account_id: a.id,
          account_code: a.code,
          account_name: a.name,
          subtype: a.subtype as any,
          balance: netBalance
        };

        if (a.type === 'ASSET') assets.push(row);
        else if (a.type === 'LIABILITY') liabilities.push(row);
        else if (a.type === 'EQUITY') equity.push(row);
      });

      const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
      const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
      const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

      return {
        date: dateStr,
        assets,
        liabilities,
        equity,
        totals: {
          assets: totalAssets,
          liabilities: totalLiabilities,
          equity: totalEquity
        }
      };
    });
  }

  /** Profit & loss — revenue and expense movements for a period */
  /** entityId, when given, restricts to one accounting_entities branch (M8) — omit for the tenant-wide consolidated view, which is every report's existing, unchanged default. */
  static async profitLoss(tenantId: string, fromStr: string, toStr: string, entityId?: string): Promise<ProfitLossReport> {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    return withTenant(tenantId, async (trx) => {
      const accounts = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'subtype', 'normal_balance'])
        .where('tenant_id', '=', tenantId)
        .where('type', 'in', ['REVENUE', 'EXPENSE'])
        .orderBy('code', 'asc')
        .execute();

      let movementsQuery = trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_entries.entry_date', '>=', toDateParam(from))
        .where('journal_entries.entry_date', '<=', toDateParam(to));
      if (entityId) movementsQuery = movementsQuery.where('journal_entries.entity_id', '=', entityId);
      const movements = await movementsQuery.groupBy('journal_lines.account_id').execute();

      const movementMap = Object.fromEntries(movements.map(m => [m.account_id, {
        debit: Number(m.debits || 0),
        credit: Number(m.credits || 0)
      }]));

      const revenue: any[] = [];
      const expenses: any[] = [];

      accounts.forEach(a => {
        const mov = movementMap[a.id] || { debit: 0, credit: 0 };
        const netAmount = a.normal_balance === 'CREDIT'
          ? mov.credit - mov.debit
          : mov.debit - mov.credit;

        const row = {
          account_id: a.id,
          account_code: a.code,
          account_name: a.name,
          subtype: a.subtype as any,
          amount: netAmount
        };

        if (a.type === 'REVENUE') revenue.push(row);
        else if (a.type === 'EXPENSE') expenses.push(row);
      });

      const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

      return {
        period: { from: fromStr, to: toStr },
        revenue,
        expenses,
        totals: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          net: totalRevenue - totalExpenses
        }
      };
    });
  }

  /** Ledger — all movements for a single account */
  static async ledger(tenantId: string, accountCode: string, fromStr: string, toStr: string): Promise<LedgerReport> {
    const from = new Date(fromStr);
    const to = new Date(toStr);

    return withTenant(tenantId, async (trx) => {
      // Find the account
      const account = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code', 'name', 'type', 'normal_balance'])
        .where('tenant_id', '=', tenantId)
        .where('code', '=', accountCode)
        .executeTakeFirstOrThrow();

      // Opening balance (sum before 'from' date)
      const openingSum = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select([trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', '=', account.id)
        .where('journal_entries.entry_date', '<', toDateParam(from))
        .executeTakeFirst();

      const opDebits = Number(openingSum?.debits || 0);
      const opCredits = Number(openingSum?.credits || 0);
      const opening_balance = account.normal_balance === 'CREDIT'
        ? opCredits - opDebits
        : opDebits - opCredits;

      // Period entries
      const lines = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select([
          'journal_lines.id',
          'journal_entries.entry_date as date',
          'journal_entries.entry_number',
          'journal_entries.reference',
          'journal_entries.description',
          'journal_lines.debit',
          'journal_lines.credit',
          'journal_entries.source_module'
        ])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_lines.account_id', '=', account.id)
        .where('journal_entries.entry_date', '>=', toDateParam(from))
        .where('journal_entries.entry_date', '<=', toDateParam(to))
        .orderBy('journal_entries.entry_date', 'asc')
        .orderBy('journal_entries.entry_number', 'asc')
        .orderBy('journal_lines.sort_order', 'asc')
        .execute();

      let currentBalance = opening_balance;
      const entries = lines.map(l => {
        const dr = Number(l.debit || 0);
        const cr = Number(l.credit || 0);
        const net = account.normal_balance === 'CREDIT' ? cr - dr : dr - cr;
        currentBalance += net;

        return {
          id: l.id,
          // entry_date is a DATE, which the driver now hands back as the
          // literal 'YYYY-MM-DD' (see the type parser in db/client.ts) rather
          // than a Date at local midnight that JSON-serialised a day early.
          date: String(l.date).slice(0, 10),
          entry_number: l.entry_number,
          reference: l.reference,
          description: l.description || '',
          debit: dr,
          credit: cr,
          running_balance: currentBalance,
          source_module: l.source_module as any
        };
      });

      return {
        account: {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          normal_balance: account.normal_balance as any
        },
        period: { from: fromStr, to: toStr },
        opening_balance,
        entries,
        closing_balance: currentBalance
      };
    });
  }

  /** Aged receivables — from unpaid/partial sales invoices */
  static async agedReceivables(tenantId: string): Promise<AgedReport> {
    return withTenant(tenantId, async (trx) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date(todayStr);

      // Fetch sales invoices that are Draft, Unpaid, Partial or Overdue
      const invoices = await trx
        .selectFrom('sales_invoices')
        .select(['id', 'client_name', 'received', 'due_date', 'bill_date', 'exchange_rate'])
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', ['Unpaid', 'Partial', 'Overdue'])
        .execute();

      const customerMap: Record<string, any> = {};

      if (invoices.length > 0) {
        const invoiceIds = invoices.map(i => i.id);
        const allLines = await trx
          .selectFrom('sales_invoice_lines')
          .selectAll()
          .where('invoice_id', 'in', invoiceIds)
          .execute();

        invoices.forEach(inv => {
          const invLines = allLines.filter(l => l.invoice_id === inv.id);
          const clearingLines = invLines.filter(l => l.line_group === 'clearing' || l.line_group === 'other');
          const shippingLines = invLines.filter(l => l.line_group === 'shipping');
          const exRate = Number(inv.exchange_rate) || 1;
          
          const total_amount = clearingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0)
            + shippingLines.reduce((s, l) => s + Number(l.qty) * Number(l.rate) * (1 + Number(l.tax_pct) / 100), 0) * exRate;

          const unpaid = total_amount - Number(inv.received || 0);
          if (unpaid <= 0) return;

          const name = inv.client_name || 'Unknown Client';
          if (!customerMap[name]) {
            customerMap[name] = {
              entity_id: name,
              entity_name: name,
              current: 0,
              days_1_30: 0,
              days_31_60: 0,
              days_61_90: 0,
              days_90_plus: 0,
              total: 0,
              oldest_invoice_date: null as string | null
            };
          }

          const c = customerMap[name];
          c.total += unpaid;

          // Keep track of oldest invoice date
          const invBillDate = inv.bill_date ? new Date(inv.bill_date).toISOString().split('T')[0] : null;
          if (invBillDate) {
            if (!c.oldest_invoice_date || invBillDate < c.oldest_invoice_date) {
              c.oldest_invoice_date = invBillDate;
            }
          }

          // Age based on due_date
          const dueDate = inv.due_date ? new Date(inv.due_date) : today;
          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays <= 0) {
            c.current += unpaid;
          } else if (diffDays <= 30) {
            c.days_1_30 += unpaid;
          } else if (diffDays <= 60) {
            c.days_31_60 += unpaid;
          } else if (diffDays <= 90) {
            c.days_61_90 += unpaid;
          } else {
            c.days_90_plus += unpaid;
          }
        });
      }

      const rows = Object.values(customerMap);
      const totals = {
        current: rows.reduce((s, r) => s + r.current, 0),
        days_1_30: rows.reduce((s, r) => s + r.days_1_30, 0),
        days_31_60: rows.reduce((s, r) => s + r.days_31_60, 0),
        days_61_90: rows.reduce((s, r) => s + r.days_61_90, 0),
        days_90_plus: rows.reduce((s, r) => s + r.days_90_plus, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
      };

      return {
        as_of: todayStr,
        rows,
        totals
      };
    });
  }

  /** Aged payables — from unpaid/partial supplier bills */
  static async agedPayables(tenantId: string): Promise<AgedReport> {
    return withTenant(tenantId, async (trx) => {
      const todayStr = new Date().toISOString().split('T')[0];
      const today = new Date(todayStr);

      // Fetch supplier bills
      const bills = await trx
        .selectFrom('supplier_bills')
        .select(['id', 'supplier_name', 'total', 'paid_amount', 'due_date', 'bill_date'])
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', ['UNPAID', 'PARTIAL', 'OVERDUE'])
        .execute();

      const supplierMap: Record<string, any> = {};

      bills.forEach(b => {
        const unpaid = Number(b.total) - Number(b.paid_amount || 0);
        if (unpaid <= 0) return;

        const name = b.supplier_name || 'Unknown Supplier';
        if (!supplierMap[name]) {
          supplierMap[name] = {
            entity_id: name,
            entity_name: name,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_90_plus: 0,
            total: 0,
            oldest_invoice_date: null as string | null
          };
        }

        const s = supplierMap[name];
        s.total += unpaid;

        const billDate = b.bill_date ? new Date(b.bill_date).toISOString().split('T')[0] : null;
        if (billDate) {
          if (!s.oldest_invoice_date || billDate < s.oldest_invoice_date) {
            s.oldest_invoice_date = billDate;
          }
        }

        const dueDate = b.due_date ? new Date(b.due_date) : today;
        const diffTime = today.getTime() - dueDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          s.current += unpaid;
        } else if (diffDays <= 30) {
          s.days_1_30 += unpaid;
        } else if (diffDays <= 60) {
          s.days_31_60 += unpaid;
        } else if (diffDays <= 90) {
          s.days_61_90 += unpaid;
        } else {
          s.days_90_plus += unpaid;
        }
      });

      const rows = Object.values(supplierMap);
      const totals = {
        current: rows.reduce((s, r) => s + r.current, 0),
        days_1_30: rows.reduce((s, r) => s + r.days_1_30, 0),
        days_31_60: rows.reduce((s, r) => s + r.days_31_60, 0),
        days_61_90: rows.reduce((s, r) => s + r.days_61_90, 0),
        days_90_plus: rows.reduce((s, r) => s + r.days_90_plus, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
      };

      return {
        as_of: todayStr,
        rows,
        totals
      };
    });
  }

  // ── Multi-entity accounting (M8) ────────────────────────────────────────
  // Additive on top of everything above: a tenant that never creates an
  // accounting_entities row keeps posting/reporting exactly as before —
  // entity_id stays NULL everywhere, and every report method's existing
  // no-filter behavior already IS the consolidated-across-everything view.

  static async listEntities(tenantId: string) {
    return withTenant(tenantId, (trx) =>
      trx.selectFrom('accounting_entities').selectAll()
        .where('tenant_id', '=', tenantId)
        .orderBy('name', 'asc')
        .execute()
    );
  }

  static async createEntity(tenantId: string, userId: string, data: { name: string; entityCode: string; countryCode?: string; currency?: string; taxId?: string; registeredAddress?: string }) {
    return withTenant(tenantId, (trx) =>
      trx.insertInto('accounting_entities').values({
        tenant_id: tenantId,
        name: data.name,
        entity_code: data.entityCode.trim().toUpperCase(),
        country_code: data.countryCode ?? null,
        currency: data.currency || 'TZS',
        tax_id: data.taxId ?? null,
        registered_address: data.registeredAddress ?? null,
        created_by: userId,
      }).returningAll().executeTakeFirstOrThrow()
    );
  }

  static async updateEntity(tenantId: string, id: string, data: Partial<{ name: string; countryCode: string | null; currency: string; taxId: string | null; registeredAddress: string | null; active: boolean }>) {
    return withTenant(tenantId, (trx) =>
      trx.updateTable('accounting_entities')
        .set({
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.countryCode !== undefined ? { country_code: data.countryCode } : {}),
          ...(data.currency !== undefined ? { currency: data.currency } : {}),
          ...(data.taxId !== undefined ? { tax_id: data.taxId } : {}),
          ...(data.registeredAddress !== undefined ? { registered_address: data.registeredAddress } : {}),
          ...(data.active !== undefined ? { active: data.active } : {}),
          updated_at: new Date(),
        })
        .where('id', '=', id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow()
    );
  }

  /**
   * Consolidated P&L, broken down by entity plus a Total column — the real
   * "consolidated multi-branch reporting" deliverable. Entries never tagged
   * to an entity (every entry, for a tenant that hasn't adopted branches)
   * land in an "Unassigned" bucket, so this is meaningful even for a
   * single-entity tenant — it just has one bucket.
   */
  static async consolidatedProfitLoss(tenantId: string, fromStr: string, toStr: string) {
    const entities = await GLService.listEntities(tenantId);
    const buckets = await Promise.all([
      GLService.profitLoss(tenantId, fromStr, toStr).then(pl => ({ entityId: null, entityName: 'Unassigned', ...pl })),
      ...entities.map(e => GLService.profitLoss(tenantId, fromStr, toStr, e.id).then(pl => ({ entityId: e.id, entityName: e.name, ...pl }))),
    ]);
    // profitLoss(tenantId,...) with no entityId returns the whole tenant, not
    // just the unassigned slice — the true "Unassigned" figure is the
    // consolidated total minus every real entity's own total, computed here
    // rather than re-querying, since it's the same numbers already fetched.
    const consolidated = buckets[0];
    const perEntity = buckets.slice(1);
    const entityRevenue = perEntity.reduce((s, b) => s + b.totals.revenue, 0);
    const entityExpenses = perEntity.reduce((s, b) => s + b.totals.expenses, 0);
    const unassigned = {
      entityId: null as string | null,
      entityName: 'Unassigned',
      totals: {
        revenue: consolidated.totals.revenue - entityRevenue,
        expenses: consolidated.totals.expenses - entityExpenses,
        net: (consolidated.totals.revenue - entityRevenue) - (consolidated.totals.expenses - entityExpenses),
      },
    };
    return {
      period: { from: fromStr, to: toStr },
      entities: [unassigned, ...perEntity.map(b => ({ entityId: b.entityId, entityName: b.entityName, totals: b.totals }))],
      total: consolidated.totals,
    };
  }

  /**
   * Auto-creates the two intercompany clearing accounts for a tenant if
   * they don't already exist — same idempotent, code-based pattern as
   * seedChartOfAccounts, but using non-numeric codes ('IC-AR'/'IC-AP') so
   * they can never collide with a tenant's own numeric COA.
   *
   * Deliberately its own top-level withTenant call (its own committed
   * transaction), NOT run inside another still-open transaction: this
   * codebase's GLService.post() always opens its own separate transaction
   * (withTenant → db.transaction()), on its own DB connection — so an
   * account created but not yet committed in an outer transaction is
   * invisible to it under Postgres's default READ COMMITTED isolation.
   * Found live: posting an intercompany transaction failed with a NULL
   * account_id because the just-inserted IC-AR account, still sitting in
   * an uncommitted outer transaction, couldn't be seen by post()'s own
   * fresh transaction. Fixed by making every step here its own committed
   * step, in sequence, rather than one nested attempt.
   */
  private static async ensureIntercompanyAccounts(tenantId: string): Promise<void> {
    await withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('chart_of_accounts').select(['code'])
        .where('tenant_id', '=', tenantId).where('code', 'in', ['IC-AR', 'IC-AP']).execute();
      const codes = new Set(existing.map(a => a.code));

      if (!codes.has('IC-AR')) {
        await trx.insertInto('chart_of_accounts').values({
          tenant_id: tenantId, code: 'IC-AR', name: 'Intercompany Receivable', type: 'ASSET', subtype: 'CURRENT_ASSET', normal_balance: 'DEBIT', is_system: true,
        }).execute();
      }
      if (!codes.has('IC-AP')) {
        await trx.insertInto('chart_of_accounts').values({
          tenant_id: tenantId, code: 'IC-AP', name: 'Intercompany Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normal_balance: 'CREDIT', is_system: true,
        }).execute();
      }
    });
  }

  /**
   * Posts an intercompany transaction as two individually-balanced journal
   * entries — an AR-shaped entry in the selling (from) entity's books, an
   * AP-shaped entry in the buying (to) entity's — linked by this row rather
   * than one shared cross-entity entry, matching how the DB's own
   * check_journal_balance trigger already requires each entry to balance on
   * its own (021_finance_gl.sql).
   */
  static async postIntercompanyTransaction(tenantId: string, userId: string, data: {
    fromEntityId: string; toEntityId: string; description: string; amount: number; currency?: string;
    fromAccountCode: string; toAccountCode: string; entryDate?: string;
  }) {
    if (data.fromEntityId === data.toEntityId) throw new Error('An intercompany transaction must be between two different entities.');
    if (data.amount <= 0) throw new Error('Amount must be positive.');
    const entryDate = data.entryDate || new Date().toISOString().slice(0, 10);
    const currency = data.currency || 'TZS';

    const entities = await withTenant(tenantId, (trx) =>
      trx.selectFrom('accounting_entities').select(['id', 'name'])
        .where('tenant_id', '=', tenantId).where('id', 'in', [data.fromEntityId, data.toEntityId]).execute()
    );
    const fromEntity = entities.find(e => e.id === data.fromEntityId);
    const toEntity = entities.find(e => e.id === data.toEntityId);
    if (!fromEntity || !toEntity) throw new Error('Both entities must belong to this tenant.');

    await GLService.ensureIntercompanyAccounts(tenantId);

    const arEntryId = await GLService.post(tenantId, {
      entryDate, description: `Intercompany: ${data.description} (to ${toEntity.name})`,
      sourceModule: 'MANUAL', entityId: data.fromEntityId, createdBy: userId,
      lines: [
        { accountCode: 'IC-AR', debit: data.amount, credit: 0, currency },
        { accountCode: data.fromAccountCode, debit: 0, credit: data.amount, currency },
      ],
    });

    const apEntryId = await GLService.post(tenantId, {
      entryDate, description: `Intercompany: ${data.description} (from ${fromEntity.name})`,
      sourceModule: 'MANUAL', entityId: data.toEntityId, createdBy: userId,
      lines: [
        { accountCode: data.toAccountCode, debit: data.amount, credit: 0, currency },
        { accountCode: 'IC-AP', debit: 0, credit: data.amount, currency },
      ],
    });

    return withTenant(tenantId, (trx) => trx.insertInto('intercompany_transactions').values({
      tenant_id: tenantId,
      from_entity_id: data.fromEntityId,
      to_entity_id: data.toEntityId,
      description: data.description,
      amount: data.amount,
      currency,
      from_account_code: data.fromAccountCode,
      to_account_code: data.toAccountCode,
      ar_journal_entry_id: arEntryId,
      ap_journal_entry_id: apEntryId,
      created_by: userId,
    }).returningAll().executeTakeFirstOrThrow());
  }

  static async listIntercompanyTransactions(tenantId: string) {
    return withTenant(tenantId, (trx) =>
      trx.selectFrom('intercompany_transactions')
        .leftJoin('accounting_entities as from_e', 'from_e.id', 'intercompany_transactions.from_entity_id')
        .leftJoin('accounting_entities as to_e', 'to_e.id', 'intercompany_transactions.to_entity_id')
        .where('intercompany_transactions.tenant_id', '=', tenantId)
        .select([
          'intercompany_transactions.id', 'intercompany_transactions.description', 'intercompany_transactions.amount',
          'intercompany_transactions.currency', 'intercompany_transactions.status', 'intercompany_transactions.created_at',
          'from_e.name as from_entity_name', 'to_e.name as to_entity_name',
        ])
        .orderBy('intercompany_transactions.created_at', 'desc')
        .execute()
    );
  }
}
