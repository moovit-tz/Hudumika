import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

export interface Entitlements {
  features: Record<string, boolean>;
  appStatus: Record<string, 'active' | 'maintenance'>;
  usage: { used: number; limit: number | null; period: string } | null;
}

let cache: Entitlements | null = null;
let inflight: Promise<Entitlements> | null = null;

async function fetchEntitlements(): Promise<Entitlements> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiFetch('/v1/entitlements')
      .then((r: any) => { cache = { features: r?.features || {}, appStatus: r?.appStatus || {}, usage: r?.usage || null }; return cache!; })
      .catch(() => ({ features: {}, appStatus: {}, usage: null }))
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
