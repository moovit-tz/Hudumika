import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import {
  installApp, configureApp, activateApp, updateAppVersion, disableApp, uninstallApp,
  listLifecycleHistory, submitAppVersion, reviewAppVersion, MarketplaceError,
} from '../services/marketplace-lifecycle.service.js';

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

  // HUD-0024 continuation: neither route below had a role check — any
  // authenticated user, CUSTOMER included, could install/uninstall a
  // marketplace app for the whole tenant. Same MGMT convention addons.
  // routes.ts already uses for "browse freely, but only these roles change
  // what the tenant actually has."
  const STORE_MGMT_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'] as const;

  // POST /v1/store/installed { app_id } -> mark an app installed for this tenant
  app.post('/installed', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { app_id } = z.object({ app_id: z.string() }).parse(request.body);
    const result = await installApp(user.tenant_id, app_id, UUID_RE.test(user.sub) ? user.sub : null);
    reply.status(201);
    return result;
  });

  // POST /v1/store/installed/:appId/configure { config } -> set tenant-specific config
  app.post('/installed/:appId/configure', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    const { config } = z.object({ config: z.record(z.string(), z.any()) }).parse(request.body);
    return configureApp(user.tenant_id, appId, user.sub, config);
  });

  // POST /v1/store/installed/:appId/activate -> go live (requires required config, if any, to be set)
  app.post('/installed/:appId/activate', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    return activateApp(user.tenant_id, appId, user.sub);
  });

  // POST /v1/store/installed/:appId/update -> move onto the app's current approved version
  app.post('/installed/:appId/update', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    return updateAppVersion(user.tenant_id, appId, user.sub);
  });

  // POST /v1/store/installed/:appId/disable -> stop live access, reversible (also cuts webhook delivery)
  app.post('/installed/:appId/disable', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
    return disableApp(user.tenant_id, appId, user.sub, reason);
  });

  // GET /v1/store/installed/:appId/history -> preserved lifecycle audit trail
  app.get('/installed/:appId/history', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    return listLifecycleHistory(user.tenant_id, appId);
  });

  // DELETE /v1/store/installed/:appId -> uninstall for this tenant. Terminal:
  // also revokes the separate Integrations webhook grant (tenant_marketplace_
  // installs) — previously this route only touched store_installed_apps, so
  // an "uninstalled" app with a live Integrations grant kept receiving
  // webhooks regardless (see migration 726's own note).
  app.delete('/installed/:appId', { preHandler: requireRole(...STORE_MGMT_ROLES) }, async (request, reply) => {
    const user = request.user;
    const { appId } = request.params as { appId: string };
    await uninstallApp(user.tenant_id, appId, user.sub);
    reply.status(204);
    return null;
  });

  // POST /v1/store/apps/:id/versions { version, manifest } -> submit a new manifest version for review
  app.post('/apps/:id/versions', { preHandler: async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') return reply.status(403).send({ error: 'Not available for this account type.' });
  } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({
      version: z.string().trim().min(1).max(50),
      manifest: z.object({
        compatibility: z.object({ platform_min_version: z.string().optional() }).optional(),
        dependencies: z.array(z.string()).optional(),
        permissions: z.array(z.string()).optional(),
        config_schema: z.object({ fields: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['string', 'number', 'boolean']), required: z.boolean() })) }).optional(),
        events_declared: z.array(z.string()).optional(),
        api_scopes: z.array(z.string()).optional(),
        financial_contract: z.object({ touches_money: z.boolean(), description: z.string().nullable().optional() }).optional(),
        privacy_declaration: z.string().nullable().optional(),
      }),
    });
    const body = schema.parse(request.body);
    const userId = request.user?.sub;
    if (!userId || !UUID_RE.test(userId)) return reply.status(400).send({ error: 'A module version must be submitted by a signed-in user account.' });
    reply.status(201);
    return submitAppVersion(id, userId, body.version, body.manifest);
  });

  // PATCH /v1/store/admin/versions/:versionId { decision, reason? } -> review a submitted manifest version
  app.patch('/admin/versions/:versionId', { preHandler: requireRole('SUPER_ADMIN') }, async (request) => {
    const { versionId } = request.params as { versionId: string };
    const { decision, reason } = z.object({ decision: z.enum(['approved', 'rejected']), reason: z.string().max(1000).optional() }).parse(request.body);
    return reviewAppVersion(versionId, request.user.sub, decision, reason);
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
  // HUD-0070: the only mutating route in this file the earlier CUSTOMER-block
  // pass (see STORE_MGMT_ROLES above) missed — a CUSTOMER-portal account of
  // any tenant could submit a listing straight into the platform-wide
  // marketplace review queue, live-confirmed. This isn't a tenant-isolation
  // leak (marketplace_apps is genuinely platform-level, and nothing reaches
  // a real user until a SUPER_ADMIN approves it), but a tenant's own
  // customer-portal account has no business acting as a marketplace
  // developer — same convention as every other CUSTOMER-block in this file.
  app.post('/apps', { preHandler: async (request: any, reply) => {
    if (request.user.role === 'CUSTOMER') {
      return reply.status(403).send({ error: 'Not available for this account type.' });
    }
  } }, async (request, reply) => {
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
