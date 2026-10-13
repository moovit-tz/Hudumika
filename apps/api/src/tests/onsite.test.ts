import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';
import { dbPlatform } from '../db/client.js';
import { encryptSecret } from '../services/onsite-secrets.service.js';
import { dnsFingerprint } from '../services/onsite-hostinger.service.js';

describe('Onsite infrastructure boundaries', { timeout: 60000 }, () => {
  let a: TestTenant;
  let b: TestTenant;
  let foreignProject: string;
  let foreignDomain: string;
  let appId: string;
  let environmentId: string;
  const call = async (tenant: TestTenant, path: string, payload?: object) => (await getApp()).inject({
    method: payload ? 'POST' : 'GET', url: `/v1/onsite${path}`, headers: authHeaders(tenant.token), payload,
  });
  beforeAll(async () => {
    a = await createTestTenant(); b = await createTestTenant();
    for (const tenant of [a, b]) await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { onsite: true } }) }).execute();
    foreignProject = (await call(b, '/projects', { name: 'Foreign infrastructure' })).json().id;
    foreignDomain = (await call(b, '/domains', { domain: 'foreign.example.com' })).json().id;
    const app = await call(a, '/applications', { name: 'Boundary test', default_branch: 'develop' });
    expect(app.statusCode).toBe(201); appId = app.json().id;
    const detail = await call(a, `/applications/${appId}`);
    environmentId = detail.json().environments[0].id;
  }, 120000);
  afterAll(async () => { await Promise.all([a?.cleanup(), b?.cleanup()]); }, 120000);

  it('rejects foreign project and domain links before inserting', async () => {
    for (const path of ['/applications', '/websites']) {
      for (const link of [{ project_id: foreignProject }, { domain_id: foreignDomain }]) {
        const res = await call(a, path, { name: 'Must not save', ...link });
        expect(res.statusCode).toBe(400);
      }
    }
    expect((await call(a, '/domains', { domain: 'local.example.com', project_id: foreignProject })).statusCode).toBe(400);
    expect((await call(a, '/websites')).json()).toHaveLength(0);
    expect((await call(a, '/applications')).json()).toHaveLength(1);
  });
  it('rejects foreign domain assignment to an environment', async () => {
    expect((await call(a, `/applications/${appId}/environments`, { name: 'staging', domain_id: foreignDomain })).statusCode).toBe(400);
  });
  it('rejects a different application environment before calling CI', async () => {
    const second = await call(a, '/applications', { name: 'Other app' });
    const res = await call(a, `/applications/${second.json().id}/deploy`, { environment_id: environmentId });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Environment');
    expect((await call(a, '/deployments')).json()).toHaveLength(0);
  });
  it('refuses deployment without a provider and does not create false history', async () => {
    expect((await call(a, `/applications/${appId}/deploy`, { environment_id: environmentId })).statusCode).toBe(409);
    expect((await call(a, '/deployments')).json()).toHaveLength(0);
  });
  it('uses the configured branch for the default environment', async () => {
    const res = await call(a, `/applications/${appId}`);
    expect(res.json().environments[0].branch).toBe('develop');
  });
  it('stores websites as inactive configuration without invented hosting', async () => {
    const res = await call(a, '/websites', { name: 'Example inventory record', url: 'https://example.com' });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('inactive');
    expect(res.json().hosting_provider).toBeNull();
    const clone = await call(a, `/websites/${res.json().id}/clone`, { name: 'Configuration copy' });
    expect(clone.statusCode).toBe(201);
    expect(clone.json().status).toBe('inactive');
    expect(clone.json().url).toBeNull();
  });
  it('denies low-privilege infrastructure access', async () => {
    const viewer = await a.addUser('JUNIOR');
    const res = await (await getApp()).inject({ method: 'GET', url: '/v1/onsite/applications', headers: authHeaders(viewer.token) });
    expect(res.statusCode).toBe(403);
  });
  it('hides another tenant application', async () => {
    expect((await call(b, `/applications/${appId}`)).statusCode).toBe(404);
  });
  it('returns only this workspace mailbox status without credentials', async () => {
    await dbPlatform.updateTable('tenant_settings').set({ settings: JSON.stringify({ 'enabled-apps': { onsite: true }, email: { gmailStatus: 'authorized', gmailAccessToken: 'private-test-token', pass: 'private-test-password' } }) })
      .where('tenant_id', '=', a.tenantId).execute();
    const res = await call(a, '/mailbox-status');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ gmail: 'authorized', outlook: '' });
    expect((await call(b, '/mailbox-status')).json()).toEqual({ gmail: '', outlook: '' });
  });
  it('imports verified Hostinger inventory once and rejects foreign connections', async () => {
    const connection = await dbPlatform.insertInto('onsite_provider_connections').values({ tenant_id: a.tenantId,
      provider: 'hostinger', name: 'Inventory test', config_cipher: encryptSecret('{}'),
      access_token_cipher: encryptSecret('test-token'), status: 'active',
    }).returning('id').executeTakeFirstOrThrow();
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [{ domain: 'import.example.tz' }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const path = `/provider-connections/${connection.id}/hostinger-websites/import`;
      expect((await call(b, path, { domain: 'import.example.tz' })).statusCode).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await call(a, path, { domain: 'missing.example.tz' })).statusCode).toBe(400);
      const imported = await call(a, path, { domain: 'import.example.tz' });
      expect(imported.statusCode).toBe(201);
      expect(imported.json().website.status).toBe('inactive');
      const stored = await dbPlatform.selectFrom('onsite_websites').select('provider_connection_id')
        .where('tenant_id', '=', a.tenantId).where('id', '=', imported.json().website.id).executeTakeFirstOrThrow();
      expect(stored.provider_connection_id).toBe(connection.id);
      const duplicate = await call(a, path, { domain: 'import.example.tz' });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json().imported).toBe(false);
      expect(duplicate.json().website.id).toBe(imported.json().website.id);
      const dnsDomain = await call(a, '/domains', { domain: 'import.example.tz' });
      expect(dnsDomain.statusCode).toBe(201);
      const zones = await dbPlatform.selectFrom('onsite_dns_zones').select('id').where('tenant_id', '=', a.tenantId).where('domain_id', '=', dnsDomain.json().id).execute();
      if (!zones.length) await dbPlatform.insertInto('onsite_dns_zones').values({ tenant_id: a.tenantId, domain_id: dnsDomain.json().id }).execute();
      fetchMock.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes('/dns/')
        ? [{ name: 'test', type: 'TXT', ttl: 300, records: [{ content: 'verified-value' }] }]
        : { data: [{ domain: 'import.example.tz' }] }), { status: 200 }));
      const dnsPath = `/provider-connections/${connection.id}/hostinger-dns/import`;
      const dnsPayload = { domain: 'import.example.tz', page: 1, record: { name: 'test', type: 'TXT', ttl: 300, value: 'verified-value' } };
      expect((await call(b, dnsPath, dnsPayload)).statusCode).toBe(404);
      expect((await call(a, dnsPath, { ...dnsPayload, record: { ...dnsPayload.record, value: 'stale-value' } })).statusCode).toBe(409);
      const dnsImport = await call(a, dnsPath, dnsPayload);
      expect(dnsImport.statusCode, dnsImport.body).toBe(201);
      expect((await call(a, dnsPath, dnsPayload)).json().imported).toBe(false);
      let published = false;
      fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
        if (options?.method === 'PUT') published = true;
        return new Response(JSON.stringify(url.includes('/dns/')
          ? options?.method ? {} : published ? [{ name: 'test', type: 'TXT', ttl: 300, records: [{ content: 'verified-value' }] }] : []
          : { data: [{ domain: 'import.example.tz' }] }), { status: 200 });
      });
      const publishPath = `/provider-connections/${connection.id}/hostinger-dns/publish`;
      const publishPayload = { ...dnsPayload, confirmed: true, fingerprint: dnsFingerprint([]) };
      expect((await call(b, publishPath, publishPayload)).statusCode).toBe(404);
      const publishedResult = await call(a, publishPath, publishPayload);
      expect(publishedResult.statusCode).toBe(200);
      expect(publishedResult.json().published).toBe(true);
      expect((await call(a, publishPath, publishPayload)).json().published).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
});
