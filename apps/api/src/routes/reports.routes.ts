import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { withTenant } from '../db/client.js';

export async function reportsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/reports/journal?date_from=&date_to=
  fastify.get('/journal', async (req) => {
    const user = req.user as any;
    const { date_from, date_to } = req.query as any;

    return withTenant(user.tenant_id, async (trx) => {
      // Sales invoices as revenue journal entries
      let invQ = trx
        .selectFrom('sales_invoices')
        .where('tenant_id', '=', user.tenant_id)
        .select([
          'id',
          'invoice_number as ref',
          'client_name as entity',
          'bill_date as date',
          'received as paid_amount',
          'status',
        ]);
      if (date_from) invQ = invQ.where('bill_date', '>=', new Date(date_from) as any);
      if (date_to) invQ = invQ.where('bill_date', '<=', new Date(date_to) as any);
      const invoices = await invQ.execute();

      // Supplier bills as expense journal entries
      let billQ = trx
        .selectFrom('supplier_bills')
        .where('tenant_id', '=', user.tenant_id)
        .select([
          'id',
          'bill_number as ref',
          'supplier_name as entity',
          'bill_date as date',
          'total as amount',
          'paid_amount',
          'status',
        ]);
      if (date_from) billQ = billQ.where('bill_date', '>=', new Date(date_from) as any);
      if (date_to) billQ = billQ.where('bill_date', '<=', new Date(date_to) as any);
      const bills = await billQ.execute();

      // For invoices, sum line totals per invoice_id
      const invTotalsRows = await trx
        .selectFrom('sales_invoice_lines')
        .select([
          'invoice_id',
          sql<number>`SUM(rate * qty * (1 + tax_pct / 100.0))`.as('total'),
        ])
        .groupBy('invoice_id')
        .execute();

      const invTotalsMap: Record<string, number> = {};
      for (const r of invTotalsRows) {
        invTotalsMap[r.invoice_id] = Number(r.total) || 0;
      }

      return {
        invoices: invoices.map((i: any) => ({
          ...i,
          amount: invTotalsMap[i.id] ?? 0,
          type: 'Revenue',
          account: 'Accounts Receivable',
        })),
        bills: bills.map((b: any) => ({
          ...b,
          type: 'Expense',
          account: 'Accounts Payable',
        })),
        generated_at: new Date().toISOString(),
      };
    });
  });

  // GET /v1/reports/summary
  fastify.get('/summary', async (req) => {
    const user = req.user as any;
    return withTenant(user.tenant_id, async (trx) => {
      const [invStats, billStats] = await Promise.all([
        trx
          .selectFrom('sales_invoices')
          .where('tenant_id', '=', user.tenant_id)
          .select([
            trx.fn.sum('received').as('total_received'),
            trx.fn.countAll().as('invoice_count'),
          ])
          .executeTakeFirst(),
        trx
          .selectFrom('supplier_bills')
          .where('tenant_id', '=', user.tenant_id)
          .select([
            trx.fn.sum('total').as('total_expenses'),
            trx.fn.sum('paid_amount').as('total_paid'),
            trx.fn.countAll().as('bill_count'),
          ])
          .executeTakeFirst(),
      ]);
      return { invoices: invStats, bills: billStats };
    });
  });
}
