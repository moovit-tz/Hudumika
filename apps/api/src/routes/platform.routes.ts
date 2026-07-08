import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { sql } from 'kysely';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Platform-wide branding — one look per app, set by a SuperAdmin, visible to
 * every tenant. Stored under a 'branding' key on the GLOBAL_TENANT_ID row of
 * tenant_settings (the same sentinel-row pattern used by /v1/superadmin/settings).
 */
export async function platformRoutes(fastify: FastifyInstance) {
  // GET is public — even the pre-login screen needs the platform logo/name.
  fastify.get('/branding', async (request, reply) => {
    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings.branding || {};
  });

  fastify.put('/branding', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = request.body as Record<string, any>;

    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingBranding = existing.branding || {};

    // `apps` is a per-appId map of per-app config — merge two levels deep so
    // saving one app's fields doesn't wipe other apps, or other fields on the same app.
    const mergedApps: Record<string, any> = { ...(existingBranding.apps || {}) };
    for (const [appId, cfg] of Object.entries(body.apps || {})) {
      mergedApps[appId] = { ...(mergedApps[appId] || {}), ...(cfg as object) };
    }
    const mergedBranding = { ...existingBranding, ...body, apps: mergedApps };
    const patch = JSON.stringify({ branding: mergedBranding });

    const exists = await db.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(db);
    } else {
      await db.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return mergedBranding;
  });

  // ── Design tokens — platform-wide, SuperAdmin-controlled design system.
  // Same sentinel-row pattern as branding above, stored under a sibling
  // 'design-tokens' key so the two never clobber each other (the settings
  // || jsonb merge below is per top-level key).
  fastify.get('/design-tokens', async (request, reply) => {
    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings['design-tokens'] || {};
  });

  fastify.put('/design-tokens', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = request.body as Record<string, any>;

    const row = await db.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingTokens = existing['design-tokens'] || {};

    const mergedTokens = { ...existingTokens, ...body };
    const patch = JSON.stringify({ 'design-tokens': mergedTokens });

    const exists = await db.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(db);
    } else {
      await db.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return mergedTokens;
  });
}
