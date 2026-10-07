import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHeaders, createTestTenant, getApp } from './helpers.js';

describe('Privacy audit and retention controls', () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;
  beforeAll(async () => { tenant = await createTestTenant('ADMIN'); });
  afterAll(async () => { await tenant?.cleanup(); });

  it('rejects malformed audit filters before querying personal data', async () => {
    const app = await getApp();
    for (const query of ['limit=-1', 'offset=NaN', 'from=invalid', 'subject_id=invalid', 'sensitivity=unknown']) {
      const response = await app.inject({ method: 'GET', url: `/v1/admin/privacy/pii-access-log?${query}`, headers: authHeaders(tenant.token) });
      expect(response.statusCode, response.body).toBe(400);
    }
  });

  it('rejects unsafe retention identifiers and invalid periods without inserting a policy', async () => {
    const app = await getApp();
    const base = { table_name: 'customers', data_domain: 'GENERAL', retention_days: 365, action_on_expiry: 'ARCHIVE' };
    for (const payload of [{ ...base, table_name: 'customers; DROP TABLE users' }, { ...base, retention_days: 0 }, { ...base, target_columns: ['email;DELETE'] }]) {
      const response = await app.inject({ method: 'POST', url: '/v1/admin/privacy/retention-policies', headers: authHeaders(tenant.token), payload });
      expect(response.statusCode, response.body).toBe(400);
    }
    const list = await app.inject({ method: 'GET', url: '/v1/admin/privacy/retention-policies', headers: authHeaders(tenant.token) });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().tenant_overrides).toEqual([]);
  });

  it('keeps a valid retention override scoped to its owner tenant', async () => {
    const app = await getApp();
    const other = await createTestTenant('ADMIN');
    try {
      const created = await app.inject({ method: 'POST', url: '/v1/admin/privacy/retention-policies', headers: authHeaders(tenant.token),
        payload: { table_name: 'customers', data_domain: 'GENERAL', retention_days: 365, action_on_expiry: 'ARCHIVE' } });
      expect(created.statusCode, created.body).toBe(201);
      const ownerList = await app.inject({ method: 'GET', url: '/v1/admin/privacy/retention-policies', headers: authHeaders(tenant.token) });
      expect(ownerList.json().tenant_overrides).toHaveLength(1);
      const otherList = await app.inject({ method: 'GET', url: '/v1/admin/privacy/retention-policies', headers: authHeaders(other.token) });
      expect(otherList.statusCode, otherList.body).toBe(200);
      expect(otherList.json().tenant_overrides).toEqual([]);
    } finally { await other.cleanup(); }
  });
});
