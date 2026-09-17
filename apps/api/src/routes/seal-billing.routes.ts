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
