import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { dbPlatform, withTenant } from '../db/client.js';
import { findOnsiteBackupTenants, maintainOnsiteTenantBackups } from '../jobs/onsite-backup.job.js';
import { snapshotTenant, restoreSnapshot } from '../services/onsite-backup.service.js';

describe('Onsite scheduled configuration backups', { timeout: 60000 }, () => {
  let tenantId: string;
  let otherTenantId: string;
  beforeAll(async () => {
    for (const assign of [(id: string) => { tenantId = id; }, (id: string) => { otherTenantId = id; }]) {
      const tenant = await dbPlatform.insertInto('tenants').values({
        name: 'Disposable Onsite backup test', slug: `onsite-backup-test-${randomUUID()}`, plan: 'starter',
      }).returning('id').executeTakeFirstOrThrow();
      assign(tenant.id);
    }
    await withTenant(tenantId, async trx => {
      await trx.insertInto('onsite_websites').values({ tenant_id: tenantId, name: 'Website-only workspace', status: 'inactive' }).execute();
      await trx.insertInto('tenant_settings').values({ tenant_id: tenantId, settings: JSON.stringify({ 'onsite-backup-retention-days': 1 }) }).execute();
      await trx.insertInto('onsite_backups').values([
        { tenant_id: tenantId, trigger: 'scheduled', status: 'failed', snapshot: '{}', size_bytes: 0 },
        { tenant_id: tenantId, trigger: 'manual', status: 'completed', snapshot: '{}', size_bytes: 0, created_at: new Date(Date.now() - 3 * 86400000) },
      ]).execute();
    });
    await withTenant(otherTenantId, trx => trx.insertInto('onsite_backups').values({
      tenant_id: otherTenantId, trigger: 'manual', status: 'completed', snapshot: '{}', size_bytes: 0,
      created_at: new Date(Date.now() - 60 * 86400000),
    }).execute());
  }, 120000);
  afterAll(async () => {
    await Promise.all([tenantId, otherTenantId].filter(Boolean).map(id => dbPlatform.deleteFrom('tenants').where('id', '=', id).execute()));
  }, 120000);

  it('discovers website-only and backup-only workspaces', async () => {
    const tenants = await findOnsiteBackupTenants();
    expect(tenants).toContain(tenantId);
    expect(tenants).toContain(otherTenantId);
  });
  it('retries failed snapshots and serializes overlapping runs without pruning another tenant', async () => {
    const results = await Promise.all([maintainOnsiteTenantBackups(tenantId), maintainOnsiteTenantBackups(tenantId)]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.pruned, 0)).toBe(1);
    const backups = await withTenant(tenantId, trx => trx.selectFrom('onsite_backups').selectAll().where('tenant_id', '=', tenantId).execute());
    expect(backups.filter(row => row.status === 'completed')).toHaveLength(1);
    const stored = backups.find(row => row.status === 'completed')!.snapshot;
    const snapshot = typeof stored === 'string' ? JSON.parse(stored) : stored;
    expect(snapshot.websites).toHaveLength(1);
    expect(await withTenant(otherTenantId, trx => trx.selectFrom('onsite_backups').select('id').where('tenant_id', '=', otherTenantId).execute())).toHaveLength(1);
  });
  it('prunes expired records even when a recent successful backup skips creation', async () => {
    await withTenant(tenantId, trx => trx.insertInto('onsite_backups').values({
      tenant_id: tenantId, trigger: 'manual', status: 'completed', snapshot: '{}', size_bytes: 0,
      created_at: new Date(Date.now() - 3 * 86400000),
    }).execute());
    expect(await maintainOnsiteTenantBackups(tenantId)).toEqual({ created: 0, pruned: 1 });
  });
  it('prunes a backup-only workspace without creating endless empty snapshots', async () => {
    expect(await maintainOnsiteTenantBackups(otherTenantId)).toEqual({ created: 0, pruned: 1 });
  });
  it('restores an older website connection while pruning its newer connection', async () => {
    const targetConnection = await withTenant(tenantId, trx => trx.insertInto('onsite_provider_connections').values({ tenant_id: tenantId, provider: 'hostinger', name: 'Original', config_cipher: '{}' }).returning('id').executeTakeFirstOrThrow());
    await withTenant(tenantId, trx => trx.updateTable('onsite_websites').set({ provider_connection_id: targetConnection.id }).where('tenant_id', '=', tenantId).execute());
    const target = await snapshotTenant(tenantId);
    const newer = await withTenant(tenantId, trx => trx.insertInto('onsite_provider_connections').values({ tenant_id: tenantId, provider: 'hostinger', name: 'Newer', config_cipher: '{}' }).returning('id').executeTakeFirstOrThrow());
    await withTenant(tenantId, trx => trx.updateTable('onsite_websites').set({ provider_connection_id: newer.id }).where('tenant_id', '=', tenantId).execute());
    await restoreSnapshot(tenantId, target.snapshot);
    const restored = await snapshotTenant(tenantId);
    expect(restored.snapshot.websites[0].provider_connection_id).toBe(targetConnection.id);
    expect(restored.snapshot.provider_connections.map(row => row.id)).toEqual([targetConnection.id]);
  });
});
