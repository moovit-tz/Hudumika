// Functional verification for the personal-drive isolation fix (migration
// 498): before this, GET /v1/drives returned every drive in the tenant to
// every staff user with no owner_id filter, so a "personal" drive was
// personal in name only. This proves, within ONE tenant (same-tenant
// isolation is the actual bug — cloud-drive-rls.test.ts already covers
// cross-tenant), that:
//   - a second staff member never sees the first's personal drive at all;
//   - browsing it directly by id, searching for its contents, and every
//     write operation (upload/folder/rename/move/trash/restore) on a file
//     inside it are all refused;
//   - the drive-member "add by real user" flow actually gates access, not
//     just a free-text label;
//   - Business Records is genuinely shared (every staff member sees it and
//     can file into it), matching what CloudSync's automatic folders rely on.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableCloud(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { cloud: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings: JSON.stringify({ 'enabled-apps': { cloud: true } }) as any }))
    .execute();
}

function multipart(fieldName: string, filename: string, contentType: string, body: string) {
  const boundary = '----personaldrivetest' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(body),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('Personal drive isolation (migration 498)', () => {
  let T: TestTenant;
  let userA: { userId: string; token: string };
  let userB: { userId: string; token: string };
  let driveA: string;
  let fileA: string;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableCloud(T.tenantId);
    userA = await T.addUser('SENIOR');
    userB = await T.addUser('SENIOR');

    const app = await getApp();
    // GET / auto-creates userA's own personal drive.
    const listA = await app.inject({ method: 'GET', url: '/v1/drives', headers: authHeaders(userA.token) });
    expect(listA.statusCode).toBe(200);
    const personal = listA.json().find((d: any) => d.type === 'personal');
    expect(personal).toBeTruthy();
    driveA = personal.id;

    const mp = multipart('file', 'private.txt', 'text/plain', 'userA private file');
    const up = await app.inject({
      method: 'POST', url: `/v1/files/upload?drive_id=${driveA}`,
      headers: { ...authHeaders(userA.token), ...mp.headers },
      payload: mp.payload,
    });
    expect(up.statusCode).toBe(200);
    fileA = up.json().id;
  });

  afterAll(async () => { await T.cleanup(); });

  it("GET /v1/drives never returns another staff member's personal drive", async () => {
    const app = await getApp();
    const listB = await app.inject({ method: 'GET', url: '/v1/drives', headers: authHeaders(userB.token) });
    expect(listB.statusCode).toBe(200);
    expect(listB.json().some((d: any) => d.id === driveA)).toBe(false);
    // ...but userB does have their own (auto-created) personal drive, and it's a different id.
    const ownPersonal = listB.json().find((d: any) => d.type === 'personal');
    expect(ownPersonal).toBeTruthy();
    expect(ownPersonal.id).not.toBe(driveA);
  });

  it("browsing user A's personal drive by id is refused for user B", async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/files?drive_id=${driveA}`, headers: authHeaders(userB.token) });
    expect(res.statusCode).toBe(404);
  });

  it("tenant-wide search never surfaces another staff member's personal file", async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/v1/files?q=private', headers: authHeaders(userB.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((f: any) => f.id === fileA)).toBe(false);
    // Owner's own search still finds it.
    const ownRes = await app.inject({ method: 'GET', url: '/v1/files?q=private', headers: authHeaders(userA.token) });
    expect(ownRes.json().some((f: any) => f.id === fileA)).toBe(true);
  });

  it('every write operation on a file inside a personal drive is refused for a non-owner', async () => {
    const app = await getApp();

    const upload = await multipart('file', 'intrude.txt', 'text/plain', 'x');
    const uploadRes = await app.inject({
      method: 'POST', url: `/v1/files/upload?drive_id=${driveA}`,
      headers: { ...authHeaders(userB.token), ...upload.headers }, payload: upload.payload,
    });
    expect(uploadRes.statusCode).toBe(404);

    const folderRes = await app.inject({
      method: 'POST', url: '/v1/files/folder', headers: authHeaders(userB.token),
      payload: { name: 'Intrusion', drive_id: driveA },
    });
    expect(folderRes.statusCode).toBe(404);

    const patchRes = await app.inject({
      method: 'PATCH', url: `/v1/files/${fileA}`, headers: authHeaders(userB.token),
      payload: { name: 'renamed-by-intruder.txt' },
    });
    expect(patchRes.statusCode).toBe(403);

    const trashRes = await app.inject({ method: 'POST', url: `/v1/files/${fileA}/trash`, headers: authHeaders(userB.token), payload: {} });
    expect(trashRes.statusCode).toBe(403);

    const moveRes = await app.inject({
      method: 'POST', url: `/v1/files/${fileA}/move`, headers: authHeaders(userB.token), payload: { parent_id: null },
    });
    expect(moveRes.statusCode).toBe(403);

    // Owner's own writes still work.
    const ownPatch = await app.inject({
      method: 'PATCH', url: `/v1/files/${fileA}`, headers: authHeaders(userA.token), payload: { starred: true },
    });
    expect(ownPatch.statusCode).toBe(200);
  });

  it('a shared drive is invisible until a real user is added as a member, then works', async () => {
    const app = await getApp();
    const shared = await app.inject({ method: 'POST', url: '/v1/drives', headers: authHeaders(userA.token), payload: { name: 'Ops Team' } });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().type).toBe('shared'); // POST / can only ever create 'shared' now
    const sharedId = shared.json().id;

    // userB has no membership yet — refused.
    const before = await app.inject({ method: 'GET', url: `/v1/files?drive_id=${sharedId}`, headers: authHeaders(userB.token) });
    expect(before.statusCode).toBe(404);

    // Free-text names are no longer accepted.
    const badAdd = await app.inject({
      method: 'POST', url: `/v1/drives/${sharedId}/members`, headers: authHeaders(userA.token),
      payload: { person_name: 'Someone I typed', role: 'viewer' },
    });
    expect(badAdd.statusCode).toBe(400);

    // Real principal — resolved via member-candidates, exactly what the UI does.
    const candidates = await app.inject({ method: 'GET', url: `/v1/drives/${sharedId}/member-candidates?q=`, headers: authHeaders(userA.token) });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().some((c: any) => c.id === userB.userId)).toBe(true);

    const add = await app.inject({
      method: 'POST', url: `/v1/drives/${sharedId}/members`, headers: authHeaders(userA.token),
      payload: { principal_id: userB.userId, role: 'viewer' },
    });
    expect(add.statusCode).toBe(200);
    expect(add.json().principal_type).toBe('user');
    expect(add.json().principal_id).toBe(userB.userId);

    // Now userB can see the drive and read (viewer role) but not write.
    const after = await app.inject({ method: 'GET', url: `/v1/files?drive_id=${sharedId}`, headers: authHeaders(userB.token) });
    expect(after.statusCode).toBe(200);
    const viewerFolder = await app.inject({
      method: 'POST', url: '/v1/files/folder', headers: authHeaders(userB.token),
      payload: { name: 'Should fail', drive_id: sharedId },
    });
    expect(viewerFolder.statusCode).toBe(403);
  });

  it('Business Records is visible to every staff member and accepts uploads from any of them', async () => {
    const app = await getApp();
    const listA = await app.inject({ method: 'GET', url: '/v1/drives', headers: authHeaders(userA.token) });
    const listB = await app.inject({ method: 'GET', url: '/v1/drives', headers: authHeaders(userB.token) });
    const businessA = listA.json().find((d: any) => d.type === 'business');
    const businessB = listB.json().find((d: any) => d.type === 'business');
    expect(businessA).toBeTruthy();
    expect(businessB).toBeTruthy();
    expect(businessA.id).toBe(businessB.id); // same one drive, shared by the whole tenant

    const mp = multipart('file', 'shipment-doc.txt', 'text/plain', 'a business record');
    const up = await app.inject({
      method: 'POST', url: `/v1/files/upload?drive_id=${businessA.id}`,
      headers: { ...authHeaders(userB.token), ...mp.headers }, payload: mp.payload,
    });
    expect(up.statusCode).toBe(200);
  });

  it('a non-admin cannot list every drive in the tenant via the admin override', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: '/v1/drives?admin=1', headers: authHeaders(userA.token) });
    expect(res.statusCode).toBe(403);
  });

  it('a TENANT_ADMIN can use the explicit admin override, and it is audited', async () => {
    const app = await getApp();
    const admin = await T.addUser('TENANT_ADMIN');
    const res = await app.inject({ method: 'GET', url: '/v1/drives?admin=1', headers: authHeaders(admin.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((d: any) => d.id === driveA)).toBe(true); // sees userA's personal drive too

    const events = await dbPlatform.selectFrom('domain_events').select(['event_type', 'actor_id'])
      .where('tenant_id', '=', T.tenantId).where('event_type', '=', 'cloud.drive.admin_override').execute();
    expect(events.some(e => e.actor_id === admin.userId)).toBe(true);
  });
});
