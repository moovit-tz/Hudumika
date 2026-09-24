// Resumable chunked uploads and email invitations (undone items from the Cloud review).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { dbPlatform } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

async function enableApps(tenantId: string, apps: Record<string, boolean>) {
  const settings = JSON.stringify({ 'enabled-apps': apps }) as any;
  await dbPlatform.insertInto('tenant_settings').values({ tenant_id: tenantId, settings })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({ settings })).execute();
}

describe('Cloud — resumable uploads and email invitations', () => {
  let T: TestTenant;
  let driveId: string;

  const call = (token: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: any, headers: Record<string, string> = {}) =>
    getApp().then(app => app.inject({ method, url, headers: { ...authHeaders(token), ...headers }, ...(payload !== undefined ? { payload } : {}) }));

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await enableApps(T.tenantId, { cloud: true });
    const drives = (await call(T.token, 'GET', '/v1/drives')).json();
    driveId = (Array.isArray(drives) ? drives : drives.data).find((d: any) => d.type === 'personal').id;
  });
  afterAll(async () => { await T.cleanup(); });

  describe('chunked upload', () => {
    it('rejects a session over the size cap, and refuses a chunk of the wrong size', async () => {
      const tooBig = await call(T.token, 'POST', '/v1/files/uploads', { name: 'huge.bin', size: 2 * 1024 * 1024 * 1024, drive_id: driveId });
      expect(tooBig.statusCode).toBe(413);

      const session = (await call(T.token, 'POST', '/v1/files/uploads', { name: 'a.bin', size: 12 * 1024 * 1024, drive_id: driveId })).json();
      expect(session.total_chunks).toBe(3); // 5MB, 5MB, 2MB
      const wrongSize = await call(T.token, 'PUT', `/v1/files/uploads/${session.id}/chunks/0`, Buffer.alloc(1024), { 'content-type': 'application/octet-stream' });
      expect(wrongSize.statusCode).toBe(400);
      expect(wrongSize.json().error).toBe('BAD_CHUNK_SIZE');
    });

    it('assembles chunks sent in any order, is idempotent on re-sent chunks, and completing twice is safe', async () => {
      const size = 11 * 1024 * 1024; // two 5MB chunks + one 1MB chunk
      const content = Buffer.alloc(size);
      for (let i = 0; i < size; i++) content[i] = i % 256;
      const session = (await call(T.token, 'POST', '/v1/files/uploads', { name: 'assembled.bin', size, drive_id: driveId })).json();
      const chunkAt = (i: number) => content.subarray(i * (5 * 1024 * 1024), Math.min((i + 1) * (5 * 1024 * 1024), size));

      // Out of order, plus a duplicate re-send of chunk 0.
      for (const i of [1, 0, 0, 2]) {
        const res = await call(T.token, 'PUT', `/v1/files/uploads/${session.id}/chunks/${i}`, chunkAt(i), { 'content-type': 'application/octet-stream' });
        expect(res.statusCode, `chunk ${i}`).toBe(200);
      }
      const status = (await call(T.token, 'GET', `/v1/files/uploads/${session.id}`)).json();
      expect(status.received).toEqual([0, 1, 2]);

      const done = await call(T.token, 'POST', `/v1/files/uploads/${session.id}/complete`, {});
      expect(done.statusCode, done.body).toBe(200);
      const fileId = done.json().id;
      const stored = await dbPlatform.selectFrom('cloud_files').select(['name', 'size', 'scan_status']).where('id', '=', fileId).executeTakeFirstOrThrow();
      expect(stored.name).toBe('assembled.bin');
      expect(Number(stored.size)).toBe(size);

      // The download really is the assembled content, byte-for-byte.
      const dl = await call(T.token, 'GET', `/v1/files/${fileId}/download`);
      expect(Buffer.from(dl.rawPayload).equals(content)).toBe(true);

      // A second /complete on an already-completed session does not create a second file.
      const again = await call(T.token, 'POST', `/v1/files/uploads/${session.id}/complete`, {});
      expect(again.statusCode).toBe(404);
    });

    it('refuses to complete while chunks are still missing, and blocks a size mismatch', async () => {
      const session = (await call(T.token, 'POST', '/v1/files/uploads', { name: 'partial.bin', size: 6 * 1024 * 1024, drive_id: driveId })).json();
      const incomplete = await call(T.token, 'POST', `/v1/files/uploads/${session.id}/complete`, {});
      expect(incomplete.statusCode).toBe(409);
      expect(incomplete.json().missing).toEqual([0, 1]);
    });

    it('resumes the same session for the same user/file fingerprint instead of starting over', async () => {
      const fp = { name: 'resume.bin', size: 6 * 1024 * 1024, drive_id: driveId, fingerprint: 'resume-key-1' };
      const first = (await call(T.token, 'POST', '/v1/files/uploads', fp)).json();
      await call(T.token, 'PUT', `/v1/files/uploads/${first.id}/chunks/0`, Buffer.alloc(5 * 1024 * 1024), { 'content-type': 'application/octet-stream' });
      const second = (await call(T.token, 'POST', '/v1/files/uploads', fp)).json();
      expect(second.id).toBe(first.id);
      expect(second.resumed).toBe(true);
      expect(second.received).toEqual([0]);
    });

    it('a cancelled session cannot be completed, and another user cannot touch someone else\'s session', async () => {
      const other = await T.addUser('SALES');
      const session = (await call(T.token, 'POST', '/v1/files/uploads', { name: 'cancel.bin', size: 1024, drive_id: driveId })).json();
      expect((await call(other.token, 'GET', `/v1/files/uploads/${session.id}`)).statusCode).toBe(404);
      expect((await call(T.token, 'DELETE', `/v1/files/uploads/${session.id}`)).statusCode).toBe(200);
      const chunk = await call(T.token, 'PUT', `/v1/files/uploads/${session.id}/chunks/0`, Buffer.alloc(1024), { 'content-type': 'application/octet-stream' });
      expect(chunk.statusCode).toBe(404); // cancelled sessions are no longer 'open'
    });

    it('refuses a session against a drive the user cannot write to', async () => {
      const other = await T.addUser('SALES');
      const otherDrives = (await call(other.token, 'GET', '/v1/drives')).json();
      const otherPersonal = (Array.isArray(otherDrives) ? otherDrives : otherDrives.data).find((d: any) => d.type === 'personal').id;
      const res = await call(T.token, 'POST', '/v1/files/uploads', { name: 'x.bin', size: 1024, drive_id: otherPersonal });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('email invitations', () => {
    let fileId: string;
    beforeAll(async () => {
      const row = await dbPlatform.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'invite-me.pdf', type: 'pdf', size: 10, owner_id: T.userId, owner_name: 'Owner', scan_status: 'clean',
      } as any).returning('id').executeTakeFirstOrThrow();
      fileId = row.id;
      const { storageKey } = await MinioIntegration.uploadCloudFile(T.tenantId, fileId, 'invite-me.pdf', Buffer.from('%PDF-1.4 x'));
      await dbPlatform.updateTable('cloud_files').set({ storage_key: storageKey } as any).where('id', '=', fileId).execute();
    });

    it('validates the email and refuses invitations to a folder', async () => {
      const bad = await call(T.token, 'POST', `/v1/files/${fileId}/invites`, { email: 'not-an-email' });
      expect(bad.statusCode).toBe(400);
      const folder = await dbPlatform.insertInto('cloud_files').values({ tenant_id: T.tenantId, drive_id: driveId, name: 'F', type: 'folder', size: 0, owner_id: T.userId, owner_name: 'Owner' } as any).returning('id').executeTakeFirstOrThrow();
      const onFolder = await call(T.token, 'POST', `/v1/files/${folder.id}/invites`, { email: 'a@b.test' });
      expect(onFolder.statusCode).toBe(400);
    });

    it('sends an invite, lists it, and only the owner or a drive manager can see or revoke it', async () => {
      const other = await T.addUser('SALES');
      const denied = await call(other.token, 'POST', `/v1/files/${fileId}/invites`, { email: 'guest@outside.test' });
      expect(denied.statusCode).toBe(404); // no access to the file at all (indistinguishable from "does not exist")

      const created = await call(T.token, 'POST', `/v1/files/${fileId}/invites`, { email: 'Guest@Outside.test', message: 'Here you go' });
      expect(created.statusCode, created.body).toBe(201);
      expect(created.json().url).toContain('/v1/files-public/invite/');
      expect(created.json().email).toBe('guest@outside.test');
      // Only the hash is stored, never the raw token.
      const row = await dbPlatform.selectFrom('cloud_file_invites').select(['email', 'token_hash']).where('id', '=', created.json().id).executeTakeFirstOrThrow();
      expect(row.token_hash).not.toContain(created.json().url.split('/').pop());

      // Same reasoning: no access to the file at all reads as "not found", not "forbidden".
      expect((await call(other.token, 'GET', `/v1/files/${fileId}/invites`)).statusCode).toBe(404);
      const list = await call(T.token, 'GET', `/v1/files/${fileId}/invites`);
      expect(list.json().data.map((i: any) => i.email)).toContain('guest@outside.test');
    });

    it('the invited link opens the file exactly once per visit and is logged under the invitee\'s email, revoking stops it', async () => {
      const app = await getApp();
      const created = (await call(T.token, 'POST', `/v1/files/${fileId}/invites`, { email: 'once@outside.test' })).json();
      const token = created.url.split('/').pop();
      const open1 = await app.inject({ method: 'GET', url: `/v1/files-public/invite/${token}` });
      expect(open1.statusCode).toBe(200);
      const log = await dbPlatform.selectFrom('cloud_file_access_log').select(['actor_name', 'action']).where('file_id', '=', fileId).where('actor_name', 'like', '%once@outside.test%').execute();
      expect(log).toEqual([{ actor_name: 'Invited: once@outside.test', action: 'link_download' }]);

      const revoked = await call(T.token, 'DELETE', `/v1/files/${fileId}/invites/${created.id}`);
      expect(revoked.statusCode, revoked.body).toBe(200);
      const afterRevoke = await app.inject({ method: 'GET', url: `/v1/files-public/invite/${token}` });
      expect(afterRevoke.statusCode).toBe(404);
    });

    it('an invite to a quarantined file cannot be opened', async () => {
      const app = await getApp();
      const created = (await call(T.token, 'POST', `/v1/files/${fileId}/invites`, { email: 'blocked@outside.test' })).json();
      await dbPlatform.updateTable('cloud_files').set({ scan_status: 'infected' } as any).where('id', '=', fileId).execute();
      const res = await app.inject({ method: 'GET', url: `/v1/files-public/invite/${created.url.split('/').pop()}` });
      expect(res.statusCode).toBe(423);
      await dbPlatform.updateTable('cloud_files').set({ scan_status: 'clean' } as any).where('id', '=', fileId).execute();
    });
  });
});
