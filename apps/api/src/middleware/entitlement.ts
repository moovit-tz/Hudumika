import type { FastifyRequest, FastifyReply } from 'fastify';
import { dbPlatform, withTenant } from '../db/client.js';
import { checkAppUsageLimit } from '../lib/usage.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The app/feature key checkEntitlement() resolved this request against
     *  — stashed here so index.ts's onResponse hook can increment that
     *  app's usage counter on success, without a separate route→app map. */
    meteredAppId?: string | null;
  }
}

/**
 * Route preHandler hook that unifies requireAppEnabled() (appGate.ts) and
 * requirePlanTier() (planGate.ts) into a single check, in this order:
 *   1. app_status       — global maintenance kill switch (503), SUPER_ADMIN bypasses.
 *   2. tenant_settings['enabled-apps'][featureKey] — per-tenant manual override,
 *      if a SuperAdmin has explicitly set one (true or false either way).
 *   3. agency-managed inheritance — see agencyManagedOnsiteGrant() below.
 *   4. package_features — otherwise, does the tenant's plan grant this feature.
 * An API-key-authenticated request (see middleware/auth.ts) carries a fixed
 * scope list on request.apiKeyScopes — that's a hard ceiling checked first,
 * regardless of the key's acting role, since scoping would be meaningless
 * if a SUPER_ADMIN-created key could bypass it.
 * Must run after fastify.authenticate (needs request.user).
 */

/**
 * AgencyHost M1: a client tenant an agency manages (an active
 * agency_managed_tenants row) is entitled to 'onsite' specifically, sourced
 * from the relationship rather than its own plan — the 'agency-managed'
 * package (see migration 243) deliberately grants nothing via
 * package_features, so this is the only thing standing between an attached
 * client and a 403. Scoped to 'onsite' only, not a generic pass-through of
 * whatever the agency's own plan grants: the relationship exists to cover
 * hosting, not to accidentally widen a client's access to every app the
 * agency happens to have.
 */
export async function agencyManagedOnsiteGrant(tenantId: string, featureKey: string): Promise<boolean> {
  if (featureKey !== 'onsite') return false;
  const managed = await dbPlatform.selectFrom('agency_managed_tenants')
    .select('id')
    .where('client_tenant_id', '=', tenantId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  return !!managed;
}
/**
 * Does this tenant hold an active, purchased add-on that grants this
 * feature? (376_package_addons.sql) — a join, not two separate lookups,
 * so a deactivated add-on (package_addons.is_active=false) stops granting
 * access even if a tenant's own tenant_addons row is still 'active'.
 */
async function hasActiveAddonGrant(tenantId: string, featureKey: string): Promise<boolean> {
  const grant = await dbPlatform.selectFrom('tenant_addons')
    .innerJoin('package_addons', 'package_addons.code', 'tenant_addons.addon_code')
    .select('tenant_addons.id')
    .where('tenant_addons.tenant_id', '=', tenantId)
    .where('tenant_addons.status', '=', 'active')
    .where('package_addons.feature_key', '=', featureKey)
    .where('package_addons.is_active', '=', true)
    .executeTakeFirst();
  return !!grant;
}

/**
 * The actual entitlement check for one feature key, factored out so both
 * requireEntitlement() (single key) and requireAnyEntitlement() (OR across
 * keys) share one implementation. Returns null when access is granted, or
 * the FastifyReply-shaped error to send when it isn't.
 */
async function checkEntitlement(
  request: FastifyRequest,
  featureKey: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const user = request.user!;
  // Stashed unconditionally, before any pass/fail branch below — harmless if
  // this request ultimately fails (onResponse only ever acts on a 2xx reply).
  request.meteredAppId = featureKey;

  if (request.apiKeyScopes && !request.apiKeyScopes.includes(featureKey)) {
    return { status: 403, body: { error: 'This API key is not scoped for this feature.', code: 'SCOPE_INSUFFICIENT' } };
  }

  const appStatus = await dbPlatform.selectFrom('app_status')
    .select('status')
    .where('app_id', '=', featureKey)
    .executeTakeFirst();
  if (appStatus?.status === 'maintenance' && user.role !== 'SUPER_ADMIN') {
    return { status: 503, body: { error: 'This feature is temporarily unavailable for maintenance.', code: 'MAINTENANCE' } };
  }

  // SuperAdmins administer every tenant/app regardless of plan or overrides.
  if (user.role === 'SUPER_ADMIN') return null;

  type TenantCheck =
    | { outcome: 'fail'; failure: { status: number; body: Record<string, unknown> } }
    | { outcome: 'pass' }
    | { outcome: 'continue'; plan: string };

  const tenantCheck = await withTenant(user.tenant_id, async (trx): Promise<TenantCheck> => {
    const settingsRow = await trx.selectFrom('tenant_settings')
      .select('settings')
      .where('tenant_id', '=', user.tenant_id)
      .executeTakeFirst();
    const settings = settingsRow
      ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
      : {};
    const enabledApps = settings['enabled-apps'] as Record<string, boolean> | undefined;

    if (enabledApps && enabledApps[featureKey] === false) {
      return { outcome: 'fail', failure: { status: 403, body: { error: 'This app is not enabled for your organization.' } } };
    }
    // An explicit true override grants access regardless of the tenant's package.
    if (enabledApps && enabledApps[featureKey] === true) return { outcome: 'pass' };

    const tenant = await trx.selectFrom('tenants')
      .select('plan')
      .where('id', '=', user.tenant_id)
      .executeTakeFirst();
    if (!tenant) {
      return { outcome: 'fail', failure: { status: 403, body: { error: 'Tenant not found.' } } };
    }
    return { outcome: 'continue', plan: tenant.plan };
  });

  if (tenantCheck.outcome === 'fail') return tenantCheck.failure;
  if (tenantCheck.outcome === 'pass') return null;

  if (await agencyManagedOnsiteGrant(user.tenant_id, featureKey)) return null;

  const grant = await dbPlatform.selectFrom('package_features')
    .select('feature_key')
    .where('package_code', '=', tenantCheck.plan)
    .where('feature_key', '=', featureKey)
    .executeTakeFirst();

  // A purchased add-on (376_package_addons.sql — e.g. Onsite) grants the
  // same real entitlement a base package's own feature list would,
  // independent of which package the tenant is actually on.
  const addonGrant = grant ? null : await hasActiveAddonGrant(user.tenant_id, featureKey);

  if (!grant && !addonGrant) {
    return { status: 403, body: { error: 'Your current plan does not include this feature.', code: 'PLAN_UPGRADE_REQUIRED' } };
  }

  // Per-app quota, layered on top of the blanket monthly_item_limit checked
  // earlier in authenticate() — only once the tenant is confirmed to have
  // this app at all, and only for the same POST-only convention isMeteredPath
  // already uses for the blanket limit.
  if (request.method === 'POST') {
    const appGate = await checkAppUsageLimit(user.tenant_id, tenantCheck.plan, featureKey);
    if (appGate.exceeded) {
      return {
        status: 402,
        body: { error: 'APP_USAGE_LIMIT_EXCEEDED', message: appGate.message, used: appGate.used, limit: appGate.limit, app: featureKey },
      };
    }
  }

  return null;
}

/**
 * Tenant-level entitlement check for work that has no request behind it —
 * an event-driven Studio run, a scheduled job. Same precedence as
 * checkEntitlement (maintenance kill switch, per-tenant override, then plan)
 * minus the two request-only concerns: there is no API key to scope against,
 * and no acting user to be a SUPER_ADMIN. A background run must not inherit an
 * administrator's bypass — it acts for the tenant, not for a person.
 */
export async function tenantHasEntitlement(tenantId: string, featureKey: string): Promise<boolean> {
  const appStatus = await dbPlatform.selectFrom('app_status')
    .select('status').where('app_id', '=', featureKey).executeTakeFirst();
  if (appStatus?.status === 'maintenance') return false;

  type TenantCheck = { decided: boolean } | { plan: string };

  const tenantCheck = await withTenant(tenantId, async (trx): Promise<TenantCheck> => {
    const settingsRow = await trx.selectFrom('tenant_settings')
      .select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const settings = settingsRow
      ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
      : {};
    const enabledApps = settings['enabled-apps'] as Record<string, boolean> | undefined;
    if (enabledApps && enabledApps[featureKey] === false) return { decided: false };
    if (enabledApps && enabledApps[featureKey] === true) return { decided: true };

    const tenant = await trx.selectFrom('tenants')
      .select('plan').where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) return { decided: false };
    return { plan: tenant.plan };
  });

  if ('decided' in tenantCheck) return tenantCheck.decided;

  if (await agencyManagedOnsiteGrant(tenantId, featureKey)) return true;

  const grant = await dbPlatform.selectFrom('package_features')
    .select('feature_key')
    .where('package_code', '=', tenantCheck.plan)
    .where('feature_key', '=', featureKey)
    .executeTakeFirst();
  if (grant) return true;

  return hasActiveAddonGrant(tenantId, featureKey);
}

export function requireEntitlement(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
    const failure = await checkEntitlement(request, featureKey);
    if (failure) return reply.status(failure.status).send(failure.body);
  };
}

/**
 * Passes if the user is entitled to ANY one of the given feature keys —
 * for routes shared across apps (e.g. the carrier directory, reachable from
 * both ClearOS's Freight Booking and the standalone CargoTracker app).
 * On failure, returns the first key's error response.
 */
export function requireAnyEntitlement(featureKeys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized: Authentication required' });
    }
    let firstFailure: { status: number; body: Record<string, unknown> } | null = null;
    for (const featureKey of featureKeys) {
      const failure = await checkEntitlement(request, featureKey);
      if (!failure) return; // any pass is enough
      if (!firstFailure) firstFailure = failure;
    }
    return reply.status(firstFailure!.status).send(firstFailure!.body);
  };
}
