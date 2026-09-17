// CMS regression suite (§80-81 of the "Build Hudumika CMS" master brief).
// Every check here started life as a one-off scratch script run by hand
// during this session's series of CMS passes (Trash/Retention, Navigation,
// Search, Blog extras, Autosave, SEO extras, Webhooks, Audit logs) and was
// then thrown away — this file is those checks converted into a permanent
// suite so the same regressions get caught automatically instead of only
// when someone happens to re-verify by hand. Real HTTP through the actual
// app (fastify.inject), a real Postgres tenant, RLS genuinely enforced.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { randomUUID } from 'crypto';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('CMS — pages, posts, search, autosave, SEO extras, webhooks, audit trail', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => {
    await A.cleanup();
    await B.cleanup();
  });

  it('cms_webhooks has RLS enabled + FORCEd + a tenant_isolation_policy', async () => {
    const rows = await sql<{ relname: string; rls: boolean; forced: boolean; pols: string }>`
      SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation_policy') AS pols
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'cms_webhooks'
    `.execute(dbPlatform);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].rls).toBe(true);
    expect(rows.rows[0].forced).toBe(true);
    expect(Number(rows.rows[0].pols)).toBe(1);
  });

  let pageId: string;

  it('creates a published page, rejects a non-http(s) canonical URL', async () => {
    const app = await getApp();
    const bad = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'reg-page', title: 'Regression Page', content: '<p>hi</p>', canonical_url: 'not-a-url' } });
    expect(bad.statusCode).toBe(400);

    const res = await app.inject({
      method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token),
      payload: { slug: 'reg-page', title: 'Regression Page', content: '<p>hi</p>', status: 'published', canonical_url: 'https://example.com/reg-page', noindex: true, og_image: 'https://example.com/og.png' },
    });
    expect(res.statusCode).toBeLessThan(300);
    const page = res.json();
    expect(page.canonical_url).toBe('https://example.com/reg-page');
    expect(page.noindex).toBe(true);
    pageId = page.id;
  });

  it('page.created and page.published are both recorded, with the real actor', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/activity/page/${pageId}`, headers: authHeaders(A.token) });
    expect(res.statusCode).toBe(200);
    const events = res.json();
    expect(events.some((e: any) => e.event_type === 'page.created')).toBe(true);
    expect(events.some((e: any) => e.event_type === 'page.published')).toBe(true);
    expect(events.every((e: any) => e.actor_id === A.userId)).toBe(true);
  });

  it('an autosave-shaped PATCH (no status field) persists content but emits no new domain event', async () => {
    const app = await getApp();
    const before = await app.inject({ method: 'GET', url: `/v1/activity/page/${pageId}`, headers: authHeaders(A.token) });
    const beforeCount = before.json().length;

    const patch = await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${pageId}`, headers: authHeaders(A.token), payload: { title: 'Regression Page Edited', content: '<p>edited</p>' } });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().status).toBe('published'); // untouched

    const after = await app.inject({ method: 'GET', url: `/v1/activity/page/${pageId}`, headers: authHeaders(A.token) });
    expect(after.json().length).toBe(beforeCount);
  });

  it('trashing then restoring a page records page.trashed then page.restored', async () => {
    const app = await getApp();
    await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${pageId}`, headers: authHeaders(A.token), payload: { status: 'trash' } });
    await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${pageId}`, headers: authHeaders(A.token), payload: { status: 'draft' } });
    const res = await app.inject({ method: 'GET', url: `/v1/activity/page/${pageId}`, headers: authHeaders(A.token) });
    const events = res.json();
    expect(events.some((e: any) => e.event_type === 'page.trashed')).toBe(true);
    expect(events.some((e: any) => e.event_type === 'page.restored')).toBe(true);
  });

  it("a real sitemap.xml excludes both a draft page and a noindex'd published one", async () => {
    const app = await getApp();
    // Repurpose the same page: publish + noindex it, plus create a second, plain draft.
    await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${pageId}`, headers: authHeaders(A.token), payload: { status: 'published', noindex: true } });
    await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'reg-draft', title: 'Regression Draft', content: '<p>draft</p>', status: 'draft' } });

    const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
    const sitemap = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/sitemap.xml` });
    expect(sitemap.statusCode).toBe(200);
    expect(sitemap.body).not.toContain('reg-page');
    expect(sitemap.body).not.toContain('reg-draft');
  });

  it('cross-tenant: tenant B cannot read or modify tenant A\'s page', async () => {
    const app = await getApp();
    const list = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: authHeaders(B.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().some((p: any) => p.id === pageId)).toBe(false);

    const patch = await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${pageId}`, headers: authHeaders(B.token), payload: { title: 'Hijacked' } });
    expect(patch.statusCode).not.toBe(200);
  });

  let postId: string;

  it('creates a post, finds it via real Postgres full-text search, hides drafts from search', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/v1/cms/posts', headers: authHeaders(A.token), payload: { title: 'Zanzibar shipping update', content: '<p>clove exports and dhow logistics</p>', status: 'published', category: 'Updates' } });
    expect(res.statusCode).toBeLessThan(300);
    postId = res.json().id;

    const draft = await app.inject({ method: 'POST', url: '/v1/cms/posts', headers: authHeaders(A.token), payload: { title: 'Zanzibar internal draft', content: '<p>not yet public</p>', status: 'draft', category: 'Updates' } });
    const draftId = draft.json().id;

    const search = await app.inject({ method: 'GET', url: '/v1/cms/posts?search=zanzibar', headers: authHeaders(A.token) });
    expect(search.statusCode).toBe(200);
    const found = search.json();
    expect(found.some((p: any) => p.id === postId)).toBe(true);

    const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
    const publicSearch = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/search?q=zanzibar` });
    expect(publicSearch.statusCode).toBe(200);
    const publicResults = publicSearch.json();
    expect(publicResults.some((r: any) => r.slug && found.find((p: any) => p.id === postId)?.slug === r.slug)).toBe(true);
    expect(publicResults.every((r: any) => r.title !== 'Zanzibar internal draft')).toBe(true);

    await app.inject({ method: 'POST', url: '/v1/cms/posts/bulk-delete', headers: authHeaders(A.token), payload: { ids: [draftId] } });
  });

  it('bulk-updating a post to trash records the transition with the real actor', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/v1/cms/posts/bulk', headers: authHeaders(A.token), payload: { ids: [postId], status: 'trash' } });
    expect(res.statusCode).toBe(200);
    const activity = await app.inject({ method: 'GET', url: `/v1/activity/post/${postId}`, headers: authHeaders(A.token) });
    const events = activity.json();
    const trashed = events.find((e: any) => e.event_type === 'post.trashed');
    expect(trashed).toBeTruthy();
    expect(trashed.actor_id).toBe(A.userId);
  });

  it('a webhook secret is returned once on create and never again on list', async () => {
    const app = await getApp();
    const create = await app.inject({ method: 'POST', url: '/v1/cms/webhooks', headers: authHeaders(A.token), payload: { url: 'https://example.invalid/hook', events: ['page.published'] } });
    expect(create.statusCode).toBeLessThan(300);
    const hook = create.json();
    expect(typeof hook.secret).toBe('string');
    expect(hook.secret.length).toBeGreaterThan(10);

    const list = await app.inject({ method: 'GET', url: '/v1/cms/webhooks', headers: authHeaders(A.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().every((h: any) => h.secret === undefined)).toBe(true);

    const del = await app.inject({ method: 'DELETE', url: `/v1/cms/webhooks/${hook.id}`, headers: authHeaders(A.token) });
    expect(del.statusCode).toBe(200);
  });

  it('a non-http(s) webhook URL is rejected', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'POST', url: '/v1/cms/webhooks', headers: authHeaders(A.token), payload: { url: 'not-a-url', events: ['page.published'] } });
    expect(res.statusCode).toBe(400);
  });

  it('CUSTOMER-role accounts are refused every tenant CMS route', async () => {
    const app = await getApp();
    const customer = await A.addUser('CUSTOMER');
    for (const path of ['/v1/cms/pages', '/v1/cms/posts', '/v1/cms/webhooks', '/v1/cms/nav-items', '/v1/cms/media']) {
      const res = await app.inject({ method: 'GET', url: path, headers: authHeaders(customer.token) });
      expect(res.statusCode, path).toBe(403);
    }
  });

  // §50 — the alt-text-generation route (POST /v1/cms/media/generate-alt-text)
  // fetches a tenant-supplied image URL server-side, which is exactly the
  // SSRF shape assertPublicHttpUrl exists to guard — these checks protect
  // that guard from ever silently regressing, not the (unverifiable in CI,
  // no real Anthropic key) vision call itself.
  describe('alt-text generation (§50)', () => {
    it('refuses when AI is not configured', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const res = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers: authHeaders(t.token), payload: { url: 'https://example.com/a.png' } });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/not configured/i);
      } finally { await t.cleanup(); }
    });

    it('refuses a non-Anthropic provider with a clear message', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        await dbPlatform.insertInto('tenant_settings')
          .values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'openai' } }) as any })
          .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'openai' } }) as any }))
          .execute();
        const res = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers: authHeaders(t.token), payload: { url: 'https://example.com/a.png' } });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/Anthropic/i);
      } finally { await t.cleanup(); }
    });

    it('blocks SSRF-shaped URLs (cloud metadata, localhost) even with AI configured', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        await dbPlatform.insertInto('tenant_settings')
          .values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'anthropic' } }) as any })
          .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'anthropic' } }) as any }))
          .execute();
        const headers = authHeaders(t.token);
        const metadata = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers, payload: { url: 'http://169.254.169.254/latest/meta-data/' } });
        expect(metadata.statusCode).toBe(400);
        const localhost = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers, payload: { url: 'http://localhost:3001/x' } });
        expect(localhost.statusCode).toBe(400);
        const badScheme = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers, payload: { url: 'ftp://example.com/a.png' } });
        expect(badScheme.statusCode).toBe(400);
      } finally { await t.cleanup(); }
    });

    it('rejects a non-image content-type before ever calling the model', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        await dbPlatform.insertInto('tenant_settings')
          .values({ tenant_id: t.tenantId, settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'anthropic' } }) as any })
          .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'int-ai': { on: true, apiKey: 'fake', provider: 'anthropic' } }) as any }))
          .execute();
        const res = await app.inject({ method: 'POST', url: '/v1/cms/media/generate-alt-text', headers: authHeaders(t.token), payload: { url: 'https://www.google.com/robots.txt' } });
        expect(res.statusCode).toBe(400);
      } finally { await t.cleanup(); }
    });
  });

  // §50 — the three remaining, genuinely unblocked writing-assist
  // sub-features ("rewrite," "summarize," "tagging" — "translate" stays
  // correctly blocked on §25-26's still-nonexistent locale field, untouched
  // here). Unlike alt-text these are plain-text calls, so both configured
  // providers are accepted, not Anthropic-only. No real AI key exists in
  // this environment (the same disclosed limitation the alt-text tests
  // above already carry), so these check the real pipeline up to the
  // external call boundary: a bad/missing config is rejected before ever
  // reaching it (400), while a syntactically valid config reaches the real
  // call and fails cleanly (500), not silently succeeding with garbage.
  describe('AI writing assist — rewrite, summarize, tagging (§50)', () => {
    async function setAiConfig(tenantId: string, cfg: Record<string, unknown>) {
      const settings = JSON.stringify({ 'int-ai': cfg }) as any;
      await dbPlatform.insertInto('tenant_settings')
        .values({ tenant_id: tenantId, settings })
        .onConflict(oc => oc.column('tenant_id').doUpdateSet({ settings }))
        .execute();
    }

    it('rejects when AI is not configured, validates input, and reaches the real call once configured', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      const authorization = authHeaders(t.token);
      try {
        const noCfg = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', headers: authorization, payload: { text: '<p>Hello world, a real blog post about logistics.</p>' } });
        expect(noCfg.statusCode).toBe(400);
        expect(noCfg.json().error).toMatch(/not configured/i);

        await setAiConfig(t.tenantId, { on: true, apiKey: 'fake', provider: 'anthropic' });

        const emptyText = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', headers: authorization, payload: { text: '' } });
        expect(emptyText.statusCode).toBe(400);

        const onlyMarkup = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', headers: authorization, payload: { text: '<img src="x.png"/><br/>' } });
        expect(onlyMarkup.statusCode).toBe(400);
        expect(onlyMarkup.json().error).toMatch(/text content/i);

        // A syntactically valid, HTML-bearing request reaches the real
        // external call (proving the sanitize-html strip + prompt build
        // succeeded) and fails there, not before — confirms the pipeline,
        // not the unverifiable-without-a-real-key model response itself.
        const realCall = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', headers: authorization, payload: { text: '<p>Hello <b>world</b>, a real blog post about East African freight logistics.</p>' } });
        expect(realCall.statusCode).toBe(500);
      } finally { await t.cleanup(); }
    });

    it('suggest-tags: rejects when unconfigured, rejects content with no real text, reaches the real call once configured', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      const authorization = authHeaders(t.token);
      try {
        const noCfg = await app.inject({ method: 'POST', url: '/v1/cms/ai/suggest-tags', headers: authorization, payload: { title: 'A post', text: '<p>Some content.</p>' } });
        expect(noCfg.statusCode).toBe(400);

        await setAiConfig(t.tenantId, { on: true, apiKey: 'fake', provider: 'openai' });
        const onlyMarkup = await app.inject({ method: 'POST', url: '/v1/cms/ai/suggest-tags', headers: authorization, payload: { text: '<img src="x.png"/>' } });
        expect(onlyMarkup.statusCode).toBe(400);

        // openai accepted (unlike alt-text's Anthropic-only vision restriction).
        const realCall = await app.inject({ method: 'POST', url: '/v1/cms/ai/suggest-tags', headers: authorization, payload: { title: 'Freight in East Africa', text: '<p>A real article about shipping and customs.</p>' } });
        expect(realCall.statusCode).toBe(500);
      } finally { await t.cleanup(); }
    });

    it('rewrite: validates length, rejects when unconfigured, reaches the real call once configured', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      const authorization = authHeaders(t.token);
      try {
        const noCfg = await app.inject({ method: 'POST', url: '/v1/cms/ai/rewrite', headers: authorization, payload: { text: 'A paragraph that needs rewriting.' } });
        expect(noCfg.statusCode).toBe(400);

        const tooLong = await app.inject({ method: 'POST', url: '/v1/cms/ai/rewrite', headers: authorization, payload: { text: 'a'.repeat(4001) } });
        expect(tooLong.statusCode).toBe(400);

        await setAiConfig(t.tenantId, { on: true, apiKey: 'fake', provider: 'anthropic' });
        const realCall = await app.inject({ method: 'POST', url: '/v1/cms/ai/rewrite', headers: authorization, payload: { text: 'A paragraph that needs rewriting for clarity.' } });
        expect(realCall.statusCode).toBe(500);
      } finally { await t.cleanup(); }
    });

    it('blocks a CUSTOMER-role account and an unauthenticated request on all three routes', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const customer = await t.addUser('CUSTOMER');
        const custAuth = authHeaders(customer.token);
        const custSeo = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', headers: custAuth, payload: { text: '<p>x</p>' } });
        expect(custSeo.statusCode).toBe(403);
        const custRewrite = await app.inject({ method: 'POST', url: '/v1/cms/ai/rewrite', headers: custAuth, payload: { text: 'x' } });
        expect(custRewrite.statusCode).toBe(403);

        const noAuthSeo = await app.inject({ method: 'POST', url: '/v1/cms/ai/summarize-seo', payload: { text: '<p>x</p>' } });
        expect(noAuthSeo.statusCode).toBe(401);
        const noAuthRewrite = await app.inject({ method: 'POST', url: '/v1/cms/ai/rewrite', payload: { text: 'x' } });
        expect(noAuthRewrite.statusCode).toBe(401);
      } finally { await t.cleanup(); }
    });
  });

  // §11 — a page's template is a real enum, not a placeholder column.
  it('a page template defaults to standard, accepts a real value, rejects a fake one', async () => {
    const app = await getApp();
    const bad = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'tmpl-bad', title: 'Bad', content: '<p>x</p>', template: 'not-real' } });
    expect(bad.statusCode).toBe(400);

    const withDefault = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'tmpl-default', title: 'Default', content: '<p>x</p>' } });
    expect(withDefault.json().template).toBe('standard');

    const withLanding = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'tmpl-landing', title: 'Landing', content: '<p>x</p>', status: 'published', template: 'landing' } });
    expect(withLanding.json().template).toBe('landing');
  });

  // §74 — role capabilities: additive to the existing binary gate, TENANT_ADMIN
  // treated the same as ADMIN throughout (a real, live legacy alias — see
  // user.ts's own UserRole comment — never auto-normalized in this codebase).
  describe('role capabilities (§74)', () => {
    it('an unconfigured role keeps full access — the exact behavior every tenant already had', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const manager = await t.addUser('MANAGER');
        const res = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: authHeaders(manager.token) });
        expect(res.statusCode).toBe(200);
      } finally { await t.cleanup(); }
    });

    it('only an ADMIN (or the TENANT_ADMIN alias) can configure capabilities', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const manager = await t.addUser('MANAGER');
        const asManager = await app.inject({ method: 'GET', url: '/v1/cms/capabilities', headers: authHeaders(manager.token) });
        expect(asManager.statusCode).toBe(403);
        const asAdmin = await app.inject({ method: 'GET', url: '/v1/cms/capabilities', headers: authHeaders(t.token) });
        expect(asAdmin.statusCode).toBe(200);
        expect(asAdmin.json().length).toBe(30); // 5 restrictable roles x 6 areas
      } finally { await t.cleanup(); }
    });

    it('a restricted role is refused, other roles and other areas stay unaffected, ADMIN always bypasses', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const manager = await t.addUser('MANAGER');
        const managerHeaders = authHeaders(manager.token);
        await app.inject({ method: 'PATCH', url: '/v1/cms/capabilities/MANAGER/pages', headers: authHeaders(t.token), payload: { can_view: false } });

        const restricted = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: managerHeaders });
        expect(restricted.statusCode).toBe(403);
        const otherArea = await app.inject({ method: 'GET', url: '/v1/cms/posts', headers: managerHeaders });
        expect(otherArea.statusCode).toBe(200);
        const adminBypass = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: authHeaders(t.token) });
        expect(adminBypass.statusCode).toBe(200);

        await app.inject({ method: 'DELETE', url: '/v1/cms/capabilities/MANAGER/pages', headers: authHeaders(t.token) });
        const afterReset = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: managerHeaders });
        expect(afterReset.statusCode).toBe(200);
      } finally { await t.cleanup(); }
    });

    it('publish is its own capability, separate from manage — and covers restoring a published-status revision', async () => {
      const app = await getApp();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const adminHeaders = { authorization: authHeaders(t.token).authorization };
        const manager = await t.addUser('MANAGER');
        const managerHeaders = { authorization: authHeaders(manager.token).authorization };
        await app.inject({ method: 'PATCH', url: '/v1/cms/capabilities/MANAGER/pages', headers: authHeaders(t.token), payload: { can_publish: false } });

        const create = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(manager.token), payload: { slug: 'pub-guard', title: 'Pub Guard', content: '<p>x</p>', status: 'draft' } });
        expect(create.statusCode).toBeLessThan(300); // manage still allowed
        const publish = await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${create.json().id}`, headers: authHeaders(manager.token), payload: { status: 'published' } });
        expect(publish.statusCode).toBe(403); // publish specifically refused

        // The restore route never sends `status` in its own body — a real
        // edge case found by self-review, not by the scratch script: a
        // restored snapshot can carry status:'published' on its own.
        await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${create.json().id}`, headers: authHeaders(t.token), payload: { status: 'published' } });
        await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${create.json().id}`, headers: authHeaders(t.token), payload: { status: 'draft' } });
        const revisions = await app.inject({ method: 'GET', url: `/v1/cms/pages/${create.json().id}/revisions`, headers: adminHeaders });
        const publishedRev = revisions.json().find((r: any) => r.snapshot?.status === 'published');
        expect(publishedRev).toBeTruthy();
        const restoreAttempt = await app.inject({ method: 'POST', url: `/v1/cms/pages/${create.json().id}/revisions/${publishedRev.id}/restore`, headers: managerHeaders });
        expect(restoreAttempt.statusCode).toBe(403);
      } finally { await t.cleanup(); }
    });
  });

  // §19 — bulk status changes now record a revision (previously only a
  // single-item save/restore did), and revisions are capped at a bounded
  // count so an actively-edited page's autosave ticks can't grow the table
  // without limit.
  it('a bulk status change records a revision, and revision history is capped rather than unbounded', async () => {
    const app = await getApp();
    const create = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: authHeaders(A.token), payload: { slug: 'rev-cap', title: 'Rev Cap', content: '<p>x</p>', status: 'draft' } });
    const id = create.json().id;

    const before = await app.inject({ method: 'GET', url: `/v1/cms/pages/${id}/revisions`, headers: authHeaders(A.token) });
    await app.inject({ method: 'POST', url: '/v1/cms/pages/bulk', headers: authHeaders(A.token), payload: { ids: [id], status: 'trash' } });
    const after = await app.inject({ method: 'GET', url: `/v1/cms/pages/${id}/revisions`, headers: authHeaders(A.token) });
    expect(after.json().length).toBe(before.json().length + 1);

    for (let i = 0; i < 55; i++) {
      await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${id}`, headers: authHeaders(A.token), payload: { title: `Rev Cap ${i}` } });
    }
    const capped = await app.inject({ method: 'GET', url: `/v1/cms/pages/${id}/revisions`, headers: authHeaders(A.token) });
    expect(capped.json().length).toBeLessThanOrEqual(50);
  });

  // §21-22 — folders/tags/thumbnails. The folder filter in particular
  // guards a real regression: an earlier version used `.where('folder',
  // '=', null)` for the "unfiled" bucket, which Postgres always evaluates
  // to false (NULL comparisons never equal) rather than IS NULL — caught
  // before shipping by this exact scratch check, kept here so it can't
  // silently come back.
  describe('media folders, tags and thumbnails (§21-22)', () => {
    const PNG_1PX_RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    async function uploadPng(app: any, authorization: string, filename: string) {
      const boundary = '----testBoundary';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
        PNG_1PX_RED,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return app.inject({ method: 'POST', url: '/v1/cms/media', headers: { authorization, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
    }

    it('generates a real thumbnail on upload and serves it', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const up = await uploadPng(app, authorization, 'thumb-test.png');
      expect(up.statusCode).toBeLessThan(300);
      const media = up.json();
      expect(media.thumbnail_url).toContain('/thumbnail');
      const thumb = await app.inject({ method: 'GET', url: media.thumbnail_url });
      expect(thumb.statusCode).toBe(200);
      expect(thumb.headers['content-type']).toBe('image/webp');
    });

    it('the unfiled folder filter is a real IS NULL, not a no-op "= NULL"', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const filed = (await uploadPng(app, authorization, 'filed.png')).json();
      const unfiled = (await uploadPng(app, authorization, 'unfiled.png')).json();
      await app.inject({ method: 'PATCH', url: `/v1/cms/media/${filed.id}`, headers: { authorization }, payload: { folder: 'RegressionCheck' } });

      const unfiledList = await app.inject({ method: 'GET', url: '/v1/cms/media?folder=', headers: { authorization } });
      const ids = unfiledList.json().map((m: any) => m.id);
      expect(ids).toContain(unfiled.id);
      expect(ids).not.toContain(filed.id);
    });

    it('a tag filter matches whole tags, not a substring of a different tag', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tagged = (await uploadPng(app, authorization, 'hero.png')).json();
      const decoy = (await uploadPng(app, authorization, 'heroic.png')).json();
      await app.inject({ method: 'PATCH', url: `/v1/cms/media/${tagged.id}`, headers: { authorization }, payload: { tags: 'hero' } });
      await app.inject({ method: 'PATCH', url: `/v1/cms/media/${decoy.id}`, headers: { authorization }, payload: { tags: 'heroic-tales' } });

      const res = await app.inject({ method: 'GET', url: '/v1/cms/media?tag=hero', headers: { authorization } });
      const ids = res.json().map((m: any) => m.id);
      expect(ids).toContain(tagged.id);
      expect(ids).not.toContain(decoy.id);
    });

    it('cross-tenant: another tenant cannot see or patch this tenant\'s media', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const owned = (await uploadPng(app, authorization, 'owned.png')).json();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const bAuth = authHeaders(t.token).authorization;
        const list = await app.inject({ method: 'GET', url: '/v1/cms/media', headers: { authorization: bAuth } });
        expect(list.json().some((m: any) => m.id === owned.id)).toBe(false);
        const patch = await app.inject({ method: 'PATCH', url: `/v1/cms/media/${owned.id}`, headers: { authorization: bAuth }, payload: { folder: 'Hijack' } });
        expect(patch.statusCode).not.toBe(200);
      } finally { await t.cleanup(); }
    });
  });

  // §38 — secure preview links for a draft/scheduled Page, Post or Content
  // entry. Same HMAC+timingSafeEqual shape as object-storage.ts's own
  // presignGet/verifyDiskSignedUrl, keyed to the exact resource row rather
  // than its slug. Live-verifying this surfaced a real, pre-existing bug
  // (unrelated to preview tokens): PageEditor stores a page's slug with a
  // leading '/' (its own "/about" placeholder + auto-slug convention), but
  // :pageSlug is a single URL segment that can never carry that slash, and
  // every existing link that points at a page already strips it first —
  // getPublicPage's exact-string match 404'd every published page whose
  // slug had the leading slash. Fixed alongside this feature (also fixed:
  // the sitemap and two OneSitePublic.tsx link sites that had the same gap).
  describe('preview tokens (§38)', () => {
    it('a draft page is hidden from the public route, visible with a valid token, and needs no token once published', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const create = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { title: 'Preview Page', slug: '/preview-page-38', content: '<p>secret</p>', status: 'draft' } });
      expect(create.statusCode).toBe(201);
      const page = create.json();

      const noToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-page-38` });
      expect(noToken.statusCode).toBe(404);

      const mint = await app.inject({ method: 'GET', url: `/v1/cms/pages/${page.id}/preview-token`, headers: { authorization } });
      expect(mint.statusCode).toBe(200);
      const { token } = mint.json();

      const withToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-page-38?preview=${encodeURIComponent(token)}` });
      expect(withToken.statusCode).toBe(200);
      expect(withToken.json().content).toContain('secret');

      const tampered = token.slice(0, -4) + 'dead';
      const withTampered = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-page-38?preview=${encodeURIComponent(tampered)}` });
      expect(withTampered.statusCode).toBe(404);

      await app.inject({ method: 'PATCH', url: `/v1/cms/pages/${page.id}`, headers: { authorization }, payload: { status: 'published' } });
      const afterPublish = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-page-38` });
      expect(afterPublish.statusCode).toBe(200);
    });

    it('a preview token only unlocks the exact resource it was minted for, even within the same tenant', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const pageA = (await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { title: 'A', slug: '/preview-a-38', content: '<p>a</p>', status: 'draft' } })).json();
      await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { title: 'C', slug: '/preview-c-38', content: '<p>c</p>', status: 'draft' } });
      const token = (await app.inject({ method: 'GET', url: `/v1/cms/pages/${pageA.id}/preview-token`, headers: { authorization } })).json().token;

      const wrongResource = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-c-38?preview=${encodeURIComponent(token)}` });
      expect(wrongResource.statusCode).toBe(404);
    });

    it('another tenant cannot mint a token for this tenant\'s page, and this tenant\'s token does not unlock another tenant\'s draft', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const pageA = (await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { title: 'Cross', slug: '/preview-cross-38', content: '<p>x</p>', status: 'draft' } })).json();

      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const bAuth = authHeaders(t.token).authorization;
        const crossMint = await app.inject({ method: 'GET', url: `/v1/cms/pages/${pageA.id}/preview-token`, headers: { authorization: bAuth } });
        expect(crossMint.statusCode).toBe(404);

        const pageB = (await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization: bAuth }, payload: { title: 'B', slug: '/preview-b-38', content: '<p>b</p>', status: 'draft' } })).json();
        const tokenB = (await app.inject({ method: 'GET', url: `/v1/cms/pages/${pageB.id}/preview-token`, headers: { authorization: bAuth } })).json().token;
        const crossUnlock = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/pages/preview-cross-38?preview=${encodeURIComponent(tokenB)}` });
        expect(crossUnlock.statusCode).toBe(404);
      } finally { await t.cleanup(); }
    });

    it('draft posts and content entries also gate on the same preview token, and are hidden without one', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();

      const post = (await app.inject({ method: 'POST', url: '/v1/cms/posts', headers: { authorization }, payload: { title: 'Preview Post', slug: 'preview-post-38', content: '<p>post secret</p>', status: 'draft' } })).json();
      const postNoToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/posts/preview-post-38` });
      expect(postNoToken.statusCode).toBe(404);
      const postToken = (await app.inject({ method: 'GET', url: `/v1/cms/posts/${post.id}/preview-token`, headers: { authorization } })).json().token;
      const postWithToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/posts/preview-post-38?preview=${encodeURIComponent(postToken)}` });
      expect(postWithToken.statusCode).toBe(200);

      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'preview_model_38', name: 'Preview Model', name_plural: 'Preview Models' } })).json();
      const entry = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Preview Entry', slug: 'preview-entry-38', status: 'draft', data: {} } })).json();
      const entryNoToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/m/preview_model_38/preview-entry-38` });
      expect(entryNoToken.statusCode).toBe(404);
      const entryToken = (await app.inject({ method: 'GET', url: `/v1/cms/content-entries/${entry.id}/preview-token`, headers: { authorization } })).json().token;
      const entryWithToken = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/m/preview_model_38/preview-entry-38?preview=${encodeURIComponent(entryToken)}` });
      expect(entryWithToken.statusCode).toBe(200);
    });
  });

  // §8 — a placed component's own per-instance overrides (a "swappable
  // headline" per placement, the exact gap this row's own map text named).
  // The merge itself — replacing a slotted block's text at render time — is
  // a frontend concern (BlockPreview.tsx's applyComponentOverrides, its own
  // pure-function scratch check run separately, not backend-testable via
  // fastify.inject since these routes never render HTML); what belongs here
  // is the part that IS backend surface: a slot name persists on a
  // component definition's block, an override map persists on a placement,
  // both are capped rather than rejected when oversized, and the public
  // route still resolves the referenced component's raw blocks alongside
  // the placement's own overrides untouched.
  describe('component variants — slot overrides (§8)', () => {
    it('a slot name on a definition block and an override map on a placement both persist, are capped not rejected, and round-trip through the public route', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();

      const comp = (await app.inject({
        method: 'POST', url: '/v1/cms/components', headers: { authorization },
        payload: { key: 'cta-banner-v8', name: 'CTA Banner', blocks: [
          { type: 'heading', props: { text: 'Default Headline', level: 2, slot: 'headline' } },
          { type: 'paragraph', props: { text: 'Untagged body copy.' } },
        ] },
      })).json();
      expect(comp.blocks.find((b: any) => b.type === 'heading').props.slot).toBe('headline');
      expect('slot' in comp.blocks.find((b: any) => b.type === 'paragraph').props).toBe(false);

      // An overlong slot name is capped (60 chars), never a save-time error.
      const capComp = (await app.inject({
        method: 'POST', url: '/v1/cms/components', headers: { authorization },
        payload: { key: 'cap-test-v8', name: 'Cap Test', blocks: [{ type: 'heading', props: { text: 'X', slot: 'x'.repeat(200) } }] },
      })).json();
      expect(capComp.blocks[0].props.slot.length).toBe(60);

      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'variant_model_v8', name: 'Variant Model', name_plural: 'Variant Models' } })).json();
      await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Body', field_type: 'blocks' } });
      const bodyField = (await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}`, headers: { authorization } })).json().fields.find((f: any) => f.field_type === 'blocks');

      const entry = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Placement A', slug: 'placement-a-v8', status: 'published', data: { [bodyField.key]: [{ type: 'component', props: { componentId: comp.id, overrides: { headline: 'Placement A Headline' } } }] } },
      });
      expect(entry.statusCode).toBe(201);
      expect(entry.json().data[bodyField.key][0].props.overrides.headline).toBe('Placement A Headline');

      // An oversized overrides map is capped at 30 keys, not rejected.
      const manyOverrides: Record<string, string> = {};
      for (let i = 0; i < 40; i++) manyOverrides[`slot_${i}`] = `v${i}`;
      const cappedEntry = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Capped', slug: 'placement-capped-v8', status: 'draft', data: { [bodyField.key]: [{ type: 'component', props: { componentId: comp.id, overrides: manyOverrides } }] } },
      });
      expect(Object.keys(cappedEntry.json().data[bodyField.key][0].props.overrides).length).toBe(30);

      const pubEntry = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/m/variant_model_v8/placement-a-v8` });
      expect(pubEntry.statusCode).toBe(200);
      const pubJson = pubEntry.json();
      expect(pubJson.components?.[comp.id]).toBeTruthy();
      expect(pubJson.data[bodyField.key][0].props.overrides.headline).toBe('Placement A Headline');
    });
  });

  // §2 — relation fields as a real, enforced foreign key rather than a
  // hand-typed slug with no existence guarantee. A relation field's own
  // targetModelId is checked at field-creation (and field-update) time, and
  // every entry save re-checks that its relation value is a real entry id
  // belonging to that exact target model and tenant — a fabricated id, an
  // id from the wrong model, and an id from a different tenant are all
  // rejected the same way a bad `select` value already was.
  describe('relation fields as an enforced foreign key (§2)', () => {
    it('a relation field must name a real target model, and every entry save re-checks its value against that exact model and tenant', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);

      const authorModel = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'author_model_v2b', name: 'Author', name_plural: 'Authors' } })).json();
      const articleModel = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'article_model_v2b', name: 'Article', name_plural: 'Articles' } })).json();

      const noTarget = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/fields`, headers: { authorization }, payload: { label: 'Author', field_type: 'relation', config: {} } });
      expect(noTarget.statusCode).toBe(400);

      const badTarget = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/fields`, headers: { authorization }, payload: { label: 'Author', field_type: 'relation', config: { targetModelId: '00000000-0000-0000-0000-000000000000' } } });
      expect(badTarget.statusCode).toBe(400);

      const relField = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/fields`, headers: { authorization }, payload: { label: 'Author', field_type: 'relation', config: { targetModelId: authorModel.id } } });
      expect(relField.statusCode).toBe(201);
      const field = relField.json();
      expect(field.config.targetModelId).toBe(authorModel.id);

      const realAuthor = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${authorModel.id}/entries`, headers: { authorization }, payload: { title: 'Jane Doe', status: 'published' } })).json();

      const fakeRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/entries`, headers: { authorization }, payload: { title: 'Bad', status: 'draft', data: { [field.key]: '00000000-0000-0000-0000-000000000000' } } });
      expect(fakeRef.statusCode).toBe(400);

      const otherModel = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'other_model_v2b', name: 'Other', name_plural: 'Others' } })).json();
      const otherEntry = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${otherModel.id}/entries`, headers: { authorization }, payload: { title: 'Wrong Model', status: 'published' } })).json();
      const wrongModelRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/entries`, headers: { authorization }, payload: { title: 'Cross Model', status: 'draft', data: { [field.key]: otherEntry.id } } });
      expect(wrongModelRef.statusCode).toBe(400);

      const goodRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/entries`, headers: { authorization }, payload: { title: 'Good', status: 'published', data: { [field.key]: realAuthor.id } } });
      expect(goodRef.statusCode).toBe(201);
      expect(goodRef.json().data[field.key]).toBe(realAuthor.id);

      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const bAuth = authHeaders(t.token).authorization;
        const bAuthorModel = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization: bAuth }, payload: { key: 'author_model_v2b', name: 'Author', name_plural: 'Authors' } })).json();
        const bAuthorEntry = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${bAuthorModel.id}/entries`, headers: { authorization: bAuth }, payload: { title: 'Tenant B Author', status: 'published' } })).json();
        const crossTenantRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${articleModel.id}/entries`, headers: { authorization }, payload: { title: 'Cross Tenant', status: 'draft', data: { [field.key]: bAuthorEntry.id } } });
        expect(crossTenantRef.statusCode).toBe(400);
      } finally { await t.cleanup(); }
    });
  });

  // §4 — saved filters: a named status+search combination, shared
  // tenant-wide per model (no per-user CMS preference surface exists
  // anywhere else in this codebase to hang a private version off).
  describe('saved filters (§4)', () => {
    it('save, list, delete, and cross-tenant isolation on a Content Manager saved filter', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'saved_filter_model_v4b', name: 'Widget', name_plural: 'Widgets' } })).json();

      const empty = await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization } });
      expect(empty.json()).toEqual([]);

      const created = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization }, payload: { name: 'My drafts', status: 'draft', search: null } });
      expect(created.statusCode).toBe(201);
      const f = created.json();
      expect(f.status).toBe('draft');
      expect(f.search).toBeNull();

      const blankName = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization }, payload: { name: '   ' } });
      expect(blankName.statusCode).toBe(400);

      const del = await app.inject({ method: 'DELETE', url: `/v1/cms/saved-filters/${f.id}`, headers: { authorization } });
      expect(del.statusCode).toBe(200);
      const afterDelete = await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization } });
      expect(afterDelete.json()).toEqual([]);

      const created2 = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization }, payload: { name: 'Sale items', search: 'sale' } })).json();
      const t = await createTestTenant('TENANT_ADMIN');
      try {
        const bAuth = authHeaders(t.token).authorization;
        const bList = await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization: bAuth } });
        expect(bList.json()).toEqual([]);
        await app.inject({ method: 'DELETE', url: `/v1/cms/saved-filters/${created2.id}`, headers: { authorization: bAuth } });
        const stillThere = await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}/saved-filters`, headers: { authorization } });
        expect(stillThere.json().some((x: any) => x.id === created2.id)).toBe(true);
      } finally { await t.cleanup(); }
    });
  });

  // §2 — two more field types from the brief's own list: coordinates
  // (a real {lat,lng} pair, range-validated, not two loose number fields)
  // and color (a hex string). Both genuinely validated server-side, not
  // just accepted as opaque JSON.
  describe('coordinates + color field types (§2)', () => {
    it('validates coordinate ranges, rejects a bad hex color, and treats an untouched {lat:"",lng:""} as empty rather than Null Island', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'geo_model_v2d', name: 'Store', name_plural: 'Stores' } })).json();

      const types = (await app.inject({ method: 'GET', url: '/v1/cms/field-types', headers: { authorization } })).json();
      expect(types.some((t: any) => t.type === 'coordinates')).toBe(true);
      expect(types.some((t: any) => t.type === 'color')).toBe(true);

      const coordField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Location', field_type: 'coordinates' } })).json();
      const colorField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Brand Color', field_type: 'color' } })).json();

      const good = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Good', status: 'published', data: { [coordField.key]: { lat: -6.7924, lng: 39.2083 }, [colorField.key]: '#4F46E5' } } });
      expect(good.statusCode).toBe(201);
      expect(good.json().data[coordField.key]).toEqual({ lat: -6.7924, lng: 39.2083 });
      expect(good.json().data[colorField.key]).toBe('#4F46E5');

      const badLat = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Bad Lat', status: 'draft', data: { [coordField.key]: { lat: 200, lng: 0 } } } });
      expect(badLat.statusCode).toBe(400);

      const badColor = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Bad Color', status: 'draft', data: { [colorField.key]: 'not-a-color' } } });
      expect(badColor.statusCode).toBe(400);

      const halfFilled = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Half Filled', status: 'draft', data: { [coordField.key]: { lat: '', lng: '' } } } });
      expect(halfFilled.statusCode).toBe(201);
      expect(halfFilled.json().data[coordField.key]).toBeNull();
    });
  });

  // §2 — two more field types: phone (bounded digit-count validation, not
  // full E.164 parsing — no phone-number library exists in this codebase)
  // and currency (a real {amount,currency} pair, currency format-checked
  // as 3 letters, amount any finite number — deliberately not forced
  // non-negative, since a generic currency field also covers refunds).
  describe('phone + currency field types (§2)', () => {
    it('validates phone digit count, currency code format and amount, and treats an untouched currency object as empty', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'product_model_v2f', name: 'Product', name_plural: 'Products' } })).json();

      const types = (await app.inject({ method: 'GET', url: '/v1/cms/field-types', headers: { authorization } })).json();
      expect(types.some((t: any) => t.type === 'phone')).toBe(true);
      expect(types.some((t: any) => t.type === 'currency')).toBe(true);

      const phoneField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Phone', field_type: 'phone' } })).json();
      const priceField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Price', field_type: 'currency' } })).json();

      const good = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Good', status: 'published', data: { [phoneField.key]: '+255 700 000 000', [priceField.key]: { amount: 49.99, currency: 'usd' } } } });
      expect(good.statusCode).toBe(201);
      expect(good.json().data[priceField.key].currency).toBe('USD');

      const tooShort = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Too Short', status: 'draft', data: { [phoneField.key]: '12345' } } });
      expect(tooShort.statusCode).toBe(400);

      const badCode = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Bad Code', status: 'draft', data: { [priceField.key]: { amount: 10, currency: 'US' } } } });
      expect(badCode.statusCode).toBe(400);

      const halfFilled = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Half Filled', status: 'draft', data: { [priceField.key]: { amount: '', currency: '' } } } });
      expect(halfFilled.statusCode).toBe(201);
      expect(halfFilled.json().data[priceField.key]).toBeNull();

      const negative = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Refund', status: 'draft', data: { [priceField.key]: { amount: -25, currency: 'EUR' } } } });
      expect(negative.statusCode).toBe(201);
    });
  });

  // §2 — repeatable: a real ordered list of scalar values (text/number/url/
  // email only — REPEATABLE_ITEM_TYPES, a deliberately small subset, no
  // nested repeatable or compound types), each item validated the same way
  // a single field of that type would be, not a bare unvalidated array.
  describe('repeatable field type (§2)', () => {
    it('validates itemType at field-creation time, validates each array item, caps length, and includes field.config on the public route', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'faq_model_v2h', name: 'FAQ', name_plural: 'FAQs' } })).json();

      const types = (await app.inject({ method: 'GET', url: '/v1/cms/field-types', headers: { authorization } })).json();
      expect(types.some((t: any) => t.type === 'repeatable')).toBe(true);

      const noItemType = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Features', field_type: 'repeatable', config: {} } });
      expect(noItemType.statusCode).toBe(400);

      const badItemType = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Features', field_type: 'repeatable', config: { itemType: 'blocks' } } });
      expect(badItemType.statusCode).toBe(400);

      const urlField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Links', field_type: 'repeatable', config: { itemType: 'url' } } })).json();

      const good = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Good', status: 'published', data: { [urlField.key]: ['https://example.com/1', 'https://example.com/2'] } } });
      expect(good.statusCode).toBe(201);
      expect(good.json().data[urlField.key][1]).toBe('https://example.com/2');

      const badItem = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Bad Item', status: 'draft', data: { [urlField.key]: ['https://example.com/1', 'not-a-url'] } } });
      expect(badItem.statusCode).toBe(400);
      expect(badItem.json().error).toMatch(/item 2/);

      const manyItems = Array.from({ length: 60 }, (_, i) => `https://example.com/${i}`);
      const capped = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Many', status: 'draft', data: { [urlField.key]: manyItems } } });
      expect(capped.json().data[urlField.key].length).toBe(50);

      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const pub = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/m/faq_model_v2h/${good.json().slug}` });
      expect(pub.statusCode).toBe(200);
      expect(pub.json().model.fields.find((f: any) => f.key === urlField.key)?.config?.itemType).toBe('url');
    });
  });

  // §2 — computed: the last field type in this brief's own tail. A small,
  // safe arithmetic-only formula (+ - * / and parentheses, numeric
  // literals, {fieldKey} references to sibling non-computed fields on the
  // same model) — never eval()/new Function() on the tenant-authored
  // formula string, a hand-rolled recursive-descent parser instead. A
  // computed field is never client-writable: validateAgainstFields
  // discards whatever the client submits for its key and fills in the
  // real value itself, in a second pass, after every other field's value
  // has already been coerced.
  describe('computed field type (§2)', () => {
    it('validates the formula at field-creation time, rejects a reference to another computed field, computes from sibling values (ignoring any client-submitted value), and resolves a missing sibling to 0', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'order_model_v2i', name: 'Order', name_plural: 'Orders' } })).json();

      const types = (await app.inject({ method: 'GET', url: '/v1/cms/field-types', headers: { authorization } })).json();
      expect(types.some((t: any) => t.type === 'computed')).toBe(true);

      const emptyFormula = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Total', field_type: 'computed', config: {} } });
      expect(emptyFormula.statusCode).toBe(400);

      const badSyntax = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Total', field_type: 'computed', config: { formula: '{price} +' } } });
      expect(badSyntax.statusCode).toBe(400);

      const badRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Total', field_type: 'computed', config: { formula: '{nonexistent} * 2' } } });
      expect(badRef.statusCode).toBe(400);

      const priceField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Price', field_type: 'number' } })).json();
      const qtyField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Quantity', field_type: 'number' } })).json();
      const totalField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Total', field_type: 'computed', config: { formula: `{${priceField.key}} * {${qtyField.key}}` } } })).json();

      const chainedRef = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Total Again', field_type: 'computed', config: { formula: `{${totalField.key}} + 1` } } });
      expect(chainedRef.statusCode).toBe(400);

      const good = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Order 1', status: 'published', data: { [priceField.key]: 10, [qtyField.key]: 3, [totalField.key]: 999 } } });
      expect(good.statusCode).toBe(201);
      expect(good.json().data[totalField.key]).toBe(30);

      const missingQty = await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Order 2', status: 'draft', data: { [priceField.key]: 10 } } });
      expect(missingQty.json().data[totalField.key]).toBe(0);

      const updated = await app.inject({ method: 'PATCH', url: `/v1/cms/content-entries/${good.json().id}`, headers: { authorization }, payload: { data: { [priceField.key]: 5, [qtyField.key]: 4 } } });
      expect(updated.json().data[totalField.key]).toBe(20);

      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const pub = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/m/order_model_v2i/${good.json().slug}` });
      expect(pub.statusCode).toBe(200);
      expect(pub.json().data[totalField.key]).toBe(20);
    });
  });

  // §30-31 — Forms + form workflows. A tenant defines a form's own field
  // shape once (config validated the same "declare the shape up front"
  // way §2's own field types already are), places it anywhere a 'blocks'
  // field already works via a real 'form' block
  // (cms-content.service.ts's sanitizeBlock), and a visitor's submission
  // is validated server-side against that exact shape and stored —
  // honeypot-guarded the same way blog comments (§37) already are.
  describe('Forms + form workflows (§30-31)', () => {
    it('validates field config at create/update time, and a public submission is validated, honeypot-guarded, and stored against the declared shape', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);

      const created = await app.inject({ method: 'POST', url: '/v1/cms/forms', headers: { authorization }, payload: { name: 'Contact Us v2' } });
      expect(created.statusCode).toBe(201);
      const form = created.json();
      expect(form.fields).toEqual([]);

      const badType = await app.inject({ method: 'PATCH', url: `/v1/cms/forms/${form.id}`, headers: { authorization }, payload: { fields: [{ label: 'Name', type: 'checkbox' }] } });
      expect(badType.statusCode).toBe(400);

      const selectNoOptions = await app.inject({ method: 'PATCH', url: `/v1/cms/forms/${form.id}`, headers: { authorization }, payload: { fields: [{ label: 'Plan', type: 'select', options: [] }] } });
      expect(selectNoOptions.statusCode).toBe(400);

      const dupKey = await app.inject({ method: 'PATCH', url: `/v1/cms/forms/${form.id}`, headers: { authorization }, payload: { fields: [{ key: 'x', label: 'A', type: 'text' }, { key: 'x', label: 'B', type: 'text' }] } });
      expect(dupKey.statusCode).toBe(400);

      const updated = await app.inject({
        method: 'PATCH', url: `/v1/cms/forms/${form.id}`, headers: { authorization },
        payload: { fields: [{ label: 'Your name', type: 'text', required: true }, { label: 'Your email', type: 'email', required: true }], notify_email: 'sales@example.com' },
      });
      expect(updated.statusCode).toBe(200);
      const uf = updated.json();

      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      const pubGet = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/forms/${uf.key}` });
      expect(pubGet.statusCode).toBe(200);
      expect(pubGet.json()).not.toHaveProperty('notify_email');

      const missingRequired = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/forms/${uf.key}/submit`, payload: { your_name: 'Jo' } });
      expect(missingRequired.statusCode).toBe(400);

      const badEmail = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/forms/${uf.key}/submit`, payload: { your_name: 'Jo', your_email: 'not-an-email' } });
      expect(badEmail.statusCode).toBe(400);

      const good = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/forms/${uf.key}/submit`, payload: { your_name: 'Jo', your_email: 'jo@example.com', extra_unknown_field: 'dropped' } });
      expect(good.statusCode).toBe(201);

      const honeypot = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/forms/${uf.key}/submit`, payload: { your_name: 'Bot', your_email: 'bot@example.com', _hp: 'i-am-a-bot' } });
      expect(honeypot.statusCode).toBe(201);
      expect(honeypot.json().ok).toBe(true);

      const list = await app.inject({ method: 'GET', url: `/v1/cms/forms/${form.id}/submissions`, headers: { authorization } });
      expect(list.json().total).toBe(1); // honeypot silently discarded, never stored
      expect(list.json().submissions[0].data).not.toHaveProperty('extra_unknown_field');
      expect(list.json().submissions[0].data.your_name).toBe('Jo');
    });

    it('cross-tenant isolation, auth gating, and cascade-delete of submissions', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const form = (await app.inject({ method: 'POST', url: '/v1/cms/forms', headers: { authorization }, payload: { name: 'Isolation Test' } })).json();

      const bList = await app.inject({ method: 'GET', url: '/v1/cms/forms', headers: authHeaders(B.token) });
      expect(bList.json().every((f: any) => f.id !== form.id)).toBe(true);

      const bDelete = await app.inject({ method: 'DELETE', url: `/v1/cms/forms/${form.id}`, headers: authHeaders(B.token) });
      expect(bDelete.statusCode).toBe(200); // RLS: silent no-op, not an error that would leak existence
      const stillThere = await app.inject({ method: 'GET', url: `/v1/cms/forms/${form.id}`, headers: { authorization } });
      expect(stillThere.statusCode).toBe(200);

      const noAuth = await app.inject({ method: 'GET', url: '/v1/cms/forms' });
      expect(noAuth.statusCode).toBe(401);

      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/forms/${form.key}/submit`, payload: {} });
      await app.inject({ method: 'DELETE', url: `/v1/cms/forms/${form.id}`, headers: { authorization } });
      const orphanSubs = await dbPlatform.selectFrom('cms_form_submissions').select('id').where('form_id', '=', form.id).execute();
      expect(orphanSubs.length).toBe(0); // ON DELETE CASCADE (migration 478)
    });

    it('the "form" block type is a real, sanitized entry in a blocks field, self-referencing its form by key', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'landing_v_forms_2', name: 'Landing', name_plural: 'Landings' } })).json();
      const blocksField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Content', field_type: 'blocks' } })).json();
      const form = (await app.inject({ method: 'POST', url: '/v1/cms/forms', headers: { authorization }, payload: { name: 'Newsletter v2' } })).json();

      const entry = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Landing Page', status: 'published', data: { [blocksField.key]: [{ type: 'form', props: { formKey: form.key } }] } },
      });
      expect(entry.statusCode).toBe(201);
      expect(entry.json().data[blocksField.key][0].props.formKey).toBe(form.key);

      const unknownType = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Bad', status: 'draft', data: { [blocksField.key]: [{ type: 'not-a-real-type', props: {} }] } },
      });
      expect(unknownType.statusCode).toBe(400);
    });
  });

  // §33 — Analytics. Deliberately just a count: no IP, no user agent, no
  // cookie, no per-visitor identity — per the brief's own "privacy-
  // conscious" framing. One row per (resource, day), incremented in place
  // on each beacon hit via a real upsert (migration 479's own UNIQUE
  // constraint), not one row per raw view plus a separate nightly
  // aggregation job.
  describe('Analytics — pageview beacon (§33)', () => {
    it('validates the beacon, aggregates same-day hits into one row via upsert, and returns bulk totals in one query', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'article_v33b', name: 'Article', name_plural: 'Articles' } })).json();
      const entry = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Hello World', status: 'published' } })).json();
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();

      const badType = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/pageview`, payload: { resource_type: 'bogus', resource_id: entry.id } });
      expect(badType.statusCode).toBe(400);

      const badTenant = await app.inject({ method: 'POST', url: `/v1/cms/public/does-not-exist-tenant/pageview`, payload: { resource_type: 'entry', resource_id: entry.id } });
      expect(badTenant.statusCode).toBe(404);

      for (let i = 0; i < 5; i++) {
        const hit = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/pageview`, payload: { resource_type: 'entry', resource_id: entry.id } });
        expect(hit.statusCode).toBe(200);
      }

      const summary = await app.inject({ method: 'GET', url: `/v1/cms/analytics/entry/${entry.id}`, headers: { authorization } });
      expect(summary.json().total).toBe(5);
      expect(summary.json().daily.length).toBe(1); // same day -> one upserted row, not 5
      expect(summary.json().daily[0].count).toBe(5);

      const entry2 = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Second Article', status: 'published' } })).json();
      await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/pageview`, payload: { resource_type: 'entry', resource_id: entry2.id } });
      const bulk = await app.inject({ method: 'GET', url: `/v1/cms/analytics/entry?ids=${entry.id},${entry2.id}`, headers: { authorization } });
      expect(bulk.json().totals[entry.id]).toBe(5);
      expect(bulk.json().totals[entry2.id]).toBe(1);
    });

    it('isolates counts per tenant even for the same raw resource id, and gates the admin routes the same way the rest of the CMS does', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'article_v33c', name: 'Article', name_plural: 'Articles' } })).json();
      const entry = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Isolation Test', status: 'published' } })).json();
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();
      await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/pageview`, payload: { resource_type: 'entry', resource_id: entry.id } });

      const bSummary = await app.inject({ method: 'GET', url: `/v1/cms/analytics/entry/${entry.id}`, headers: authHeaders(B.token) });
      expect(bSummary.json().total).toBe(0); // RLS-scoped, not a leak of tenant A's own count

      const customer = await A.addUser('CUSTOMER');
      const custAnalytics = await app.inject({ method: 'GET', url: `/v1/cms/analytics/entry/${entry.id}`, headers: authHeaders(customer.token) });
      expect(custAnalytics.statusCode).toBe(403);

      const noAuth = await app.inject({ method: 'GET', url: `/v1/cms/analytics/entry/${entry.id}` });
      expect(noAuth.statusCode).toBe(401);

      const pubNoAuth = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/pageview`, payload: { resource_type: 'entry', resource_id: entry.id } });
      expect(pubNoAuth.statusCode).toBe(200); // the beacon itself stays open with no auth at all
    });
  });

  // §56-57 — Import/export/migration. Export first (no external format to
  // trust), then a real WordPress WXR importer — the brief's own
  // explicitly-recommended starting point, mapped onto Posts (a WXR
  // <item> is structurally a blog post) rather than a generic Content
  // Model entry. Uses the already-installed fast-xml-parser and
  // @fastify/multipart (both already real dependencies elsewhere in this
  // codebase — sanctions.service.ts/tra.service.ts, cms.routes.ts's own
  // /media upload) rather than adding anything new.
  describe('Import/export (§56-57)', () => {
    const WXR_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <item>
    <title>First Imported Post</title>
    <content:encoded><![CDATA[<p>Hello <script>alert(1)</script> world</p>]]></content:encoded>
    <wp:post_date>2020-03-15 10:00:00</wp:post_date>
    <wp:post_name>first-imported-post</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <category domain="post_tag" nicename="tz"><![CDATA[Tanzania]]></category>
  </item>
  <item>
    <title></title>
    <wp:post_type>post</wp:post_type>
    <wp:status>publish</wp:status>
  </item>
  <item>
    <title>An Attachment</title>
    <wp:post_type>attachment</wp:post_type>
  </item>
</channel>
</rss>`;

    function multipartXml(xml: string, boundary = 'WXRBOUND') {
      return {
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="export.xml"\r\nContent-Type: text/xml\r\n\r\n${xml}\r\n--${boundary}--\r\n`,
      };
    }

    it('imports real WordPress posts (status mapped, date preserved, content sanitized, category/tags mapped), skips an empty title, and filters out non-post types', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const mp = multipartXml(WXR_SAMPLE);

      const badFile = await app.inject({ method: 'POST', url: '/v1/cms/import/wordpress', headers: { authorization, 'content-type': 'multipart/form-data; boundary=X' }, payload: '--X\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\nhello\r\n--X--\r\n' });
      expect(badFile.statusCode).toBe(400);

      const importRes = await app.inject({ method: 'POST', url: '/v1/cms/import/wordpress', headers: { authorization, ...mp.headers }, payload: mp.payload });
      expect(importRes.statusCode).toBe(200);
      const result = importRes.json();
      expect(result.imported).toBe(1); // the attachment item is filtered out before counting, never "skipped"
      expect(result.skipped).toBe(1); // the empty-title item

      const posts = (await app.inject({ method: 'GET', url: '/v1/cms/posts', headers: { authorization } })).json();
      const post = posts.find((p: any) => p.slug === 'first-imported-post');
      expect(post).toBeTruthy();
      expect(post.status).toBe('published');
      expect(post.created_at).toMatch(/^2020-03-15/); // the real WordPress post_date, not "now"
      expect(post.category).toBe('News');
      expect(post.tags).toBe('Tanzania');
      expect(post.content).not.toContain('<script>');
      expect(post.content).toContain('Hello');

      // Re-importing the same file must not collide on slug.
      const reImport = await app.inject({ method: 'POST', url: '/v1/cms/import/wordpress', headers: { authorization, ...mp.headers }, payload: mp.payload });
      expect(reImport.statusCode).toBe(200);
      const postsAfter = (await app.inject({ method: 'GET', url: '/v1/cms/posts', headers: { authorization } })).json();
      expect(postsAfter.some((p: any) => p.slug === 'first-imported-post-2')).toBe(true);
    });

    it('exports Posts, Pages and one Content Model\'s entries as real CSV, isolated per tenant and gated the same way the rest of the CMS is', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);

      const exportRes = await app.inject({ method: 'GET', url: '/v1/cms/posts/export', headers: { authorization } });
      expect(exportRes.statusCode).toBe(200);
      expect(exportRes.headers['content-type']).toContain('text/csv');
      const headerRow = exportRes.body.split('\r\n')[0];
      expect(headerRow).toContain('Title');
      expect(headerRow).toContain('Slug');

      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'product_export_v57', name: 'Product', name_plural: 'Products' } })).json();
      const field = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Price', field_type: 'number' } })).json();
      await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization }, payload: { title: 'Widget', status: 'published', data: { [field.key]: 42 } } });
      const entriesExport = await app.inject({ method: 'GET', url: `/v1/cms/content-models/${model.id}/entries/export`, headers: { authorization } });
      expect(entriesExport.body).toContain('Price'); // the model's own field becomes a real CSV column
      expect(entriesExport.body).toContain('Widget');
      expect(entriesExport.body).toContain('42');

      const badModel = await app.inject({ method: 'GET', url: `/v1/cms/content-models/00000000-0000-0000-0000-000000000000/entries/export`, headers: { authorization } });
      expect(badModel.statusCode).toBe(404);

      const bExport = await app.inject({ method: 'GET', url: '/v1/cms/posts/export', headers: authHeaders(B.token) });
      expect(bExport.body).not.toContain('Widget');

      const customer = await A.addUser('CUSTOMER');
      const custExport = await app.inject({ method: 'GET', url: '/v1/cms/posts/export', headers: authHeaders(customer.token) });
      expect(custExport.statusCode).toBe(403);
      const noAuth = await app.inject({ method: 'GET', url: '/v1/cms/posts/export' });
      expect(noAuth.statusCode).toBe(401);
    });
  });

  // §35 — Experimentation. The map's own text explicitly sequenced this
  // behind §6 (the Designer, to author variants) and §33 (Analytics, to
  // measure them) — both real now. Deliberately narrow: two variants, a
  // visitor sticky-assigned client-side, a real server-side view counter
  // per variant. No conversion tracking yet — a real, disclosed limit.
  describe('Experimentation — A/B variants (§35)', () => {
    it('validates variant blocks at create time (including no nested experiments), records real per-variant views, and keeps the public shape free of view counts', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const tenantRow = await dbPlatform.selectFrom('tenants').select('slug').where('id', '=', A.tenantId).executeTakeFirstOrThrow();

      const badBlockType = await app.inject({ method: 'POST', url: '/v1/cms/experiments', headers: { authorization }, payload: { name: 'Bad', variant_a_blocks: [{ type: 'not-a-real-type', props: {} }] } });
      expect(badBlockType.statusCode).toBe(400);

      const nested = await app.inject({ method: 'POST', url: '/v1/cms/experiments', headers: { authorization }, payload: { name: 'Nested', variant_a_blocks: [{ type: 'experiment', props: { experimentKey: 'x' } }] } });
      expect(nested.statusCode).toBe(400);

      const created = await app.inject({
        method: 'POST', url: '/v1/cms/experiments', headers: { authorization },
        payload: { name: 'Homepage Hero', variant_a_blocks: [{ type: 'heading', props: { text: 'Variant A', level: 2 } }], variant_b_blocks: [{ type: 'heading', props: { text: 'Variant B', level: 2 } }] },
      });
      expect(created.statusCode).toBe(201);
      const experiment = created.json();
      expect(experiment.status).toBe('running');

      const pubGet = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantRow.slug}/experiments/${experiment.key}` });
      expect(pubGet.statusCode).toBe(200);
      expect(pubGet.json()).not.toHaveProperty('variant_a_views');

      const badVariant = await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/experiments/${experiment.key}/view`, payload: { variant: 'c' } });
      expect(badVariant.statusCode).toBe(400);

      for (let i = 0; i < 3; i++) {
        await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/experiments/${experiment.key}/view`, payload: { variant: 'a' } });
      }
      await app.inject({ method: 'POST', url: `/v1/cms/public/${tenantRow.slug}/experiments/${experiment.key}/view`, payload: { variant: 'b' } });

      const after = await app.inject({ method: 'GET', url: `/v1/cms/experiments/${experiment.id}`, headers: { authorization } });
      expect(after.json().variant_a_views).toBe(3);
      expect(after.json().variant_b_views).toBe(1);
    });

    it('cross-tenant isolation, auth gating, and the real "experiment" block type in an entry\'s own blocks field', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const experiment = (await app.inject({ method: 'POST', url: '/v1/cms/experiments', headers: { authorization }, payload: { name: 'Isolation Test' } })).json();

      const bList = await app.inject({ method: 'GET', url: '/v1/cms/experiments', headers: authHeaders(B.token) });
      expect(bList.json().every((x: any) => x.id !== experiment.id)).toBe(true);

      const bDelete = await app.inject({ method: 'DELETE', url: `/v1/cms/experiments/${experiment.id}`, headers: authHeaders(B.token) });
      expect(bDelete.statusCode).toBe(200); // RLS: silent no-op, not an error that would leak existence
      const stillThere = await app.inject({ method: 'GET', url: `/v1/cms/experiments/${experiment.id}`, headers: { authorization } });
      expect(stillThere.statusCode).toBe(200);

      const noAuth = await app.inject({ method: 'GET', url: '/v1/cms/experiments' });
      expect(noAuth.statusCode).toBe(401);

      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'landing_v_exp_2', name: 'Landing', name_plural: 'Landings' } })).json();
      const blocksField = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Content', field_type: 'blocks' } })).json();
      const entry = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Landing Page', status: 'published', data: { [blocksField.key]: [{ type: 'experiment', props: { experimentKey: experiment.key } }] } },
      });
      expect(entry.statusCode).toBe(201);
      expect(entry.json().data[blocksField.key][0].props.experimentKey).toBe(experiment.key);
    });
  });

  // §34 — Personalization. A visibility rule attachable to ANY block (not
  // one more per-type prop) — three real, browser-observable signals
  // (new/returning visitor, a referrer substring, a utm_source substring),
  // evaluated client-side only (BlockPreview.tsx's evaluateBlockVisibility,
  // covered by its own scratch verification, not an HTTP-testable path).
  // What's tested here is the sanitize/round-trip half: sanitizeBlock's new
  // visibilityOf, and that both blockSchema definitions (components,
  // experiments) actually let `visibility` through rather than a plain
  // zod object silently stripping it before sanitizeBlock ever sees it —
  // a real bug this pass caught and fixed on the way in.
  describe('Personalization — block visibility rules (§34)', () => {
    it('round-trips a valid visibility rule, drops an invalid part rather than rejecting, caps oversized strings, and omits an empty rule entirely', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);

      const created = await app.inject({
        method: 'POST', url: '/v1/cms/components', headers: { authorization },
        payload: {
          key: 'personalized-banner', name: 'Personalized Banner',
          blocks: [{ type: 'heading', props: { text: 'Welcome back!' }, visibility: { visitorType: 'returning', referrerContains: 'Google', utmSource: 'Newsletter' } }],
        },
      });
      expect(created.statusCode).toBe(201);
      const comp = created.json();
      expect(comp.blocks[0].visibility).toEqual({ visitorType: 'returning', referrerContains: 'Google', utmSource: 'Newsletter' });

      const badType = await app.inject({
        method: 'PATCH', url: `/v1/cms/components/${comp.id}`, headers: { authorization },
        payload: { blocks: [{ type: 'paragraph', props: { text: 'x' }, visibility: { visitorType: 'bogus', referrerContains: '  padded  ' } }] },
      });
      expect(badType.statusCode).toBe(200);
      expect(badType.json().blocks[0].visibility).toEqual({ referrerContains: 'padded' });

      const long = 'x'.repeat(250);
      const oversized = await app.inject({
        method: 'PATCH', url: `/v1/cms/components/${comp.id}`, headers: { authorization },
        payload: { blocks: [{ type: 'paragraph', props: { text: 'x' }, visibility: { referrerContains: long, utmSource: long } }] },
      });
      expect(oversized.json().blocks[0].visibility.referrerContains.length).toBe(100);
      expect(oversized.json().blocks[0].visibility.utmSource.length).toBe(100);

      const empty = await app.inject({
        method: 'PATCH', url: `/v1/cms/components/${comp.id}`, headers: { authorization },
        payload: { blocks: [{ type: 'paragraph', props: { text: 'x' }, visibility: {} }] },
      });
      expect('visibility' in empty.json().blocks[0]).toBe(false);

      const none = await app.inject({
        method: 'PATCH', url: `/v1/cms/components/${comp.id}`, headers: { authorization },
        payload: { blocks: [{ type: 'paragraph', props: { text: 'x' } }] },
      });
      expect('visibility' in none.json().blocks[0]).toBe(false);
    });

    it('lets visibility through on an experiment variant block and on a placed component block, not just a plain content block', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);

      const experiment = await app.inject({
        method: 'POST', url: '/v1/cms/experiments', headers: { authorization },
        payload: { name: 'Personalized Variant Test', variant_a_blocks: [{ type: 'heading', props: { text: 'A' }, visibility: { visitorType: 'new' } }] },
      });
      expect(experiment.statusCode).toBe(201);
      expect(experiment.json().variant_a_blocks[0].visibility).toEqual({ visitorType: 'new' });

      const comp = (await app.inject({ method: 'POST', url: '/v1/cms/components', headers: { authorization }, payload: { key: 'plain-comp-v34', name: 'Plain' } })).json();
      const model = (await app.inject({ method: 'POST', url: '/v1/cms/content-models', headers: { authorization }, payload: { key: 'landing_v_pers_1', name: 'Landing', name_plural: 'Landings' } })).json();
      const field = (await app.inject({ method: 'POST', url: `/v1/cms/content-models/${model.id}/fields`, headers: { authorization }, payload: { label: 'Content', field_type: 'blocks' } })).json();
      const entry = await app.inject({
        method: 'POST', url: `/v1/cms/content-models/${model.id}/entries`, headers: { authorization },
        payload: { title: 'Landing Page', status: 'published', data: { [field.key]: [{ type: 'component', props: { componentId: comp.id }, visibility: { visitorType: 'new' } }] } },
      });
      expect(entry.statusCode).toBe(201);
      expect(entry.json().data[field.key][0].visibility).toEqual({ visitorType: 'new' });
    });
  });

  // Enterprise CMS (Phase 3) — §15 Configurable Workflow, §16 Approvals,
  // §18 Content Releases, §19-20 Editorial Collaboration, §23 Multisite,
  // §25-26 Localization. Built by a concurrent session's own
  // cms-enterprise.service.ts/.routes.ts (migrations 477/482) — this suite
  // is the live-verification + permanent-regression half, not the
  // original implementation. Found and fixed three real bugs on the way
  // in: (1) resolveSite queried the bare, RLS-restricted `db` singleton
  // with no tenant context — cms_sites' own FORCEd RLS silently returned
  // zero rows for every /sites/resolve call regardless of a genuinely
  // matching site, since that's the one legitimately cross-tenant lookup
  // in this whole feature set (an anonymous visitor's domain has no
  // resolved tenant yet) and needed `dbPlatform` instead, per CLAUDE.md's
  // own carve-out. (2) cms_sites had a real UNIQUE(tenant_id, slug) but
  // none on `domain`, even though a domain names exactly one site
  // platform-wide by definition — fixed with migration 483's partial
  // unique index. (3) publishRelease/updateRelease both called
  // `this.getRelease(...)` — a second, independent `withTenant()` — from
  // *inside* their own still-open transaction; under Postgres's default
  // READ COMMITTED isolation that nested read cannot see the outer
  // transaction's own uncommitted writes, so every publish/update
  // response reported stale pre-write data even though the writes
  // themselves had genuinely succeeded. Fixed by extracting a
  // `buildReleaseDetail(trx, ...)` helper both the outer transaction and
  // the standalone `getRelease` now share.

  // §10 — Design tokens (content-facing). A bounded, allow-listed heading
  // font / body font / corner-radius preset, alongside the existing real
  // accentColor — never a raw font URL or CSS value a tenant could type in,
  // since both zod (server) and the admin's own Select picker (client) only
  // ever offer the same fixed CMS_FONT_IDS/CMS_RADIUS_PRESETS list.
  describe('Design tokens — heading/body font + corner radius (§10)', () => {
    it('defaults are a visual no-op for an untouched tenant, a valid update round-trips through both the admin and public routes, an arbitrary value is rejected, and CUSTOMER is blocked', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(A.token);
      const customer = await A.addUser('CUSTOMER');

      const initial = await app.inject({ method: 'GET', url: '/v1/cms/site-settings', headers: { authorization } });
      expect(initial.statusCode).toBe(200);
      expect(initial.json().headingFont).toBe('system');
      expect(initial.json().bodyFont).toBe('system');
      expect(initial.json().radius).toBe('rounded');

      const update = await app.inject({
        method: 'PUT', url: '/v1/cms/site-settings', headers: { authorization },
        payload: { headingFont: 'cormorant', bodyFont: 'dm-sans', radius: 'pill' },
      });
      expect(update.statusCode).toBe(200);
      expect(update.json().headingFont).toBe('cormorant');
      expect(update.json().bodyFont).toBe('dm-sans');
      expect(update.json().radius).toBe('pill');

      const badFont = await app.inject({ method: 'PUT', url: '/v1/cms/site-settings', headers: { authorization }, payload: { headingFont: 'Comic Sans MS' } });
      expect(badFont.statusCode).toBe(400);
      const badRadius = await app.inject({ method: 'PUT', url: '/v1/cms/site-settings', headers: { authorization }, payload: { radius: '20px' } });
      expect(badRadius.statusCode).toBe(400);

      const custBlocked = await app.inject({ method: 'PUT', url: '/v1/cms/site-settings', headers: authHeaders(customer.token), payload: { radius: 'sharp' } });
      expect(custBlocked.statusCode).toBe(403);

      const tenantSlug = update.json().tenantSlug;
      const publicSite = await app.inject({ method: 'GET', url: `/v1/cms/public/${tenantSlug}` });
      expect(publicSite.statusCode).toBe(200);
      expect(publicSite.json().settings.headingFont).toBe('cormorant');
      expect(publicSite.json().settings.bodyFont).toBe('dm-sans');
      expect(publicSite.json().settings.radius).toBe('pill');
    });
  });

  describe('Enterprise CMS — Workflow, Approvals, Releases, Collaboration, Multisite, Localization (§15/16/18/19-20/23/25-26)', () => {
    let E: TestTenant;
    let F: TestTenant;
    beforeAll(async () => {
      E = await createTestTenant('TENANT_ADMIN');
      F = await createTestTenant('TENANT_ADMIN');
    });
    afterAll(async () => {
      await E.cleanup();
      await F.cleanup();
    });

    it('cms_sites, cms_workflow_states, cms_workflow_transitions, cms_approvals, cms_releases, cms_release_items and cms_content_comments all have RLS enabled + FORCEd + a tenant_isolation_policy', async () => {
      const tables = ['cms_sites', 'cms_workflow_states', 'cms_workflow_transitions', 'cms_approvals', 'cms_releases', 'cms_release_items', 'cms_content_comments'];
      for (const t of tables) {
        const rows = await sql<{ rls: boolean; forced: boolean; pols: string }>`
          SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
                 (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation_policy') AS pols
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = ${t}
        `.execute(dbPlatform);
        expect(rows.rows).toHaveLength(1);
        expect(rows.rows[0].rls).toBe(true);
        expect(rows.rows[0].forced).toBe(true);
        expect(Number(rows.rows[0].pols)).toBe(1);
      }
    });

    it('unauthenticated and CUSTOMER-role callers are refused', async () => {
      const app = await getApp();
      const noAuth = await app.inject({ method: 'GET', url: '/v1/cms/sites' });
      expect(noAuth.statusCode).toBe(401);
      const customer = await E.addUser('CUSTOMER');
      const custBlocked = await app.inject({ method: 'GET', url: '/v1/cms/sites', headers: authHeaders(customer.token) });
      expect(custBlocked.statusCode).toBe(403);
    });

    it('§23 Multisite: only admins create/manage sites, /sites/resolve works unauthenticated by slug+tenant and by domain, a domain is globally unique, and cross-tenant listing is isolated', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);
      const manager = await E.addUser('MANAGER');
      const testDomain = `shop-${randomUUID().slice(0, 8)}.example.com`;

      const nonAdmin = await app.inject({ method: 'POST', url: '/v1/cms/sites', headers: authHeaders(manager.token), payload: { slug: 'shop', name: 'Shop Site' } });
      expect(nonAdmin.statusCode).toBe(403);

      const site = await app.inject({ method: 'POST', url: '/v1/cms/sites', headers: { authorization }, payload: { slug: 'shop', name: 'Shop Site', domain: testDomain } });
      expect(site.statusCode).toBe(201);
      const siteJson = site.json();
      expect(siteJson.is_default).toBe(false);

      const resolveBySlug = await app.inject({ method: 'GET', url: `/v1/cms/sites/resolve?slug=shop&tenant_id=${E.tenantId}` });
      expect(resolveBySlug.statusCode).toBe(200);
      expect(resolveBySlug.json().id).toBe(siteJson.id);

      const resolveByDomain = await app.inject({ method: 'GET', url: `/v1/cms/sites/resolve?domain=${testDomain}` });
      expect(resolveByDomain.statusCode).toBe(200);
      expect(resolveByDomain.json().id).toBe(siteJson.id);

      const resolveMissing = await app.inject({ method: 'GET', url: '/v1/cms/sites/resolve?domain=nowhere.invalid' });
      expect(resolveMissing.statusCode).toBe(404);

      const dupDomain = await app.inject({ method: 'POST', url: '/v1/cms/sites', headers: authHeaders(F.token), payload: { slug: 'shop', name: 'Copycat Site', domain: testDomain } });
      expect(dupDomain.statusCode).toBe(400);

      const makeDefault = await app.inject({ method: 'POST', url: `/v1/cms/sites/${siteJson.id}/make-default`, headers: { authorization }, payload: {} });
      expect(makeDefault.statusCode).toBe(200);
      expect(makeDefault.json().is_default).toBe(true);

      const bSites = await app.inject({ method: 'GET', url: '/v1/cms/sites', headers: authHeaders(F.token) });
      expect(bSites.json().some((s: any) => s.id === siteJson.id)).toBe(false);
    });

    it('§15 Configurable Workflow: a 7-state default lifecycle auto-seeds, only admins manage states/transitions, and validate-transition enforces real seeded transitions for non-admins', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);
      const manager = await E.addUser('MANAGER');

      const states = await app.inject({ method: 'GET', url: '/v1/cms/workflows/states', headers: { authorization } });
      expect(states.statusCode).toBe(200);
      expect(states.json()).toHaveLength(7);
      expect(states.json().map((s: any) => s.slug).sort()).toEqual(['approved', 'archived', 'draft', 'in_review', 'published', 'scheduled', 'trash'].sort());
      const draftState = states.json().find((s: any) => s.slug === 'draft');
      const publishedState = states.json().find((s: any) => s.slug === 'published');
      const inReviewState = states.json().find((s: any) => s.slug === 'in_review');

      const nonAdminState = await app.inject({ method: 'POST', url: '/v1/cms/workflows/states', headers: authHeaders(manager.token), payload: { slug: 'legal_review', name: 'Legal Review' } });
      expect(nonAdminState.statusCode).toBe(403);
      const customState = await app.inject({ method: 'POST', url: '/v1/cms/workflows/states', headers: { authorization }, payload: { slug: 'legal_review', name: 'Legal Review', color: '#8b5cf6' } });
      expect(customState.statusCode).toBe(201);

      const transitions = await app.inject({ method: 'GET', url: '/v1/cms/workflows/transitions', headers: { authorization } });
      expect(transitions.json().length).toBeGreaterThan(0);

      const adminBypass = await app.inject({ method: 'POST', url: '/v1/cms/workflows/validate-transition', headers: { authorization }, payload: { from_state_id: draftState.id, to_state_id: publishedState.id } });
      expect(adminBypass.json().allowed).toBe(true);

      const mgrRealTransition = await app.inject({ method: 'POST', url: '/v1/cms/workflows/validate-transition', headers: authHeaders(manager.token), payload: { from_state_id: draftState.id, to_state_id: inReviewState.id } });
      expect(mgrRealTransition.json().allowed).toBe(true);

      const mgrNoTransition = await app.inject({ method: 'POST', url: '/v1/cms/workflows/validate-transition', headers: authHeaders(manager.token), payload: { from_state_id: publishedState.id, to_state_id: draftState.id } });
      expect(mgrNoTransition.json().allowed).toBe(false);
    });

    it('§16 Approvals: requesting flips the real resource to in_review, only the assignee (or admin) can decide, deciding it flips the resource and can\'t be redone, and only the requester (or admin) can cancel', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);
      const manager = await E.addUser('MANAGER');
      const manager2 = await E.addUser('MANAGER');

      async function pageStatus(id: string): Promise<string | undefined> {
        const list = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: { authorization } });
        return (list.json() as any[]).find(p => p.id === id)?.status;
      }

      const reviewers = await app.inject({ method: 'GET', url: '/v1/cms/reviewers', headers: { authorization } });
      expect(reviewers.json().some((r: any) => r.id === manager.userId)).toBe(true);

      const page = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'approval-test-page', title: 'Approval Test Page', content: '<p>hi</p>' } });
      const pageId = page.json().id;

      const approvalReq = await app.inject({ method: 'POST', url: '/v1/cms/approvals/request', headers: { authorization }, payload: { resource_type: 'page', resource_id: pageId, assigned_to: manager.userId, note: 'please review' } });
      expect(approvalReq.statusCode).toBe(201);
      const approvalId = approvalReq.json().id;
      expect(await pageStatus(pageId)).toBe('in_review');

      const listMine = await app.inject({ method: 'GET', url: `/v1/cms/approvals?assigned_to=${manager.userId}`, headers: authHeaders(manager.token) });
      expect(listMine.json().some((a: any) => a.id === approvalId)).toBe(true);

      const decideByOther = await app.inject({ method: 'POST', url: `/v1/cms/approvals/${approvalId}/decide`, headers: authHeaders(manager2.token), payload: { decision: 'approved' } });
      expect(decideByOther.statusCode).toBe(403);

      const decide = await app.inject({ method: 'POST', url: `/v1/cms/approvals/${approvalId}/decide`, headers: authHeaders(manager.token), payload: { decision: 'approved', note: 'looks good' } });
      expect(decide.statusCode).toBe(200);
      expect(decide.json().status).toBe('approved');
      expect(await pageStatus(pageId)).toBe('approved');

      const decideAgain = await app.inject({ method: 'POST', url: `/v1/cms/approvals/${approvalId}/decide`, headers: authHeaders(manager.token), payload: { decision: 'approved' } });
      expect(decideAgain.statusCode).toBe(400);

      const page2 = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'approval-test-page-2', title: 'Approval Test Page 2', content: '<p>hi</p>' } });
      const approval2 = await app.inject({ method: 'POST', url: '/v1/cms/approvals/request', headers: authHeaders(manager.token), payload: { resource_type: 'page', resource_id: page2.json().id, assigned_to: manager2.userId } });
      expect(approval2.statusCode).toBe(201);
      const cancelByOther = await app.inject({ method: 'POST', url: `/v1/cms/approvals/${approval2.json().id}/cancel`, headers: authHeaders(manager2.token), payload: {} });
      expect(cancelByOther.statusCode).toBe(403);
      const cancelByRequester = await app.inject({ method: 'POST', url: `/v1/cms/approvals/${approval2.json().id}/cancel`, headers: authHeaders(manager.token), payload: {} });
      expect(cancelByRequester.statusCode).toBe(200);
      expect(cancelByRequester.json().status).toBe('cancelled');
    });

    it('§18 Content Releases: publishing atomically flips every real item to its target status, records a real audit event, and can\'t be replayed', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);

      async function pageStatus(id: string): Promise<string | undefined> {
        const list = await app.inject({ method: 'GET', url: '/v1/cms/pages', headers: { authorization } });
        return (list.json() as any[]).find(p => p.id === id)?.status;
      }

      const release = await app.inject({ method: 'POST', url: '/v1/cms/releases', headers: { authorization }, payload: { name: 'Launch Week', description: 'Batch publish' } });
      expect(release.statusCode).toBe(201);
      expect(release.json().status).toBe('draft');
      const releaseId = release.json().id;

      const relPage = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'release-test-page', title: 'Release Test Page', content: '<p>hi</p>' } });
      const addItem = await app.inject({ method: 'POST', url: `/v1/cms/releases/${releaseId}/items`, headers: { authorization }, payload: { resource_type: 'page', resource_id: relPage.json().id, target_status: 'published' } });
      expect(addItem.statusCode).toBe(201);

      const detail = await app.inject({ method: 'GET', url: `/v1/cms/releases/${releaseId}`, headers: { authorization } });
      expect(detail.json().item_count).toBe(1);

      const publish = await app.inject({ method: 'POST', url: `/v1/cms/releases/${releaseId}/publish`, headers: { authorization }, payload: {} });
      expect(publish.statusCode).toBe(200);
      expect(publish.json().status).toBe('published');
      expect(publish.json().items[0].current_status).toBe('published');
      expect(await pageStatus(relPage.json().id)).toBe('published');

      const rePublish = await app.inject({ method: 'POST', url: `/v1/cms/releases/${releaseId}/publish`, headers: { authorization }, payload: {} });
      expect(rePublish.statusCode).toBe(400);

      const activity = await app.inject({ method: 'GET', url: `/v1/activity/page/${relPage.json().id}`, headers: { authorization } });
      expect(activity.statusCode).toBe(200);
    });

    it('§19-20 Editorial Collaboration: a threaded reply nests under its parent, and only the real author (or admin) can resolve a comment', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);
      const manager = await E.addUser('MANAGER');
      const manager2 = await E.addUser('MANAGER');

      const page = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'collab-test-page', title: 'Collab Test Page', content: '<p>hi</p>' } });
      const pageId = page.json().id;

      const comment = await app.inject({ method: 'POST', url: '/v1/cms/comments/editorial', headers: authHeaders(manager.token), payload: { resource_type: 'page', resource_id: pageId, content: 'Can we reword the intro?' } });
      expect(comment.statusCode).toBe(201);
      const commentId = comment.json().id;

      const reply = await app.inject({ method: 'POST', url: '/v1/cms/comments/editorial', headers: { authorization }, payload: { resource_type: 'page', resource_id: pageId, content: 'Sure, updating now.', parent_id: commentId } });
      expect(reply.statusCode).toBe(201);
      expect(reply.json().parent_id).toBe(commentId);

      const list = await app.inject({ method: 'GET', url: `/v1/cms/comments/editorial?resource_type=page&resource_id=${pageId}`, headers: { authorization } });
      const topLevel = list.json().find((c: any) => c.id === commentId);
      expect(topLevel.replies.some((r: any) => r.id === reply.json().id)).toBe(true);

      const resolveByOther = await app.inject({ method: 'PATCH', url: `/v1/cms/comments/editorial/${commentId}`, headers: authHeaders(manager2.token), payload: { is_resolved: true } });
      expect([400, 403]).toContain(resolveByOther.statusCode);

      const resolve = await app.inject({ method: 'PATCH', url: `/v1/cms/comments/editorial/${commentId}`, headers: authHeaders(manager.token), payload: { is_resolved: true } });
      expect(resolve.statusCode).toBe(200);
      expect(resolve.json().resolved).toBe(true);

      const del = await app.inject({ method: 'DELETE', url: `/v1/cms/comments/editorial/${reply.json().id}`, headers: { authorization } });
      expect(del.statusCode).toBe(200);
    });

    it('§25-26 Localization: linking a translation round-trips through the real translation group, and AI translation is rejected (not a crash) with no AI key configured', async () => {
      const app = await getApp();
      const { authorization } = authHeaders(E.token);
      const manager = await E.addUser('MANAGER');

      const page = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'about-us-en', title: 'About Us', content: '<p>Hi</p>' } });
      const swPage = await app.inject({ method: 'POST', url: '/v1/cms/pages', headers: { authorization }, payload: { slug: 'about-us-sw', title: 'Kuhusu Sisi', content: '<p>Habari</p>' } });

      const link = await app.inject({
        method: 'POST', url: '/v1/cms/translations/link', headers: { authorization },
        payload: { resource_type: 'page', resource_id: swPage.json().id, translation_group_id: page.json().translation_group_id, locale: 'sw' },
      });
      expect(link.statusCode).toBe(200);

      const group = await app.inject({ method: 'GET', url: `/v1/cms/translations/${page.json().translation_group_id}`, headers: { authorization } });
      expect(group.statusCode).toBe(200);

      const translateNoKey = await app.inject({ method: 'POST', url: '/v1/cms/translate', headers: { authorization }, payload: { resource_type: 'page', resource_id: page.json().id, target_locale: 'sw' } });
      expect(translateNoKey.statusCode).toBe(400);

      const translateAsStaff = await app.inject({ method: 'POST', url: '/v1/cms/translate', headers: authHeaders(manager.token), payload: { resource_type: 'page', resource_id: page.json().id, target_locale: 'fr' } });
      expect(translateAsStaff.statusCode).toBe(400);
    });
  });
});
