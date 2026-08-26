import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { requireEntitlement } from '../middleware/entitlement.js';
import { computeAndPostDeferredTax } from '../services/deferred-tax.service.js';

const FINANCE_TIER = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'] as const;

/**
 * Deferred tax (M3 of the corporate-tax build-out) — fixed-asset timing
 * differences only. See deferred-tax.service.ts's header for the explicit
 * scope disclosure: any consumer of this data must present it labeled
 * "Deferred Tax — Fixed Asset Timing Differences Only", never as an
 * unqualified deferred tax figure.
 */
export async function deferredTaxRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireEntitlement('finops'));

  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) =>
      trx.selectFrom('deferred_tax_computations').selectAll().where('tenant_id', '=', user.tenant_id)
        .orderBy('as_of_date', 'desc').execute()
    );
  });

  fastify.get('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params as { id: string };
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('deferred_tax_computations').selectAll().where('id', '=', id).where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return reply.status(404).send({ error: 'Computation not found' });
      return row;
    });
  });

  // POST /v1/deferred-tax/compute — computes the fixed-asset-timing-
  // difference position as of a date and posts whatever movement is needed
  // to bring 1250/2450's real GL balances to that target. Safe to call
  // repeatedly (including for the same as_of_date) — a run with nothing
  // changed posts no entry.
  fastify.post('/compute', { preHandler: requireRole(...FINANCE_TIER) }, async (request) => {
    const user = request.user;
    const { as_of_date } = z.object({ as_of_date: z.string() }).parse(request.body);
    return computeAndPostDeferredTax(user.tenant_id, as_of_date, user.sub);
  });
}
