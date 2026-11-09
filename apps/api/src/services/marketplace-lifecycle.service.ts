// Module marketplace lifecycle (backlog S08). marketplace_apps/
// marketplace_app_versions are platform-level (no tenant_id) — reached via
// dbPlatform, same as store.routes.ts's existing raw-sql queries against
// marketplace_apps. store_installed_apps and store_app_lifecycle_events ARE
// tenant-scoped and go through withTenant.
//
// Deliberately NOT a sandboxed code-execution engine: the backlog is explicit
// — "no arbitrary uploaded code or tenant-triggered unreviewed DDL." A
// module's only real integration surface is the webhook_url it registers
// (domain-events.service.ts); this lifecycle governs install/configure/
// activate/update/disable/uninstall around that single constrained channel.
import { randomUUID } from 'node:crypto';
import { dbPlatform, withTenant, type Database } from '../db/client.js';
import type { Transaction } from 'kysely';

type Trx = Transaction<Database>;

export class MarketplaceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface ModuleManifest {
  compatibility?: { platform_min_version?: string };
  dependencies?: string[];
  permissions?: string[];
  config_schema?: { fields: Array<{ key: string; label: string; type: 'string' | 'number' | 'boolean'; required: boolean }> };
  events_declared?: string[];
  api_scopes?: string[];
  financial_contract?: { touches_money: boolean; description?: string | null };
  privacy_declaration?: string | null;
}

// A new manifest version starts as a draft — reviewed the same way the app
// listing itself already is, never silently promoted to what tenants see.
export async function submitAppVersion(appId: string, submittedBy: string, version: string, manifest: ModuleManifest) {
  const app = await dbPlatform.selectFrom('marketplace_apps').select('id').where('id', '=', appId).executeTakeFirst();
  if (!app) throw new MarketplaceError('App not found', 404);
  return dbPlatform.insertInto('marketplace_app_versions')
    .values({ app_id: appId, version, manifest: JSON.stringify(manifest), status: 'pending_review', submitted_by: submittedBy })
    .returningAll().executeTakeFirstOrThrow();
}

// Approving a version makes it the app's current installable version;
// rejecting leaves the app on whatever version (if any) was approved before.
export async function reviewAppVersion(versionId: string, reviewerId: string, decision: 'approved' | 'rejected', reason?: string) {
  const version = await dbPlatform.selectFrom('marketplace_app_versions').selectAll()
    .where('id', '=', versionId).where('status', '=', 'pending_review').executeTakeFirst();
  if (!version) throw new MarketplaceError('Version not found or not pending review', 409);

  const updated = await dbPlatform.updateTable('marketplace_app_versions')
    .set({ status: decision, reviewed_by: reviewerId, reviewed_at: new Date(), rejection_reason: decision === 'rejected' ? (reason ?? null) : null })
    .where('id', '=', versionId).returningAll().executeTakeFirstOrThrow();

  if (decision === 'approved') {
    await dbPlatform.updateTable('marketplace_apps').set({ current_version_id: versionId }).where('id', '=', version.app_id).execute();
  }
  return updated;
}

async function logLifecycleEvent(trx: Trx, tenantId: string, appId: string, versionId: string | null, fromStatus: string | null, toStatus: string, actorId: string | null, reason?: string) {
  await trx.insertInto('store_app_lifecycle_events')
    .values({ tenant_id: tenantId, app_id: appId, version_id: versionId, from_status: fromStatus, to_status: toStatus, actor_id: actorId, reason: reason ?? null })
    .execute();
}

// Install pins the app's CURRENT APPROVED version at install time — a later
// approved version never silently changes what's running under an existing
// install; that only happens through updateApp(), an explicit action.
export async function installApp(tenantId: string, appId: string, userId: string | null) {
  const app = await dbPlatform.selectFrom('marketplace_apps').select(['id', 'status', 'current_version_id'])
    .where('id', '=', appId).executeTakeFirst();
  if (!app) throw new MarketplaceError('App not found', 404);
  if (app.status !== 'approved') throw new MarketplaceError('This app is not approved for installation', 409);
  if (!app.current_version_id) throw new MarketplaceError('This app has no approved version yet', 409);

  return withTenant(tenantId, async trx => {
    const existing = await trx.selectFrom('store_installed_apps').select(['id', 'status'])
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).executeTakeFirst();
    if (existing && existing.status !== 'uninstalled') throw new MarketplaceError('Already installed', 409);

    // A reinstall after uninstall UPDATEs the existing row rather than
    // INSERTing a second one — store_installed_apps has a real UNIQUE
    // (tenant_id, app_id) constraint (migration 329), so a second insert
    // would fail at the database level even if this check allowed it. The
    // row (and its lifecycle history) is preserved either way; this is a
    // fresh install cycle, not a fresh row.
    const row = existing
      ? await trx.updateTable('store_installed_apps')
          .set({ installed_by: userId, version_id: app.current_version_id, status: 'installed', config: '{}', activated_at: null, disabled_at: null, uninstalled_at: null })
          .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
          .returningAll().executeTakeFirstOrThrow()
      : await trx.insertInto('store_installed_apps')
          .values({ id: randomUUID(), tenant_id: tenantId, app_id: appId, installed_by: userId, version_id: app.current_version_id, status: 'installed' })
          .returningAll().executeTakeFirstOrThrow();
    await logLifecycleEvent(trx, tenantId, appId, app.current_version_id, existing?.status ?? null, 'installed', userId);
    return row;
  });
}

function validateConfig(manifest: ModuleManifest, config: Record<string, unknown>) {
  for (const field of manifest.config_schema?.fields ?? []) {
    if (field.required && (config[field.key] === undefined || config[field.key] === null || config[field.key] === '')) {
      throw new MarketplaceError(`Missing required configuration field: ${field.label}`, 422);
    }
    if (field.key in config) {
      const value = config[field.key];
      const actualType = typeof value;
      if (field.type === 'number' && actualType !== 'number') throw new MarketplaceError(`${field.label} must be a number`, 422);
      if (field.type === 'boolean' && actualType !== 'boolean') throw new MarketplaceError(`${field.label} must be a boolean`, 422);
      if (field.type === 'string' && actualType !== 'string') throw new MarketplaceError(`${field.label} must be a string`, 422);
    }
  }
}

export async function configureApp(tenantId: string, appId: string, userId: string, config: Record<string, unknown>) {
  return withTenant(tenantId, async trx => {
    const install = await trx.selectFrom('store_installed_apps').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('status', '!=', 'uninstalled').executeTakeFirst();
    if (!install) throw new MarketplaceError('App is not installed', 404);
    if (!install.version_id) throw new MarketplaceError('Install has no version pinned', 409);
    const version = await dbPlatform.selectFrom('marketplace_app_versions').select('manifest').where('id', '=', install.version_id).executeTakeFirstOrThrow();
    const manifest: ModuleManifest = typeof version.manifest === 'string' ? JSON.parse(version.manifest) : version.manifest;
    validateConfig(manifest, config);

    const nextStatus = install.status === 'installed' ? 'configured' : install.status;
    const row = await trx.updateTable('store_installed_apps')
      .set({ config: JSON.stringify(config), status: nextStatus })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    await logLifecycleEvent(trx, tenantId, appId, install.version_id, install.status, nextStatus, userId, 'Configuration updated');
    return row;
  });
}

// Activation requires a satisfied config if the manifest declares required
// fields — a module cannot go live half-configured.
export async function activateApp(tenantId: string, appId: string, userId: string) {
  return withTenant(tenantId, async trx => {
    const install = await trx.selectFrom('store_installed_apps').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('status', 'in', ['installed', 'configured', 'disabled']).executeTakeFirst();
    if (!install) throw new MarketplaceError('App is not in an activatable state', 409);
    if (install.version_id) {
      const version = await dbPlatform.selectFrom('marketplace_app_versions').select('manifest').where('id', '=', install.version_id).executeTakeFirstOrThrow();
      const manifest: ModuleManifest = typeof version.manifest === 'string' ? JSON.parse(version.manifest) : version.manifest;
      const requiresConfig = (manifest.config_schema?.fields ?? []).some(f => f.required);
      if (requiresConfig) validateConfig(manifest, typeof install.config === 'string' ? JSON.parse(install.config) : install.config);
    }
    const row = await trx.updateTable('store_installed_apps')
      .set({ status: 'active', activated_at: new Date(), disabled_at: null })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    await logLifecycleEvent(trx, tenantId, appId, install.version_id, install.status, 'active', userId);
    return row;
  });
}

// Moves an existing install onto the app's current approved version,
// preserving the tenant's own configuration — an update is never a
// reinstall from the tenant's point of view.
export async function updateAppVersion(tenantId: string, appId: string, userId: string) {
  const app = await dbPlatform.selectFrom('marketplace_apps').select(['current_version_id', 'status']).where('id', '=', appId).executeTakeFirst();
  if (!app?.current_version_id) throw new MarketplaceError('App has no approved version to update to', 409);

  return withTenant(tenantId, async trx => {
    const install = await trx.selectFrom('store_installed_apps').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('status', '!=', 'uninstalled').executeTakeFirst();
    if (!install) throw new MarketplaceError('App is not installed', 404);
    if (install.version_id === app.current_version_id) throw new MarketplaceError('Already on the current version', 409);

    const row = await trx.updateTable('store_installed_apps')
      .set({ version_id: app.current_version_id })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    await logLifecycleEvent(trx, tenantId, appId, app.current_version_id, install.status, install.status, userId, `Updated from version ${install.version_id ?? '(none)'} to ${app.current_version_id}`);
    return row;
  });
}

// Disabling stops live access WITHOUT uninstalling — same real-access
// guarantee uninstall gives, just reversible. Also turns off the separate
// Integrations webhook grant (tenant_marketplace_installs), the exact
// cross-table gap that let an app keep receiving events after Store showed
// it "uninstalled" before this migration — disable must not leave that gap
// either.
export async function disableApp(tenantId: string, appId: string, userId: string, reason?: string) {
  return withTenant(tenantId, async trx => {
    const install = await trx.selectFrom('store_installed_apps').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('status', '!=', 'uninstalled').executeTakeFirst();
    if (!install) throw new MarketplaceError('App is not installed', 404);

    const row = await trx.updateTable('store_installed_apps')
      .set({ status: 'disabled', disabled_at: new Date() })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('tenant_marketplace_installs').set({ events_enabled: false })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('revoked_at', 'is', null).execute();
    await logLifecycleEvent(trx, tenantId, appId, install.version_id, install.status, 'disabled', userId, reason);
    return row;
  });
}

// Terminal. Preserves the install row (history, never deleted) but revokes
// EVERY access channel — Store status AND the separate Integrations
// webhook grant — "resolve open work and revoke access" from the backlog's
// acceptance line.
export async function uninstallApp(tenantId: string, appId: string, userId: string, reason?: string) {
  return withTenant(tenantId, async trx => {
    const install = await trx.selectFrom('store_installed_apps').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('status', '!=', 'uninstalled').executeTakeFirst();
    if (!install) throw new MarketplaceError('App is not installed', 404);

    const row = await trx.updateTable('store_installed_apps')
      .set({ status: 'uninstalled', uninstalled_at: new Date() })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .returningAll().executeTakeFirstOrThrow();
    await trx.updateTable('tenant_marketplace_installs').set({ revoked_at: new Date() })
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('revoked_at', 'is', null).execute();
    await logLifecycleEvent(trx, tenantId, appId, install.version_id, install.status, 'uninstalled', userId, reason);
    return row;
  });
}

export async function listLifecycleHistory(tenantId: string, appId: string) {
  return withTenant(tenantId, trx =>
    trx.selectFrom('store_app_lifecycle_events').selectAll()
      .where('tenant_id', '=', tenantId).where('app_id', '=', appId)
      .orderBy('created_at', 'asc').execute());
}
