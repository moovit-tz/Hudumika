import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';

interface UnifiedPayment {
  id: string;
  kind: 'customer' | 'vendor';
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  method: string | null;
  payment_date: unknown;
  note: string | null;
  created_at: unknown;
  party_name: string | null;
  document_number: string;
  invoice_id?: string;
  bill_id?: string;
  customer_id?: string | null;
  supplier_id?: string | null;
  logged_by: string | null;
}

const byCreatedDesc = (a: UnifiedPayment, b: UnifiedPayment) =>
  new Date(b.created_at as any).getTime() - new Date(a.created_at as any).getTime();

const querySchema = z.object({
  customer_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).optional(),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  direction: z.enum(['in', 'out']).optional(),
  search: z.string().max(200).optional(),
  currency: z.string().max(10).optional(),
  method: z.string().max(50).optional(),
  sort_by: z.enum(['payment_date', 'amount', 'created_at']).default('created_at'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
});

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'CUSTOMER') }, async (request, reply) => {
    const user = request.user;
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid payment filters or pagination.' });
    const { customer_id, page, page_size, direction, search, currency, method, sort_by, sort_dir } = parsed.data;

    const ownCustomerId = user.role === 'CUSTOMER' ? await resolveCustomerId(user) : null;
    if (user.role === 'CUSTOMER' && customer_id && customer_id !== ownCustomerId) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const scopedCustomerId = user.role === 'CUSTOMER' ? ownCustomerId : customer_id;
    if (user.role === 'CUSTOMER' && !ownCustomerId) return page !== undefined ? { items: [], total: 0, page, page_size, total_pages: 0 } : [];

    return withTenant(user.tenant_id, async (trx) => {
      const escapedSearch = search ? `%${search.replace(/[\\%_]/g, c => `\\${c}`)}%` : null;
      const isCustomer = user.role === 'CUSTOMER';

      // Build a UNION ALL CTE so pagination, sorting and filtering happen in SQL.
      const arSelect = trx.selectFrom('invoice_payments')
        .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
        .leftJoin('users', 'users.id', 'invoice_payments.created_by')
        .select([
          'invoice_payments.id',
          sql.lit('customer').as('kind'),
          sql.lit('in').as('direction'),
          'invoice_payments.amount',
          'sales_invoices.currency',
          'invoice_payments.method',
          'invoice_payments.payment_date',
          'invoice_payments.note',
          'invoice_payments.created_at',
          'sales_invoices.client_name as party_name',
          'sales_invoices.invoice_number as document_number',
          'invoice_payments.invoice_id',
          sql<string | null>`null`.as('bill_id'),
          'sales_invoices.customer_id',
          sql<string | null>`null`.as('supplier_id'),
          'users.name as logged_by',
        ])
        .where('invoice_payments.tenant_id', '=', user.tenant_id)
        .where('sales_invoices.tenant_id', '=', user.tenant_id)
        .$if(!!scopedCustomerId, q => q.where('sales_invoices.customer_id', '=', scopedCustomerId!));

      const apSelect = isCustomer ? null : trx.selectFrom('bill_payments')
        .innerJoin('supplier_bills', 'supplier_bills.id', 'bill_payments.bill_id')
        .leftJoin('users', 'users.id', 'bill_payments.created_by')
        .select([
          'bill_payments.id',
          sql.lit('vendor').as('kind'),
          sql.lit('out').as('direction'),
          'bill_payments.amount',
          'bill_payments.currency',
          'bill_payments.method',
          'bill_payments.payment_date',
          sql`coalesce(bill_payments.reference, bill_payments.note)`.as('note'),
          'bill_payments.created_at',
          'supplier_bills.supplier_name as party_name',
          'supplier_bills.bill_number as document_number',
          sql<string | null>`null`.as('invoice_id'),
          'bill_payments.bill_id',
          sql<string | null>`null`.as('customer_id'),
          'supplier_bills.supplier_id',
          'users.name as logged_by',
        ])
        .where('bill_payments.tenant_id', '=', user.tenant_id)
        .where('supplier_bills.tenant_id', '=', user.tenant_id);

      const unionQuery = apSelect
        ? arSelect.unionAll(apSelect as any)
        : arSelect;

      // Wrap the union in a CTE for filtering / pagination.
      let cte = trx.with('payments_union', () => unionQuery).selectFrom('payments_union');

      if (direction) cte = cte.where('direction', '=', direction);
      if (currency) cte = cte.where('currency', '=', currency);
      if (method) cte = cte.where('method', '=', method);
      if (escapedSearch) {
        cte = cte.where(eb => eb.or([
          eb('document_number', 'ilike', escapedSearch),
          eb('party_name', 'ilike', escapedSearch),
          eb('method', 'ilike', escapedSearch),
        ]));
      }

      if (page === undefined) {
        // Legacy: return full array, sorted in memory (matches old behavior).
        const rows = await cte.selectAll().execute();
        return (rows as any[]).map(r => ({ ...r, amount: Number(r.amount) })).sort(byCreatedDesc);
      }

      const total = Number((await cte.select(eb => eb.fn.countAll().as('count')).executeTakeFirstOrThrow()).count);
      const items = await cte.selectAll()
        .orderBy(sort_by, sort_dir).orderBy('id', sort_dir)
        .limit(page_size).offset((page - 1) * page_size)
        .execute();

      return {
        items: (items as any[]).map(r => ({ ...r, amount: Number(r.amount) })),
        total,
        page,
        page_size,
        total_pages: Math.ceil(total / page_size),
      };
    });
  });

  // GET /v1/payments/stats — aggregated money-in / money-out by currency.
  fastify.get('/stats', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES') }, async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const arAgg = await trx.selectFrom('invoice_payments')
        .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
        .where('invoice_payments.tenant_id', '=', user.tenant_id)
        .where('sales_invoices.tenant_id', '=', user.tenant_id)
        .select([
          'sales_invoices.currency',
          sql<number>`count(*)`.as('count'),
          sql<number>`coalesce(sum(invoice_payments.amount), 0)`.as('total'),
        ])
        .groupBy('sales_invoices.currency')
        .execute();

      const apAgg = await trx.selectFrom('bill_payments')
        .where('tenant_id', '=', user.tenant_id)
        .select([
          'currency',
          sql<number>`count(*)`.as('count'),
          sql<number>`coalesce(sum(amount), 0)`.as('total'),
        ])
        .groupBy('currency')
        .execute();

      const thisMonthStart = new Date();
      thisMonthStart.setDate(1);
      thisMonthStart.setHours(0, 0, 0, 0);
      const thisMonthIso = thisMonthStart.toISOString().slice(0, 10);

      const monthlyAr = await trx.selectFrom('invoice_payments')
        .where('tenant_id', '=', user.tenant_id)
        .where('payment_date', '>=', thisMonthIso)
        .select(sql<number>`count(*)`.as('count'))
        .executeTakeFirstOrThrow();

      return {
        money_in: arAgg.map(r => ({ currency: r.currency || 'TZS', count: Number(r.count), total: Number(r.total) })),
        money_out: apAgg.map(r => ({ currency: r.currency || 'TZS', count: Number(r.count), total: Number(r.total) })),
        this_month_count: Number(monthlyAr.count),
      };
    });
  });
}
