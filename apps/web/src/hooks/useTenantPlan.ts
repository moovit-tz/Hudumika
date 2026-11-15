import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { TenantPlan } from '@hudumika/types';

interface PackageInfo { code: TenantPlan; name: string; features: string[]; max_users: number; color: string; monthly_price: string | null }

// Mirrors PLAN_LEVELS in packages/types/src/user.ts, inlined here rather than
// imported at runtime — see apps/api/src/middleware/planGate.ts for why.
const PLAN_LEVELS: Record<TenantPlan, number> = {
  free: 0,
  'agency-managed': 0,
  'onsite-standalone': 0,
  starter: 1, operations: 2, growth: 2, professional: 3, finance: 3, scale: 3, enterprise: 4,
  'starter-tzs': 1, 'business-tzs': 2, 'scale-tzs': 3,
  'workspace-free': 0,
};

// packages (GET /v1/packages, the same source Subscription.tsx and the
// signup wizard use) only has rows for the 4 primary tier codes — legacy
// plan aliases still stored on older tenants map onto the modern tier at
// the same PLAN_LEVELS rank so we can still look up a real package row.
const LEGACY_ALIAS: Partial<Record<TenantPlan, TenantPlan>> = {
  operations: 'growth', professional: 'scale', finance: 'scale',
};

interface PlanInfo { plan: TenantPlan; pkg: PackageInfo | null }

/**
 * One fetch per page load, shared by every caller.
 *
 * Each mount used to fetch /settings and then /packages on its own, and
 * rendered the raw plan code ("Growth") in between — so the sidebar flashed
 * "Growth Plan" before settling on the package's real name ("HuduPlus
 * Plan") on every navigation. Now the label stays empty until the real
 * name is known, and later mounts get it immediately from this cache.
 */
let planCache: PlanInfo | null = null;
let planPromise: Promise<PlanInfo> | null = null;

function loadPlan(): Promise<PlanInfo> {
  if (!planPromise) {
    planPromise = (async () => {
      const plan: TenantPlan = await apiFetch('/v1/settings')
        .then((d: any) => d?.tenant?.plan ?? 'starter').catch(() => 'starter');
      const code = LEGACY_ALIAS[plan] ?? plan;
      const pkg = await apiFetch('/v1/packages')
        .then((res: { data: PackageInfo[] }) => res.data.find(p => p.code === code) ?? null)
        .catch(() => null);
      planCache = { plan, pkg };
      return planCache;
    })();
  }
  return planPromise;
}

/** Drop the cached plan, after an upgrade or downgrade. */
export function resetTenantPlanCache(): void {
  planCache = null;
  planPromise = null;
}

/** The plan's display name: the package's own name, else the code itself. */
export function planDisplayName(plan: TenantPlan | null, pkg: PackageInfo | null): string | null {
  if (!plan) return null;
  return pkg?.name ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function useTenantPlan() {
  const [info, setInfo] = useState<PlanInfo | null>(planCache);

  useEffect(() => {
    let alive = true;
    if (!planCache) loadPlan().then(i => { if (alive) setInfo(i); });
    return () => { alive = false; };
  }, []);

  const plan = info?.plan ?? null;
  const pkg = info?.pkg ?? null;
  return {
    plan,
    /** Null until known — render nothing rather than a code that changes. */
    planLabel: planDisplayName(plan, pkg),
    features: pkg?.features ?? [],
    maxUsers: pkg?.max_users ?? null,
    monthlyPrice: pkg?.monthly_price ?? null,
    hasPlan: (required: TenantPlan) => plan != null && PLAN_LEVELS[plan] >= PLAN_LEVELS[required],
  };
}
