import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTestApp, closeTestApp, authHeader, setupOrgWithMember, registerAndLogin, randomRegNumber,
  type TestApp,
} from './helpers.js';

describe('JML automation: OFFBOARDING flow really removes access', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('running the seeded OFFBOARDING flow deletes the UserRole and expires real sessions', async () => {
    const { owner, member, orgId } = await setupOrgWithMember(t, 'Serengeti Traders Ltd');

    // Confirm the member's login actually created a real, still-live session
    // before offboarding — otherwise "sessions expired" would be vacuously true.
    const sessionsBefore = await t.app.prisma.authSession.findMany({ where: { userId: member.userId } });
    expect(sessionsBefore.length).toBeGreaterThan(0);
    expect(sessionsBefore.every(s => s.expiresAt > new Date())).toBe(true);

    // Flows are lazily seeded on first fetch — GET them to find the real
    // OFFBOARDING flow's id rather than guessing/hardcoding one.
    const flowsRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/automation/flows`, headers: authHeader(owner.token),
    });
    expect(flowsRes.statusCode).toBe(200);
    const offboardingFlow = flowsRes.json().flows.find((f: any) => f.trigger === 'OFFBOARDING');
    expect(offboardingFlow).toBeTruthy();
    expect(offboardingFlow.status).toBe('ACTIVE');

    const runRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/${orgId}/automation/flows/${offboardingFlow.id}/run`,
      headers: authHeader(owner.token),
      payload: { memberId: member.userId },
    });
    expect(runRes.statusCode).toBe(201);
    expect(runRes.json().status).toBe('COMPLETED');

    const membershipAfter = await t.app.prisma.userRole.findFirst({ where: { userId: member.userId, organizationId: orgId } });
    expect(membershipAfter).toBeNull();

    const sessionsAfter = await t.app.prisma.authSession.findMany({ where: { userId: member.userId } });
    expect(sessionsAfter.length).toBeGreaterThan(0); // rows aren't deleted, just expired
    expect(sessionsAfter.every(s => s.expiresAt <= new Date())).toBe(true);

    // A real AutomationRun row was written, with a real (non-zero-ish) duration.
    const run = await t.app.prisma.automationRun.findFirst({ where: { flowId: offboardingFlow.id }, orderBy: { startedAt: 'desc' } });
    expect(run).not.toBeNull();
    expect(run!.status).toBe('COMPLETED');
    expect(run!.subjectUserId).toBe(member.userId);

    // The offboarded member can no longer refresh their now-expired session.
    const refreshRes = await t.app.inject({
      method: 'POST', url: '/v1/auth/token/refresh', payload: { refreshToken: member.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('refuses to run OFFBOARDING against the org\'s only remaining Owner', async () => {
    const owner = await registerAndLogin(t);
    const createRes = await t.app.inject({
      method: 'POST', url: '/v1/organizations', headers: authHeader(owner.token),
      payload: { businessName: 'Solo Owner Co', registrationNumber: randomRegNumber() },
    });
    const org = createRes.json();

    const flowsRes = await t.app.inject({ method: 'GET', url: `/v1/organizations/${org.id}/automation/flows`, headers: authHeader(owner.token) });
    const offboardingFlow = flowsRes.json().flows.find((f: any) => f.trigger === 'OFFBOARDING');

    const runRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/${org.id}/automation/flows/${offboardingFlow.id}/run`,
      headers: authHeader(owner.token),
      payload: { memberId: owner.userId },
    });
    expect(runRes.statusCode).toBe(422);
    expect(runRes.json().error).toBe('cannot_remove_last_owner');

    const stillMember = await t.app.prisma.userRole.findFirst({ where: { userId: owner.userId, organizationId: org.id } });
    expect(stillMember).not.toBeNull();
  });
});
