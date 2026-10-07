import { randomUUID } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { FinanceIndustryKey, IndustryWorkStatus } from '@hudumika/types';
import { withTenant, type Database } from '../db/client.js';

export class IndustryWorkError extends Error {
  constructor(message: string, public statusCode = 409) { super(message); }
}
export const WORK_TRANSITIONS: Record<IndustryWorkStatus, readonly IndustryWorkStatus[]> = {
  draft: ['active', 'cancelled'], active: ['completed', 'cancelled'], completed: [], cancelled: [],
};
export function assertWorkTransition(from: IndustryWorkStatus, to: IndustryWorkStatus, invoiced: boolean) {
  if (!WORK_TRANSITIONS[from].includes(to)) throw new IndustryWorkError(`Cannot change ${from} work to ${to}.`);
  if (to === 'cancelled' && invoiced) throw new IndustryWorkError('Void the linked invoice before cancelling this work.');
}
export async function getIndustryWork(trx: Transaction<Database>, tenantId: string, id: string, lock = false) {
  let query = trx.selectFrom('finance_industry_work').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id);
  if (lock) query = query.forUpdate();
  const work = await query.executeTakeFirst();
  if (!work) throw new IndustryWorkError('Work not found.', 404);
  return work;
}
export async function createIndustryWork(tenantId: string, actorId: string, input: {
  industry: FinanceIndustryKey; name: string; customer_id: string; currency: string;
  budget: number; due_date?: string; specifications: Record<string, string>;
}) {
  return withTenant(tenantId, async trx => {
    const customer = await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.customer_id).executeTakeFirst();
    if (!customer) throw new IndustryWorkError('Choose a customer in this workspace.', 400);
    return trx.insertInto('finance_industry_work').values({
      ...input, tenant_id: tenantId, created_by: actorId, reference: `WORK-${randomUUID().slice(0, 8).toUpperCase()}`,
      specifications: JSON.stringify(input.specifications), due_date: input.due_date ?? null, invoice_id: null,
    }).returningAll().executeTakeFirstOrThrow();
  });
}
/** Billing locks the parent row, which also serializes additions and approvals. */
export async function prepareIndustryBilling(trx: Transaction<Database>, tenantId: string, id: string) {
  const work = await getIndustryWork(trx, tenantId, id, true);
  if (!['active', 'completed'].includes(work.status)) throw new IndustryWorkError('Activate the work before billing.');
  const pendingProduction = await trx.selectFrom('finance_production_orders').select('id').where('tenant_id', '=', tenantId).where('work_id', '=', id).where('status', '!=', 'completed').executeTakeFirst();
  if (pendingProduction) throw new IndustryWorkError('Complete production before billing this job.');
  const lines = await trx.selectFrom('finance_industry_work_lines').selectAll()
    .where('tenant_id', '=', tenantId).where('work_id', '=', id)
    .where('approved', '=', true).where('billable', '=', true).where('invoice_id', 'is', null).execute();
  if (!lines.length) throw new IndustryWorkError('No approved, unbilled lines are available.');
  if (lines.some(line => Number(line.rate) <= 0)) throw new IndustryWorkError('Billable lines need a positive rate.');
  const customer = await trx.selectFrom('customers').select(['id', 'name']).where('tenant_id', '=', tenantId).where('id', '=', work.customer_id).executeTakeFirst();
  if (!customer) throw new IndustryWorkError('The linked customer is unavailable.', 400);
  return { work, lines, customer, items: lines.map(line => ({
    name: line.description, qty: Number(line.quantity), rate: Number(line.rate), unit: line.unit,
    currency: work.currency, line_group: work.reference,
  })) };
}
export async function attachIndustryInvoice(trx: Transaction<Database>, tenantId: string, workId: string, lineIds: string[], invoiceId: string) {
  await trx.updateTable('sales_invoices').set({ industry_work_id: workId }).where('tenant_id', '=', tenantId).where('id', '=', invoiceId).execute();
  await trx.updateTable('finance_industry_work_lines').set({ invoice_id: invoiceId })
    .where('tenant_id', '=', tenantId).where('work_id', '=', workId).where('id', 'in', lineIds).where('invoice_id', 'is', null).execute();
  await trx.updateTable('finance_industry_work').set({ invoice_id: invoiceId, updated_at: new Date() })
    .where('tenant_id', '=', tenantId).where('id', '=', workId).execute();
}
