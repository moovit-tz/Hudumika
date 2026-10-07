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
