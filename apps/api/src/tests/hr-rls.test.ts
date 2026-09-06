// Automated version of the manual cross-tenant proof run during the audit:
// two real tenants, a real requisition created in tenant A, and a direct
// assertion that tenant B's session can never see it — through the actual
// HTTP route, not a raw SQL check. Confirms migration 397/399/400/401's
// RLS additions are load-bearing, not just present in pg_class.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('Cross-tenant isolation on the new recruitment-pipeline tables', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;

  beforeAll(async () => {
    await getApp();
    tenantA = await createTestTenant('TENANT_ADMIN');
    tenantB = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => {
    await tenantA.cleanup();
    await tenantB.cleanup();
  });

  it('a requisition created in tenant A is invisible to tenant B, by id and by list', async () => {
    const app = await getApp();

    const created = await app.inject({
      method: 'POST', url: '/v1/hr/recruitment/requisitions',
      headers: authHeaders(tenantA.token),
      payload: { title: 'Cross-tenant probe role' },
    });
    expect(created.statusCode).toBe(200);
    const requisitionId = created.json().id;

    // Tenant A sees it.
    const seenByOwner = await app.inject({ method: 'GET', url: `/v1/hr/recruitment/requisitions/${requisitionId}`, headers: authHeaders(tenantA.token) });
    expect(seenByOwner.statusCode).toBe(200);

    // Tenant B, same id, requesting from its own session — must 404, not
    // leak the row and not 500.
    const seenByOther = await app.inject({ method: 'GET', url: `/v1/hr/recruitment/requisitions/${requisitionId}`, headers: authHeaders(tenantB.token) });
    expect(seenByOther.statusCode).toBe(404);

    // And it must not appear in tenant B's own list, ever.
    const listByOther = await app.inject({ method: 'GET', url: '/v1/hr/recruitment/requisitions', headers: authHeaders(tenantB.token) });
    expect(listByOther.statusCode).toBe(200);
    expect(listByOther.json().some((r: any) => r.id === requisitionId)).toBe(false);
  });
});
