// Pulse audiences and campaigns (migrations 770–772): segments compile only
// catalogued rules, opted-out people are never sent to, tracking URLs only
// redirect to the campaign's own links, unsubscribe is recorded and honoured,
// A/B tests release the held audience to the winner, and nothing crosses
// tenants.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenant, dbPlatform } from '../db/client.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';
import { advanceCampaign } from '../services/pulse-campaigns.service.js';

describe('Pulse campaigns', () => {
  let app: Awaited<ReturnType<typeof getApp>>;
  let A: TestTenant, B: TestTenant;
  let sales: { userId: string; token: string };
  let segmentId: string;

  const call = (token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: authHeaders(token), payload: payload as any });

  const addContact = (t: TestTenant, first: string, email: string | null, city = 'Arusha') =>
    withTenant(t.tenantId, (trx) => trx.insertInto('contacts').values({
      tenant_id: t.tenantId, first_name: first, last_name: 'Test', email, address_city: city,
    } as any).returning('id').executeTakeFirstOrThrow());

  async function sendsOf(campaignId: string) {
    return withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_sends').selectAll()
      .where('tenant_id', '=', A.tenantId).where('campaign_id', '=', campaignId).orderBy('address').execute());
  }

  async function launchEmail(name: string, extra: Record<string, unknown> = {}) {
    const c = await call(A.token, 'POST', '/v1/pulse/campaigns', {
      name, channel: 'email', segment_id: segmentId, subject: 'Hello {{first_name}}',
      body_html: '<p>Hi {{first_name}}</p><a href="https://example.com/offer?x=1">Offer</a>', utm_campaign: 'spring', ...extra,
    });
    expect(c.statusCode).toBe(201);
    const id = c.json().data.id;
    const l = await call(A.token, 'POST', `/v1/pulse/campaigns/${id}/launch`, {});
    expect(l.statusCode).toBe(200);
    await advanceCampaign(A.tenantId, id);
    return id as string;
  }

  beforeAll(async () => {
    app = await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    for (const t of [A, B]) await dbPlatform.updateTable('tenants').set({ plan: 'enterprise' }).where('id', '=', t.tenantId).execute();
    sales = await A.addUser('SALES');
    await addContact(A, 'Amina', 'amina@example.test');
    await addContact(A, 'Baraka', 'BARAKA@example.test');
    await addContact(A, 'Chausiku', 'chausiku@example.test');
    await addContact(A, 'Daudi', null);
    await addContact(A, 'Elia', 'elia@example.test', 'Mwanza');
    await withTenant(A.tenantId, (trx) => trx.insertInto('pulse_consents').values({
      tenant_id: A.tenantId, channel: 'email', address: 'chausiku@example.test', status: 'unsubscribed', source: 'manual',
    }).execute());
  }, 120_000);

  afterAll(async () => { await A?.cleanup(); await B?.cleanup(); }, 240_000);

  it('rejects rules outside the catalog', async () => {
    const bad = await call(A.token, 'POST', '/v1/pulse/segments/preview', { source: 'contacts', match_type: 'all', rules: [{ field: 'password', op: 'eq', value: 'x' }] });
    expect(bad.statusCode).toBe(400);
    const badOp = await call(A.token, 'POST', '/v1/pulse/segments/preview', { source: 'leads', match_type: 'all', rules: [{ field: 'stage', op: 'contains', value: 'x' }] });
    expect(badOp.statusCode).toBe(400);
    const badDays = await call(A.token, 'POST', '/v1/pulse/segments/preview', { source: 'contacts', match_type: 'all', rules: [{ field: 'created', op: 'within_days', value: '1; drop table x' }] });
    expect(badDays.statusCode).toBe(400);
  });

  it('counts an audience with the Contacts rules and the consent list', async () => {
    const r = await call(A.token, 'POST', '/v1/pulse/segments', { name: 'Arusha', source: 'contacts', match_type: 'all', rules: [{ field: 'city', op: 'eq', value: 'Arusha' }] });
    expect(r.statusCode).toBe(201);
    segmentId = r.json().data.id;
    const s = (await call(A.token, 'GET', `/v1/pulse/segments/${segmentId}`)).json().data.stats;
    expect(s).toMatchObject({ total: 4, with_email: 3, email_suppressed: 1 });
  });

  it('keeps one tenant out of another tenant\'s audiences', async () => {
    expect((await call(B.token, 'GET', `/v1/pulse/segments/${segmentId}`)).statusCode).toBe(404);
    expect((await call(B.token, 'GET', `/v1/pulse/segments/${segmentId}/members`)).statusCode).toBe(404);
    const leaked = await withTenant(B.tenantId, (trx) => trx.selectFrom('pulse_segments').select('id').where('id', '=', segmentId).execute());
    expect(leaked).toHaveLength(0);
  });

  it('lets sales draft but not send', async () => {
    const c = await call(sales.token, 'POST', '/v1/pulse/campaigns', { name: 'Draft by sales', channel: 'email', segment_id: segmentId, subject: 'x', body_html: '<p>x</p>' });
    expect(c.statusCode).toBe(201);
    expect((await call(sales.token, 'POST', `/v1/pulse/campaigns/${c.json().data.id}/launch`, {})).statusCode).toBe(403);
  });

  let campaignId: string;
  it('sends to everyone reachable and skips the opted-out', async () => {
    campaignId = await launchEmail('Spring offer');
    const sends = await sendsOf(campaignId);
    expect(sends.map((s) => [s.address, s.status])).toEqual([
      ['amina@example.test', 'sent'], ['baraka@example.test', 'sent'], ['chausiku@example.test', 'skipped'],
    ]);
    const outbox = await withTenant(A.tenantId, (trx) => trx.selectFrom('email_outbox').select(['to_address', 'subject', 'body_html', 'headers'])
      .where('tenant_id', '=', A.tenantId).where('source_app', '=', 'pulse').where('to_address', '=', 'amina@example.test').executeTakeFirstOrThrow());
    expect(outbox.subject).toBe('Hello Amina');
    expect(outbox.body_html).not.toContain('https://example.com/offer');
    const headers = typeof outbox.headers === 'string' ? JSON.parse(outbox.headers) : outbox.headers;
    expect(headers['List-Unsubscribe']).toMatch(/\/v1\/pulse-public\/u\/[0-9a-f]{32}>$/);
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    const c = (await call(A.token, 'GET', `/v1/pulse/campaigns/${campaignId}`)).json().data;
    expect(c.status).toBe('sent');
  });

  it('tracks opens and clicks, and only redirects to the campaign\'s own link', async () => {
    const [amina] = await sendsOf(campaignId);
    const open = await app.inject({ method: 'GET', url: `/v1/pulse-public/o/${amina.token}.gif` });
    expect(open.statusCode).toBe(200);
    expect(open.headers['content-type']).toContain('image/gif');
    const click = await app.inject({ method: 'GET', url: `/v1/pulse-public/c/${amina.token}/1` });
    expect(click.statusCode).toBe(302);
    expect(click.headers.location).toBe('https://example.com/offer?x=1&utm_source=pulse&utm_medium=email&utm_campaign=spring');
    expect((await app.inject({ method: 'GET', url: `/v1/pulse-public/c/${amina.token}/9` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/v1/pulse-public/c/${'0'.repeat(32)}/1` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/pulse-public/o/not-a-token.gif' })).statusCode).toBe(200);
    const report = (await call(A.token, 'GET', `/v1/pulse/campaigns/${campaignId}/report`)).json().data;
    expect(report.totals).toMatchObject({ sent: 2, opened: 1, clicked: 1, skipped: 1 });
    expect(report.links[0]).toMatchObject({ position: 1, click_count: 1 });
  });

  it('records an unsubscribe and honours it next time', async () => {
    const baraka = (await sendsOf(campaignId)).find((s) => s.address === 'baraka@example.test')!;
    const page = await app.inject({ method: 'GET', url: `/v1/pulse-public/u/${baraka.token}` });
    expect(page.statusCode).toBe(200);
    // Opening the page must not unsubscribe (mail scanners prefetch links).
    const before = (await call(A.token, 'GET', '/v1/pulse/consents?channel=email&status=unsubscribed')).json();
    expect(before.data.map((c: any) => c.address)).not.toContain('baraka@example.test');
    const oneClick = await app.inject({ method: 'POST', url: `/v1/pulse-public/u/${baraka.token}`,
      headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' });
    expect(oneClick.statusCode).toBe(200);
    const next = await launchEmail('Follow-up');
    const sends = await sendsOf(next);
    expect(sends.find((s) => s.address === 'baraka@example.test')?.status).toBe('skipped');
    expect(sends.find((s) => s.address === 'amina@example.test')?.status).toBe('sent');
  });

  it('putting back an opted-out address needs a reason', async () => {
    const noReason = await call(A.token, 'POST', '/v1/pulse/consents', { channel: 'email', address: 'baraka@example.test', status: 'subscribed' });
    expect(noReason.statusCode).toBe(400);
    const withReason = await call(A.token, 'POST', '/v1/pulse/consents', { channel: 'email', address: 'baraka@example.test', status: 'subscribed', note: 'Asked by email on 2 March' });
    expect(withReason.statusCode).toBe(200);
  });

  it('holds the rest of an A/B audience until the winner is picked', async () => {
    await addContact(A, 'Fatuma', 'fatuma@example.test');
    await addContact(A, 'Gift', 'gift@example.test');
    const id = await launchEmail('Subject test', {
      ab_test: { variants: [{ key: 'A', subject: 'One' }, { key: 'B', subject: 'Two' }], sample_pct: 50, metric: 'open', decide_after_hours: 1 },
    });
    let sends = await sendsOf(id);
    const tested = sends.filter((s) => s.variant);
    expect(tested.length).toBeGreaterThanOrEqual(2);
    expect(sends.some((s) => s.status === 'held')).toBe(true);
    // Variant B gets an open; pretend the hour has passed.
    const b = tested.find((s) => s.variant === 'B')!;
    await app.inject({ method: 'GET', url: `/v1/pulse-public/o/${b.token}.gif` });
    await withTenant(A.tenantId, (trx) => trx.updateTable('pulse_campaigns').set({ started_at: new Date(Date.now() - 2 * 3600_000) }).where('id', '=', id).execute());
    await advanceCampaign(A.tenantId, id);
    await advanceCampaign(A.tenantId, id);
    sends = await sendsOf(id);
    expect(sends.filter((s) => s.status === 'held')).toHaveLength(0);
    const c = (await call(A.token, 'GET', `/v1/pulse/campaigns/${id}`)).json().data;
    expect(c.ab_test.winner_key).toBe('B');
    expect(c.status).toBe('sent');
  });

  it('sends SMS with tracked short links and skips numbers that replied STOP', async () => {
    const phone = (first: string, p: string) => withTenant(A.tenantId, (trx) => trx.insertInto('contacts').values({
      tenant_id: A.tenantId, first_name: first, last_name: 'Sms', phone: p, address_city: 'Moshi',
    } as any).execute());
    await phone('Halima', '+255712000111');
    await phone('Issa', '0712000222');
    await withTenant(A.tenantId, (trx) => trx.insertInto('sms_opt_outs').values({ tenant_id: A.tenantId, phone: '+255712000222', phone_normalized: '712000222' } as any).execute());
    const seg = await call(A.token, 'POST', '/v1/pulse/segments', { name: 'Moshi', source: 'contacts', match_type: 'all', rules: [{ field: 'city', op: 'eq', value: 'Moshi' }] });
    const c = await call(A.token, 'POST', '/v1/pulse/campaigns', { name: 'SMS promo', channel: 'sms', segment_id: seg.json().data.id, body_text: 'Hi {{first_name}}, see https://example.com/sms-offer' });
    const id = c.json().data.id;
    expect((await call(A.token, 'POST', `/v1/pulse/campaigns/${id}/launch`, {})).statusCode).toBe(200);
    await advanceCampaign(A.tenantId, id);
    const sends = await withTenant(A.tenantId, (trx) => trx.selectFrom('pulse_sends').selectAll().where('campaign_id', '=', id).orderBy('recipient_name').execute());
    expect(sends.map((s) => s.status)).toEqual(['sent', 'skipped']);
    const msg = await withTenant(A.tenantId, (trx) => trx.selectFrom('sms_messages').select(['to_number', 'body']).where('tenant_id', '=', A.tenantId).where('source_app', '=', 'pulse').execute());
    expect(msg).toHaveLength(1);
    expect(msg[0].body).toMatch(/^Hi Halima, see http.+\/v1\/pulse-public\/r\/[A-Za-z0-9]{8}1$/);
    const path = msg[0].body.slice(msg[0].body.indexOf('/v1/'));
    const r = await app.inject({ method: 'GET', url: path });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('https://example.com/sms-offer');
  });

  it('will not launch WhatsApp without a real connection and an approved template', async () => {
    const c = await call(A.token, 'POST', '/v1/pulse/campaigns', { name: 'WA', channel: 'whatsapp', segment_id: segmentId });
    const r = await call(A.token, 'POST', `/v1/pulse/campaigns/${c.json().data.id}/launch`, {});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/approved WhatsApp template/);
  });

  it('refuses to edit or delete a campaign that went out', async () => {
    expect((await call(A.token, 'PATCH', `/v1/pulse/campaigns/${campaignId}`, { name: 'x' })).statusCode).toBe(409);
    expect((await call(A.token, 'DELETE', `/v1/pulse/campaigns/${campaignId}`)).statusCode).toBe(409);
    expect((await call(B.token, 'GET', `/v1/pulse/campaigns/${campaignId}/report`)).statusCode).toBe(404);
  });
});
