import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { resolveCIProvider } from '../services/onsite-ci.service.js';
import { encryptSecret } from '../services/onsite-secrets.service.js';
import { createTestTenant, getApp, authHeaders, type TestTenant } from './helpers.js';

describe('Onsite deployment provider selection', () => {
  let tenant: TestTenant;
  let other: TestTenant;
  let githubId: string;
  let appId: string;
  beforeAll(async () => {
    tenant = await createTestTenant();
    other = await createTestTenant();
    await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenant.tenantId, settings: JSON.stringify({ 'enabled-apps': { onsite: true } }) }).execute();
    for (const provider of ['circleci', 'github']) {
      const connection = await dbPlatform.insertInto('onsite_provider_connections').values({
        tenant_id: tenant.tenantId, provider, name: provider, status: 'active',
        config_cipher: encryptSecret('{}'), access_token_cipher: encryptSecret('test-token'),
        external_id: provider === 'github' ? 'example/repo/deploy.yml' : 'gh/example/repo',
      }).returning('id').executeTakeFirstOrThrow();
      if (provider === 'github') githubId = connection.id;
    }
    const created = await (await getApp()).inject({ method: 'POST', url: '/v1/onsite/applications', headers: authHeaders(tenant.token), payload: { name: 'Deployment selection' } });
    expect(created.statusCode).toBe(201);
    appId = created.json().id;
  }, 120000);
  afterAll(async () => { await Promise.all([tenant?.cleanup(), other?.cleanup()]); }, 120000);

  it('resolves the recorded provider even when another provider has higher priority', async () => {
    expect((await resolveCIProvider(tenant.tenantId))?.key).toBe('circleci');
    expect((await resolveCIProvider(tenant.tenantId, 'github'))?.key).toBe('github');
  });
  it('does not fall back when the recorded provider is missing or unsupported', async () => {
    expect(await resolveCIProvider(tenant.tenantId, 'cloudflare')).toBeNull();
    expect(await resolveCIProvider(tenant.tenantId, 'hostinger')).toBeNull();
  });
  it('does not use another workspace connection', async () => {
    expect(await resolveCIProvider(other.tenantId, 'github', githubId)).toBeNull();
  });
  it('assigns the selected project connection and rejects foreign connection ids', async () => {
    const foreign = await dbPlatform.insertInto('onsite_provider_connections').values({ tenant_id: other.tenantId, provider: 'github', name: 'Foreign', status: 'active', external_id: 'foreign/repo/deploy.yml', config_cipher: encryptSecret('{}'), access_token_cipher: encryptSecret('test-token') }).returning('id').executeTakeFirstOrThrow();
    const api = await getApp();
    const options = { method: 'PATCH' as const, url: `/v1/onsite/applications/${appId}/deployment-connection`, headers: authHeaders(tenant.token) };
    expect((await api.inject({ ...options, payload: { provider_connection_id: foreign.id } })).statusCode).toBe(400);
    const saved = await api.inject({ ...options, payload: { provider_connection_id: githubId } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().provider_connection_id).toBe(githubId);
    expect((await resolveCIProvider(tenant.tenantId, 'github', githubId))?.connectionId).toBe(githubId);
    expect(await resolveCIProvider(tenant.tenantId, 'circleci', githubId)).toBeNull();
  });
  it('does not substitute another connection for the selected account', async () => {
    const second = await dbPlatform.insertInto('onsite_provider_connections').values({ tenant_id: tenant.tenantId, provider: 'github', name: 'Second', status: 'active', external_id: 'second/repo/deploy.yml', config_cipher: encryptSecret('{}'), access_token_cipher: encryptSecret('test-token') }).returning('id').executeTakeFirstOrThrow();
    expect((await resolveCIProvider(tenant.tenantId, 'github', second.id))?.connectionId).toBe(second.id);
  });
  it('records the selected account on a real deployment request', async () => {
    const request = vi.fn().mockImplementation(async (_url: string, options?: RequestInit) => options?.method === 'POST'
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ workflow_runs: [{ id: 12345, created_at: new Date().toISOString(), html_url: 'https://github.com/example/repo/actions/runs/12345' }] }), { status: 200 }));
    vi.stubGlobal('fetch', request);
    try {
      const deployed = await (await getApp()).inject({ method: 'POST', url: `/v1/onsite/applications/${appId}/deploy`, headers: authHeaders(tenant.token), payload: {} });
      expect(deployed.statusCode, deployed.body).toBe(202);
      expect(deployed.json().provider_connection_id).toBe(githubId);
      expect(deployed.json().ci_provider).toBe('github');
      expect(request.mock.calls[0][0]).toContain('/repos/example/repo/');
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not fall back after the recorded connection is revoked', async () => {
    await dbPlatform.updateTable('onsite_provider_connections').set({ status: 'revoked' })
      .where('tenant_id', '=', tenant.tenantId).where('provider', '=', 'github').execute();
    expect(await resolveCIProvider(tenant.tenantId, 'github', githubId)).toBeNull();
  });
});
