// Regression tests for the P0 fixes made during the HR production-
// readiness audit: a set of "list everything for the tenant" GET endpoints
// enforced nothing beyond "you're logged in", even though every sibling
// write endpoint required a management role. Each of these calls with a
// plain JUNIOR-role session and asserts a real 403 — not that the frontend
// hides a button, an actual backend refusal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('HR authorization — previously-open endpoints now require a management role', () => {
  let tenant: TestTenant;
  let juniorToken: string;

  beforeAll(async () => {
    await getApp();
    tenant = await createTestTenant('TENANT_ADMIN');
    const junior = await tenant.addUser('JUNIOR');
    juniorToken = junior.token;
  });

  afterAll(async () => { await tenant.cleanup(); });

  const endpoints: { method: 'GET' | 'POST'; url: string }[] = [
    { method: 'GET', url: '/v1/hr/recruitment/openings' },
    { method: 'GET', url: '/v1/hr/recruitment/interviews/upcoming' },
    { method: 'GET', url: '/v1/hr/delete-requests' },
    { method: 'GET', url: '/v1/hr/contracts/expiring' },
    { method: 'GET', url: '/v1/hr/invitations' },
    { method: 'GET', url: '/v1/hr/roster' },
    { method: 'GET', url: '/v1/hr/payroll/runs' },
    { method: 'GET', url: '/v1/hr/documents' },
    { method: 'GET', url: '/v1/hr/assets' },
    { method: 'GET', url: '/v1/hr/goals' },
    { method: 'GET', url: '/v1/hr/reviews/cycles' },
    { method: 'GET', url: '/v1/hr/legal-entities' },
    { method: 'GET', url: '/v1/hr/employments' },
    { method: 'GET', url: '/v1/hr/recruitment/requisitions' },
    { method: 'GET', url: '/v1/hr/workforce-planning' },
  ];

  for (const ep of endpoints) {
    it(`${ep.method} ${ep.url} refuses a JUNIOR session (403)`, async () => {
      const app = await getApp();
      const res = await app.inject({ method: ep.method, url: ep.url, headers: authHeaders(juniorToken) });
      expect(res.statusCode).toBe(403);
    });
  }

  it('the same endpoint succeeds for the TENANT_ADMIN who created the tenant', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/v1/hr/recruitment/openings', headers: authHeaders(tenant.token) });
    expect(res.statusCode).toBe(200);
  });
});
