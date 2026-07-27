import { requireEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';

/**
 * GET /v1/payments — customer payment history, joined from invoice_payments
 * (per-invoice records) against sales_invoices for the tenant/customer scope.
 * Previously this endpoint didn't exist at all — the frontend called it and
 * silently swallowed the resulting 404, so "Payments" always rendered empty.
 */
export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request, reply) => {
    const user = request.user;
    const { customer_id } = request.query as { customer_id?: string };
    if (user.role === 'CUSTOMER' && customer_id && customer_id !== user.sub) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
    const scopedCustomerId = user.role === 'CUSTOMER' ? user.sub : customer_id;

    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('invoice_payments')
        .innerJoin('sales_invoices', 'sales_invoices.id', 'invoice_payments.invoice_id')
        .leftJoin('users', 'users.id', 'invoice_payments.created_by')
        .select([
          'invoice_payments.id', 'invoice_payments.invoice_id', 'invoice_payments.amount',
          'invoice_payments.method', 'invoice_payments.payment_date', 'invoice_payments.note',
          'invoice_payments.created_at',
          'sales_invoices.invoice_number', 'sales_invoices.customer_id', 'sales_invoices.client_name',
          'users.name as logged_by',
        ])
        .where('invoice_payments.tenant_id', '=', user.tenant_id);
      if (scopedCustomerId) q = q.where('sales_invoices.customer_id', '=', scopedCustomerId);
      const rows = await q.orderBy('invoice_payments.created_at', 'desc').execute();
      return rows;
    });
  });
}
