import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { resolveCustomerId } from '../services/customer-identity.service.js';

/** One row of the unified payments feed — money in (customer receipts against
 *  invoices) and money out (supplier payments against bills), so "Payments" is
 *  the whole cash picture, not receivables only. */
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

/**
 * GET /v1/payments — the tenant's payment history, both directions:
 *   • A/R receipts from `invoice_payments` (money in, kind 'customer'), and
 *   • A/P payments from `bill_payments`   (money out, kind 'vendor').
 * A CUSTOMER only ever sees their own receipts; staff see both, newest first.
 * Previously this returned invoice payments only, so supplier payments never
 * appeared here at all.
 */
export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const { customer_id } = request.query as { customer_id?: string };
    if (user.role === 'CUSTOMER' && customer_id && customer_id !== await resolveCustomerId(user)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const scopedCustomerId = user.role === 'CUSTOMER' ? user.sub : customer_id;

    return withTenant(user.tenant_id, async (trx) => {
      // A/R — customer receipts.
      let arq = trx.selectFrom('invoice_payments')
        .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
        .leftJoin('users', 'users.id', 'invoice_payments.created_by')
        .select([
          'invoice_payments.id', 'invoice_payments.invoice_id', 'invoice_payments.amount',
          'invoice_payments.method', 'invoice_payments.payment_date', 'invoice_payments.note',
          'invoice_payments.created_at',
          'sales_invoices.invoice_number', 'sales_invoices.customer_id',
          'sales_invoices.client_name', 'sales_invoices.currency',
          'users.name as logged_by',
        ])
        .where('invoice_payments.tenant_id', '=', user.tenant_id);
      if (scopedCustomerId) arq = arq.where('sales_invoices.customer_id', '=', scopedCustomerId);
      const arRows = await arq.execute();

      const ar: UnifiedPayment[] = arRows.map(r => ({
        id: r.id, kind: 'customer', direction: 'in',
        amount: Number(r.amount), currency: r.currency || 'TZS',
        method: r.method, payment_date: r.payment_date, note: r.note,
        created_at: r.created_at,
        party_name: r.client_name, document_number: r.invoice_number,
        invoice_id: r.invoice_id, customer_id: r.customer_id,
        logged_by: r.logged_by,
      }));

      // A customer sees only their own receipts, never the tenant's payables.
      if (user.role === 'CUSTOMER') return ar.sort(byCreatedDesc);

      // A/P — supplier payments (money out). supplier_bills carries the
      // supplier's name denormalized, so no extra join is needed.
      const apRows = await trx.selectFrom('bill_payments')
        .innerJoin('supplier_bills', 'supplier_bills.id', 'bill_payments.bill_id')
        .leftJoin('users', 'users.id', 'bill_payments.created_by')
        .select([
          'bill_payments.id', 'bill_payments.bill_id', 'bill_payments.amount', 'bill_payments.currency',
          'bill_payments.method', 'bill_payments.payment_date', 'bill_payments.reference', 'bill_payments.note',
          'bill_payments.created_at',
          'supplier_bills.bill_number', 'supplier_bills.supplier_id', 'supplier_bills.supplier_name',
          'users.name as logged_by',
        ])
        .where('bill_payments.tenant_id', '=', user.tenant_id)
        .execute();

      const ap: UnifiedPayment[] = apRows.map(r => ({
        id: r.id, kind: 'vendor', direction: 'out',
        amount: Number(r.amount), currency: r.currency || 'TZS',
        method: r.method, payment_date: r.payment_date, note: r.reference || r.note,
        created_at: r.created_at,
        party_name: r.supplier_name, document_number: r.bill_number,
        bill_id: r.bill_id, supplier_id: r.supplier_id,
        logged_by: r.logged_by,
      }));

      return [...ar, ...ap].sort(byCreatedDesc);
    });
  });
}
