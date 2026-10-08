import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { getIndustryWork, IndustryWorkError } from './finance-industry-work.service.js';

export async function accrueWorkCost(tenantId: string, actorId: string, workId: string, lineId: string) {
  return withTenant(tenantId, async trx => {
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (!['active', 'completed'].includes(work.status)) throw new IndustryWorkError('Cost accrual requires active or completed work.');
    if (work.currency !== 'TZS') throw new IndustryWorkError('Use the existing expense or bill workflow for foreign-currency costs. This direct accrual accepts TZS jobs only.');
    const line = await trx.selectFrom('finance_industry_work_lines').selectAll().where('tenant_id', '=', tenantId).where('work_id', '=', workId).where('id', '=', lineId).forUpdate().executeTakeFirst();
    if (!line) throw new IndustryWorkError('Work line not found.', 404);
    if (!line.approved || line.cost_journal_id || line.kind === 'material' || Number(line.cost_rate) <= 0) throw new IndustryWorkError('Accrual requires an approved, unposted service/time/expense line with a positive cost. Stock costs post through inventory.');
    const amount = Math.round(Number(line.quantity) * Number(line.cost_rate) * 100) / 100;
    const dimensions = { work_id: workId, work_line_id: lineId };
    const journal = await GLService.post(tenantId, { entryDate: line.work_date, description: `Direct job cost: ${work.reference} — ${line.description}`, sourceModule: 'EXPENSE', sourceId: lineId, createdBy: actorId,
      lines: [{ accountCode: '5020', debit: amount, credit: 0, dimensions }, { accountCode: '2100', debit: 0, credit: amount, dimensions }],
    }, trx);
    return trx.updateTable('finance_industry_work_lines').set({ cost_journal_id: journal }).where('tenant_id', '=', tenantId).where('id', '=', lineId).returningAll().executeTakeFirstOrThrow();
  });
}
export async function getWorkPostedResults(trx: Transaction<Database>, tenantId: string, workId: string) {
  const rows = await trx.selectFrom('journal_lines as l').innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id').innerJoin('chart_of_accounts as a', 'a.id', 'l.account_id')
    .select(['a.type', 'l.debit', 'l.credit']).where('e.tenant_id', '=', tenantId).where('a.tenant_id', '=', tenantId)
    .where(sql<string>`l.dimensions ->> 'work_id'`, '=', workId).where('e.status', 'in', ['POSTED', 'VOIDED']).execute();
  // Include voided originals AND their posted reversals; excluding only the original doubles the reversal effect.
  return { posted_revenue: rows.filter(row => row.type === 'REVENUE').reduce((sum, row) => sum + Number(row.credit) - Number(row.debit), 0),
    posted_cost: rows.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0) };
}

export async function allocatePostedWorkCost(tenantId: string, actorId: string, workId: string, sourceId: string, amount: number, reason: string) {
  return withTenant(tenantId, async trx => {
    // Match the ledger reversal lock order so allocation cannot race a source void.
    await sql`select pg_advisory_xact_lock(hashtextextended(${`gl:${tenantId}`}, 0))`.execute(trx);
    const work = await getIndustryWork(trx, tenantId, workId, true);
    if (!['active', 'completed'].includes(work.status) || work.currency !== 'TZS') throw new IndustryWorkError('Allocate posted costs to active or completed TZS jobs.');
    const source = await trx.selectFrom('journal_lines as l').innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
      .innerJoin('chart_of_accounts as a', 'a.id', 'l.account_id')
      .select(['l.id', 'l.debit', 'l.credit', 'l.dimensions', 'a.code', 'a.type', 'e.status', 'e.reverses_entry_id', 'e.voided_at'])
      .where('e.tenant_id', '=', tenantId).where('a.tenant_id', '=', tenantId).where('l.id', '=', sourceId).executeTakeFirst();
    if (!source) throw new IndustryWorkError('Posted cost not found.', 404);
    if (source.type !== 'EXPENSE' || source.status !== 'POSTED' || source.voided_at || source.reverses_entry_id || Number(source.credit) !== 0 || Number(source.debit) <= 0 || source.dimensions?.work_id || source.dimensions?.cost_allocation_source) throw new IndustryWorkError('Select an original, untagged posted expense debit.');
    const allocated = await trx.selectFrom('finance_work_cost_allocations').select(sql<string>`coalesce(sum(amount),0)`.as('total'))
      .where('tenant_id', '=', tenantId).where('source_journal_line_id', '=', sourceId).where('reversed_at', 'is', null).executeTakeFirstOrThrow();
    const cents = Math.round(amount * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || Math.abs(amount * 100 - cents) > 0.00001 || cents > Math.round(Number(source.debit) * 100) - Math.round(Number(allocated.total) * 100)) throw new IndustryWorkError('Amount must use at most two decimals and cannot exceed the unallocated cost.');
    const journalId = await GLService.post(tenantId, { entryDate: new Date().toISOString().slice(0, 10), description: `Cost allocation: ${work.reference}`, createdBy: actorId, sourceModule: 'MANUAL',
      lines: [
        { accountCode: source.code, debit: amount, credit: 0, dimensions: { ...source.dimensions, work_id: workId, cost_allocation_source: sourceId } },
        { accountCode: source.code, debit: 0, credit: amount, dimensions: { ...source.dimensions, cost_allocation_source: sourceId } },
      ],
    }, trx);
    return trx.insertInto('finance_work_cost_allocations').values({ tenant_id: tenantId, work_id: workId, source_journal_line_id: sourceId, amount, reason, allocation_journal_id: journalId, created_by: actorId, reversed_at: null }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function listWorkCostSources(trx: Transaction<Database>, tenantId: string, search: string, page: number) {
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const rows = await trx.selectFrom('journal_lines as l').innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
    .innerJoin('chart_of_accounts as a', 'a.id', 'l.account_id')
    .select(['l.id', 'e.entry_number', 'e.description', 'a.code as account_code', 'a.name as account_name', 'l.debit',
      sql<string>`l.debit - coalesce((select sum(c.amount) from finance_work_cost_allocations c where c.tenant_id = ${tenantId} and c.source_journal_line_id = l.id and c.reversed_at is null),0)`.as('available')])
    .where('e.tenant_id', '=', tenantId).where('a.tenant_id', '=', tenantId).where('a.type', '=', 'EXPENSE')
    .where('e.status', '=', 'POSTED').where('e.voided_at', 'is', null).where('e.reverses_entry_id', 'is', null)
    .where('l.debit', '>', 0).where('l.credit', '=', 0)
    .where(sql<boolean>`coalesce(l.dimensions->>'work_id', '') = '' and coalesce(l.dimensions->>'cost_allocation_source', '') = ''`)
    .where(sql<boolean>`l.debit > coalesce((select sum(c.amount) from finance_work_cost_allocations c where c.tenant_id = ${tenantId} and c.source_journal_line_id = l.id and c.reversed_at is null),0)`)
    .where(eb => eb.or([eb('e.entry_number', 'ilike', `%${escaped}%`), eb('e.description', 'ilike', `%${escaped}%`), eb('a.name', 'ilike', `%${escaped}%`)]))
    .orderBy('e.created_at', 'desc').orderBy('l.id').limit(21).offset((page - 1) * 20).execute();
  return { data: rows.slice(0, 20).map(row => ({ ...row, debit: Number(row.debit), available: Number(row.available) })), has_more: rows.length > 20 };
}
