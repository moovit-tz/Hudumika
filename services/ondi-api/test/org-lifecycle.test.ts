import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildTestApp, closeTestApp, registerAndLogin, authHeader, randomRegNumber,
  type TestApp,
} from './helpers.js';

describe('Organization lifecycle: create -> invite -> accept -> real UserRole', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('creates a real Organization with the caller as Owner', async () => {
    const owner = await registerAndLogin(t);

    const createRes = await t.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: authHeader(owner.token),
      payload: { businessName: 'Acme Logistics Tanzania', registrationNumber: randomRegNumber() },
    });
    expect(createRes.statusCode).toBe(201);
    const org = createRes.json();
    expect(org.id).toBeTruthy();

    const ownerRole = await t.app.prisma.userRole.findFirst({
      where: { userId: owner.userId, organizationId: org.id },
      include: { role: true },
    });
    expect(ownerRole).not.toBeNull();
    expect(ownerRole!.role.name).toBe('Owner');
  });

  it('invites a second real user by Ondi ID, and only they can accept it into a real membership', async () => {
    const owner = await registerAndLogin(t);
    const invitee = await registerAndLogin(t);
    const stranger = await registerAndLogin(t);

    const createRes = await t.app.inject({
      method: 'POST',
      url: '/v1/organizations',
      headers: authHeader(owner.token),
      payload: { businessName: 'Kilimanjaro Freight Co', registrationNumber: randomRegNumber() },
    });
    const org = createRes.json();

    const inviteRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/${org.id}/invite`,
      headers: authHeader(owner.token),
      payload: { ondi: invitee.ondi, roleName: 'Member' },
    });
    expect(inviteRes.statusCode).toBe(201);
    const { inviteId } = inviteRes.json();

    const dbInvite = await t.app.prisma.organizationInvite.findUnique({ where: { id: inviteId } });
    expect(dbInvite).not.toBeNull();
    expect(dbInvite!.invitedUserId).toBe(invitee.userId);
    expect(dbInvite!.acceptedAt).toBeNull();

    // A user who wasn't invited can't accept someone else's invite.
    const strangerAcceptRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/invites/${inviteId}/accept`,
      headers: authHeader(stranger.token),
    });
    expect(strangerAcceptRes.statusCode).toBe(404);

    // No membership exists yet — invite alone never creates one.
    const preAccept = await t.app.prisma.userRole.findFirst({ where: { userId: invitee.userId, organizationId: org.id } });
    expect(preAccept).toBeNull();

    const acceptRes = await t.app.inject({
      method: 'POST',
      url: `/v1/organizations/invites/${inviteId}/accept`,
      headers: authHeader(invitee.token),
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json()).toEqual({ joined: true, organizationId: org.id });

    const membership = await t.app.prisma.userRole.findFirst({
      where: { userId: invitee.userId, organizationId: org.id },
      include: { role: true },
    });
    expect(membership).not.toBeNull();
    expect(membership!.role.name).toBe('Member');

    const dbInviteAfter = await t.app.prisma.organizationInvite.findUnique({ where: { id: inviteId } });
    expect(dbInviteAfter!.acceptedAt).not.toBeNull();

    // GET members roster reflects the real membership.
    const membersRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${org.id}/members`, headers: authHeader(owner.token),
    });
    expect(membersRes.statusCode).toBe(200);
    const memberIds = membersRes.json().members.map((m: any) => m.userId);
    expect(memberIds).toContain(owner.userId);
    expect(memberIds).toContain(invitee.userId);
  });
});
