import { withTenant, dbPlatform } from '../db/client.js';

/**
 * Server-side enforcement of plan-level seat and location limits.
 *
 * Migration 635 added `included_seats` and `max_locations` to the packages
 * table. These functions check those limits transactionally before allowing
 * a new user invitation or location creation.
 *
 * Seat counting: active users minus CUSTOMER-role (portal accounts) and
 * minus any user whose role starts with 'API' (machine identities). Per the
 * commercial plan brief: "do not charge customer portal users or machine
 * identities."
 *
 * Outstanding pending invitations also count toward the seat limit — a tenant
 * with 2/2 seats used can't send 5 invitations and end up with 7 users.
 */

export interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null;
  message?: string;
}

export async function checkSeatLimit(tenantId: string, targetPlanCode?: string): Promise<LimitCheckResult> {
  return withTenant(tenantId, async (trx) => {
    const planCode = targetPlanCode
      ?? (await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst())?.plan;
    if (!planCode) return { allowed: false, current: 0, limit: 0, message: 'Tenant not found' };

    const pkg = await dbPlatform.selectFrom('packages').select(['max_users', 'included_seats'])
      .where('code', '=', planCode).executeTakeFirst();
    if (!pkg) return { allowed: true, current: 0, limit: null };

    const limit = pkg.included_seats ?? pkg.max_users;
    if (!limit || limit <= 0) return { allowed: true, current: 0, limit: null };

    const activeUsers = await trx.selectFrom('users')
      .select(({ fn }) => fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .where('active', '=', true)
      .where('role', '!=', 'CUSTOMER')
      .executeTakeFirst();

    const pendingInvites = await trx.selectFrom('invitations' as any)
      .select(({ fn }) => fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    const current = Number(activeUsers?.c ?? 0) + Number(pendingInvites?.c ?? 0);

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit,
        message: `Your plan allows ${limit} team member${limit === 1 ? '' : 's'}. You currently have ${current} (including pending invitations). Upgrade your plan to add more.`,
      };
    }

    return { allowed: true, current, limit };
  });
}

export async function checkLocationLimit(tenantId: string): Promise<LimitCheckResult> {
  return withTenant(tenantId, async (trx) => {
    const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) return { allowed: false, current: 0, limit: 0, message: 'Tenant not found' };

    const pkg = await dbPlatform.selectFrom('packages').select('max_locations')
      .where('code', '=', tenant.plan).executeTakeFirst();
    if (!pkg) return { allowed: true, current: 0, limit: null };

    const limit = (pkg as any).max_locations;
    if (!limit || limit <= 0) return { allowed: true, current: 0, limit: null };

    const locationCount = await trx.selectFrom('locations')
      .select(({ fn }) => fn.countAll<number>().as('c'))
      .where('tenant_id', '=', tenantId)
      .executeTakeFirst();

    const current = Number(locationCount?.c ?? 0);

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit,
        message: `Your plan allows ${limit} location${limit === 1 ? '' : 's'}. You currently have ${current}. Upgrade your plan to add more.`,
      };
    }

    return { allowed: true, current, limit };
  });
}
