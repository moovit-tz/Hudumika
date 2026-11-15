// Pulse social publishing (migration 790). Network calls are stubbed with the
// response shapes each API documents — nothing is posted anywhere real.
// Covers: signed OAuth state, page discovery, per-network rules (Instagram
// needs an image, X's 280 limit), tokens never leaving the server, unavailable
// networks refusing plainly, and per-account outcomes on publish.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Pulse social', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let Social: typeof import('../integrations/pulse-social.js');
  let encryptSecret: (s: string) => string;
  const realFetch = globalThis.fetch;
  const calls: { url: string; body?: string }[] = [];
  const stub = (routes: Array<[RegExp, unknown, number?]>) => {
    (globalThis as any).fetch = async (url: string, init?: any) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : undefined });
      const hit = routes.find(([re]) => re.test(String(url)));
      if (!hit) return new Response(JSON.stringify({ error: { message: `unexpected ${url}` } }), { status: 500 });
      return new Response(JSON.stringify(hit[1]), { status: hit[2] ?? 200, headers: { 'content-type': 'application/json' } });
    };
  };
  const call = (t: TestTenant, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, headers: authHeaders(t.token), payload: payload as any });
  const addAccount = (network: string, name: string) => withTenant(A.tenantId, (trx) => trx.insertInto('pulse_social_accounts').values({
    tenant_id: A.tenantId, network: network as any, external_id: `${network}-1`, name, access_token: encryptSecret('secret-token-123'),
  }).returning('id').executeTakeFirstOrThrow());

  beforeAll(async () => {
    app = await getApp();
    Social = await import('../integrations/pulse-social.js');
    ({ encryptSecret } = await import('../services/onsite-secrets.service.js'));
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    for (const t of [A, B]) await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', t.tenantId).execute();
  }, 120_000);
  afterAll(async () => { (globalThis as any).fetch = realFetch; await A?.cleanup(); await B?.cleanup(); }, 240_000);

  it('signs the OAuth state to one workspace, person and network', () => {
    const s = Social.makeState(A.tenantId, A.userId, 'x');
    expect(Social.readState(s, A.tenantId, A.userId, 'x')).toBe(true);
    expect(Social.readState(s, B.tenantId, A.userId, 'x')).toBe(false);
    expect(Social.readState(s, A.tenantId, A.userId, 'meta')).toBe(false);
    expect(Social.readState(s.replace(/.$/, s.endsWith('a') ? 'b' : 'a'), A.tenantId, A.userId, 'x')).toBe(false);
  });

  it('enforces each network’s rules before calling it', async () => {
    await expect(Social.publish('instagram', 'ig1', 't', { text: 'hi' })).rejects.toThrow(/need an image/);
    await expect(Social.publish('x', 'x1', 't', { text: 'a'.repeat(281) })).rejects.toThrow(/Too long/);
  });

  it('publishes through each network’s documented endpoints', async () => {
    stub([
      [/\/ig1\/media$/, { id: 'container-9' }],
      [/\/ig1\/media_publish$/, { id: 'media-77' }],
      [/\/media-77\?/, { permalink: 'https://www.instagram.com/p/abc/' }],
      [/\/page1\/feed$/, { id: 'page1_555' }],
      [/api\.x\.com\/2\/tweets$/, { data: { id: '1800000000000000001', text: 'x' } }],
    ]);
    expect(await Social.publish('instagram', 'ig1', 't', { text: 'New route', imageUrl: 'https://cdn.example.test/a.jpg' })).toEqual({ id: 'media-77', url: 'https://www.instagram.com/p/abc/' });
    expect((await Social.publish('facebook', 'page1', 't', { text: 'Hello', link: 'https://example.test' })).id).toBe('page1_555');
    const x = await Social.publish('x', 'x1', 't', { text: 'Rates are out', link: 'https://example.test/r' });
    expect(x.url).toBe('https://x.com/i/web/status/1800000000000000001');
    expect(JSON.parse(calls.at(-1)!.body!).text).toBe('Rates are out\nhttps://example.test/r');
    (globalThis as any).fetch = realFetch;
  });

  it('turns a network error into a readable reason, and flags expired tokens', async () => {
    stub([[/\/page1\/feed$/, { error: { message: 'Error validating access token: Session has expired', code: 190 } }, 400]]);
    const err = await Social.publish('facebook', 'page1', 't', { text: 'x' }).catch((e) => e);
    expect(err.message).toMatch(/Session has expired/);
    expect(err.expired).toBe(true);
    (globalThis as any).fetch = realFetch;
  });

  it('says plainly when a network isn’t set up on the platform', async () => {
    const r = (await call(A, 'GET', '/v1/pulse/social/accounts')).json().data;
    if (!r.available.x) {
      const c = await call(A, 'POST', '/v1/pulse/social/connect/x');
      expect(c.statusCode).toBe(409);
      expect(c.json().error).toMatch(/aren't available on this platform yet/);
    }
  });

  it('never returns tokens, and refuses a post that breaks a network rule', async () => {
    const ig = await addAccount('instagram', 'Msafiri Logistics IG');
    const list = (await call(A, 'GET', '/v1/pulse/social/accounts')).json().data.accounts;
    expect(JSON.stringify(list)).not.toContain('secret-token');
    expect(list[0]).not.toHaveProperty('access_token');
    const p = await call(A, 'POST', '/v1/pulse/social/posts', { body: 'No picture', account_ids: [ig.id] });
    expect(p.statusCode).toBe(201);
    const s = await call(A, 'POST', `/v1/pulse/social/posts/${p.json().data.id}/schedule`, {});
    expect(s.statusCode).toBe(400);
    expect(s.json().error).toMatch(/Instagram needs an image/);
    expect((await call(B, 'GET', '/v1/pulse/social/posts')).json().data).toHaveLength(0);
  });

  it('posts now and records each account’s own outcome', async () => {
    const x = await addAccount('x', 'Msafiri on X');
    const li = await addAccount('linkedin', 'Msafiri on LinkedIn');
    stub([[/api\.x\.com\/2\/tweets$/, { data: { id: '1800000000000000002' } }], [/api\.linkedin\.com\/rest\/posts$/, { message: 'Not enough permissions to access: partnerApiPostsExternal.CREATE' }, 403]]);
    const p = await call(A, 'POST', '/v1/pulse/social/posts', { body: 'Our Dar–Nairobi weekly service starts Monday.', account_ids: [x.id, li.id] });
    const id = p.json().data.id;
    const s = await call(A, 'POST', `/v1/pulse/social/posts/${id}/schedule`, {});
    (globalThis as any).fetch = realFetch;
    expect(s.statusCode).toBe(200);
    expect(s.json().data.status).toBe('partly_published');
    const targets = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_social_post_targets').selectAll().where('post_id', '=', id).execute());
    const byAcc = Object.fromEntries(targets.map((t) => [t.account_id, t]));
    expect(byAcc[x.id]).toMatchObject({ status: 'published', external_post_id: '1800000000000000002' });
    expect(byAcc[li.id].status).toBe('failed');
    expect(byAcc[li.id].error).toMatch(/Not enough permissions/);
  });
});
