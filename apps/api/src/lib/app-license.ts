import { withTenant } from '../db/client.js';

/**
 * Per-seat license assignment. Layered entirely on top of the existing
 * tenant-wide entitlement check (middleware/entitlement.ts) — it never
 * grants access an app's tenant-level gate would otherwise refuse, it only
 * ever narrows a tenant-enabled app to specific people, and only for an app
 * an admin has explicitly opted into "restricted" mode. An app nobody ever
 * restricts behaves exactly as it did before this existed.
 */

export async function getRestrictedApps(tenantId: string): Promise<Record<string, boolean>> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const settings = row ? (typeof row.settings === 'string' ? JSON.parse(row.settings) : row.settings) : {};
    return (settings['restricted-apps'] as Record<string, boolean> | undefined) ?? {};
  });
}

export async function isAppRestricted(tenantId: string, appId: string): Promise<boolean> {
  const restricted = await getRestrictedApps(tenantId);
  return restricted[appId] === true;
}

export async function hasAppLicense(tenantId: string, userId: string, appId: string): Promise<boolean> {
  return withTenant(tenantId, async (trx) => {
    const row = await trx.selectFrom('user_app_access')
      .select('id')
      .where('tenant_id', '=', tenantId).where('user_id', '=', userId).where('app_id', '=', appId)
      .executeTakeFirst();
    return !!row;
  });
}

/** The one call both checkEntitlement() and GET /v1/entitlements use —
 *  same question, same answer, so a hidden launcher tile and a live API
 *  call can never disagree about who's actually licensed for an app. */
export async function isLicensedForApp(tenantId: string, userId: string, appId: string): Promise<boolean> {
  const restricted = await isAppRestricted(tenantId, appId);
  if (!restricted) return true;
  return hasAppLicense(tenantId, userId, appId);
}
