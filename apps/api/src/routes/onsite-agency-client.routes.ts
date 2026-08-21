import type { FastifyInstance } from 'fastify';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { notifyClientDetached } from './onsite-agency-manage.routes.js';

/**
 * AgencyHost M3 — the client's own side of an agency relationship: checking
 * who manages them, and leaving. Deliberately not gated by
 * requireEntitlement('onsite') the way onsite-agency.routes.ts (create/list,
 * an agency-only action) and onsite.routes.ts both are — a tenant that has
 * just lost onsite entitlement (mid-detach, or checking their status
 * afterward) is exactly who needs to reach these, so requiring the very
 * entitlement a detach just removed would lock them out of confirming it.
 * Same reasoning as onsite-plan.routes.ts's activate-standalone.
 *
 * Registered at the same /v1/onsite/agency prefix as onsite-agency.routes.ts
 * — Fastify's per-plugin hook encapsulation keeps the two hook chains
 * separate even though the URL paths sit side by side.
 */
export async function onsiteAgencyClientRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));

  fastify.get('/my-agency', async (request) => {
    const user = request.user;
    const rel = await dbPlatform.selectFrom('agency_managed_tenants')
      .innerJoin('tenants', 'tenants.id', 'agency_managed_tenants.agency_tenant_id')
      .select(['tenants.id as agency_tenant_id', 'tenants.name as agency_name'])
      .where('agency_managed_tenants.client_tenant_id', '=', user.tenant_id)
      .where('agency_managed_tenants.status', '=', 'active')
      .executeTakeFirst();
    return { agency: rel ?? null };
  });

  fastify.post('/leave', async (request, reply) => {
    const user = request.user;
    const rel = await dbPlatform.selectFrom('agency_managed_tenants')
      .select(['id', 'agency_tenant_id'])
      .where('client_tenant_id', '=', user.tenant_id)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!rel) return reply.status(404).send({ error: 'You are not currently managed by an agency' });

    await dbPlatform.updateTable('agency_managed_tenants')
      .set({ status: 'detached', detached_at: new Date(), detached_by: user.sub })
      .where('id', '=', rel.id)
      .execute();
    await notifyClientDetached(user.tenant_id, rel.agency_tenant_id);
    return { status: 'detached' };
  });
}
