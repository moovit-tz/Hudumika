import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';

/**
 * Route preHandler hook that unifies requireAppEnabled() (appGate.ts) and
 * requirePlanTier() (planGate.ts) into a single check, in this order:
 *   1. app_status       — global maintenance kill switch (503), SUPER_ADMIN bypasses.
 *   2. tenant_settings['enabled-apps'][featureKey] — per-tenant manual override,
 *      if a SuperAdmin has explicitly set one (true or false either way).
 *   3. package_features — otherwise, does the tenant's plan grant this feature.
 * An API-key-authenticated request (see middleware/auth.ts) carries a fixed
 * scope list on request.apiKeyScopes — that's a hard ceiling checked first,
 * regardless of the key's acting role, since scoping would be meaningless
 * if a SUPER_ADMIN-created key could bypass it.
 * Must run after fastify.authenticate (needs request.user).
 */
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

  if (request.apiKeyScopes && !request.apiKeyScopes.includes(featureKey)) {
    return { status: 403, body: { error: 'This API key is not scoped for this feature.', code: 'SCOPE_INSUFFICIENT' } };
  }

  const appStatus = await db.selectFrom('app_status')
    .select('status')
    .where('app_id', '=', featureKey)
    .executeTakeFirst();
  if (appStatus?.status === 'maintenance' && user.role !== 'SUPER_ADMIN') {
    return { status: 503, body: { error: 'This feature is temporarily unavailable for maintenance.', code: 'MAINTENANCE' } };
  }

  // SuperAdmins administer every tenant/app regardless of plan or overrides.
  if (user.role === 'SUPER_ADMIN') return null;

  const settingsRow = await db.selectFrom('tenant_settings')
    .select('settings')
    .where('tenant_id', '=', user.tenant_id)
    .executeTakeFirst();
  const settings = settingsRow
    ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
    : {};
  const enabledApps = settings['enabled-apps'] as Record<string, boolean> | undefined;

  if (enabledApps && enabledApps[featureKey] === false) {
    return { status: 403, body: { error: 'This app is not enabled for your organization.' } };
  }
  // An explicit true override grants access regardless of the tenant's package.
  if (enabledApps && enabledApps[featureKey] === true) return null;

  const tenant = await db.selectFrom('tenants')
    .select('plan')
    .where('id', '=', user.tenant_id)
    .executeTakeFirst();
  if (!tenant) {
    return { status: 403, body: { error: 'Tenant not found.' } };
  }

  const grant = await db.selectFrom('package_features')
    .select('feature_key')
    .where('package_code', '=', tenant.plan)
    .where('feature_key', '=', featureKey)
    .executeTakeFirst();
  if (!grant) {
    return { status: 403, body: { error: 'Your current plan does not include this feature.', code: 'PLAN_UPGRADE_REQUIRED' } };
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
  const appStatus = await db.selectFrom('app_status')
    .select('status').where('app_id', '=', featureKey).executeTakeFirst();
  if (appStatus?.status === 'maintenance') return false;

  const settingsRow = await db.selectFrom('tenant_settings')
    .select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const settings = settingsRow
    ? (typeof settingsRow.settings === 'string' ? JSON.parse(settingsRow.settings) : settingsRow.settings)
    : {};
  const enabledApps = settings['enabled-apps'] as Record<string, boolean> | undefined;
  if (enabledApps && enabledApps[featureKey] === false) return false;
  if (enabledApps && enabledApps[featureKey] === true) return true;

  const tenant = await db.selectFrom('tenants')
    .select('plan').where('id', '=', tenantId).executeTakeFirst();
  if (!tenant) return false;

  const grant = await db.selectFrom('package_features')
    .select('feature_key')
    .where('package_code', '=', tenant.plan)
    .where('feature_key', '=', featureKey)
    .executeTakeFirst();
  return !!grant;
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
