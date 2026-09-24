// Quota accounting: version history and trash count against storage, usage is
// broken down by category, and warning levels trip at 70/85/95/100%.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPlatform } from '../db/client.js';
import { ensureDrive } from '../services/cloud-sync.service.js';
import { withTenant } from '../db/client.js';
import { getStorageQuota, quotaLevel, categoryOf } from '../lib/storage-quota.js';
import { getApp, createTestTenant, type TestTenant } from './helpers.js';

describe('Storage quota accounting', () => {
  let T: TestTenant;

  beforeAll(async () => {
    await getApp();
    T = await createTestTenant('TENANT_ADMIN');
    await withTenant(T.tenantId, async (trx) => {
      const driveId = await ensureDrive(trx, T.tenantId);
      const live = await trx.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'a.pdf', type: 'pdf', size: 1000, mime_type: 'application/pdf',
      }).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'pic.png', type: 'png', size: 400, mime_type: 'image/png',
      }).execute();
      await trx.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'old.pdf', type: 'pdf', size: 250, mime_type: 'application/pdf',
        is_trash: true, trashed_at: new Date(),
      }).execute();
      // A folder's own size is a rolled-up total and must never be counted.
      await trx.insertInto('cloud_files').values({
        tenant_id: T.tenantId, drive_id: driveId, name: 'Folder', type: 'folder', size: 99999,
      }).execute();
      await trx.insertInto('cloud_file_versions').values({
        tenant_id: T.tenantId, file_id: live.id, storage_key: 'k1', size: 700, mime_type: 'application/pdf',
      }).execute();
      await trx.insertInto('cloud_file_versions').values({
        tenant_id: T.tenantId, file_id: live.id, storage_key: 'k2', size: 300, mime_type: 'application/pdf',
      }).execute();
    });
  });

  afterAll(async () => { await T.cleanup(); });

  it('counts live files, trash and version history, but not folder roll-ups', async () => {
    const q = await getStorageQuota(T.tenantId);
    expect(q.live_bytes).toBe(1400);
    expect(q.trash_bytes).toBe(250);
    expect(q.versions_bytes).toBe(1000);
    expect(q.used_bytes).toBe(2650);
  });

  it('breaks usage down by category (versions follow their file type)', async () => {
    const q = await getStorageQuota(T.tenantId);
    expect(q.by_category.documents).toBe(1000 + 250 + 1000);
    expect(q.by_category.images).toBe(400);
    expect(Object.values(q.by_category).reduce((a, b) => a + b, 0)).toBe(q.used_bytes);
  });

  it('flags warning levels at 70 / 85 / 95 / 100 percent, and never for unlimited tiers', () => {
    expect(quotaLevel(69, 100)).toBe('ok');
    expect(quotaLevel(70, 100)).toBe('warning');
    expect(quotaLevel(85, 100)).toBe('high');
    expect(quotaLevel(95, 100)).toBe('critical');
    expect(quotaLevel(100, 100)).toBe('exceeded');
    expect(quotaLevel(10 ** 12, null)).toBe('ok');
  });

  it('classifies types into categories', () => {
    expect(categoryOf('pdf', null)).toBe('documents');
    expect(categoryOf('jpg', null)).toBe('images');
    expect(categoryOf('file', 'video/mp4')).toBe('video');
    expect(categoryOf('zip', null)).toBe('archives');
    expect(categoryOf('bin', null)).toBe('other');
  });

  it('a tenant with a limit reports its level from real usage', async () => {
    const tenant = await dbPlatform.selectFrom('tenants').select('plan').where('id', '=', T.tenantId).executeTakeFirst();
    const pkg = await dbPlatform.selectFrom('packages').select('storage_limit_bytes').where('code', '=', tenant!.plan).executeTakeFirst();
    const q = await getStorageQuota(T.tenantId);
    expect(q.limit_bytes).toBe(pkg?.storage_limit_bytes == null ? null : Number(pkg.storage_limit_bytes));
    expect(q.level).toBe(quotaLevel(q.used_bytes, q.limit_bytes));
  });
});
