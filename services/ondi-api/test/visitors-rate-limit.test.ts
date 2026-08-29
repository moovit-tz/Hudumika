import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp, registerAndLogin, authHeader, randomRegNumber, type TestApp } from './helpers.js';

/**
 * Isolated in its own file (own app instance -> own in-memory rate-limit
 * store) so the visitor check-in route's 10/minute cap isn't polluted by
 * check-in calls made in test/visitors.test.ts. The route is registered
 * once per app instance and @fastify/rate-limit's default key is per-IP
 * across every :id, so any prior check-in call against this app counts
 * toward the same bucket.
 */
describe('Visitor check-in rate limiting: 10/minute cap enforced for real', () => {
  let t: TestApp;
  let orgId: string;

  beforeAll(async () => {
    t = await buildTestApp();
    const owner = await registerAndLogin(t);
    const res = await t.app.inject({
      method: 'POST', url: '/v1/organizations', headers: authHeader(owner.token),
      payload: { businessName: 'Kiosk Test Org', registrationNumber: randomRegNumber() },
    });
    orgId = res.json().id;
  });
  afterAll(async () => { await closeTestApp(t); });

  it('allows the first 10 rapid check-ins and 429s the 11th', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t.app.inject({
        method: 'POST',
        url: `/v1/organizations/${orgId}/visitors/check-in`,
        payload: { visitorName: `Visitor ${i}`, visitorPhone: `25570000${String(i).padStart(4, '0')}`, purpose: 'Load test' },
      });
      statuses.push(res.statusCode);
    }

    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(201));
    expect(statuses[10]).toBe(429);

    // Confirm only the 10 that actually succeeded were persisted — the
    // rejected 11th request never reached the handler that writes to Postgres.
    const count = await t.app.prisma.visitorLog.count({ where: { organizationId: orgId } });
    expect(count).toBe(10);
  });
});
