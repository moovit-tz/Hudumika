import { sql } from 'kysely';
import { dbPlatform, withTenant } from '../db/client.js';

// Route prefixes that are account/platform administration, not a tenant
// "using" the product — excluded from the monthly item count. Everything
// else (POST across ClearOS, FinOps, NexusHR, CRM, HR, Comply, Cloud,
// Email, Contacts, AI, Store, tracking/fleet, demurrage, cargo, etc. — and
// any app added later) is metered by default so new apps don't need to
// remember to opt in.
const UNMETERED_PREFIXES = [
  '/auth', '/v1/settings', '/v1/entitlements', '/v1/onboarding', '/v1/webhooks',
  '/v1/superadmin', '/v1/api-keys', '/v1/tenants', '/v1/permissions', '/v1/platform', '/v1/packages',
  '/v1/tasks', // Tasks + Calendar are personal free utility apps, not plan-gated usage
  '/v1/search',
];

export function isMeteredPath(path: string | undefined | null): boolean {
  if (!path) return false;
  return !UNMETERED_PREFIXES.some(p => path.startsWith(p));
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getMonthlyLimit(tenantId: string): Promise<number | null> {
  return withTenant(tenantId, async (trx) => {
    const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) return null;
    const pkg = await trx.selectFrom('packages').select('monthly_item_limit').where('code', '=', tenant.plan).executeTakeFirst();
    return pkg?.monthly_item_limit ?? null; // no matching package row (legacy plan code) = treat as unlimited
  });
}

async function getUsage(tenantId: string): Promise<number> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_usage_counters')
    .select('count')
    .where('tenant_id', '=', tenantId)
    .where('period', '=', currentPeriod())
    .executeTakeFirst());
  return row?.count ?? 0;
}

export async function incrementUsage(tenantId: string): Promise<void> {
  await withTenant(tenantId, trx => trx.insertInto('tenant_usage_counters')
    .values({ tenant_id: tenantId, period: currentPeriod(), count: 1 })
    .onConflict(oc => oc.columns(['tenant_id', 'period']).doUpdateSet({
      count: sql`tenant_usage_counters.count + 1`,
      updated_at: new Date(),
    }))
    .execute());
}

export interface UsageGate {
  exceeded: boolean;
  used: number;
  limit: number | null; // null = unlimited
  message?: string;
}

export async function checkUsageLimit(tenantId: string, role: string): Promise<UsageGate> {
  if (role === 'SUPER_ADMIN') return { exceeded: false, used: 0, limit: null };
  const [limit, used] = await Promise.all([getMonthlyLimit(tenantId), getUsage(tenantId)]);
  if (limit === null) return { exceeded: false, used, limit: null };
  if (used >= limit) {
    return {
      exceeded: true, used, limit,
      message: `You've reached this month's limit of ${limit} items on your current plan. Upgrade to keep creating shipments, invoices, records and more.`,
    };
  }
  return { exceeded: false, used, limit };
}

/** For the /v1/entitlements response — lets the frontend show a usage meter before the tenant hits the wall. */
export async function getUsageSummary(tenantId: string): Promise<{ used: number; limit: number | null; period: string }> {
  const [limit, used] = await Promise.all([getMonthlyLimit(tenantId), getUsage(tenantId)]);
  return { used, limit, period: currentPeriod() };
}

// ── Per-app quotas ───────────────────────────────────────────────────────
// A genuine per-app tier, layered on top of the blanket monthly_item_limit
// above — package_app_quotas (migration 280) is global platform config
// (dbPlatform, not tenant data), keyed by (package_code, app_id); an absent
// row means unlimited for that app under that tier, same convention as
// getMonthlyLimit's "no matching package row = unlimited".
async function getAppMonthlyLimit(plan: string, appId: string): Promise<number | null> {
  const row = await dbPlatform.selectFrom('package_app_quotas')
    .select('monthly_limit')
    .where('package_code', '=', plan).where('app_id', '=', appId)
    .executeTakeFirst();
  return row?.monthly_limit ?? null;
}

async function getAppUsage(tenantId: string, appId: string): Promise<number> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('tenant_app_usage_counters')
    .select('count')
    .where('tenant_id', '=', tenantId).where('app_id', '=', appId).where('period', '=', currentPeriod())
    .executeTakeFirst());
  return row?.count ?? 0;
}

/** Mirrors incrementUsage — called from index.ts's onResponse hook for
 *  whichever app middleware/entitlement.ts's checkEntitlement() resolved
 *  this request against (stashed as request.meteredAppId), not derived from
 *  a separate route-prefix map. */
export async function incrementAppUsage(tenantId: string, appId: string): Promise<void> {
  await withTenant(tenantId, trx => trx.insertInto('tenant_app_usage_counters')
    .values({ tenant_id: tenantId, app_id: appId, period: currentPeriod(), count: 1 })
    .onConflict(oc => oc.columns(['tenant_id', 'app_id', 'period']).doUpdateSet({
      count: sql`tenant_app_usage_counters.count + 1`,
      updated_at: new Date(),
    }))
    .execute());
}

/** Called from checkEntitlement() once a plan is known to actually grant the
 *  feature — so a tenant is never quota-blocked on an app they don't have
 *  access to in the first place. */
export async function checkAppUsageLimit(tenantId: string, plan: string, appId: string): Promise<UsageGate> {
  const [limit, used] = await Promise.all([getAppMonthlyLimit(plan, appId), getAppUsage(tenantId, appId)]);
  if (limit === null) return { exceeded: false, used, limit: null };
  if (used >= limit) {
    return {
      exceeded: true, used, limit,
      message: `You've reached this month's limit of ${limit} ${appId} actions on your current plan. Upgrade to keep going.`,
    };
  }
  return { exceeded: false, used, limit };
}

/** For a per-app usage meter in the frontend (mirrors getUsageSummary). */
export async function getAppUsageSummary(tenantId: string, plan: string, appId: string): Promise<{ used: number; limit: number | null; period: string }> {
  const [limit, used] = await Promise.all([getAppMonthlyLimit(plan, appId), getAppUsage(tenantId, appId)]);
  return { used, limit, period: currentPeriod() };
}
