// Notes regression suite — private/shared/team visibility and permissions
// (including this session's legal-hold ownership fix), the cross-tenant
// reference validation added alongside it (bogus subject type, nonexistent
// subject id, foreign-tenant share user), and optimistic concurrency. Real
// HTTP calls through the actual app (fastify.inject), a real Postgres
// tenant, RLS genuinely enforced.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableNotes(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { notes: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { notes: true } }) as any }))
    .execute();
}

describe('Notes — visibility, permissions, cross-tenant validation, concurrency', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    await getApp();
    A = await createTestTenant('TENANT_ADMIN');
    B = await createTestTenant('TENANT_ADMIN');
    await enableNotes(A.tenantId);
    await enableNotes(B.tenantId);
  });

  afterAll(async () => {
    await A.cleanup();
    await B.cleanup();
  });

  it('a private note is invisible to another tenant member, and they cannot edit it', async () => {
    const app = await getApp();
    const other = await A.addUser('SENIOR');
    const created = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: { title: 'My private note', content: 'secret', visibility: 'private' },
    });
    expect(created.statusCode).toBe(201);
    const noteId = created.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/notes', headers: authHeaders(other.token) });
    expect(list.statusCode).toBe(200);
    expect(list.json().notes.some((n: any) => n.id === noteId)).toBe(false);

    const patch = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(other.token),
      payload: { content: 'hijacked' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('a view-permission collaborator can read a shared note but not edit it', async () => {
    const app = await getApp();
    const viewer = await A.addUser('JUNIOR');
    const created = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: {
        title: 'Shared note', content: 'v1', visibility: 'shared',
        shares: [{ userId: viewer.userId, permission: 'view' }],
      },
    });
    expect(created.statusCode).toBe(201);
    const noteId = created.json().id;

    const list = await app.inject({ method: 'GET', url: '/v1/notes', headers: authHeaders(viewer.token) });
    expect(list.json().notes.some((n: any) => n.id === noteId)).toBe(true);

    const patch = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(viewer.token),
      payload: { content: 'edited by viewer' },
    });
    expect(patch.statusCode).toBe(403);
  });

  it('an edit-permission collaborator can edit content but not reshare or touch legal hold', async () => {
    const app = await getApp();
    const editor = await A.addUser('OFFICER');
    const created = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: {
        title: 'Editable shared note', content: 'v1', visibility: 'shared',
        shares: [{ userId: editor.userId, permission: 'edit' }],
      },
    });
    expect(created.statusCode).toBe(201);
    const noteId = created.json().id;

    const contentEdit = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(editor.token),
      payload: { content: 'edited by editor' },
    });
    expect(contentEdit.statusCode).toBe(200);
    expect(contentEdit.json().content).toBe('edited by editor');

    const reshare = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(editor.token),
      payload: { visibility: 'team' },
    });
    expect(reshare.statusCode).toBe(403);

    const legalHold = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(editor.token),
      payload: { legalHold: true },
    });
    expect(legalHold.statusCode).toBe(403);

    // The creator can do both.
    const creatorLegalHold = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(A.token),
      payload: { legalHold: true },
    });
    expect(creatorLegalHold.statusCode).toBe(200);
    expect(creatorLegalHold.json().legalHold).toBe(true);
  });

  it('rejects a bogus subject type and a nonexistent subject id', async () => {
    const app = await getApp();
    const badType = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: { title: 'x', subjectType: 'not_a_real_type', subjectId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(badType.statusCode).toBe(400);

    const missingRecord = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: { title: 'x', subjectType: 'customer', subjectId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(missingRecord.statusCode).toBe(400);
  });

  it("rejects a share for a user who doesn't belong to this tenant", async () => {
    const app = await getApp();
    const foreignUser = await B.addUser('OFFICER');
    const res = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: {
        title: 'Leaky share', content: 'x', visibility: 'shared',
        shares: [{ userId: foreignUser.userId, permission: 'view' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a stale update with a conflict, not a silent overwrite', async () => {
    const app = await getApp();
    const created = await app.inject({
      method: 'POST', url: '/v1/notes', headers: authHeaders(A.token),
      payload: { title: 'Concurrency test', content: 'v1' },
    });
    const noteId = created.json().id;
    const staleUpdatedAt = created.json().updatedAt;

    const firstEdit = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(A.token),
      payload: { content: 'v2' },
    });
    expect(firstEdit.statusCode).toBe(200);

    const staleEdit = await app.inject({
      method: 'PATCH', url: `/v1/notes/${noteId}`, headers: authHeaders(A.token),
      payload: { content: 'v3-based-on-stale-v1', expectedUpdatedAt: staleUpdatedAt },
    });
    expect(staleEdit.statusCode).toBe(409);
    expect(staleEdit.json().code).toBe('NOTE_CONFLICT');
  });
});
