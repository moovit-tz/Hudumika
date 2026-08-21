import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

/**
 * AgencyHost M4 — a tenant activating the standalone Onsite-only package
 * (migration 244) for itself. Deliberately its own file, not added to
 * onsite.routes.ts: that plugin's preHandler chain requires 'onsite'
 * entitlement for every route in it, which is exactly backwards here — the
 * tenants this exists for are the ones who have just lost that entitlement
 * (a detached former agency client, see the /v1/onsite/agency/*  detach/leave
 * routes) and need a way back in without already holding it.
 */
export async function onsitePlanRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));

  // The destination is hardcoded, not caller-supplied — unlike the generic
  // PATCH /v1/settings escape hatch (which lets a tenant admin write
  // tenants.plan to any string with no validation it names a real, paid
  // package), this can only ever aim at the one specific plan it's for.
  fastify.post('/activate-standalone', async (request) => {
    const tenantId = request.user.tenant_id;
    await withTenant(tenantId, trx => trx.updateTable('tenants')
      .set({ plan: 'onsite-standalone', updated_at: new Date() })
      .where('id', '=', tenantId)
      .execute());
    return { plan: 'onsite-standalone' };
  });
}
