import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { FINANCE_CAPABILITIES, type TenantEntitlements, type TenantUsage } from '@hudumika/types';

/** Re-exported under its long-established local name — every call site
 *  already imports `Entitlements` from here. Now just an alias for the
 *  canonical shared shape instead of an independently hand-typed copy that
 *  had drifted from it (this one never knew about `usage.history` until
 *  TenantEntitlements gained it). */
export type Entitlements = TenantEntitlements;

const EMPTY_USAGE: TenantUsage = { used: 0, limit: null, period: '', history: [] };
const EMPTY_AI_CREDITS = { used: 0, limit: 0, remaining: 0 };
const EMPTY_FINANCE = {
  edition: 'basic' as const,
  capabilities: FINANCE_CAPABILITIES.map(definition => ({ ...definition, entitled: false, enabled: false, state: 'not_entitled' as const })),
  usage: EMPTY_USAGE,
};

let cache: Entitlements | null = null;
let inflight: Promise<Entitlements> | null = null;
let cacheGeneration = 0;
const listeners = new Set<(value: Entitlements | null) => void>();

function publish(value: Entitlements | null): void {
  for (const listener of listeners) listener(value);
}

async function fetchEntitlements(force = false): Promise<Entitlements> {
  if (cache && !force) return cache;
  if (!inflight) {
    const generation = cacheGeneration;
    let request!: Promise<Entitlements>;
    request = apiFetch('/v1/entitlements')
      .then((r: any) => {
        const next = { features: r?.features || {}, appStatus: r?.appStatus || {}, betaApps: r?.betaApps || [], usage: r?.usage || EMPTY_USAGE, aiCredits: r?.aiCredits || EMPTY_AI_CREDITS, byokAllowed: !!r?.byokAllowed, finance: r?.finance || EMPTY_FINANCE };
        if (generation === cacheGeneration) {
          cache = next;
          publish(next);
        }
        return next;
      })
      .catch(() => cache ?? { features: {}, appStatus: {}, betaApps: [], usage: EMPTY_USAGE, aiCredits: EMPTY_AI_CREDITS, byokAllowed: false, finance: EMPTY_FINANCE })
      .finally(() => { if (inflight === request) inflight = null; });
    inflight = request;
  }
  return inflight;
}

/** Returns null while loading, then { features, appStatus } for the current tenant (cached across the SPA session). */
export function useEntitlements(): Entitlements | null {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(cache);
  useEffect(() => {
    let alive = true;
    listeners.add(setEntitlements);
    fetchEntitlements().then(e => { if (alive) setEntitlements(e); });
    const refresh = () => { if (document.visibilityState === 'visible') void fetchEntitlements(true); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      listeners.delete(setEntitlements);
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return entitlements;
}

/** Re-read central entitlement state after package, add-on, trial, or app
 *  configuration mutations and update every mounted consumer together. */
export async function refreshEntitlementsCache(): Promise<Entitlements> {
  return fetchEntitlements(true);
}

/** Call on login/logout/impersonate so the next tenant's session doesn't see a stale cache. */
export function resetEntitlementsCache(): void {
  cacheGeneration += 1;
  cache = null;
  inflight = null;
  publish(null);
}
