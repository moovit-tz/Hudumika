// ─── eSign — Billing integration (Phase S9) ─────────────────────────────────
// Prefix: /v1/sign. Its own file for the same reason sign-matters.routes.ts/
// sign-jurisdiction.routes.ts already are.
//
// Creates a real DRAFT sales_invoices row through the exact shape
// seal-billing.service.ts's generateStorageInvoice already established for
// this problem — a cross-app event that should become a FinOps invoice.
// Invoice finalization (tax resolution, GL posting, accounting sync) stays
// entirely inside FinOps's own POST /v1/invoices flow; this never
// duplicates that logic, only creates the draft it starts from. No fee
// schedule is invented — the preparer types the real amount being charged
// (Sign has no existing notary/consultant rate card anywhere in this
// codebase to compute one from).
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { getNextDocNumber } from '../lib/doc-numbering.js';

function tenantId(req: FastifyRequest): string { return (req.user as { tenant_id: string }).tenant_id; }
function userId(req: FastifyRequest): string { return (req.user as { sub: string }).sub; }

// Same role tier invoices.routes.ts's own POST / already requires — this
// creates the same kind of real financial document, not a lighter one.
const INVOICE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'] as const;

const billSchema = z.object({
  description: z.string().trim().min(1, 'A description is required'),
  amount: z.number().positive('Amount must be greater than zero'),
  currency: z.string().trim().length(3).optional(),
});

export async function signBillingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post<{ Params: { id: string } }>('/envelopes/:id/bill', { preHandler: requireRole(...INVOICE_ROLES) }, async (req, reply) => {
    const tid = tenantId(req);
    const body = billSchema.parse(req.body);

    return withTenant(tid, async (trx) => {
      const envelope = await trx.selectFrom('sign_envelopes').selectAll()
        .where('id', '=', req.params.id).where('tenant_id', '=', tid).executeTakeFirst();
      if (!envelope) return reply.status(404).send({ error: 'Envelope not found' });
      if (envelope.invoice_id) return reply.status(409).send({ error: 'This envelope has already been billed.' });
      if (!envelope.client_id) return reply.status(400).send({ error: 'This envelope has no linked customer to bill — set one from the Customers record it was sent from.' });

      const currency = body.currency?.toUpperCase() || 'TZS';
      const invoiceNumber = await getNextDocNumber(trx, tid, 'invoice');

      const invoice = await trx.insertInto('sales_invoices').values({
        tenant_id: tid,
        invoice_number: invoiceNumber,
        shipment_ref: null,
        customer_id: envelope.client_id,
        client_name: null,
        client_address: '[]',
        bl_number: null,
        origin: null,
        destination: null,
        bill_date: new Date(),
        due_date: null,
        sale_agent: null,
        payment_terms: null,
        currency,
        status: 'Draft',
        received: 0,
        version: 1,
        ref_code: null,
        notes: `Hudumika Sign — ${envelope.title}${envelope.verification_code ? ` (${envelope.verification_code})` : ''}`,
        created_by: userId(req),
      }).returningAll().executeTakeFirstOrThrow();

      await trx.insertInto('sales_invoice_lines').values({
        invoice_id: invoice.id,
        name: body.description,
        unit: 'FLAT',
        rate: body.amount,
        qty: 1,
        line_group: 'other',
        currency,
        sort_order: 0,
      }).execute();

      await trx.updateTable('sign_envelopes').set({ invoice_id: invoice.id, updated_at: new Date() })
        .where('id', '=', envelope.id).execute();

      return reply.status(201).send({ invoice_id: invoice.id, invoice_number: invoice.invoice_number });
    });
  });
}
