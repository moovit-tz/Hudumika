import { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const storeRoutes: FastifyPluginAsync = async (app) => {
  // This plugin previously registered no auth hook at all: the admin listing and
  // the approve/reject endpoint answered 200 to unauthenticated callers, so
  // anyone could approve an app into the marketplace — and an approved app with
  // a webhook_url receives domain events (see domain-events.service.ts).
  app.addHook('preHandler', app.authenticate);

  // GET /v1/store/apps (Public/Authenticated) -> returns approved apps
  app.get('/apps', async (request, reply) => {
    const result = await sql<any>`
      SELECT 
        id, name, developer_id, developer_name, category, 
        short_desc as "shortDesc", long_desc as "longDesc", 
        features, permissions, icon_url as "iconUrl", 
        rating, reviews_count as "reviewsCount", installs, status
      FROM marketplace_apps
      WHERE status = 'approved'
      ORDER BY created_at DESC
    `.execute(dbPlatform);
    return result.rows;
  });

  // GET /v1/store/installed -> which marketplace app ids this TENANT has
  // installed. Tenant-scoped (withTenant), unlike the catalog above which is
  // the same for everyone — install status previously lived in localStorage
  // only, invisible to every other staff member on the same tenant.
  app.get('/installed', async (request, reply) => {
    const user = request.user;
    return withTenant(user.tenant_id, async (trx) => {
      const rows = await trx.selectFrom('store_installed_apps').select('app_id').where('tenant_id', '=', user.tenant_id).execute();
      return rows.map(r => r.app_id);
    });
  });

  // POST /v1/store/installed { app_id } -> mark an app installed for this tenant
  app.post('/installed', async (request, reply) => {
    const user = request.user;
    const { app_id } = z.object({ app_id: z.string() }).parse(request.body);
    return withTenant(user.tenant_id, async (trx) => {
      await trx.insertInto('store_installed_apps').values({
        id: randomUUID(), tenant_id: user.tenant_id, app_id, installed_by: UUID_RE.test(user.sub) ? user.sub : null,
      }).onConflict(oc => oc.columns(['tenant_id', 'app_id']).doNothing()).execute();
      reply.status(204);
      return null;
    });
  });

  // DELETE /v1/store/installed/:appId -> uninstall for this tenant
  app.delete('/installed/:appId', async (request, reply) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    return withTenant(user.tenant_id, async (trx) => {
      await trx.deleteFrom('store_installed_apps').where('tenant_id', '=', user.tenant_id).where('app_id', '=', appId).execute();
      reply.status(204);
      return null;
    });
  });

  // GET /v1/store/admin/apps (Admin) -> returns all apps including pending.
  // Marketplace approval is a platform-level decision, not a tenant one, so
  // these two are SUPER_ADMIN and not the wider OPS role set.
  app.get('/admin/apps', { preHandler: requireRole('SUPER_ADMIN') }, async (request, reply) => {
    const result = await sql<any>`
      SELECT 
        id, name, developer_id, developer_name, category, 
        short_desc as "shortDesc", long_desc as "longDesc", 
        features, permissions, icon_url as "iconUrl", 
        rating, reviews_count as "reviewsCount", installs, status
      FROM marketplace_apps
      ORDER BY created_at DESC
    `.execute(dbPlatform);
    return result.rows;
  });

  // POST /v1/store/apps (Submit new app)
  app.post('/apps', async (request, reply) => {
    const schema = z.object({
      name: z.string(),
      developer_name: z.string(),
      category: z.string(),
      short_desc: z.string(),
      long_desc: z.string(),
      features: z.array(z.string()),
      permissions: z.array(z.string()),
      icon_url: z.string().optional(),
      webhook_url: z.string().optional(),
    });

    const body = schema.parse(request.body);
    // request.user carries `sub`, never `id` — the old `?.id` read was always
    // undefined, so every submission fell back to the all-zeros UUID and died
    // on the developer_id FK. API-key callers have a non-UUID sub
    // ("apikey:<id>"), which cannot own a marketplace listing.
    const userId = request.user?.sub;
    if (!userId || !UUID_RE.test(userId)) {
      return reply.status(400).send({ error: 'A marketplace app must be submitted by a signed-in user account.' });
    }

    const result = await sql<any>`
      INSERT INTO marketplace_apps 
        (name, developer_id, developer_name, category, short_desc, long_desc, features, permissions, icon_url, webhook_url, status)
      VALUES 
        (${body.name}, ${userId}, ${body.developer_name}, ${body.category}, ${body.short_desc}, ${body.long_desc}, ${JSON.stringify(body.features)}, ${JSON.stringify(body.permissions)}, ${body.icon_url || null}, ${body.webhook_url || null}, 'pending')
      RETURNING *
    `.execute(dbPlatform);

    return result.rows[0];
  });

  // PATCH /v1/store/admin/apps/:id/status (Approve/Reject app)
  app.patch('/admin/apps/:id/status', { preHandler: requireRole('SUPER_ADMIN') }, async (request, reply) => {
    const paramsSchema = z.object({ id: z.string() });
    const bodySchema = z.object({ status: z.enum(['approved', 'rejected']) });

    const { id } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);

    const result = await sql<any>`
      UPDATE marketplace_apps 
      SET status = ${status}, updated_at = NOW() 
      WHERE id = ${id} 
      RETURNING *
    `.execute(dbPlatform);

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'App not found' });
    }

    return result.rows[0];
  });
};
