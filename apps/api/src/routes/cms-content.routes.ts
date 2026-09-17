import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireEntitlement } from '../middleware/entitlement.js';
import { CMSContentService, FIELD_TYPES, ValidationError } from '../services/cms-content.service.js';
import { listRevisions, getRevision } from '../services/cms-revisions.service.js';
import { CMSCapabilitiesService } from '../services/cms-capabilities.service.js';
import { callAI } from './ai.routes.js';
import { withTenant } from '../db/client.js';
import type { CmsFieldType } from '@hudumika/types';

// §74 — same admin-equivalence list cms.routes.ts's own hook uses: TENANT_ADMIN
// is a live, still-issued legacy alias for ADMIN, never auto-normalized
// anywhere in this codebase.
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'] as const;
const isCmsAdmin = (role: string) => (CMS_ADMIN_ROLES as readonly string[]).includes(role);

// Object.keys() always widens to string[] even over a Record<CmsFieldType, …>
// — real pre-existing gap, not a hypothetical one: z.enum(FIELD_TYPE_KEYS)
// was inferring field_type as plain `string`, not CmsFieldType, so every
// caller downstream had to re-widen it. The cast here is sound (these really
// are exactly FIELD_TYPES' own keys at runtime), just narrower than
// Object.keys' own signature admits.
const FIELD_TYPE_KEYS = Object.keys(FIELD_TYPES) as [CmsFieldType, ...CmsFieldType[]];
const ENTRY_STATUSES = ['draft', 'published', 'scheduled', 'trash'] as const;

const modelCreateSchema = z.object({
  key: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  name_plural: z.string().trim().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(60).optional(),
});
const modelPatchSchema = modelCreateSchema.omit({ key: true }).partial();

const fieldCreateSchema = z.object({
  key: z.string().trim().max(60).optional(),
  label: z.string().trim().min(1).max(120),
  field_type: z.enum(FIELD_TYPE_KEYS),
  required: z.boolean().optional(),
  help_text: z.string().max(300).nullable().optional(),
  config: z.record(z.string(), z.any()).optional(),
  sort_order: z.number().optional(),
});
const fieldPatchSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  required: z.boolean().optional(),
  help_text: z.string().max(300).nullable().optional(),
  config: z.record(z.string(), z.any()).optional(),
  sort_order: z.number().optional(),
});

const entryCreateSchema = z.object({
  slug: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(300),
  status: z.enum(ENTRY_STATUSES).optional(),
  data: z.record(z.string(), z.any()).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
});
const entryPatchSchema = z.object({
  slug: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  status: z.enum(ENTRY_STATUSES).optional(),
  data: z.record(z.string(), z.any()).optional(),
  seo_description: z.string().max(500).nullable().optional(),
  publish_at: z.string().datetime().nullable().optional(),
});
const bulkSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });
const bulkStatusSchema = bulkSchema.extend({ status: z.enum(ENTRY_STATUSES) });

// §34 — `visibility` must be let through here too (real sanitizing happens
// in sanitizeBlock, not this zod gate), or a plain z.object() silently
// strips it before it ever reaches there.
const blockSchema = z.object({ id: z.string().optional(), type: z.string(), props: z.record(z.string(), z.any()).optional(), visibility: z.record(z.string(), z.any()).optional() });
const componentCreateSchema = z.object({
  key: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(120),
  blocks: z.array(blockSchema).max(200).optional(),
});
const componentPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  blocks: z.array(blockSchema).max(200).optional(),
});

const savedFilterCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  status: z.string().max(60).nullable().optional(),
  search: z.string().max(300).nullable().optional(),
});

function handleError(reply: any, err: any) {
  if (err instanceof ValidationError) return reply.status(400).send({ error: err.message });
  // HUD-0130: a plain Error ending in "not found." is this file's own
  // signal for a caller-supplied id that doesn't resolve to a real row —
  // a 404, not a validation problem. None of ValidationError's own messages
  // end this way (checked), so this can't misclassify a real input error.
  if (typeof err?.message === 'string' && err.message.endsWith('not found.')) {
    return reply.status(404).send({ error: err.message });
  }
  return reply.status(400).send({ error: err.message || 'Request failed' });
}

/**
 * The no-code Content Model Builder (§2 of the CMS master brief) — Products,
 * Employees, Events, anything Page/Post can't express, without a migration
 * per content type. Additive alongside cms.routes.ts's Page/Post/Media
 * routes, not a replacement (see migration 465's header comment).
 *
 * Registered at the same /v1/cms prefix as cms.routes.ts, but — same
 * HUD-0024 lesson that file's own comment documents — a sibling Fastify
 * plugin does NOT inherit another plugin's hooks even under one prefix, so
 * this file carries its own complete auth/entitlement/CUSTOMER-exclusion
 * gate rather than assuming cms.routes.ts's covers it.
 */
export async function cmsContentRoutes(fastify: FastifyInstance) {

  // ── Public: dynamic template routes — no auth, published-only ───────────
  // The literal "m" segment (not /public/:tenantSlug/:modelKey directly) is
  // deliberate: cms.routes.ts's own /public/:tenantSlug/:pageSlug already
  // occupies that exact single-dynamic-segment shape, and two param routes
  // at the same position are genuinely ambiguous to any router, not just
  // this one — a literal prefix is what actually disambiguates it, on both
  // this route and the matching frontend one (App.tsx).
  fastify.get('/public/:tenantSlug/m/:modelKey', async (request: any, reply) => {
    const { tenantSlug, modelKey } = request.params as { tenantSlug: string; modelKey: string };
    const resolved = await CMSContentService.getPublicModel(tenantSlug, modelKey);
    if (!resolved) return reply.status(404).send({ error: 'Not found.' });
    const entries = await CMSContentService.listPublicEntries(tenantSlug, modelKey);
    return { model: { key: resolved.model.key, name: resolved.model.name, name_plural: resolved.model.name_plural }, entries: entries ?? [] };
  });

  fastify.get('/public/:tenantSlug/m/:modelKey/:entrySlug', async (request: any, reply) => {
    const { tenantSlug, modelKey, entrySlug } = request.params as { tenantSlug: string; modelKey: string; entrySlug: string };
    const previewToken = (request.query as any)?.preview as string | undefined;
    const entry = await CMSContentService.getPublicEntry(tenantSlug, modelKey, entrySlug, previewToken);
    if (!entry) return reply.status(404).send({ error: 'Not found.' });
    return entry;
  });

  // ── Tenant (authenticated) routes ────────────────────────────────────────
  const TENANT_PREFIXES = ['/v1/cms/content-models', '/v1/cms/content-fields', '/v1/cms/content-entries', '/v1/cms/field-types', '/v1/cms/components', '/v1/cms/saved-filters', '/v1/cms/ai'];
  fastify.addHook('preHandler', async (request: any, reply) => {
    const url = request.raw.url as string | undefined;
    if (url && TENANT_PREFIXES.some(p => url.startsWith(p))) {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;
      await requireEntitlement('onesite')(request, reply);
      if (reply.sent) return;
      // Same HUD-0024/0027 rule cms.routes.ts's own tenant hook enforces:
      // a CUSTOMER-role portal account has no business editing (or even
      // listing) the tenant's own content models.
      if (request.user.role === 'CUSTOMER') {
        return reply.status(403).send({ error: 'Not available for this account type.' });
      }
      // §74 — same role-capability gate cms.routes.ts's own hook applies,
      // all five prefixes here map to the one 'content' area. ADMIN bypasses.
      if (!isCmsAdmin(request.user.role)) {
        const action = request.method === 'GET' ? 'view' : 'manage';
        const allowed = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'content', action);
        if (!allowed) return reply.status(403).send({ error: `Your role does not have ${action === 'view' ? 'access to' : 'permission to manage'} content in the CMS.` });
        const body = request.body as any;
        if (body && typeof body === 'object' && body.status === 'published') {
          const canPublish = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'content', 'publish');
          if (!canPublish) return reply.status(403).send({ error: 'Your role does not have permission to publish content.' });
        }
      }
    }
  });

  fastify.get('/field-types', async () => {
    return Object.entries(FIELD_TYPES).map(([type, meta]) => ({ type, label: meta.label }));
  });

  // ── Models ──────────────────────────────────────────────────────────────
  fastify.get('/content-models', async (request: any, reply) => {
    try { return await CMSContentService.listModels(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/content-models/:id', async (request: any, reply) => {
    try { return await CMSContentService.getModel(request.user.tenant_id, (request.params as any).id); }
    catch { return reply.status(404).send({ error: 'Model not found.' }); }
  });

  fastify.post('/content-models', async (request: any, reply) => {
    const body = modelCreateSchema.parse(request.body);
    try {
      const model = await CMSContentService.createModel(request.user.tenant_id, request.user.sub, body);
      reply.status(201);
      return model;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.patch('/content-models/:id', async (request: any, reply) => {
    const body = modelPatchSchema.parse(request.body);
    try { return await CMSContentService.updateModel(request.user.tenant_id, (request.params as any).id, body); }
    catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/content-models/:id', async (request: any, reply) => {
    try {
      await CMSContentService.deleteModel(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  // ── Fields ──────────────────────────────────────────────────────────────
  fastify.post('/content-models/:id/fields', async (request: any, reply) => {
    const body = fieldCreateSchema.parse(request.body);
    try {
      const field = await CMSContentService.createField(request.user.tenant_id, (request.params as any).id, body);
      reply.status(201);
      return field;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.patch('/content-fields/:id', async (request: any, reply) => {
    const body = fieldPatchSchema.parse(request.body);
    try { return await CMSContentService.updateField(request.user.tenant_id, (request.params as any).id, body); }
    catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/content-fields/:id', async (request: any, reply) => {
    try {
      await CMSContentService.deleteField(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  // ── Entries ─────────────────────────────────────────────────────────────
  fastify.get('/content-models/:id/entries', async (request: any, reply) => {
    const q = request.query as Record<string, string>;
    try {
      return await CMSContentService.listEntries(request.user.tenant_id, (request.params as any).id, {
        search: q.search, status: q.status,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
    } catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.post('/content-models/:id/entries', async (request: any, reply) => {
    const body = entryCreateSchema.parse(request.body);
    try {
      const entry = await CMSContentService.createEntry(request.user.tenant_id, request.user.sub, (request.params as any).id, body);
      reply.status(201);
      return entry;
    } catch (err: any) { return handleError(reply, err); }
  });

  // ── Saved filters (§4) ───────────────────────────────────────────────────
  fastify.get('/content-models/:id/saved-filters', async (request: any, reply) => {
    try { return await CMSContentService.listSavedFilters(request.user.tenant_id, (request.params as any).id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.post('/content-models/:id/saved-filters', async (request: any, reply) => {
    const body = savedFilterCreateSchema.parse(request.body);
    try {
      const filter = await CMSContentService.createSavedFilter(request.user.tenant_id, (request.params as any).id, request.user.sub, body);
      reply.status(201);
      return filter;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/saved-filters/:id', async (request: any, reply) => {
    try {
      await CMSContentService.deleteSavedFilter(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.get('/content-entries/:id', async (request: any, reply) => {
    try { return await CMSContentService.getEntry(request.user.tenant_id, (request.params as any).id); }
    catch { return reply.status(404).send({ error: 'Entry not found.' }); }
  });

  fastify.patch('/content-entries/:id', async (request: any, reply) => {
    const body = entryPatchSchema.parse(request.body);
    try { return await CMSContentService.updateEntry(request.user.tenant_id, (request.params as any).id, request.user.sub, body); }
    catch (err: any) { return handleError(reply, err); }
  });

  // ── Entries: revision history (§19) ────────────────────────────────────
  fastify.get('/content-entries/:id/revisions', async (request: any, reply) => {
    try { return await listRevisions(request.user.tenant_id, 'entry', (request.params as any).id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });
  fastify.post('/content-entries/:id/revisions/:revId/restore', async (request: any, reply) => {
    const { id, revId } = request.params as { id: string; revId: string };
    try {
      const rev = await getRevision(request.user.tenant_id, 'entry', id, revId);
      // §74 — same guard as cms.routes.ts's own page/post restore routes:
      // this endpoint never sends `status` in its own request body (the
      // generic capability hook above has nothing to inspect there), but a
      // restored snapshot can carry status:'published' on its own.
      if (!isCmsAdmin(request.user.role) && (rev.snapshot as any)?.status === 'published') {
        const canPublish = await CMSCapabilitiesService.can(request.user.tenant_id, request.user.role, 'content', 'publish');
        if (!canPublish) return reply.status(403).send({ error: 'Your role does not have permission to publish content.' });
      }
      return await CMSContentService.updateEntry(request.user.tenant_id, id, request.user.sub, rev.snapshot as any);
    } catch (err: any) { return handleError(reply, err); }
  });

  // §38 — same preview-link minting as Pages/Posts in cms.routes.ts.
  fastify.get('/content-entries/:id/preview-token', async (request: any, reply) => {
    try {
      return await CMSContentService.createEntryPreviewToken(request.user.tenant_id, (request.params as any).id);
    } catch (err: any) { return reply.status(404).send({ error: err.message }); }
  });

  fastify.delete('/content-entries/:id', async (request: any, reply) => {
    try {
      await CMSContentService.deleteEntry(request.user.tenant_id, (request.params as any).id, request.user.sub);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.post('/content-entries/bulk', async (request: any, reply) => {
    const body = bulkStatusSchema.parse(request.body);
    try {
      const results = await CMSContentService.bulkUpdateEntries(request.user.tenant_id, body.ids, body.status, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.post('/content-entries/bulk-delete', async (request: any, reply) => {
    const body = bulkSchema.parse(request.body);
    try {
      const results = await CMSContentService.bulkDeleteEntries(request.user.tenant_id, body.ids, request.user.sub);
      return { results, succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
    } catch (err: any) { return handleError(reply, err); }
  });

  // ── Components (§8) ───────────────────────────────────────────────────
  fastify.get('/components', async (request: any, reply) => {
    try { return await CMSContentService.listComponents(request.user.tenant_id); }
    catch (err: any) { return reply.status(500).send({ error: err.message }); }
  });

  fastify.get('/components/:id', async (request: any, reply) => {
    try { return await CMSContentService.getComponent(request.user.tenant_id, (request.params as any).id); }
    catch { return reply.status(404).send({ error: 'Component not found.' }); }
  });

  fastify.post('/components', async (request: any, reply) => {
    const body = componentCreateSchema.parse(request.body);
    try {
      const component = await CMSContentService.createComponent(request.user.tenant_id, request.user.sub, body as any);
      reply.status(201);
      return component;
    } catch (err: any) { return handleError(reply, err); }
  });

  fastify.patch('/components/:id', async (request: any, reply) => {
    const body = componentPatchSchema.parse(request.body);
    try { return await CMSContentService.updateComponent(request.user.tenant_id, (request.params as any).id, body as any); }
    catch (err: any) { return handleError(reply, err); }
  });

  fastify.delete('/components/:id', async (request: any, reply) => {
    try {
      await CMSContentService.deleteComponent(request.user.tenant_id, (request.params as any).id);
      return { ok: true };
    } catch (err: any) { return handleError(reply, err); }
  });

  // ── AI writing assist (§50) ─────────────────────────────────────────────
  // POST /v1/cms/ai/rewrite — the "rewrite" sub-feature of §50. Lives here,
  // not cms.routes.ts, because its only real caller — BlockEditor.tsx's
  // TextFormatToolbar — is only ever mounted from Content-entry and
  // Component editing (both in this file); Pages/Posts still edit through
  // RichTextEditor's one HTML blob, per §5's own fork, so they have no
  // paragraph/quote block to rewrite. Same BYO-key pattern as cms.routes.ts's
  // own summarize-seo/suggest-tags routes — a plain-text call, so it works
  // with whichever provider the tenant configured, not Anthropic-only.
  fastify.post('/ai/rewrite', async (request: any, reply) => {
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(request.body);
    const settings = await withTenant(request.user.tenant_id, async (trx) => {
      const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', request.user.tenant_id).executeTakeFirst();
      return row?.settings as any ?? {};
    });
    const aiCfg = settings['int-ai'] ?? {};
    if (!aiCfg.on || !aiCfg.apiKey) {
      return reply.status(400).send({ error: 'AI is not configured. Enable it in Settings > Integrations > AI Integration.' });
    }
    try {
      const raw = await callAI(aiCfg.apiKey, aiCfg.model || 'claude-sonnet-4-6', aiCfg.provider || 'anthropic',
        [{ role: 'user', content: `Rewrite the following text so it reads more clearly and polished, keeping the same meaning and roughly the same length. Respond with ONLY the rewritten text — no preamble, no quotes, no markdown.\n\n${text}` }],
        1024, 0.4);
      const result = raw.trim().replace(/^["']|["']$/g, '');
      if (!result) return reply.status(500).send({ error: 'AI returned an empty response — try again.' });
      return { result };
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }
  });
}
