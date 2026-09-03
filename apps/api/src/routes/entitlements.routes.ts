import type { FastifyInstance } from 'fastify';
import { withTenant } from '../db/client.js';
import type { FeatureKey } from '@hudumika/types';
import { ALL_FEATURE_KEYS } from '@hudumika/types';
import { getUsageSummary, getUsageHistory } from '../lib/usage.js';
import { agencyManagedOnsiteGrant, hasActiveAddonGrant } from '../middleware/entitlement.js';
import { isLicensedForApp } from '../lib/app-license.js';

/**
 * The features this endpoint reports on.
 *
 * This was a hardcoded array of twelve keys, and it had fallen behind: Onsite
 * had a feature key and real grants in package_features and never appeared
 * here — so the entire frontend, which decides what to show from this response,
 * could not see it. Eight further apps were in the same position, permanently
 * on because nothing could report them as anything else.
 *
 * It reads the shared list now, so an app added to ALL_FEATURE_KEYS is reported
 * without anyone having to remember this file exists.
 */
const BASE_FEATURES: readonly FeatureKey[] = ALL_FEATURE_KEYS;

/**
 * GET /v1/entitlements — everything the frontend needs to decide what to show
 * (nav tiles, "upgrade" vs "under maintenance" screens) without a round trip
 * per feature. Mirrors the same precedence as requireEntitlement():
 * maintenance > tenant override > package_features.
 */
export async function entitlementsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/', async (request, reply) => {
    const user = request.user;

    const [[appStatusRows, settingsRow, tenant], usage, history] = await Promise.all([
      withTenant(user.tenant_id, trx => Promise.all([
        trx.selectFrom('app_status').select(['app_id', 'status']).execute(),
        trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
        trx.selectFrom('tenants').select('plan').where('id', '=', user.tenant_id).executeTakeFirst(),
      ])),
      getUsageSummary(user.tenant_id),
      getUsageHistory(user.tenant_id, 12),
    ]);

    const appStatus: Record<string, string> = {};
    for (const row of appStatusRows) appStatus[row.app_id] = row.status;

    const settings = settingsRow
      ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
      : {};
    const overrides = (settings['enabled-apps'] as Record<string, boolean> | undefined) ?? {};

    const planGrants = tenant
      ? await withTenant(user.tenant_id, trx => trx.selectFrom('package_features').select('feature_key').where('package_code', '=', tenant.plan).execute())
      : [];
    const planGrantSet = new Set(planGrants.map(r => r.feature_key));

    // AgencyHost M1: a client tenant managed by an agency inherits 'onsite'
    // from that relationship, not from its own (deliberately empty)
    // 'agency-managed' plan — same check requireEntitlement() already makes
    // for the actual API routes. Without this, a real, actively-managed
    // client would pass every backend call yet still see "Not included in
    // your plan" from RequireAppEnabled, since this endpoint is what drives
    // that screen and previously only ever looked at package_features.
    const onsiteInherited = await agencyManagedOnsiteGrant(user.tenant_id, 'onsite');

    const features: Record<string, boolean> = {};
    for (const key of BASE_FEATURES) {
      if (user.role === 'SUPER_ADMIN') {
        features[key] = true;
        continue;
      }
      if (appStatus[key] === 'maintenance') {
        features[key] = false;
        continue;
      }
      if (key in overrides) {
        features[key] = overrides[key];
        continue;
      }
      if (key === 'onsite' && onsiteInherited) {
        features[key] = true;
        continue;
      }
      features[key] = planGrantSet.has(key);
    }

    // checkEntitlement() (middleware/entitlement.ts) also grants a feature
    // via a purchased add-on (tenant_addons + package_addons), independent
    // of package_features — this endpoint didn't check that at all, so a
    // tenant who bought e.g. the Onsite or Enterprise Identity & Governance
    // add-on would pass every real API call yet still see "Not included in
    // your plan" here, since this response is what RequireAppEnabled and
    // every per-feature frontend gate actually decide from. Only checked for
    // keys package_features didn't already grant, and skipped for
    // SUPER_ADMIN/maintenance/override cases already decided above.
    const stillUngranted = BASE_FEATURES.filter(key => user.role !== 'SUPER_ADMIN' && !features[key] && appStatus[key] !== 'maintenance' && !(key in overrides));
    if (stillUngranted.length > 0) {
      const addonResults = await Promise.all(stillUngranted.map(key => hasActiveAddonGrant(user.tenant_id, key)));
      stillUngranted.forEach((key, i) => { if (addonResults[i]) features[key] = true; });
    }

    // Per-seat license assignment (migration 383) — narrows a tenant-granted
    // "true" above to this specific user, but only for an app the tenant has
    // explicitly put into restricted mode; same check checkEntitlement()
    // enforces server-side, so a hidden launcher tile and a live API call
    // can never disagree.
    if (user.role !== 'SUPER_ADMIN') {
      await Promise.all(BASE_FEATURES.map(async (key) => {
        if (features[key] && !(await isLicensedForApp(user.tenant_id, user.sub, key))) {
          features[key] = false;
        }
      }));
    }

    return { features, appStatus, usage: { ...usage, history } };
  });
}
