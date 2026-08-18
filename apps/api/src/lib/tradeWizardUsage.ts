import { sql } from 'kysely';
import { withTenant } from '../db/client.js';

// Dedicated per-tier monthly quota for Trade Compliance Wizard runs — kept
// separate from the generic tenant_usage_counters (lib/usage.ts), which is
// a shared platform-wide budget covering everything else a tenant creates.
// Mirrors that file's shape.

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getMonthlyLimit(tenantId: string): Promise<number | null> {
  return withTenant(tenantId, async (trx) => {
    const tenant = await trx.selectFrom('tenants').select('plan').where('id', '=', tenantId).executeTakeFirst();
    if (!tenant) return null;
    const pkg = await trx.selectFrom('packages').select('trade_wizard_monthly_searches').where('code', '=', tenant.plan).executeTakeFirst();
    return pkg?.trade_wizard_monthly_searches ?? null; // no matching package row = treat as unlimited
  });
}

async function getUsage(tenantId: string): Promise<number> {
  const row = await withTenant(tenantId, trx => trx.selectFrom('trade_wizard_usage_counters')
    .select('searches')
    .where('tenant_id', '=', tenantId)
    .where('period', '=', currentPeriod())
    .executeTakeFirst());
  return row?.searches ?? 0;
}

export async function incrementTradeWizardUsage(tenantId: string): Promise<void> {
  await withTenant(tenantId, trx => trx.insertInto('trade_wizard_usage_counters')
    .values({ tenant_id: tenantId, period: currentPeriod(), searches: 1 })
    .onConflict(oc => oc.columns(['tenant_id', 'period']).doUpdateSet({
      searches: sql`trade_wizard_usage_counters.searches + 1`,
    }))
    .execute());
}

export interface TradeWizardUsageGate {
  exceeded: boolean;
  used: number;
  limit: number | null; // null = unlimited
  message?: string;
}

export async function checkTradeWizardQuota(tenantId: string, role: string): Promise<TradeWizardUsageGate> {
  if (role === 'SUPER_ADMIN') return { exceeded: false, used: 0, limit: null };
  const [limit, used] = await Promise.all([getMonthlyLimit(tenantId), getUsage(tenantId)]);
  if (limit === null) return { exceeded: false, used, limit: null };
  if (used >= limit) {
    return {
      exceeded: true, used, limit,
      message: `You've used all ${limit} Trade Compliance Wizard searches included on your current plan this month. Upgrade your plan for more searches.`,
    };
  }
  return { exceeded: false, used, limit };
}

/** For the frontend's "X of Y searches used" indicator, shown before the tenant hits the wall. */
export async function getTradeWizardUsageSummary(tenantId: string): Promise<{ used: number; limit: number | null; period: string }> {
  const [limit, used] = await Promise.all([getMonthlyLimit(tenantId), getUsage(tenantId)]);
  return { used, limit, period: currentPeriod() };
}
