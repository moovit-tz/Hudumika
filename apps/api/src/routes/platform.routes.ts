import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbPlatform } from '../db/client.js';
import { requireRole } from '../middleware/rbac.js';
import { sql } from 'kysely';

const GLOBAL_TENANT_ID = '00000000-0000-0000-0000-000000000000';

// Each of these settings blobs is a genuinely dynamic, deeply-nested shape
// (branding per app, arbitrary design tokens, SEO tags, a workspace list) —
// SUPER_ADMIN-only already gates every write below, so these schemas exist
// to guarantee the body is really an object/array before it's spread or
// iterated, not to police individual field shapes.
const brandingPatchSchema = z.record(z.string(), z.any());
const designTokensPatchSchema = z.record(z.string(), z.any());
const seoPatchSchema = z.record(z.string(), z.any());
const workspacesPatchSchema = z.array(z.record(z.string(), z.any()));
const stirlingPdfPatchSchema = z.object({
  baseUrl: z.string().optional(),
});
const designSystemVersionPatchSchema = z.object({
  version: z.enum(['v1', 'v2', 'v3']).optional(),
  v2Color: z.string().optional(),
});

/**
 * Platform-wide branding — one look per app, set by a SuperAdmin, visible to
 * every tenant. Stored under a 'branding' key on the GLOBAL_TENANT_ID row of
 * tenant_settings (the same sentinel-row pattern used by /v1/superadmin/settings).
 */
export async function platformRoutes(fastify: FastifyInstance) {
  // GET is public — even the pre-login screen needs the platform logo/name.
  fastify.get('/branding', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings.branding || {};
  });

  fastify.put('/branding', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = brandingPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
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

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return mergedBranding;
  });

  // ── Design tokens — platform-wide, SuperAdmin-controlled design system.
  // Same sentinel-row pattern as branding above, stored under a sibling
  // 'design-tokens' key so the two never clobber each other (the settings
  // || jsonb merge below is per top-level key).
  fastify.get('/design-tokens', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings['design-tokens'] || {};
  });

  fastify.put('/design-tokens', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = designTokensPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingTokens = existing['design-tokens'] || {};

    const mergedTokens = { ...existingTokens, ...body };
    const patch = JSON.stringify({ 'design-tokens': mergedTokens });

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return mergedTokens;
  });

  // ── Design system version — v1 (today's flexible per-app/per-tenant
  // theming, unchanged) vs v2 (one fixed brand color platform-wide, no
  // per-app or per-tenant variation) vs v3 (reserved for a future version,
  // not yet built). Deliberately its own key rather than folded into
  // design-tokens: switching versions must never touch — and switching back
  // to v1 must exactly restore — whatever theme/branding data was already
  // saved there. Same sentinel-row pattern as branding/design-tokens above.
  // GET is public: every page (including pre-login) needs to know which
  // version is active to render the right brand color.
  fastify.get('/design-system-version', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings['design-system-version'] || { version: 'v1', v2Color: '#141e33' };
  });

  fastify.put('/design-system-version', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = designSystemVersionPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingVersion = existing['design-system-version'] || { version: 'v1', v2Color: '#141e33' };

    const merged = { ...existingVersion, ...body };
    const patch = JSON.stringify({ 'design-system-version': merged });

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return merged;
  });

  // ── Stirling-PDF (self-hosted PDF toolkit, github.com/Stirling-Tools/
  // Stirling-PDF) base URL — one platform-wide endpoint, not per-tenant.
  // GET only requires a login, not SUPER_ADMIN: StirlingPdfTools.tsx calls
  // this for any authenticated user who opens "PDF Tools" in the eSign
  // editor, to learn whether the feature is configured at all and, if so,
  // to show the connected endpoint — the same "needed client-side just to
  // render the panel" reasoning nutrient-license's own GET used to document
  // before Nutrient was removed in favor of this. Only PUT (actually
  // changing the endpoint) is SuperAdmin-only. Same sentinel-row pattern as
  // design-system-version above.
  fastify.get('/stirling-pdf', { preHandler: fastify.authenticate }, async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings['stirling-pdf'] || { baseUrl: null };
  });

  fastify.put('/stirling-pdf', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = stirlingPdfPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingConfig = existing['stirling-pdf'] || { baseUrl: null };

    const merged = { ...existingConfig, ...body };
    const patch = JSON.stringify({ 'stirling-pdf': merged });

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return merged;
  });

  // Same sentinel-row pattern as branding/design-tokens above, stored under a
  // sibling 'seo' key. GET is public — tracking tags and verification meta
  // tags must render on pre-login pages (/signup, /track/shared/:token) too.
  fastify.get('/seo', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings.seo || {};
  });

  // Writes execute arbitrary script platform-wide via customHeadScripts/
  // customBodyScripts by design (that's the point of a tag-manager feature) —
  // SUPER_ADMIN-only must never be loosened to a tenant/company-admin role.
  fastify.put('/seo', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = seoPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const existing = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    const existingSeo = existing.seo || {};

    const mergedSeo = { ...existingSeo, ...body };
    const patch = JSON.stringify({ seo: mergedSeo });

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return mergedSeo;
  });

  // ── Workspaces — platform-wide application list
  fastify.get('/workspaces', async (request, reply) => {
    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return settings['workspaces'] || [];
  });

  fastify.put('/workspaces', {
    preHandler: [fastify.authenticate, requireRole('SUPER_ADMIN')],
  }, async (request, reply) => {
    const body = workspacesPatchSchema.parse(request.body);

    const row = await dbPlatform.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', GLOBAL_TENANT_ID)
      .executeTakeFirst();
    
    // We just overwrite the existing array with the new one
    const patch = JSON.stringify({ 'workspaces': body });

    const exists = await dbPlatform.selectFrom('tenant_settings').select('id').where('tenant_id', '=', GLOBAL_TENANT_ID).executeTakeFirst();
    if (exists) {
      await sql`UPDATE tenant_settings SET settings = settings || ${patch}::jsonb, updated_at = NOW() WHERE tenant_id = ${GLOBAL_TENANT_ID}`.execute(dbPlatform);
    } else {
      await dbPlatform.insertInto('tenant_settings').values({ tenant_id: GLOBAL_TENANT_ID, settings: patch }).execute();
    }

    return body;
  });
}
