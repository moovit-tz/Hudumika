// Automated cross-tenant proof for the Drive ("cloud") app — migration 455
// enabled + FORCE'd RLS on all 9 cloud_* tables, which had zero before.
// Two real tenants, a real file uploaded in tenant A through the actual HTTP
// route, and direct assertions that tenant B can never see it by list, by
// id, or by download — plus a pg_class check that the policies are really
// there (FORCE, not just ENABLE), the same shape as tenant-rls-coverage.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { dbPlatform } from '../db/client.js';
import { getApp, createTestTenant, authHeaders, type TestTenant } from './helpers.js';

const CLOUD_TABLES = [
  'cloud_files', 'cloud_file_shares', 'cloud_file_comments', 'cloud_file_versions',
  'cloud_file_access_log', 'cloud_drives', 'cloud_drive_members',
  'cloud_storage_connections', 'cloud_external_files',
];

async function enableCloud(tenantId: string) {
  await dbPlatform.insertInto('tenant_settings')
    .values({ tenant_id: tenantId, settings: JSON.stringify({ 'enabled-apps': { cloud: true } }) as any })
    .onConflict((oc) => oc.column('tenant_id').doUpdateSet({
      settings: sql`jsonb_set(coalesce(tenant_settings.settings, '{}'::jsonb), '{enabled-apps,cloud}', 'true'::jsonb, true)`,
    }))
    .execute();
}

/** Multipart body for a single in-memory file part. */
function multipart(fieldName: string, filename: string, contentType: string, body: string) {
  const boundary = '----drivetest' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(body),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('Drive (cloud_*) cross-tenant isolation — migration 455', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let driveA: string;
  let fileA: string;

  beforeAll(async () => {
    await getApp();
    tenantA = await createTestTenant('TENANT_ADMIN');
    tenantB = await createTestTenant('TENANT_ADMIN');
    await enableCloud(tenantA.tenantId);
    await enableCloud(tenantB.tenantId);

    const app = await getApp();
    const drive = await app.inject({
      method: 'POST', url: '/v1/drives', headers: authHeaders(tenantA.token),
      payload: { name: 'Probe drive', type: 'personal' },
    });
    expect(drive.statusCode).toBe(200);
    driveA = drive.json().id;

    const mp = multipart('file', 'secret-a.txt', 'text/plain', 'tenant A only — do not leak');
    const up = await app.inject({
      method: 'POST', url: `/v1/files/upload?drive_id=${driveA}`,
      headers: { ...authHeaders(tenantA.token), ...mp.headers },
      payload: mp.payload,
    });
    expect(up.statusCode).toBe(200);
    fileA = up.json().id;
  });

  afterAll(async () => {
    await tenantA.cleanup();
    await tenantB.cleanup();
  });

  it('all 9 cloud_* tables have RLS enabled, FORCEd, and a tenant_isolation_policy', async () => {
    const rows = await sql<{ relname: string; rls: boolean; forced: boolean; pols: string }>`
      SELECT c.relname,
             c.relrowsecurity      AS rls,
             c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policy p
                WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation_policy') AS pols
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY(${CLOUD_TABLES})
    `.execute(dbPlatform);

    expect(rows.rows).toHaveLength(CLOUD_TABLES.length);
    for (const r of rows.rows) {
      expect(r.rls, `${r.relname} RLS enabled`).toBe(true);
      expect(r.forced, `${r.relname} RLS forced`).toBe(true);
      expect(Number(r.pols), `${r.relname} has tenant_isolation_policy`).toBe(1);
    }
  });

  it("tenant A's file is invisible to tenant B by list, by id, and by download", async () => {
    const app = await getApp();

    // Owner sees it.
    const listA = await app.inject({ method: 'GET', url: `/v1/files?drive_id=${driveA}`, headers: authHeaders(tenantA.token) });
    expect(listA.statusCode).toBe(200);
    expect(listA.json().some((f: any) => f.id === fileA)).toBe(true);

    // Tenant B: the drive itself is not theirs → 404, never the file list.
    const listB = await app.inject({ method: 'GET', url: `/v1/files?drive_id=${driveA}`, headers: authHeaders(tenantB.token) });
    expect(listB.statusCode).toBe(404);

    // Tenant B: direct download of A's file id → 404, not the bytes, not a 500.
    const dlB = await app.inject({ method: 'GET', url: `/v1/files/${fileA}/download`, headers: authHeaders(tenantB.token) });
    expect(dlB.statusCode).toBe(404);

    // Tenant B: preview + access-log + versions of A's file → all 404.
    for (const path of [`/v1/files/${fileA}/preview`, `/v1/files/${fileA}/access-log`, `/v1/files/${fileA}/versions`]) {
      const res = await app.inject({ method: 'GET', url: path, headers: authHeaders(tenantB.token) });
      expect(res.statusCode, path).toBe(404);
    }

    // Owner download still works and returns the real bytes.
    const dlA = await app.inject({ method: 'GET', url: `/v1/files/${fileA}/download`, headers: authHeaders(tenantA.token) });
    expect(dlA.statusCode).toBe(200);
    expect(dlA.body).toContain('tenant A only');
  });

  it('a download is recorded in the access log and visible to the owner', async () => {
    const app = await getApp();
    await app.inject({ method: 'GET', url: `/v1/files/${fileA}/download`, headers: authHeaders(tenantA.token) });
    const log = await app.inject({ method: 'GET', url: `/v1/files/${fileA}/access-log`, headers: authHeaders(tenantA.token) });
    expect(log.statusCode).toBe(200);
    const entries = log.json().data as any[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.action === 'download' || e.action === 'preview')).toBe(true);
  });

  it('full-text search finds the file by a word from its content', async () => {
    const app = await getApp();
    const res = await app.inject({ method: 'GET', url: `/v1/files?q=leak`, headers: authHeaders(tenantA.token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((f: any) => f.id === fileA)).toBe(true);

    // …and tenant B's identical search returns nothing of A's.
    const resB = await app.inject({ method: 'GET', url: `/v1/files?q=leak`, headers: authHeaders(tenantB.token) });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().some((f: any) => f.id === fileA)).toBe(false);
  });
});
