// Pulse ads (migration 900) and target accounts (901). Ad platform calls are
// stubbed with each API's documented response shape; nothing reaches Google
// or Meta. Covers: platform numbers stored per day, budget/pause going to the
// right endpoint in the right unit, matched audiences sharing only opted-in
// people as SHA-256 hashes, account scoring from real activity, the "went
// hot" notice, the target-account audience rule, and tenant isolation.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'node:crypto';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Pulse ads and target accounts', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let encryptSecret: (s: string) => string;
  let syncAdAccount: typeof import('../routes/pulse-ads.routes.js').syncAdAccount;
  const realFetch = globalThis.fetch;
  const calls: { url: string; body: string }[] = [];
  const stub = (routes: Array<[RegExp, unknown]>) => {
    (globalThis as any).fetch = async (url: string, init?: any) => {
      calls.push({ url: String(url), body: init?.body ? String(init.body) : '' });
      const hit = routes.find(([re]) => re.test(String(url)));
      return new Response(JSON.stringify(hit ? hit[1] : { error: { message: `unexpected ${url}` } }), { status: hit ? 200 : 500 });
    };
  };
  const call = (t: TestTenant, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url, headers: authHeaders(t.token), payload: payload as any });
  let accountId: string;

  beforeAll(async () => {
    app = await getApp();
    ({ encryptSecret } = await import('../services/onsite-secrets.service.js'));
    ({ syncAdAccount } = await import('../routes/pulse-ads.routes.js'));
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    for (const t of [A, B]) await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', t.tenantId).execute();
    accountId = (await withTenant(A.tenantId, (trx) => trx.insertInto('pulse_ad_accounts').values({
      tenant_id: A.tenantId, network: 'meta', external_id: 'act_42', name: 'Msafiri Ads', currency: 'TZS', access_token: encryptSecret('meta-token'),
    }).returning('id').executeTakeFirstOrThrow())).id;
  }, 120_000);
  afterAll(async () => { (globalThis as any).fetch = realFetch; await A?.cleanup(); await B?.cleanup(); }, 240_000);

  it('stores campaigns and daily numbers exactly as the platform reports them', async () => {
    stub([
      [/act_42\/campaigns\?/, { data: [{ id: 'c1', name: 'harvest', status: 'ACTIVE', daily_budget: '5000000', objective: 'OUTCOME_LEADS' }] }],
      [/act_42\/insights\?/, { data: [
        { campaign_id: 'c1', date_start: '2026-11-10', impressions: '1200', clicks: '40', spend: '20000.50', actions: [{ action_type: 'lead', value: '3' }, { action_type: 'link_click', value: '40' }] },
        { campaign_id: 'c1', date_start: '2026-11-11', impressions: '800', clicks: '10', spend: '9000', actions: [] },
      ] }],
    ]);
    const acc = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_ad_accounts').selectAll().where('id', '=', accountId).executeTakeFirstOrThrow());
    expect(await syncAdAccount(acc as any)).toEqual({ campaigns: 1, days: 2 });
    (globalThis as any).fetch = realFetch;
    const c = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_ad_campaigns').selectAll().where('account_id', '=', accountId).executeTakeFirstOrThrow());
    expect(c).toMatchObject({ name: 'harvest', status: 'ACTIVE' });
    expect(Number(c.daily_budget)).toBe(50000); // Meta budgets arrive in cents
    const days = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_ad_metrics_daily').selectAll().where('campaign_id', '=', c.id).orderBy('day').execute());
    expect(days.map((d) => [Number(d.spend), Number(d.conversions)])).toEqual([[20000.5, 3], [9000, 0]]);
  });

  it('changes budget and status through the platform, in its own units', async () => {
    const c = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_ad_campaigns').select('id').where('account_id', '=', accountId).executeTakeFirstOrThrow());
    stub([[/\/c1$/, { success: true }]]);
    expect((await call(A, 'POST', `/v1/pulse/ads/campaigns/${c.id}`, { action: 'budget', amount: 75000 })).statusCode).toBe(200);
    expect(new URLSearchParams(calls.at(-1)!.body).get('daily_budget')).toBe('7500000');
    expect((await call(A, 'POST', `/v1/pulse/ads/campaigns/${c.id}`, { action: 'pause' })).statusCode).toBe(200);
    expect(new URLSearchParams(calls.at(-1)!.body).get('status')).toBe('PAUSED');
    (globalThis as any).fetch = realFetch;
    expect((await call(B, 'POST', `/v1/pulse/ads/campaigns/${c.id}`, { action: 'pause' })).statusCode).toBe(404);
  });

  it('shares only opted-in people, hashed, and needs at least 100 of them', async () => {
    const seg = await call(A, 'POST', '/v1/pulse/segments', { name: 'Ad audience', source: 'contacts', match_type: 'all', rules: [{ field: 'company', op: 'eq', value: 'Ad Co' }] });
    const segId = seg.json().data.id;
    await withTenant(A.tenantId, async (trx) => {
      const rows = Array.from({ length: 120 }, (_, i) => ({ tenant_id: A.tenantId, first_name: `P${i}`, email: `p${i}@adco.test`, company: 'Ad Co' }));
      await trx.insertInto('contacts').values(rows as any).execute();
      // 105 opted in, 15 never asked.
      await trx.insertInto('pulse_consents').values(rows.slice(0, 105).map((r) => ({ tenant_id: A.tenantId, channel: 'email' as const, address: r.email, status: 'subscribed' as const, source: 'form' }))).execute();
    });
    stub([[/act_42\/customaudiences$/, { id: 'aud_1' }], [/aud_1\/users$/, { audience_id: 'aud_1', num_received: 105 }]]);
    const r = await call(A, 'POST', '/v1/pulse/ads/audiences', { account_id: accountId, segment_id: segId });
    (globalThis as any).fetch = realFetch;
    expect(r.statusCode).toBe(200);
    expect(r.json().data).toMatchObject({ uploaded: 105, status: 'synced', external_id: 'aud_1' });
    const sent = JSON.parse(new URLSearchParams(calls.at(-1)!.body).get('payload')!);
    expect(sent.data).toHaveLength(105);
    expect(sent.data[0][0]).toBe(createHash('sha256').update('p0@adco.test').digest('hex'));
    expect(calls.at(-1)!.body).not.toContain('adco.test');
  });

  let targetId: string;
  it('scores a target account from its people’s real activity, and tells the owner when it goes hot', async () => {
    const cust = await withTenant(A.tenantId, (trx) => trx.insertInto('customers').values({ tenant_id: A.tenantId, name: 'Kilimo Exports', email: 'info@kilimo.test' } as any).returning('id').executeTakeFirstOrThrow());
    await withTenant(A.tenantId, (trx) => trx.insertInto('contacts').values({ tenant_id: A.tenantId, first_name: 'Rehema', email: 'rehema@kilimo.test', company_id: cust.id } as any).execute());
    const r = await call(A, 'POST', '/v1/pulse/accounts', { customer_ids: [cust.id], tier: 1 });
    expect(r.statusCode).toBe(201);
    targetId = (await call(A, 'GET', '/v1/pulse/accounts')).json().data[0].id;
    // Activity: a campaign to Rehema, opened and clicked 6 times, plus a form.
    await withTenant(A.tenantId, async (trx) => {
      const camp = await trx.insertInto('pulse_campaigns').values({ tenant_id: A.tenantId, name: 'ABM', channel: 'email', status: 'sent' }).returning('id').executeTakeFirstOrThrow();
      for (let i = 0; i < 6; i++) {
        await trx.insertInto('pulse_sends').values({ tenant_id: A.tenantId, campaign_id: camp.id, source: 'contacts', address: i ? `x${i}@other.test` : 'rehema@kilimo.test', token: `${'a'.repeat(31)}${i}`, short_code: `abcdefg${i}`, status: 'sent', opened_at: new Date(), clicked_at: i ? null : new Date() }).execute();
      }
      for (let i = 0; i < 2; i++) await trx.insertInto('pulse_touchpoints').values({ tenant_id: A.tenantId, person_key: 'rehema@kilimo.test', channel: 'form' }).execute();
    });
    await call(A, 'POST', '/v1/pulse/accounts/rescore');
    const a = (await call(A, 'GET', `/v1/pulse/accounts/${targetId}`)).json().data;
    expect(a.score_detail).toMatchObject({ opens: 1, clicks: 1, forms: 2, people: 1 });
    expect(a.score).toBe(1 + 5 + 20);
    expect(a.hot).toBe(false);
    // Six clicks and three open deals push it over 60.
    await withTenant(A.tenantId, async (trx) => {
      await trx.updateTable('pulse_sends').set({ clicked_at: new Date() }).where('tenant_id', '=', A.tenantId).where('address', '=', 'rehema@kilimo.test').execute();
      // One send per campaign: the same address appears once per campaign.
      for (let i = 0; i < 5; i++) {
        const camp = await trx.insertInto('pulse_campaigns').values({ tenant_id: A.tenantId, name: `ABM ${i}`, channel: 'email', status: 'sent' }).returning('id').executeTakeFirstOrThrow();
        await trx.insertInto('pulse_sends').values({ tenant_id: A.tenantId, campaign_id: camp.id, source: 'contacts', address: 'rehema@kilimo.test', token: `${'b'.repeat(31)}${i}`, short_code: `hijkmnp${i}`, status: 'sent', opened_at: new Date(), clicked_at: new Date() }).execute();
      }
      for (let i = 0; i < 3; i++) await trx.insertInto('deals').values({ tenant_id: A.tenantId, name: `Deal ${i}`, customer_id: cust.id, value: 1000, created_by: A.userId } as any).execute();
    });
    await call(A, 'POST', '/v1/pulse/accounts/rescore');
    const hot = (await call(A, 'GET', `/v1/pulse/accounts/${targetId}`)).json().data;
    expect(hot.score).toBeGreaterThanOrEqual(60);
    expect(hot.hot).toBe(true);
    const notes = await withTenant(A.tenantId, (trx) => trx.selectFrom('notifications').select(['title']).where('tenant_id', '=', A.tenantId).where('app', '=', 'pulse').execute());
    expect(notes.map((n) => n.title)).toContain('Kilimo Exports is warming up');
  });

  it('lets an audience target the people at target accounts', async () => {
    const r = await call(A, 'POST', '/v1/pulse/segments/preview', { source: 'contacts', match_type: 'all', rules: [{ field: 'target_account', op: 'tier_is', value: '1' }] });
    expect(r.statusCode).toBe(200);
    expect(r.json().data.sample.map((m: any) => m.email)).toEqual(['rehema@kilimo.test']);
    expect((await call(B, 'GET', `/v1/pulse/accounts/${targetId}`)).statusCode).toBe(404);
  });
});
