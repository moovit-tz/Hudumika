import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { invoiceGrandTotal } from './invoices.routes.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

/**
 * Customer credits (M10 of the corporate-tax build-out) — an unapplied,
 * customer-level balance born from a real overpayment (see
 * invoices.routes.ts's POST /:id/payment), usable against any future
 * invoice for the same customer. Deliberately distinct from credit_notes,
 * which reduce one specific original document.
 */
export async function customerCreditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/customer-credits?customer_id= — remaining balance is computed
  // live (amount minus the sum of its own applications), never stored.
  fastify.get('/', async (request) => {
    const user = request.user;
    const { customer_id } = request.query as { customer_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('customer_credits').selectAll().where('tenant_id', '=', user.tenant_id);
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      const credits = await q.orderBy('created_at', 'desc').execute();
      const ids = credits.map(c => c.id);
      const applications = ids.length
        ? await trx.selectFrom('customer_credit_applications').select(['credit_id', 'amount']).where('credit_id', 'in', ids).execute()
        : [];
      const appliedByCredit = new Map<string, number>();
      for (const a of applications) appliedByCredit.set(a.credit_id, (appliedByCredit.get(a.credit_id) ?? 0) + Number(a.amount));
      return credits.map(c => {
        const applied = appliedByCredit.get(c.id) ?? 0;
        return { ...c, applied_amount: applied, remaining_amount: Math.round((Number(c.amount) - applied) * 100) / 100 };
      });
    });
  });

  // POST /v1/customer-credits/:id/apply — applies part (or all) of a
  // credit's remaining balance to a target invoice for the same customer.
  fastify.post('/:id/apply', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { invoice_id, amount } = z.object({ invoice_id: z.string().uuid(), amount: z.number().positive() }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const credit = await trx.selectFrom('customer_credits').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!credit) return reply.status(404).send({ error: 'Credit not found' });

      const invoice = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoice_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!invoice) return reply.status(404).send({ error: 'Invoice not found' });
      if (credit.customer_id && invoice.customer_id && credit.customer_id !== invoice.customer_id) {
        return reply.status(400).send({ error: 'This credit belongs to a different customer than the target invoice.' });
      }

      const applications = await trx.selectFrom('customer_credit_applications').select('amount').where('credit_id', '=', id).execute();
      const alreadyApplied = applications.reduce((s, a) => s + Number(a.amount), 0);
      const remaining = Math.round((Number(credit.amount) - alreadyApplied) * 100) / 100;
      if (amount > remaining + 0.01) {
        return reply.status(400).send({ error: `Only ${remaining.toLocaleString()} remains on this credit.` });
      }

      const invLines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoice_id).execute();
      const invGrandTotal = invoiceGrandTotal(invLines, invoice.currency, Number(invoice.exchange_rate) || 1);
      const invPayments = await trx.selectFrom('invoice_payments').select('amount').where('invoice_id', '=', invoice_id).execute();
      const invPaid = invPayments.reduce((s, p) => s + Number(p.amount), 0);
      const invOutstanding = Math.max(0, invGrandTotal - invPaid);
      if (amount > invOutstanding + 0.01) {
        return reply.status(400).send({ error: `This invoice only has ${invOutstanding.toLocaleString()} outstanding.` });
      }

      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: new Date().toISOString(),
        description: `Customer credit applied to ${invoice.invoice_number}`,
        reference: invoice.invoice_number, sourceModule: 'MANUAL', sourceId: credit.id, createdBy: user.sub,
        lines: [
          { accountCode: '2150', debit: amount, credit: 0, description: 'Customer credit applied' },
          { accountCode: '1100', debit: 0, credit: amount, description: `Clear AR: ${invoice.invoice_number}` },
        ],
      });

      await trx.insertInto('customer_credit_applications').values({
        tenant_id: user.tenant_id, credit_id: id, invoice_id, amount: String(amount),
        journal_entry_id: journalEntryId, applied_by: user.sub,
      }).execute();

      // Applying a credit clears AR the same way a cash payment would —
      // `received` and status must move the same way POST /:id/payment
      // moves them, or the invoice looks unpaid despite being settled.
      const newReceived = invPaid + amount;
      const newStatus = newReceived <= 0 ? 'Unpaid' : newReceived >= invGrandTotal ? 'Paid' : 'Partial';
      await trx.updateTable('sales_invoices').set({ received: newReceived, status: newStatus, updated_at: new Date() }).where('id', '=', invoice_id).execute();

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'credit_applied', detail: `Customer credit of ${amount.toLocaleString()} applied`, created_at: new Date(),
      }).execute();

      return { success: true, applied: amount, invoice_status: newStatus };
    });
  });
}
