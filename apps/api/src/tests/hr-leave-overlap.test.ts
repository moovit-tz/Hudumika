// The P2 fix from the audit: two leave requests for the same person on
// overlapping dates used to both succeed (the entitlement ledger blocks
// over-taking a balance, but never checked whether two requests claimed the
// same calendar days). Confirms the new overlap check actually refuses the
// second request, and that a genuinely non-overlapping one still succeeds.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

describe('Leave request overlap prevention', () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant('TENANT_ADMIN');
  });

  afterAll(async () => { await tenant.cleanup(); });

  it('refuses a second request overlapping an already-pending one for the same person', async () => {
    const app = await getApp();

    const first = await app.inject({
      method: 'POST', url: '/v1/hr/leaves', headers: authHeaders(tenant.token),
      payload: { from_date: '2027-03-01', to_date: '2027-03-10', type: 'ANNUAL' },
    });
    expect(first.statusCode).toBe(200);

    const overlapping = await app.inject({
      method: 'POST', url: '/v1/hr/leaves', headers: authHeaders(tenant.token),
      payload: { from_date: '2027-03-08', to_date: '2027-03-15', type: 'ANNUAL' },
    });
    expect(overlapping.statusCode).toBe(409);
    expect(overlapping.json().code).toBe('LEAVE_OVERLAP');
  });

  it('allows a second request for dates that do not overlap the first', async () => {
    const app = await getApp();

    const nonOverlapping = await app.inject({
      method: 'POST', url: '/v1/hr/leaves', headers: authHeaders(tenant.token),
      payload: { from_date: '2027-04-01', to_date: '2027-04-05', type: 'ANNUAL' },
    });
    expect(nonOverlapping.statusCode).toBe(200);
  });
});
