import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp, registerAndLogin, authHeader, randomRegNumber, type TestApp } from './helpers.js';

describe('Visitor Logbook: public check-in, register counts, check-out, manual purge', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  async function makeOrg() {
    const owner = await registerAndLogin(t);
    const res = await t.app.inject({
      method: 'POST', url: '/v1/organizations', headers: authHeader(owner.token),
      payload: { businessName: 'Dar Business Park', registrationNumber: randomRegNumber() },
    });
    return { owner, orgId: res.json().id as string };
  }

  it('checks a visitor in with no auth, lists them in the register with currentlyIn counted, then checks them out', async () => {
    const { owner, orgId } = await makeOrg();

    const checkInRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/visitors/check-in`,
      // Deliberately no authorization header — this is the public kiosk endpoint.
      payload: { visitorName: 'John Mrema', visitorPhone: '255712345678', purpose: 'Delivery', hostName: 'Warehouse' },
    });
    expect(checkInRes.statusCode).toBe(201);
    const { visitId } = checkInRes.json();
    expect(visitId).toBeTruthy();

    const dbVisit = await t.app.prisma.visitorLog.findUnique({ where: { id: visitId } });
    expect(dbVisit).not.toBeNull();
    expect(dbVisit!.status).toBe('CHECKED_IN');
    expect(dbVisit!.purgeAt.getTime()).toBeGreaterThan(Date.now()); // 90-day default retention

    const registerRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/visitors`, headers: authHeader(owner.token),
    });
    expect(registerRes.statusCode).toBe(200);
    const registerBody = registerRes.json();
    expect(registerBody.currentlyIn).toBe(1);
    expect(registerBody.visits.map((v: any) => v.id)).toContain(visitId);

    const checkOutRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/${visitId}/check-out`, headers: authHeader(owner.token),
    });
    expect(checkOutRes.statusCode).toBe(200);
    expect(checkOutRes.json().status).toBe('CHECKED_OUT');

    const registerAfter = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/visitors`, headers: authHeader(owner.token),
    });
    expect(registerAfter.json().currentlyIn).toBe(0);

    // Checking out twice is rejected.
    const doubleCheckoutRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/${visitId}/check-out`, headers: authHeader(owner.token),
    });
    expect(doubleCheckoutRes.statusCode).toBe(409);
  });

  it('rejects check-in for a missing organization and for missing required fields', async () => {
    const notFoundRes = await t.app.inject({
      method: 'POST', url: '/v1/organizations/does-not-exist/visitors/check-in',
      payload: { visitorName: 'X', visitorPhone: '255700000000', purpose: 'Meeting' },
    });
    expect(notFoundRes.statusCode).toBe(404);

    const { orgId } = await makeOrg();
    const missingFieldsRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/check-in`, payload: { visitorName: 'X' },
    });
    expect(missingFieldsRes.statusCode).toBe(400);
  });

  it('purge deletes only real, genuinely past-retention visitor rows', async () => {
    const { owner, orgId } = await makeOrg();

    const checkInRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/check-in`,
      payload: { visitorName: 'Old Visitor', visitorPhone: '255711000000', purpose: 'Audit' },
    });
    const { visitId: expiredVisitId } = checkInRes.json();

    const freshCheckInRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/check-in`,
      payload: { visitorName: 'Fresh Visitor', visitorPhone: '255722000000', purpose: 'Audit' },
    });
    const { visitId: freshVisitId } = freshCheckInRes.json();

    // Directly backdate purgeAt via Prisma to simulate the retention window
    // having genuinely elapsed — real DB state manipulation, not a mock.
    await t.app.prisma.visitorLog.update({ where: { id: expiredVisitId }, data: { purgeAt: new Date(Date.now() - 1000) } });

    const purgeRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/visitors/purge`, headers: authHeader(owner.token),
    });
    expect(purgeRes.statusCode).toBe(200);
    expect(purgeRes.json().purged).toBe(1);

    const expiredAfter = await t.app.prisma.visitorLog.findUnique({ where: { id: expiredVisitId } });
    expect(expiredAfter).toBeNull();

    const freshAfter = await t.app.prisma.visitorLog.findUnique({ where: { id: freshVisitId } });
    expect(freshAfter).not.toBeNull();
  });
});
