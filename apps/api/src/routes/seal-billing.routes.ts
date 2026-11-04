import { validateSealReferences } from '../middleware/seal-references.js';
import { getSealStock } from '../services/seal-stock.service.js';
import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealBillingService, NothingToBill, LotHasNoVolume, LotNotFound } from '../services/seal-billing.service.js';

// FinOps link — closes the "no billing" gap explicitly deferred out of
// SEAL's original Increment 1 scope. Generating a storage invoice is a
// real financial action, so this is a real (Draft) sales_invoices row —
// finalization/GL-posting stays entirely inside FinOps's own POST
// /v1/invoices flow, never duplicated here. requireAnyEntitlement lets a
// SEAL-only warehouse manager generate the invoice without also being
// provisioned into FinOps; the invoices.routes.ts role check (FINANCE/
// MANAGER/ADMIN+) still gates who can actually send/finalize it there.
export async function sealBillingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', validateSealReferences);
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'finops']));
  // HUD-0101: this file postdates the original HUD-0024/0031 sweep that put
  // this same block on every other SEAL route file (seal.routes.ts,
  // seal-warehouse-ops.routes.ts) — added for HUD-0099's own billing
  // feature, it never got it. Live-confirmed the real gap it left: a
  // CUSTOMER-role account for a *different* customer could read any lot's
  // confidential storage rate/accrual, and could actually generate a real
  // Draft invoice against another customer's lot (consuming its billing
  // watermark in the process) — not just a read leak, a real cross-customer
  // financial-document creation with no ownership check at all.
  fastify.addHook('preHandler', async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  });

  // HUD-0099: both routes below crashed on a wrong/stale lot id with a raw
  // 500 instead of a clean 404 — the underlying service used
  // executeTakeFirstOrThrow() with no prior check. Fixed at the service
  // layer (LotNotFound); mapped to 404 here.
  fastify.get('/stock-overview', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, trx => getSealStock(trx, request.user.tenant_id, request.query.compartment_id));
    } catch (e: any) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get('/storage-invoices', async (request: any, reply) => {
    try {
      return await withTenant(request.user.tenant_id, async trx => {
        const invoices = await trx.selectFrom('sales_invoices').leftJoin('customers', join => join.onRef('customers.id', '=', 'sales_invoices.customer_id').on('customers.tenant_id', '=', request.user.tenant_id))
          .select(['sales_invoices.id', 'sales_invoices.invoice_number', 'sales_invoices.status', 'sales_invoices.bill_date', 'sales_invoices.notes', 'customers.name as customer_name'])
          .where('sales_invoices.tenant_id', '=', request.user.tenant_id).where('sales_invoices.invoice_number', 'like', 'SEAL-STG-%')
          .orderBy('sales_invoices.bill_date', 'desc').execute();
        const lines = invoices.length ? await trx.selectFrom('sales_invoice_lines')
          .innerJoin('sales_invoices', 'sales_invoices.id', 'sales_invoice_lines.invoice_id')
          .select(['sales_invoice_lines.invoice_id', 'sales_invoice_lines.currency', 'sales_invoice_lines.rate', 'sales_invoice_lines.qty'])
          .where('sales_invoices.tenant_id', '=', request.user.tenant_id).where('sales_invoices.id', 'in', invoices.map(i => i.id)).execute() : [];
        return invoices.map(i => {
          const totals = new Map<string, number>();
          for (const line of lines.filter(l => l.invoice_id === i.id)) {
            const currency = line.currency ?? 'TZS';
            totals.set(currency, (totals.get(currency) ?? 0) + Number(line.rate) * Number(line.qty));
          }
          return { id: i.id, invoiceNumber: i.invoice_number, customerName: i.customer_name, status: i.status,
            billDate: i.bill_date, notes: i.notes, totals: [...totals].map(([currency, amount]) => ({ currency, amount })) };
        });
      });
    } catch (e: any) { return reply.code(500).send({ error: e.message }); }
  });

  fastify.get('/lots/:id/storage-accrual', async (request: any, reply) => {
    try {
      const accrual = await withTenant(request.user.tenant_id, trx => SealBillingService.previewAccrual(trx, request.user.tenant_id, request.params.id));
      return accrual;
    } catch (err: any) {
      if (err instanceof LotNotFound) return reply.status(404).send({ error: err.message });
      if (err instanceof LotHasNoVolume) return reply.status(422).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/lots/:id/generate-storage-invoice', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, trx =>
        SealBillingService.generateStorageInvoice(trx, request.user.tenant_id, request.user.sub, request.params.id)
      );
      return result;
    } catch (err: any) {
      if (err instanceof LotNotFound) return reply.status(404).send({ error: err.message });
      if (err instanceof NothingToBill) return reply.status(422).send({ error: err.message });
      if (err instanceof LotHasNoVolume) return reply.status(422).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });
}
