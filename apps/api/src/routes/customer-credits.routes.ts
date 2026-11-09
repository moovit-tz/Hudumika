import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { GLService } from '../services/gl.service.js';
import { invoiceGrandTotal } from './invoices.routes.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;
// Same clearing-account convention pos.routes.ts's tenderAccounts already
// uses for a real cash/card/mobile-money receipt — a deposit is real money
// taken in hand, not an invoice-derived figure, so it needs its own tender
// account rather than invoice-payment.service.ts's single hardcoded '1010'.
const depositTenderAccounts = { CASH: '1001', CARD: '1020', MOBILE_MONEY: '1021', BANK: '1010', OTHER: '1022' } as const;
const depositMethod = z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK', 'OTHER']);

/**
 * Customer credits (M10 of the corporate-tax build-out) — an unapplied,
 * customer-level balance usable against any future invoice for the same
 * customer, born either from a real overpayment (see
 * invoices.routes.ts's POST /:id/payment) or, as of migration 728, a true
 * deposit taken directly before any invoice/job exists (POST / below).
 * Deliberately distinct from credit_notes, which reduce one specific
 * original document.
 */
export async function customerCreditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  // GET /v1/customer-credits?customer_id= — remaining balance is computed
  // live (amount minus the sum of its own applications), never stored.
  // HUD-0024 continuation: internal tenant-business data (finance ledgers,
  // fleet ops, HR, identity/access admin, or tenant configuration) with only
  // an entitlement gate — reachable end-to-end by a CUSTOMER JWT (confirmed
  // live before this fix). Not customer-portal data.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  fastify.get('/', async (request) => {
    const user = request.user;
    const { customer_id } = request.query as { customer_id?: string };
    return withTenant(user.tenant_id, async (trx) => {
      let q = trx.selectFrom('customer_credits').selectAll().where('tenant_id', '=', user.tenant_id);
      if (customer_id) q = q.where('customer_id', '=', customer_id);
      const credits = await q.orderBy('created_at', 'desc').execute();
      const ids = credits.map(c => c.id);
      const [applications, refunds] = ids.length ? await Promise.all([
        trx.selectFrom('customer_credit_applications').select(['credit_id', 'amount']).where('credit_id', 'in', ids).execute(),
        trx.selectFrom('customer_credit_refunds').select(['credit_id', 'amount']).where('credit_id', 'in', ids).execute(),
      ]) : [[], []];
      const appliedByCredit = new Map<string, number>();
      for (const a of applications) appliedByCredit.set(a.credit_id, (appliedByCredit.get(a.credit_id) ?? 0) + Number(a.amount));
      const refundedByCredit = new Map<string, number>();
      for (const r of refunds) refundedByCredit.set(r.credit_id, (refundedByCredit.get(r.credit_id) ?? 0) + Number(r.amount));
      return credits.map(c => {
        const applied = appliedByCredit.get(c.id) ?? 0;
        const refunded = refundedByCredit.get(c.id) ?? 0;
        return { ...c, applied_amount: applied, refunded_amount: refunded, remaining_amount: Math.round((Number(c.amount) - applied - refunded) * 100) / 100 };
      });
    });
  });

  // POST /v1/customer-credits — record a true deposit: real cash/card/
  // mobile-money taken in BEFORE any invoice or job exists (a booking
  // retainer, a custom-order down payment). Distinct from the only other
  // way a customer_credits row was ever born (an invoice overpayment,
  // invoice-payment.service.ts) — this one takes the money and posts the
  // GL entry itself, since there is no invoice payment behind it to do so.
  fastify.post('/', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const body = z.object({
      customer_id: z.string().uuid(),
      amount: z.number().positive(),
      method: depositMethod,
      note: z.string().trim().max(1000).optional(),
    }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      const customer = await trx.selectFrom('customers').select('id').where('id', '=', body.customer_id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!customer) return reply.status(404).send({ error: 'Customer not found' });

      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: new Date().toISOString(),
        description: `Customer deposit received${body.note ? `: ${body.note}` : ''}`,
        sourceModule: 'MANUAL', createdBy: user.sub,
        lines: [
          { accountCode: depositTenderAccounts[body.method], debit: body.amount, credit: 0, description: `${body.method.toLowerCase().replace('_', ' ')} deposit received` },
          { accountCode: '2150', debit: 0, credit: body.amount, description: 'Customer deposit liability' },
        ],
      }, trx);

      const credit = await trx.insertInto('customer_credits').values({
        tenant_id: user.tenant_id, customer_id: body.customer_id, amount: String(body.amount),
        source_invoice_id: null, reason: body.note || 'Customer deposit',
        source_type: 'deposit', received_via: body.method,
        journal_entry_id: journalEntryId, created_by: user.sub,
      }).returningAll().executeTakeFirstOrThrow();

      return { ...credit, applied_amount: 0, refunded_amount: 0, remaining_amount: Number(credit.amount) };
    });
  });

  // POST /v1/customer-credits/:id/refund — hands part (or all) of a
  // credit's remaining balance back to the customer in cash, for when the
  // job/order the deposit was taken against never happens. The existing
  // /apply path only ever consumes a credit forward onto an invoice; this
  // is the other direction, which never existed before migration 728.
  fastify.post('/:id/refund', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const body = z.object({ amount: z.number().positive(), method: depositMethod, note: z.string().trim().max(1000).optional() }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      // forUpdate() for the same reason /apply already takes it: without a
      // lock, two concurrent refund (or refund+apply) calls against the
      // same credit each compute "remaining" from a stale snapshot and can
      // together refund/apply more than the credit actually holds.
      const credit = await trx.selectFrom('customer_credits').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!credit) return reply.status(404).send({ error: 'Credit not found' });

      const [applications, refunds] = await Promise.all([
        trx.selectFrom('customer_credit_applications').select('amount').where('credit_id', '=', id).execute(),
        trx.selectFrom('customer_credit_refunds').select('amount').where('credit_id', '=', id).execute(),
      ]);
      const alreadyApplied = applications.reduce((s, a) => s + Number(a.amount), 0);
      const alreadyRefunded = refunds.reduce((s, r) => s + Number(r.amount), 0);
      const remaining = Math.round((Number(credit.amount) - alreadyApplied - alreadyRefunded) * 100) / 100;
      if (body.amount > remaining + 0.01) {
        return reply.status(400).send({ error: `Only ${remaining.toLocaleString()} remains on this credit.` });
      }

      const journalEntryId = await GLService.post(user.tenant_id, {
        entryDate: new Date().toISOString(),
        description: `Customer credit refunded${body.note ? `: ${body.note}` : ''}`,
        sourceModule: 'MANUAL', sourceId: credit.id, createdBy: user.sub,
        lines: [
          { accountCode: '2150', debit: body.amount, credit: 0, description: 'Customer credit refunded' },
          { accountCode: depositTenderAccounts[body.method], debit: 0, credit: body.amount, description: `${body.method.toLowerCase().replace('_', ' ')} refund paid out` },
        ],
      }, trx);

      await trx.insertInto('customer_credit_refunds').values({
        tenant_id: user.tenant_id, credit_id: id, amount: String(body.amount), method: body.method,
        note: body.note || null, journal_entry_id: journalEntryId, refunded_by: user.sub,
      }).execute();

      return { success: true, refunded: body.amount, remaining_amount: Math.round((remaining - body.amount) * 100) / 100 };
    });
  });

  // POST /v1/customer-credits/:id/apply — applies part (or all) of a
  // credit's remaining balance to a target invoice for the same customer.
  fastify.post('/:id/apply', { preHandler: requireRole(...FINANCE_TIER) }, async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    const { invoice_id, amount } = z.object({ invoice_id: z.string().uuid(), amount: z.number().positive() }).parse(request.body);

    return withTenant(user.tenant_id, async (trx) => {
      // forUpdate() on both rows this apply reads a balance from and then
      // writes a dependent row against: without it, two concurrent /apply
      // calls against the SAME credit (or the same target invoice) each
      // compute "remaining"/"outstanding" from a stale, unlocked snapshot,
      // so both can pass their own under-the-limit check and together
      // over-apply past what the credit actually holds or the invoice
      // actually owes — same race class fixed in petti.service.ts and
      // bills.routes.ts earlier this session.
      const credit = await trx.selectFrom('customer_credits').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
      if (!credit) return reply.status(404).send({ error: 'Credit not found' });

      const invoice = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoice_id).where('tenant_id', '=', user.tenant_id).forUpdate().executeTakeFirst();
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
      }, trx);

      await trx.insertInto('customer_credit_applications').values({
        tenant_id: user.tenant_id, credit_id: id, invoice_id, amount: String(amount),
        journal_entry_id: journalEntryId, applied_by: user.sub,
      }).execute();

      // Applying a credit clears AR the same way a cash payment would —
      // `received` and status must move the same way POST /:id/payment
      // moves them, or the invoice looks unpaid despite being settled.
      const newReceived = invPaid + amount;
      const newStatus = newReceived <= 0 ? 'Unpaid' : newReceived >= invGrandTotal ? 'Paid' : 'Partial';
      await trx.updateTable('sales_invoices').set({ received: newReceived, status: newStatus, updated_at: new Date() }).where('id', '=', invoice_id).where('tenant_id', '=', user.tenant_id).execute();

      await trx.insertInto('invoice_activity_log').values({
        tenant_id: user.tenant_id, invoice_id, actor_id: user.sub, actor_name: user.name || user.email,
        action: 'credit_applied', detail: `Customer credit of ${amount.toLocaleString()} applied`, created_at: new Date(),
      }).execute();

      return { success: true, applied: amount, invoice_status: newStatus };
    });
  });
}
