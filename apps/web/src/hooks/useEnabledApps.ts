import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

let cache: Record<string, boolean> | null = null;
let inflight: Promise<Record<string, boolean>> | null = null;

async function fetchEnabledApps(): Promise<Record<string, boolean>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiFetch('/v1/settings')
      .then((r: any) => { cache = r?.settings?.['enabled-apps'] || {}; return cache!; })
      .catch(() => ({}))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Apps default to enabled — a tenant only loses one once a SuperAdmin explicitly disables it. */
export function isAppEnabled(appId: string, enabledApps: Record<string, boolean> | null): boolean {
  if (!enabledApps) return true; // still loading — don't flash a redirect before we know
  return enabledApps[appId] !== false;
}

/** Returns null while loading, then the tenant's enabled-apps map (cached across the SPA session). */
export function useEnabledApps(): Record<string, boolean> | null {
  const [enabledApps, setEnabledApps] = useState<Record<string, boolean> | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchEnabledApps().then(apps => { if (alive) setEnabledApps(apps); });
    return () => { alive = false; };
  }, []);
  return enabledApps;
}

/** Call on login/logout/impersonate so the next tenant's session doesn't see a stale cache. */
export function resetEnabledAppsCache(): void {
  cache = null;
  inflight = null;
}
