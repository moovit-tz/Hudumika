import type { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import type { FeatureKey } from '@hudumika/types';
import { ALL_FEATURE_KEYS } from '@hudumika/types';
import { getUsageSummary } from '../lib/usage.js';

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

    const [appStatusRows, settingsRow, tenant, usage] = await Promise.all([
      db.selectFrom('app_status').select(['app_id', 'status']).execute(),
      db.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', user.tenant_id).executeTakeFirst(),
      db.selectFrom('tenants').select('plan').where('id', '=', user.tenant_id).executeTakeFirst(),
      getUsageSummary(user.tenant_id),
    ]);

    const appStatus: Record<string, string> = {};
    for (const row of appStatusRows) appStatus[row.app_id] = row.status;

    const settings = settingsRow
      ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
      : {};
    const overrides = (settings['enabled-apps'] as Record<string, boolean> | undefined) ?? {};

    const planGrants = tenant
      ? await db.selectFrom('package_features').select('feature_key').where('package_code', '=', tenant.plan).execute()
      : [];
    const planGrantSet = new Set(planGrants.map(r => r.feature_key));

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
      features[key] = planGrantSet.has(key);
    }

    return { features, appStatus, usage };
  });
}
