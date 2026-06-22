import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import { sql } from 'kysely';
import { requireRole } from '../middleware/rbac.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  // GET /v1/settings
  fastify.get('/', async (request) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').selectAll().where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (!row) return { settings: {} };
      const settings = typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings;
      return { settings };
    });
  });

  // PATCH /v1/settings
  fastify.patch('/', { preHandler: requireRole('SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER') }, async (request, reply) => {
    const user = request.user;
    const updates = request.body as Record<string, any>;
    return withTenant(user.tenant_id, async (trx) => {
      const existing = await trx.selectFrom('tenant_settings').select('id').where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      if (existing) {
        await sql`UPDATE tenant_settings SET settings = settings || ${JSON.stringify(updates)}::jsonb, updated_at = NOW() WHERE tenant_id = ${user.tenant_id}`.execute(trx);
      } else {
        await trx.insertInto('tenant_settings').values({
          tenant_id: user.tenant_id,
          settings: JSON.stringify(updates),
        }).execute();
      }
      // Also update tenants table for known fields
      if (updates.company) {
        const co = updates.company;
        const tenantUpdates: any = { updated_at: new Date() };
        if (co.name) tenantUpdates.name = co.name;
        if (co.logoUrl !== undefined) tenantUpdates.logo_url = co.logoUrl;
        await trx.updateTable('tenants').set(tenantUpdates).where('id', '=', user.tenant_id).execute();
      }
      const row = await trx.selectFrom('tenant_settings').selectAll().where('tenant_id', '=', user.tenant_id).executeTakeFirst();
      const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : updates;
      return { settings };
    });
  });
}
