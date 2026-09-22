import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { TenantEntitlements, TenantUsage } from '@hudumika/types';

/** Re-exported under its long-established local name — every call site
 *  already imports `Entitlements` from here. Now just an alias for the
 *  canonical shared shape instead of an independently hand-typed copy that
 *  had drifted from it (this one never knew about `usage.history` until
 *  TenantEntitlements gained it). */
export type Entitlements = TenantEntitlements;

const EMPTY_USAGE: TenantUsage = { used: 0, limit: null, period: '', history: [] };
const EMPTY_AI_CREDITS = { used: 0, limit: 0, remaining: 0 };

let cache: Entitlements | null = null;
let inflight: Promise<Entitlements> | null = null;

async function fetchEntitlements(): Promise<Entitlements> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiFetch('/v1/entitlements')
      .then((r: any) => {
        cache = { features: r?.features || {}, appStatus: r?.appStatus || {}, betaApps: r?.betaApps || [], usage: r?.usage || EMPTY_USAGE, aiCredits: r?.aiCredits || EMPTY_AI_CREDITS, byokAllowed: !!r?.byokAllowed };
        return cache!;
      })
      .catch(() => ({ features: {}, appStatus: {}, betaApps: [], usage: EMPTY_USAGE, aiCredits: EMPTY_AI_CREDITS, byokAllowed: false }))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Returns null while loading, then { features, appStatus } for the current tenant (cached across the SPA session). */
export function useEntitlements(): Entitlements | null {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchEntitlements().then(e => { if (alive) setEntitlements(e); });
    return () => { alive = false; };
  }, []);
  return entitlements;
}

/** Call on login/logout/impersonate so the next tenant's session doesn't see a stale cache. */
export function resetEntitlementsCache(): void {
  cache = null;
  inflight = null;
}
