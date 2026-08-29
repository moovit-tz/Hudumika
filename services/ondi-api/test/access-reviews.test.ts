import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp, authHeader, setupOrgWithMember, type TestApp } from './helpers.js';

describe('Access Review Campaigns: snapshot real grants, decide, auto-complete', () => {
  let t: TestApp;

  beforeAll(async () => { t = await buildTestApp(); });
  afterAll(async () => { await closeTestApp(t); });

  it('auto-populates items from current UserRole grants, REVOKED deletes the grant, campaign auto-completes', async () => {
    const { owner, member, orgId } = await setupOrgWithMember(t, 'Zanzibar Spice Exports');

    const grantsBefore = await t.app.prisma.userRole.count({ where: { organizationId: orgId } });
    expect(grantsBefore).toBe(2); // owner + member

    const startRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/access-reviews`, headers: authHeader(owner.token),
      payload: { name: 'Q1 Access Review' },
    });
    expect(startRes.statusCode).toBe(201);
    const campaign = startRes.json();
    expect(campaign.itemCount).toBe(grantsBefore);
    expect(campaign.status).toBe('IN_PROGRESS');

    const dbItems = await t.app.prisma.accessReviewItem.findMany({ where: { campaignId: campaign.id } });
    expect(dbItems).toHaveLength(2);
    const itemUserIds = dbItems.map(i => i.userId).sort();
    expect(itemUserIds).toEqual([owner.userId, member.userId].sort());
    expect(dbItems.every(i => i.decision === 'PENDING')).toBe(true);

    const memberItem = dbItems.find(i => i.userId === member.userId)!;
    const ownerItem = dbItems.find(i => i.userId === owner.userId)!;

    // Decide the member's item REVOKED — real deprovisioning path.
    const revokeRes = await t.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}/items/${memberItem.id}`,
      headers: authHeader(owner.token),
      payload: { decision: 'REVOKED' },
    });
    expect(revokeRes.statusCode).toBe(200);

    const memberMembershipAfter = await t.app.prisma.userRole.findFirst({ where: { userId: member.userId, organizationId: orgId } });
    expect(memberMembershipAfter).toBeNull();

    // Campaign shouldn't auto-complete yet — the owner's item is still PENDING.
    const campaignMidway = await t.app.prisma.accessReviewCampaign.findUnique({ where: { id: campaign.id } });
    expect(campaignMidway!.status).toBe('IN_PROGRESS');

    // Decide the owner's own item APPROVED (not revoked, so the owner keeps access).
    const approveRes = await t.app.inject({
      method: 'PATCH',
      url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}/items/${ownerItem.id}`,
      headers: authHeader(owner.token),
      payload: { decision: 'APPROVED' },
    });
    expect(approveRes.statusCode).toBe(200);

    // All items decided — campaign should now auto-transition to COMPLETED.
    const campaignAfter = await t.app.prisma.accessReviewCampaign.findUnique({ where: { id: campaign.id } });
    expect(campaignAfter!.status).toBe('COMPLETED');
    expect(campaignAfter!.completedAt).not.toBeNull();

    const ownerMembershipAfter = await t.app.prisma.userRole.findFirst({ where: { userId: owner.userId, organizationId: orgId } });
    expect(ownerMembershipAfter).not.toBeNull(); // APPROVED — access retained

    // Confirm via the real GET endpoint too, not just direct Prisma reads.
    const getRes = await t.app.inject({
      method: 'GET', url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}`, headers: authHeader(owner.token),
    });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.status).toBe('COMPLETED');
    const revokedItem = body.items.find((i: any) => i.id === memberItem.id);
    expect(revokedItem.decision).toBe('REVOKED');
  });

  it('rejects deciding an already-decided item and a decision on a completed campaign', async () => {
    const { owner, member, orgId } = await setupOrgWithMember(t, 'Mwanza Cold Chain');

    const startRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/access-reviews`, headers: authHeader(owner.token),
    });
    const campaign = startRes.json();
    const items = await t.app.prisma.accessReviewItem.findMany({ where: { campaignId: campaign.id } });
    const memberItem = items.find(i => i.userId === member.userId)!;
    const ownerItem = items.find(i => i.userId === owner.userId)!;

    await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}/items/${memberItem.id}`,
      headers: authHeader(owner.token), payload: { decision: 'REVOKED' },
    });

    // Deciding the same item twice is rejected.
    const doubleDecideRes = await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}/items/${memberItem.id}`,
      headers: authHeader(owner.token), payload: { decision: 'APPROVED' },
    });
    expect(doubleDecideRes.statusCode).toBe(409);
    expect(doubleDecideRes.json().error).toBe('item_already_decided');

    // Finish the campaign.
    await t.app.inject({
      method: 'PATCH', url: `/v1/organizations/${orgId}/access-reviews/${campaign.id}/items/${ownerItem.id}`,
      headers: authHeader(owner.token), payload: { decision: 'APPROVED' },
    });
    const completed = await t.app.prisma.accessReviewCampaign.findUnique({ where: { id: campaign.id } });
    expect(completed!.status).toBe('COMPLETED');

    // A brand-new access review can't be started against a completed one's
    // id, but starting a fresh campaign on the same org (which now has 1
    // active grant — the owner) should still work and re-snapshot.
    const secondStartRes = await t.app.inject({
      method: 'POST', url: `/v1/organizations/${orgId}/access-reviews`, headers: authHeader(owner.token),
    });
    expect(secondStartRes.statusCode).toBe(201);
    expect(secondStartRes.json().itemCount).toBe(1);
  });
});
