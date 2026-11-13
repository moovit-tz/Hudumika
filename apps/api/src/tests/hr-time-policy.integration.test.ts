import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { authHeaders, createTestTenant, getApp, type TestTenant } from './helpers.js';

describe('tenant payroll time policy API', () => {
  let tenant: TestTenant;
  beforeAll(async () => { tenant = await createTestTenant(); }, 120000);
  afterAll(async () => { await tenant?.cleanup(); }, 120000);

  it('applies policy only to new overtime claims and persists its version', async () => {
    const app = await getApp();
    const update = (restDays: number[], normal: number, restDay: number, publicHoliday: number) => app.inject({
      method: 'PATCH', url: '/v1/payroll/policy', headers: authHeaders(tenant.token),
      payload: { time_policy: { restDays, overtimeMultipliers: { normal, restDay, publicHoliday } } },
    });

    const firstPolicy = await update([6], 1.25, 1.75, 2.25);
    expect(firstPolicy.statusCode, firstPolicy.body).toBe(200);
    expect(firstPolicy.json().time_policy.version).toBe(2);
    const firstClaim = await app.inject({ method: 'POST', url: '/v1/hr/overtime', headers: authHeaders(tenant.token), payload: { date: '2026-10-17', hours: 1, reason: 'Policy version check' } });
    expect(firstClaim.statusCode, firstClaim.body).toBe(200);
    expect(firstClaim.json()).toMatchObject({ kind: 'REST_DAY', rate_multiplier: '1.75', policy_version: 2 });

    const secondPolicy = await update([0, 6], 1.5, 2, 2.5);
    expect(secondPolicy.statusCode, secondPolicy.body).toBe(200);
    expect(secondPolicy.json().time_policy.version).toBe(3);
    const secondClaim = await app.inject({ method: 'POST', url: '/v1/hr/overtime', headers: authHeaders(tenant.token), payload: { date: '2026-10-18', hours: 1, reason: 'Policy version check' } });
    expect(secondClaim.statusCode, secondClaim.body).toBe(200);
    expect(secondClaim.json()).toMatchObject({ kind: 'REST_DAY', rate_multiplier: '2.00', policy_version: 3 });

    const saved = await dbPlatform.selectFrom('hr_overtime_requests').select(['policy_version', 'rate_multiplier']).where('tenant_id', '=', tenant.tenantId).orderBy('date').execute();
    expect(saved.map(row => [row.policy_version, row.rate_multiplier])).toEqual([[2, '1.75'], [3, '2.00']]);
    expect((await update([0, 0], 1.5, 2, 2)).statusCode).toBe(400);
  });
});
