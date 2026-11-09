// Module marketplace lifecycle (backlog S08). Acceptance: "a real module
// completes its lifecycle and loses access when revoked." Deliberately not
// a sandboxed code-execution test — the backlog is explicit that arbitrary
// uploaded code is out of scope; the only real integration surface a module
// has is its webhook_url (domain-events.service.ts), so "loses access" is
// proven by checking that channel's own eligibility query.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPlatform, withTenant } from '../db/client.js';
import {
  submitAppVersion, reviewAppVersion, installApp, configureApp, activateApp,
  updateAppVersion, disableApp, uninstallApp, listLifecycleHistory,
} from '../services/marketplace-lifecycle.service.js';
import { createTestTenant, type TestTenant } from './helpers.js';

describe('Module marketplace — versioned manifest, lifecycle, and access revocation', () => {
  let tenant: TestTenant;
  let appId: string;

  beforeAll(async () => {
    tenant = await createTestTenant();
    const app = await dbPlatform.insertInto('marketplace_apps').values({
      name: 'Lifecycle Test Module', developer_id: tenant.userId, developer_name: 'Test Developer',
      category: 'test', short_desc: 'Test module', long_desc: 'Test module for lifecycle verification.',
      status: 'approved',
    }).returning('id').executeTakeFirstOrThrow();
    appId = app.id;
  }, 120000);

  afterAll(async () => {
    await withTenant(tenant.tenantId, async trx => {
      await trx.deleteFrom('store_app_lifecycle_events').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('tenant_marketplace_installs').where('tenant_id', '=', tenant.tenantId).execute();
      await trx.deleteFrom('store_installed_apps').where('tenant_id', '=', tenant.tenantId).execute();
    });
    await dbPlatform.updateTable('marketplace_apps').set({ current_version_id: null }).where('id', '=', appId).execute();
    await dbPlatform.deleteFrom('marketplace_app_versions').where('app_id', '=', appId).execute();
    await dbPlatform.deleteFrom('marketplace_apps').where('id', '=', appId).execute();
    await tenant.cleanup();
  }, 120000);

  it('reviews a manifest version, then runs install -> configure -> activate -> update -> disable -> uninstall with preserved history', async () => {
    // A version starting life as a draft/pending-review is not installable yet.
    const v1 = await submitAppVersion(appId, tenant.userId, '1.0.0', {
      permissions: ['read:shipments'],
      config_schema: { fields: [{ key: 'api_key', label: 'API Key', type: 'string', required: true }] },
      events_declared: ['shipment.created'],
      financial_contract: { touches_money: false },
      privacy_declaration: 'Reads shipment metadata only; stores nothing.',
    });
    expect(v1.status).toBe('pending_review');
    await expect(installApp(tenant.tenantId, appId, tenant.userId)).rejects.toThrow('has no approved version');

    const approved = await reviewAppVersion(v1.id, tenant.userId, 'approved');
    expect(approved.status).toBe('approved');

    // Install pins the current approved version.
    const installed = await installApp(tenant.tenantId, appId, tenant.userId);
    expect(installed.status).toBe('installed');
    expect(installed.version_id).toBe(v1.id);
    await expect(installApp(tenant.tenantId, appId, tenant.userId)).rejects.toThrow('Already installed');

    // Activation is refused until the required config field is set.
    await expect(activateApp(tenant.tenantId, appId, tenant.userId)).rejects.toThrow('Missing required configuration field');

    const configured = await configureApp(tenant.tenantId, appId, tenant.userId, { api_key: 'sk-test-123' });
    expect(configured.status).toBe('configured');

    const activated = await activateApp(tenant.tenantId, appId, tenant.userId);
    expect(activated.status).toBe('active');

    // A second, newer version — updating moves the install onto it without losing config.
    const v2 = await submitAppVersion(appId, tenant.userId, '2.0.0', {
      permissions: ['read:shipments', 'read:invoices'],
      config_schema: { fields: [{ key: 'api_key', label: 'API Key', type: 'string', required: true }] },
    });
    await reviewAppVersion(v2.id, tenant.userId, 'approved');
    const updated = await updateAppVersion(tenant.tenantId, appId, tenant.userId);
    expect(updated.version_id).toBe(v2.id);
    expect(updated.status).toBe('active'); // still active — update doesn't silently deactivate
    const configAfterUpdate = typeof updated.config === 'string' ? JSON.parse(updated.config) : updated.config;
    expect(configAfterUpdate.api_key).toBe('sk-test-123'); // config preserved across the version move

    const disabled = await disableApp(tenant.tenantId, appId, tenant.userId, 'Temporary pause for testing.');
    expect(disabled.status).toBe('disabled');

    const reactivated = await activateApp(tenant.tenantId, appId, tenant.userId);
    expect(reactivated.status).toBe('active');

    const uninstalled = await uninstallApp(tenant.tenantId, appId, tenant.userId, 'No longer needed.');
    expect(uninstalled.status).toBe('uninstalled');
    await expect(disableApp(tenant.tenantId, appId, tenant.userId)).rejects.toThrow('not installed');

    // History is preserved end to end — nothing is overwritten or dropped.
    const history = await listLifecycleHistory(tenant.tenantId, appId);
    const transitions = history.map(h => h.to_status);
    expect(transitions).toEqual(['installed', 'configured', 'active', 'active', 'disabled', 'active', 'uninstalled']);
  });

  it('actually loses webhook access the moment it is revoked — not just marked revoked', async () => {
    const version = await submitAppVersion(appId, tenant.userId, '3.0.0', {});
    await reviewAppVersion(version.id, tenant.userId, 'approved');
    await dbPlatform.updateTable('marketplace_apps').set({ webhook_url: 'https://example.invalid/hook' }).where('id', '=', appId).execute();

    await installApp(tenant.tenantId, appId, tenant.userId);
    await activateApp(tenant.tenantId, appId, tenant.userId);

    // Grant the separate Integrations webhook authorization (tenant_marketplace_installs) —
    // the exact second table whose own revocation this lifecycle must keep in sync with.
    await withTenant(tenant.tenantId, trx =>
      trx.insertInto('tenant_marketplace_installs').values({
        tenant_id: tenant.tenantId, app_id: appId, webhook_secret: randomUUID(), events_enabled: true, installed_by: tenant.userId,
      }).execute());

    const eligibleBefore = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('tenant_marketplace_installs as i')
        .innerJoin('marketplace_apps as a', 'a.id', 'i.app_id')
        .innerJoin('store_installed_apps as si', (join) => join.onRef('si.tenant_id', '=', 'i.tenant_id').onRef('si.app_id', '=', 'i.app_id'))
        .select('i.id')
        .where('i.tenant_id', '=', tenant.tenantId).where('i.app_id', '=', appId)
        .where('i.revoked_at', 'is', null).where('i.events_enabled', '=', true)
        .where('a.status', '=', 'approved').where('si.status', '=', 'active')
        .execute());
    expect(eligibleBefore.length).toBe(1); // actually eligible for live webhook delivery

    // Disabling (reversible) already cuts delivery — before any uninstall.
    await disableApp(tenant.tenantId, appId, tenant.userId, 'Access check.');
    const eligibleAfterDisable = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('tenant_marketplace_installs as i')
        .innerJoin('marketplace_apps as a', 'a.id', 'i.app_id')
        .innerJoin('store_installed_apps as si', (join) => join.onRef('si.tenant_id', '=', 'i.tenant_id').onRef('si.app_id', '=', 'i.app_id'))
        .select('i.id')
        .where('i.tenant_id', '=', tenant.tenantId).where('i.app_id', '=', appId)
        .where('i.revoked_at', 'is', null).where('i.events_enabled', '=', true)
        .where('a.status', '=', 'approved').where('si.status', '=', 'active')
        .execute());
    expect(eligibleAfterDisable.length).toBe(0);

    // Reactivate, then uninstall — the terminal action must ALSO have cut it
    // (this is the exact bug: uninstall alone, with no explicit disable
    // first, must not leave the Integrations grant live).
    await activateApp(tenant.tenantId, appId, tenant.userId);
    await uninstallApp(tenant.tenantId, appId, tenant.userId);

    const eligibleAfterUninstall = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('tenant_marketplace_installs as i')
        .innerJoin('marketplace_apps as a', 'a.id', 'i.app_id')
        .innerJoin('store_installed_apps as si', (join) => join.onRef('si.tenant_id', '=', 'i.tenant_id').onRef('si.app_id', '=', 'i.app_id'))
        .select('i.id')
        .where('i.tenant_id', '=', tenant.tenantId).where('i.app_id', '=', appId)
        .where('i.revoked_at', 'is', null).where('i.events_enabled', '=', true)
        .where('a.status', '=', 'approved').where('si.status', '=', 'active')
        .execute());
    expect(eligibleAfterUninstall.length).toBe(0);

    const grant = await withTenant(tenant.tenantId, trx =>
      trx.selectFrom('tenant_marketplace_installs').select('revoked_at')
        .where('tenant_id', '=', tenant.tenantId).where('app_id', '=', appId).executeTakeFirstOrThrow());
    expect(grant.revoked_at).not.toBeNull(); // the grant itself, not just the join, is actually revoked
  });
});
