import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { postExpenseToGl } from './financeExpenses.routes.js';
import { GLService } from '../services/gl.service.js';
import { IndustryWorkError } from '../services/finance-industry-work.service.js';

const reviewers = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'];
const params = z.object({ id: z.string().uuid() });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
async function getReport(trx: Transaction<Database>, tenantId: string, id: string, actorId: string, role: string) {
  const report = await trx.selectFrom('finance_expense_reports').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).forUpdate().executeTakeFirst();
  if (!report || (report.owner_id !== actorId && !reviewers.includes(role))) throw new IndustryWorkError('Expense report not found.', 404);
  return report;
}
export async function financeExpenseReportRoutes(server: FastifyInstance) {
  server.addHook('preHandler', server.authenticate);
  server.addHook('preHandler', requireEntitlement('finops'));
  server.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE', 'MANAGER', 'SALES'));
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.status(400).send({ error: error.issues.map(issue => issue.message).join('; ') });
    if (error instanceof IndustryWorkError) return reply.status(error.statusCode).send({ error: error.message });
    if ((error as { code?: string }).code === '23505') return reply.status(409).send({ error: 'This receipt has already been claimed in this workspace.' });
    request.log.error(error); return reply.status(500).send({ error: 'Unable to process the expense report.' });
  });
  server.get('/', async request => {
    const { page, status } = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), status: z.enum(['all', 'draft', 'submitted', 'approved', 'rejected', 'reimbursed']).default('all') }).parse(request.query);
    return withTenant(request.user.tenant_id, async trx => {
      let query = trx.selectFrom('finance_expense_reports').selectAll().where('tenant_id', '=', request.user.tenant_id);
      if (!reviewers.includes(request.user.role)) query = query.where('owner_id', '=', request.user.sub);
      if (status !== 'all') query = query.where('status', '=', status);
      const rows = await query.orderBy('created_at', 'desc').orderBy('id').limit(21).offset((page - 1) * 20).execute();
      return { data: rows.slice(0, 20), has_more: rows.length > 20 };
    });
  });
  server.post('/', async (request, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(160) }).parse(request.body);
    return reply.status(201).send(await withTenant(request.user.tenant_id, trx => trx.insertInto('finance_expense_reports').values({ tenant_id: request.user.tenant_id, name, owner_id: request.user.sub, review_note: null, reviewed_by: null, reviewed_at: null, reimbursement_journal_id: null, payment_reference: null }).returningAll().executeTakeFirstOrThrow()));
  });
  server.get('/:id', async request => {
    const { id } = params.parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      const report = await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      const items = await trx.selectFrom('finance_expense_report_items as i')
        .leftJoin('customers as c', join => join.onRef('c.id', '=', 'i.customer_id').on('c.tenant_id', '=', request.user.tenant_id))
        .leftJoin('suppliers as s', join => join.onRef('s.id', '=', 'i.supplier_id').on('s.tenant_id', '=', request.user.tenant_id))
        .select(['i.id', 'i.name', 'i.category', 'i.amount', 'i.expense_date', 'i.expense_id', 'i.customer_id', 'i.supplier_id', 'c.name as customer_name', 's.name as supplier_name'])
        .where('i.tenant_id', '=', request.user.tenant_id).where('i.report_id', '=', id).orderBy('i.created_at').execute();
      return { ...report, items };
    });
  });
  server.post('/:id/items', async (request, reply) => {
    const { id } = params.parse(request.params);
    const body = z.object({ name: z.string().trim().min(1).max(255), category: z.string().trim().min(1).max(50), amount: z.number().finite().positive().max(1e10).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001), expense_date: day, receipt_data: z.string().max(1000000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/), customer_id: z.string().uuid().nullable().default(null), supplier_id: z.string().uuid().nullable().default(null) }).parse(request.body);
    const bytes = Buffer.from(body.receipt_data.split(',')[1], 'base64');
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])); const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new IndustryWorkError('Upload a PNG or JPEG receipt.', 400);
    return reply.status(201).send(await withTenant(request.user.tenant_id, async trx => {
      const report = await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      if (report.owner_id !== request.user.sub || !['draft', 'rejected'].includes(report.status)) throw new IndustryWorkError('Only the owner can add receipts to draft or rejected reports.');
      if (body.customer_id) {
        const customer = await trx.selectFrom('customers').select('id').where('tenant_id', '=', request.user.tenant_id).where('id', '=', body.customer_id).where('deleted_at', 'is', null).where('is_customer', '=', true).where('active', '=', true).executeTakeFirst();
        if (!customer) throw new IndustryWorkError('Choose an active CRM customer in this workspace.', 422);
      }
      if (body.supplier_id) {
        const supplier = await trx.selectFrom('suppliers').select('id').where('tenant_id', '=', request.user.tenant_id).where('id', '=', body.supplier_id).where('status', '=', 'active').executeTakeFirst();
        if (!supplier) throw new IndustryWorkError('Choose an active CRM vendor in this workspace.', 422);
      }
      const item = await trx.insertInto('finance_expense_report_items').values({ ...body, receipt_hash: createHash('sha256').update(bytes).digest('hex'), tenant_id: request.user.tenant_id, report_id: id, expense_id: null }).returning(['id', 'name', 'amount']).executeTakeFirstOrThrow();
      return item;
    }));
  });
  server.get('/:id/items/:itemId/receipt', async request => {
    const { id, itemId } = params.extend({ itemId: z.string().uuid() }).parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      const item = await trx.selectFrom('finance_expense_report_items').select('receipt_data').where('tenant_id', '=', request.user.tenant_id).where('report_id', '=', id).where('id', '=', itemId).executeTakeFirst();
      if (!item) throw new IndustryWorkError('Receipt not found.', 404);
      return item;
    });
  });
  server.post('/:id/submit', async request => {
    const { id } = params.parse(request.params);
    return withTenant(request.user.tenant_id, async trx => {
      const report = await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      if (report.owner_id !== request.user.sub || !['draft', 'rejected'].includes(report.status)) throw new IndustryWorkError('Only the owner can submit a draft or rejected report.');
      const item = await trx.selectFrom('finance_expense_report_items').select('id').where('tenant_id', '=', request.user.tenant_id).where('report_id', '=', id).executeTakeFirst();
      if (!item) throw new IndustryWorkError('Add at least one receipt before submission.', 422);
      return trx.updateTable('finance_expense_reports').set({ status: 'submitted', reviewed_by: null, reviewed_at: null, review_note: null }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
  server.post('/:id/review', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async request => {
    const { id } = params.parse(request.params);
    const { approve, note } = z.object({ approve: z.boolean(), note: z.string().trim().min(1).max(2000) }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const report = await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      if (report.status !== 'submitted') throw new IndustryWorkError('Only submitted reports can be reviewed.');
      if (report.owner_id === request.user.sub) throw new IndustryWorkError('A different finance reviewer must approve your report.', 403);
      if (approve) {
        const items = await trx.selectFrom('finance_expense_report_items').selectAll().where('tenant_id', '=', request.user.tenant_id).where('report_id', '=', id).execute();
        for (const item of items) {
          const expense = await trx.insertInto('finance_expenses').values({ tenant_id: request.user.tenant_id, report_id: id, name: item.name, amount: Number(item.amount), expense_date: item.expense_date, category: item.category, attachment_data: item.receipt_data, created_by: report.owner_id, status: 'APPROVED', reviewed_by: request.user.sub, reviewed_at: new Date(), shipment_id: null, customer_id: item.customer_id, supplier_id: item.supplier_id, business_line_id: null, payment_mode: 'REIMBURSEMENT', reference: null, note, efd_verified: null, efd_verified_at: null, efd_error: null, retired_by: null, retired_at: null, retirement_note: null, submitted_at: null, rejection_reason: null }).returningAll().executeTakeFirstOrThrow();
          await postExpenseToGl(request.user.tenant_id, expense, request.user.sub, trx);
          await trx.updateTable('finance_expense_report_items').set({ expense_id: expense.id }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', item.id).execute();
        }
      }
      return trx.updateTable('finance_expense_reports').set({ status: approve ? 'approved' : 'rejected', review_note: note, reviewed_by: request.user.sub, reviewed_at: new Date() }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
  server.post('/:id/reimburse', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE') }, async request => {
    const { id } = params.parse(request.params);
    const { reference, date } = z.object({ reference: z.string().trim().min(1).max(160), date: day }).parse(request.body);
    return withTenant(request.user.tenant_id, async trx => {
      const report = await getReport(trx, request.user.tenant_id, id, request.user.sub, request.user.role);
      if (report.status !== 'approved') throw new IndustryWorkError('Record reimbursement only for an approved, unpaid report.');
      const total = await trx.selectFrom('finance_expense_report_items').select(sql<string>`sum(amount)`.as('amount')).where('tenant_id', '=', request.user.tenant_id).where('report_id', '=', id).executeTakeFirstOrThrow();
      const amount = Number(total.amount);
      const journal = await GLService.post(request.user.tenant_id, { entryDate: date, description: `Employee reimbursement: ${report.name}`, sourceModule: 'MANUAL', sourceId: id, createdBy: request.user.sub, reference, lines: [{ accountCode: '2100', debit: amount, credit: 0 }, { accountCode: '1010', debit: 0, credit: amount }] }, trx);
      return trx.updateTable('finance_expense_reports').set({ status: 'reimbursed', reimbursement_journal_id: journal, payment_reference: reference }).where('tenant_id', '=', request.user.tenant_id).where('id', '=', id).returningAll().executeTakeFirstOrThrow();
    });
  });
}
