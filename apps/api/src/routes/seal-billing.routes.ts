import { requireAnyEntitlement } from '../middleware/entitlement.js';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { SealBillingService, NothingToBill } from '../services/seal-billing.service.js';

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
  fastify.addHook('preHandler', requireAnyEntitlement(['seal', 'finops']));

  fastify.get('/lots/:id/storage-accrual', async (request: any, reply) => {
    try {
      const accrual = await withTenant(request.user.tenant_id, trx => SealBillingService.previewAccrual(trx, request.params.id));
      return accrual;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.post('/lots/:id/generate-storage-invoice', async (request: any, reply) => {
    try {
      const result = await withTenant(request.user.tenant_id, trx =>
        SealBillingService.generateStorageInvoice(trx, request.user.tenant_id, request.user.id, request.params.id)
      );
      return result;
    } catch (err: any) {
      if (err instanceof NothingToBill) return reply.status(422).send({ error: err.message });
      return reply.status(500).send({ error: err.message });
    }
  });
}
