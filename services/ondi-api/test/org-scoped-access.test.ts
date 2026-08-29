import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTestApp, closeTestApp, registerAndLogin, authHeader, randomRegNumber,
  type TestApp,
} from './helpers.js';

/**
 * Delegated/scoped admin — the real architectural gap this covers: every
 * granted permission used to apply org-wide with no way to say "manage
 * team, but only within Group X." Covers the actual security property that
 * matters: a scoped grant must pass for its own scope and fail for a
 * different one, both directly (UserRole.scopeGroupId) and — in the same
 * test, reusing the same 4 registered users rather than registering more —
 * that an unscoped grant of the identical permission still applies
 * org-wide (no regression). A regression here (a scope check that's
 * accidentally too permissive) is a real security bug, not a UX bug, which
 * is exactly why this is a real Postgres-backed integration test and not
 * just a unit test of hasPermission in isolation — the permission
 * resolution in requireMember (real group-membership queries) is part of
 * what's being verified.
 *
 * Deliberately just 4 registerAndLogin calls total (well under
 * /v1/auth/request-otp's real 5/min rate limit, which is IP-keyed and
 * shared across every t.app.inject() call in a test run — going over it
 * isn't a bug in the feature, it's the rate limiter doing its job).
 */
describe('Delegated/scoped admin — org:manage_team scoped to a group', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('a scoped grant applies only within its group; an unscoped grant of the same permission still applies org-wide', async () => {
    const owner = await registerAndLogin(t);
    const groupAdmin = await registerAndLogin(t);
    const memberInScope = await registerAndLogin(t);
    const memberOutOfScope = await registerAndLogin(t);

    const org = (await t.app.inject({
      method: 'POST', url: '/v1/organizations', headers: authHeader(owner.token),
      payload: { businessName: 'Scoped Admin Test Co', registrationNumber: randomRegNumber() },
    })).json();

    async function invite(ondi: string) {
      const res = await t.app.inject({
        method: 'POST', url: `/v1/organizations/${org.id}/invite`, headers: authHeader(owner.token),
        payload: { ondi, roleName: 'Member' },
      });
      return res.json().inviteId as string;
    }
    async function accept(token: string, inviteId: string) {
      const res = await t.app.inject({
        method: 'POST', url: `/v1/organizations/invites/${inviteId}/accept`, headers: authHeader(token),
      });
      expect(res.statusCode).toBe(200);
    }
    for (const u of [groupAdmin, memberInScope, memberOutOfScope]) {
      await accept(u.token, await invite(u.ondi));
    }

    // A custom role that grants org:manage_team (nothing else) — same
    // ALL_ORG_PERMISSIONS-validated CRUD any real org admin uses.
    const roleRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${org.id}/access/roles`, headers: authHeader(owner.token),
      payload: { name: 'Group Admin', permissions: ['org:manage_team'] },
    });
    expect(roleRes.statusCode).toBe(201);

    // A real Group, with memberInScope (not groupAdmin) as its only member.
    const groupRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${org.id}/access/groups`, headers: authHeader(owner.token),
      payload: { name: 'Sales' },
    });
    const group = groupRes.json();
    const addMemberRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/${org.id}/access/groups/${group.id}/members/${memberInScope.userId}`,
      headers: authHeader(owner.token),
    });
    expect(addMemberRes.statusCode).toBe(201);

    // Promote groupAdmin to "Group Admin", scoped to the Sales group —
    // the actual feature under test.
    const promoteRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${org.id}/members/${groupAdmin.userId}/role`,
      headers: authHeader(owner.token),
      payload: { roleName: 'Group Admin', scopeGroupId: group.id },
    });
    expect(promoteRes.statusCode).toBe(200);

    const dbGrant = await t.app.prisma.userRole.findFirst({ where: { userId: groupAdmin.userId, organizationId: org.id } });
    expect(dbGrant!.scopeGroupId).toBe(group.id);

    // Positive: groupAdmin CAN change the role of memberInScope (in Sales).
    const allowedRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${org.id}/members/${memberInScope.userId}/role`,
      headers: authHeader(groupAdmin.token),
      payload: { roleName: 'Member' },
    });
    expect(allowedRes.statusCode).toBe(200);

    // Negative: groupAdmin CANNOT touch memberOutOfScope (not in Sales) —
    // the actual security property. Without scoping this would incorrectly
    // succeed, since groupAdmin does hold org:manage_team.
    const deniedRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${org.id}/members/${memberOutOfScope.userId}/role`,
      headers: authHeader(groupAdmin.token),
      payload: { roleName: 'Member' },
    });
    expect(deniedRes.statusCode).toBe(403);
    expect(deniedRes.json()).toEqual({ error: 'insufficient_permission' });

    // Regression check, reusing memberOutOfScope (already registered above,
    // no new OTP call) — an unscoped grant of the identical permission
    // still applies org-wide, same as before this change existed.
    const unscopedPromoteRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${org.id}/members/${memberOutOfScope.userId}/role`,
      headers: authHeader(owner.token),
      payload: { roleName: 'Admin' },
    });
    expect(unscopedPromoteRes.statusCode).toBe(200);

    const unscopedManageRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${org.id}/members/${memberInScope.userId}/role`,
      headers: authHeader(memberOutOfScope.token),
      payload: { roleName: 'Member' },
    });
    expect(unscopedManageRes.statusCode).toBe(200);
  });
});
