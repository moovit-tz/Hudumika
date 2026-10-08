import { sql, type Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export const CLOSE_CHECKS = ['banking', 'receivables', 'payables', 'inventory', 'payroll', 'tax', 'adjustments'] as const;
export async function closeDiagnostics(trx: Transaction<Database>, tenantId: string, start: string, end: string) {
  const expenses = await trx.selectFrom('finance_expenses').select(sql<string>`count(*)`.as('count')).where('tenant_id', '=', tenantId).where('status', '=', 'SUBMITTED').where('expense_date', '>=', start).where('expense_date', '<=', end).executeTakeFirstOrThrow();
  const unmatched = await trx.selectFrom('bank_statement_lines as l').innerJoin('bank_statements as s', 's.id', 'l.bank_statement_id').select([
    sql<string>`count(*) filter (where l.matched_at is null)`.as('count'),
    sql<string>`md5(coalesce(string_agg(l.id::text || ':' || l.amount::text || ':' || coalesce(l.matched_journal_line_id::text,''), ',' order by l.id),''))`.as('fingerprint'),
  ]).where('s.tenant_id', '=', tenantId).where('l.txn_date', '>=', start).where('l.txn_date', '<=', end).executeTakeFirstOrThrow();
  const ledger = await trx.selectFrom('journal_entries as e').leftJoin('journal_lines as l', 'l.journal_entry_id', 'e.id').select([
    sql<string>`coalesce(sum(l.debit-l.credit),0)`.as('difference'),
    sql<string>`count(distinct e.id)`.as('entries'), sql<string>`coalesce(max(e.updated_at)::text,'')`.as('last_change'),
  ]).where('e.tenant_id', '=', tenantId).where('e.entry_date', '>=', start).where('e.entry_date', '<=', end).where('e.status', 'in', ['POSTED', 'VOIDED']).executeTakeFirstOrThrow();
  return { pending_expenses: Number(expenses.count), unmatched_bank_lines: Number(unmatched.count), bank_fingerprint: unmatched.fingerprint, ledger_difference: Math.round(Number(ledger.difference) * 100) / 100, ledger_entries: Number(ledger.entries), ledger_last_change: ledger.last_change };
}
export function hasCloseBlockers(diagnostics: Awaited<ReturnType<typeof closeDiagnostics>>) {
  return diagnostics.pending_expenses > 0 || diagnostics.unmatched_bank_lines > 0 || diagnostics.ledger_difference !== 0;
}
