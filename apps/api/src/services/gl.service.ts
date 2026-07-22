import { db, withTenant } from '../db/client.js';
import type { 
  PostingRequest, 
  TrialBalanceReport, 
  BalanceSheetReport, 
  ProfitLossReport, 
  LedgerReport, 
  AgedReport 
} from '@hudumika/types';

export class GLService {
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
        .where('journal_entries.entry_date', '<', from)
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
        .where('journal_entries.entry_date', '>=', from)
        .where('journal_entries.entry_date', '<=', to)
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
        .where('journal_entries.entry_date', '<=', date)
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
  static async profitLoss(tenantId: string, fromStr: string, toStr: string): Promise<ProfitLossReport> {
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

      const movements = await trx
        .selectFrom('journal_lines')
        .innerJoin('journal_entries', 'journal_entries.id', 'journal_lines.journal_entry_id')
        .select(['journal_lines.account_id', trx.fn.sum('journal_lines.debit').as('debits'), trx.fn.sum('journal_lines.credit').as('credits')])
        .where('journal_entries.tenant_id', '=', tenantId)
        .where('journal_entries.entry_date', '>=', from)
        .where('journal_entries.entry_date', '<=', to)
        .groupBy('journal_lines.account_id')
        .execute();

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
        .where('journal_entries.entry_date', '<', from)
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
        .where('journal_entries.entry_date', '>=', from)
        .where('journal_entries.entry_date', '<=', to)
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
          date: l.date.toISOString().split('T')[0],
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
}
