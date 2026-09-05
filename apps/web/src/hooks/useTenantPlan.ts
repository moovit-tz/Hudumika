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
};

// packages (GET /v1/packages, the same source Subscription.tsx and the
// signup wizard use) only has rows for the 4 primary tier codes — legacy
// plan aliases still stored on older tenants map onto the modern tier at
// the same PLAN_LEVELS rank so we can still look up a real package row.
const LEGACY_ALIAS: Partial<Record<TenantPlan, TenantPlan>> = {
  operations: 'growth', professional: 'scale', finance: 'scale',
};

export function useTenantPlan() {
  const [plan, setPlan] = useState<TenantPlan | null>(null);
  const [pkg, setPkg] = useState<PackageInfo | null>(null);

  useEffect(() => {
    apiFetch('/v1/settings').then((data: any) => setPlan(data?.tenant?.plan ?? 'starter')).catch(() => setPlan('starter'));
  }, []);

  useEffect(() => {
    if (!plan) return;
    apiFetch('/v1/packages').then((res: { data: PackageInfo[] }) => {
      const code = LEGACY_ALIAS[plan] ?? plan;
      setPkg(res.data.find(p => p.code === code) ?? null);
    }).catch(() => setPkg(null));
  }, [plan]);

  return {
    plan,
    planLabel: pkg?.name ?? (plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : '—'),
    features: pkg?.features ?? [],
    maxUsers: pkg?.max_users ?? null,
    monthlyPrice: pkg?.monthly_price ?? null,
    hasPlan: (required: TenantPlan) => plan != null && PLAN_LEVELS[plan] >= PLAN_LEVELS[required],
  };
}
