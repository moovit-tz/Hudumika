import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { withTenant, dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

/**
 * AgencyHost M4 — restores Onsite access for a tenant who was an
 * agency-managed client and has since been detached (see the
 * /v1/onsite/agency/* detach/leave routes), so losing the agency
 * relationship doesn't also mean losing the sites/domains/deployments that
 * relationship left behind. Deliberately its own file, not added to
 * onsite.routes.ts: that plugin's preHandler chain requires 'onsite'
 * entitlement for every route in it, which is exactly backwards here.
 *
 * This is a recovery path, not a purchase path — the real purchase flow for
 * any tenant that was never agency-managed is the existing
 * POST /v1/addons/onsite/purchase (addons.routes.ts), which already prices,
 * prorates and bills it. Fixed here (see LENS audit, 5 Nov 2026): this route
 * had NO eligibility check at all — any TENANT_ADMIN of any tenant could
 * call it and get free standalone Onsite, and worse, it overwrote
 * tenants.plan outright, destroying whatever paid base plan the tenant
 * already had. Now it only fires for a tenant with real detached-agency
 * history and no currently active one, and it grants through the same
 * tenant_addons mechanism a normal purchase would (additive, preserves the
 * base plan) rather than replacing tenants.plan.
 */
export async function onsitePlanRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'));

  fastify.post('/activate-standalone', async (request, reply) => {
    const tenantId = request.user.tenant_id;

    const stillManaged = await dbPlatform.selectFrom('agency_managed_tenants')
      .select('id').where('client_tenant_id', '=', tenantId).where('status', '=', 'active')
      .executeTakeFirst();
    if (stillManaged) {
      return reply.status(409).send({ error: 'This workspace is still managed by an agency — ask the agency to detach it first, or use the normal Onsite add-on purchase instead.' });
    }

    const everManaged = await dbPlatform.selectFrom('agency_managed_tenants')
      .select('id').where('client_tenant_id', '=', tenantId).where('status', '=', 'detached')
      .executeTakeFirst();
    if (!everManaged) {
      return reply.status(403).send({ error: 'This recovery path is only for a former agency-managed client. Purchase the Onsite add-on at Settings → Add-ons instead.' });
    }

    return withTenant(tenantId, async (trx) => {
      const existing = await trx.selectFrom('tenant_addons').select(['id', 'status'])
        .where('tenant_id', '=', tenantId).where('addon_code', '=', 'onsite').executeTakeFirst();
      if (existing?.status === 'active') return { addon: 'onsite', status: 'active' };

      // The read above and this write are not atomic — two parallel retries
      // of the same recovery click (a slow response retried, a double-
      // click) can both see no row and race the INSERT, or both see an
      // inactive row and race the UPDATE. The (tenant_id, addon_code)
      // unique constraint is the actual guarantee; a unique_violation here
      // means the other request already won. PostgreSQL marks the whole
      // transaction aborted after any failed statement, so the fallback
      // SELECT below needs its own SAVEPOINT to run at all — see
      // hr.routes.ts's bestEffortInTransaction for the same pattern.
      await sql`SAVEPOINT addon_claim`.execute(trx);
      let row;
      try {
        row = existing
          ? await trx.updateTable('tenant_addons')
              .set({ status: 'active', started_at: new Date(), cancelled_at: null, updated_at: new Date() })
              .where('id', '=', existing.id).returningAll().executeTakeFirstOrThrow()
          : await trx.insertInto('tenant_addons')
              .values({ tenant_id: tenantId, addon_code: 'onsite', status: 'active', quantity: 1 })
              .returningAll().executeTakeFirstOrThrow();
        await sql`RELEASE SAVEPOINT addon_claim`.execute(trx);
      } catch (err: any) {
        if (err?.code === '23505') {
          await sql`ROLLBACK TO SAVEPOINT addon_claim`.execute(trx);
          await sql`RELEASE SAVEPOINT addon_claim`.execute(trx);
          const won = await trx.selectFrom('tenant_addons').selectAll()
            .where('tenant_id', '=', tenantId).where('addon_code', '=', 'onsite').executeTakeFirstOrThrow();
          return { addon: 'onsite', status: won.status };
        }
        throw err;
      }
      return { addon: 'onsite', status: row.status };
    });
  });
}
