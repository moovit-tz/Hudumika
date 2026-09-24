// Same-tenant authorization for Cloud: a file's UUID alone never grants anything.
// Covers signed URLs, sharing (real principals only), public links, comments,
// versions, folder-cycle moves and the fail-closed scan states.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { servingBlock, scanStatusFor } from '../lib/cloud-scan-policy.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  const settings = JSON.stringify({ 'enabled-apps': apps }) as any;
  await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenantId, settings })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings })).execute();
}

describe('Cloud same-tenant authorization', () => {
  let T: TestTenant;
  let alice: { userId: string; token: string };
  let bob: { userId: string; token: string };
  let carol: { userId: string; token: string };
  let driveId: string;
  let fileA: string;
  let fileB: string;

  const call = async (token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: any) =>
    (await getApp()).inject({ method, url, headers: authHeaders(token), ...(payload !== undefined ? { payload } : (method === 'POST' || method === 'PUT' || method === 'DELETE') ? { payload: {} } : {}) });

  const makeFile = async (name: string, parent: string | null = null) => {
    const row = await dbPlatform.insertInto('cloud_files').values({
      tenant_id: T.tenantId, drive_id: driveId, name, type: 'pdf', size: 12, owner_id: alice.userId, owner_name: 'Alice', parent_id: parent, scan_status: 'clean',
    } as any).returning('id').executeTakeFirstOrThrow();
    const { storageKey } = await MinioIntegration.uploadCloudFile(T.tenantId, row.id, name, Buffer.from('%PDF-1.4 hello'));
    await dbPlatform.updateTable('cloud_files').set({ storage_key: storageKey } as any).where('id', '=', row.id).execute();
    return row.id;
  };
  const makeFolder = async (name: string, parent: string | null = null) =>
    (await dbPlatform.insertInto('cloud_files').values({ tenant_id: T.tenantId, drive_id: driveId, name, type: 'folder', size: 0, owner_id: alice.userId, owner_name: 'Alice', parent_id: parent } as any).returning('id').executeTakeFirstOrThrow()).id;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { cloud: true });
    alice = { userId: T.userId, token: T.token };
    bob = await T.addUser('SALES');
    carol = await T.addUser('SALES');
    // Alice's PERSONAL drive (created the way the app does, on first list).
    const drives = (await call(alice.token, 'GET', '/v1/drives')).json();
    driveId = (Array.isArray(drives) ? drives : drives.data).find((d: any) => d.type === 'personal').id;
    fileA = await makeFile('secret-a.pdf');
    fileB = await makeFile('secret-b.pdf');
  });
  afterAll(async () => { await T.cleanup(); });

  it('signed URLs need real access, refuse quarantined/unscanned files, and are audited', async () => {
    const denied = await call(bob.token, 'GET', `/v1/files/${fileA}/signed-url`);
    expect(denied.statusCode).toBe(404); // indistinguishable from "does not exist"
    const ok = await call(alice.token, 'GET', `/v1/files/${fileA}/signed-url`);
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().url).toBeTruthy();
    const log = await dbPlatform.selectFrom('cloud_file_access_log').select(['action', 'user_id']).where('file_id', '=', fileA).where('action', '=', 'signed_url').execute();
    expect(log).toEqual([{ action: 'signed_url', user_id: alice.userId }]);

    for (const status of ['infected', 'pending']) {
      await dbPlatform.updateTable('cloud_files').set({ scan_status: status } as any).where('id', '=', fileA).execute();
      const blocked = await call(alice.token, 'GET', `/v1/files/${fileA}/signed-url`);
      expect(blocked.statusCode).toBe(423);
      expect((await call(alice.token, 'GET', `/v1/files/${fileA}/download`)).statusCode).toBe(423);
      expect((await call(alice.token, 'GET', `/v1/files/${fileA}/preview`)).statusCode).toBe(423);
    }
    await dbPlatform.updateTable('cloud_files').set({ scan_status: 'clean' } as any).where('id', '=', fileA).execute();
  });

  it('other users cannot read comments, versions, the access log or share state of a private file', async () => {
    for (const [method, url, payload] of [
      ['GET', `/v1/files/${fileA}/comments`, undefined],
      ['POST', `/v1/files/${fileA}/comments`, { content: 'hi' }],
      ['GET', `/v1/files/${fileA}/versions`, undefined],
      ['POST', `/v1/files/${fileA}/versions/${randomUUID()}/restore`, {}],
      ['GET', `/v1/files/${fileA}/versions/${randomUUID()}/download`, undefined],
      ['GET', `/v1/files/${fileA}/access-log`, undefined],
      ['PUT', `/v1/files/${fileA}/share`, { shared: [{ principal_type: 'user', principal_id: carol.userId, role: 'Viewer' }] }],
      ['POST', `/v1/files/${fileA}/public-link`, {}],
      ['DELETE', `/v1/files/${fileA}/public-link`, undefined],
    ] as const) {
      const res = await call(carol.token, method, url, payload as any);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await call(carol.token, 'GET', `/v1/files/${fileA}/download`)).statusCode).toBe(403);
  });

  describe('sharing', () => {
    it('refuses typed names and unknown people — a share must name a real workspace member', async () => {
      const typed = await call(alice.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [{ name: 'Somebody', role: 'Viewer' }] });
      expect(typed.statusCode).toBe(400);
      expect(typed.json().error).toBe('INVALID_SHARE_TARGET');
      const stranger = await call(alice.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [{ principal_type: 'user', principal_id: randomUUID(), role: 'Viewer' }] });
      expect(stranger.statusCode).toBe(400);
      const badRole = await call(alice.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [{ principal_type: 'user', principal_id: bob.userId, role: 'Owner' }] });
      expect(badRole.statusCode).toBe(400);
    });

    it('a Viewer share gives real read + comment access and nothing more; an Editor share adds writing, never re-sharing', async () => {
      const share = await call(alice.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [{ principal_type: 'user', principal_id: bob.userId, role: 'Viewer', name: 'ignored typed name' }] });
      expect(share.statusCode, share.body).toBe(200);
      expect(share.json().shared[0].name).not.toBe('ignored typed name'); // display name comes from the server, not the client
      expect(share.json().public_url).toBeNull(); // sharing a person never mints a public link

      // Real access:
      expect((await call(bob.token, 'GET', `/v1/files/${fileA}/download`)).statusCode).toBe(200);
      expect((await call(bob.token, 'GET', `/v1/files/${fileA}/signed-url`)).statusCode).toBe(200);
      expect((await call(bob.token, 'POST', `/v1/files/${fileA}/comments`, { content: 'looks fine' })).statusCode).toBe(200);
      const mine = (await call(bob.token, 'GET', '/v1/files/shared-with-me')).json().data;
      expect(mine.map((f: any) => f.id)).toContain(fileA);
      // …and its limits:
      expect((await call(bob.token, 'GET', `/v1/files/${fileB}/download`)).statusCode).toBe(403);
      expect((await call(bob.token, 'POST', `/v1/files/${fileA}/versions/${randomUUID()}/restore`, {})).statusCode).toBe(403);
      expect((await call(bob.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [] })).statusCode).toBe(403);
      expect((await call(bob.token, 'POST', `/v1/files/${fileA}/public-link`, {})).statusCode).toBe(403);
      // Carol still has nothing.
      expect((await call(carol.token, 'GET', `/v1/files/${fileA}/download`)).statusCode).toBe(403);

      // Editor: may write (restore is a write), still may not share.
      await call(alice.token, 'PUT', `/v1/files/${fileA}/share`, { shared: [{ principal_type: 'user', principal_id: bob.userId, role: 'Editor' }] });
      expect((await call(bob.token, 'POST', `/v1/files/${fileA}/versions/${randomUUID()}/restore`, {})).statusCode).toBe(404); // allowed to try → version simply doesn't exist
      expect((await call(bob.token, 'POST', `/v1/files/${fileA}/public-link`, {})).statusCode).toBe(403);
    });

    it('changes to sharing are audited with who was added, removed or changed', async () => {
      await call(alice.token, 'PUT', `/v1/files/${fileB}/share`, { shared: [{ principal_type: 'user', principal_id: bob.userId, role: 'Viewer' }] });
      await call(alice.token, 'PUT', `/v1/files/${fileB}/share`, { shared: [{ principal_type: 'user', principal_id: bob.userId, role: 'Editor' }] });
      await call(alice.token, 'PUT', `/v1/files/${fileB}/share`, { shared: [] });
      const events = await dbPlatform.selectFrom('domain_events').select('payload').where('tenant_id', '=', T.tenantId).where('entity_id', '=', fileB).where('event_type', '=', 'file.shared').orderBy('created_at').execute();
      const payloads = events.map(e => (typeof e.payload === 'string' ? JSON.parse(e.payload as any) : e.payload) as any);
      expect(payloads[0].added).toHaveLength(1);
      expect(payloads[1].changed[0]).toMatchObject({ from: 'Viewer', to: 'Editor' });
      expect(payloads[2].removed).toHaveLength(1);
    });
  });

  describe('public links', () => {
    it('are a separate, gated, audited capability with an absolute URL; rotate and revoke really invalidate the old one', async () => {
      const app = await getApp();
      const created = await call(alice.token, 'POST', `/v1/files/${fileA}/public-link`, {});
      expect(created.statusCode, created.body).toBe(200);
      const { share_token, public_url } = created.json();
      expect(public_url).toMatch(/^https?:\/\/.+\/v1\/files-public\/.+\/download$/);
      expect((await app.inject({ method: 'GET', url: `/v1/files-public/${share_token}/download` })).statusCode).toBe(200);

      const same = await call(alice.token, 'POST', `/v1/files/${fileA}/public-link`, {});
      expect(same.json().share_token).toBe(share_token); // idempotent unless rotating

      const rotated = await call(alice.token, 'POST', `/v1/files/${fileA}/public-link`, { rotate: true });
      expect(rotated.json().share_token).not.toBe(share_token);
      expect((await app.inject({ method: 'GET', url: `/v1/files-public/${share_token}/download` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/v1/files-public/${rotated.json().share_token}/download` })).statusCode).toBe(200);

      // An unscanned file is not served even through a valid link.
      await dbPlatform.updateTable('cloud_files').set({ scan_status: 'pending' } as any).where('id', '=', fileA).execute();
      expect((await app.inject({ method: 'GET', url: `/v1/files-public/${rotated.json().share_token}/download` })).statusCode).toBe(423);
      await dbPlatform.updateTable('cloud_files').set({ scan_status: 'clean' } as any).where('id', '=', fileA).execute();

      await call(alice.token, 'DELETE', `/v1/files/${fileA}/public-link`);
      expect((await app.inject({ method: 'GET', url: `/v1/files-public/${rotated.json().share_token}/download` })).statusCode).toBe(404);

      const types = (await dbPlatform.selectFrom('domain_events').select('event_type').where('tenant_id', '=', T.tenantId).where('entity_id', '=', fileA).where('event_type', 'like', 'file.link.%').orderBy('created_at').execute()).map(e => e.event_type);
      expect(types).toEqual(['file.link.created', 'file.link.rotated', 'file.link.revoked']);
    });

    it('a folder cannot be link-shared', async () => {
      const folder = await makeFolder('Public?');
      expect((await call(alice.token, 'POST', `/v1/files/${folder}/public-link`, {})).statusCode).toBe(400);
    });
  });

  describe('comments', () => {
    it('a comment can only be edited or deleted through the file it belongs to', async () => {
      const posted = (await call(alice.token, 'POST', `/v1/files/${fileA}/comments`, { content: 'mine' })).json();
      const wrongFile = await call(alice.token, 'PATCH', `/v1/files/${fileB}/comments/${posted.id}`, { content: 'sneaky' });
      expect(wrongFile.statusCode).toBe(404);
      const wrongDelete = await call(alice.token, 'DELETE', `/v1/files/${fileB}/comments/${posted.id}`);
      expect(wrongDelete.statusCode).toBe(404);
      const still = await dbPlatform.selectFrom('cloud_file_comments').select('content').where('id', '=', posted.id).executeTakeFirstOrThrow();
      expect(still.content).toBe('mine');
      expect((await call(alice.token, 'PATCH', `/v1/files/${fileA}/comments/${posted.id}`, { content: 'edited' })).statusCode).toBe(200);
      // A user with no access to the file cannot touch its comments even knowing both ids.
      expect((await call(carol.token, 'PATCH', `/v1/files/${fileA}/comments/${posted.id}`, { content: 'x' })).statusCode).toBe(404);
    });
  });

  describe('moving folders', () => {
    it('refuses cycles (into itself or a descendant) and non-folder destinations', async () => {
      const f = await makeFolder('F');
      const g = await makeFolder('G', f);
      const h = await makeFolder('H', g);
      const file = await makeFile('leaf.pdf');
      expect((await call(alice.token, 'POST', `/v1/files/${f}/move`, { parent_id: f })).statusCode).toBe(400);
      expect((await call(alice.token, 'POST', `/v1/files/${f}/move`, { parent_id: g })).statusCode).toBe(400);
      expect((await call(alice.token, 'POST', `/v1/files/${f}/move`, { parent_id: h })).statusCode).toBe(400);
      expect((await call(alice.token, 'POST', `/v1/files/${g}/move`, { parent_id: file })).statusCode).toBe(400);
      // Legitimate moves still work: up to the root, and a leaf folder into a sibling.
      expect((await call(alice.token, 'POST', `/v1/files/${h}/move`, { parent_id: null })).statusCode).toBe(200);
      expect((await call(alice.token, 'POST', `/v1/files/${h}/move`, { parent_id: f })).statusCode).toBe(200);
    });
  });

  describe('scan policy', () => {
    it('unscanned uploads are pending (never served) when a scan is required, and infected files are always blocked', () => {
      expect(servingBlock('infected')?.code).toBe('QUARANTINED');
      expect(servingBlock('pending')?.code).toBe('SCAN_PENDING');
      expect(servingBlock('clean')).toBeNull();
      expect(servingBlock('skipped')).toBeNull(); // dev/test only: skipped is only ever stored when scanning is not required
      expect(scanStatusFor({ clean: false, signature: 'Eicar' } as any)).toBe('infected');
      expect(scanStatusFor({ clean: true } as any)).toBe('clean');
      // Test environment does not require scanning, so an unconfigured scanner reads 'skipped'.
      expect(scanStatusFor({ clean: true, skipped: true } as any)).toBe('skipped');
    });
  });
});
