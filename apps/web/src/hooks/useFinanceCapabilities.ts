import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import type { FinanceCapabilitySummary, FinanceCapabilityKey } from '@hudumika/types';
import { refreshEntitlementsCache } from './useEntitlements.js';

let cache: FinanceCapabilitySummary | null = null;
let inflight: Promise<FinanceCapabilitySummary> | null = null;
let cacheGeneration = 0;
const listeners = new Set<(value: FinanceCapabilitySummary | null) => void>();

function publish(value: FinanceCapabilitySummary | null): void {
  for (const listener of listeners) listener(value);
}

async function fetchCapabilities(force = false): Promise<FinanceCapabilitySummary> {
  if (cache && !force) return cache;
  if (!inflight) {
    const generation = cacheGeneration;
    let request!: Promise<FinanceCapabilitySummary>;
    request = apiFetch('/v1/finance/capabilities')
      .then((result: FinanceCapabilitySummary) => {
        if (generation === cacheGeneration) {
          cache = result;
          publish(result);
        }
        return result;
      })
      .finally(() => { if (inflight === request) inflight = null; });
    inflight = request;
  }
  return inflight;
}

export function resetFinanceCapabilitiesCache(): void {
  cacheGeneration += 1;
  cache = null;
  inflight = null;
  publish(null);
}

/** Returns loading/error/data state for Finance capabilities, plus a `setEnabled`
 *  mutation that PATCHes the backend and refreshes the cache. */
export function useFinanceCapabilities() {
  const [data, setData] = useState<FinanceCapabilitySummary | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listeners.add(setData);
    setLoading(!cache);
    fetchCapabilities()
      .then(s => { if (alive) { setData(s); setLoading(false); } })
      .catch(err => { if (alive) { setError(err?.message ?? 'Failed to load capabilities'); setLoading(false); } });
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchCapabilities(true)
        .then(() => { if (alive) setError(null); })
        .catch(err => { if (alive) setError(err?.message ?? 'Failed to refresh capabilities'); });
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      listeners.delete(setData);
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const setEnabled = useCallback(async (key: FinanceCapabilityKey, enabled: boolean) => {
    const result: FinanceCapabilitySummary = await apiFetch(`/v1/finance/capabilities/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    cache = result;
    publish(result);
    await refreshEntitlementsCache();
    return result;
  }, []);

  /** Returns true when the capability is both entitled and enabled for this tenant. */
  const isEnabled = useCallback((key: FinanceCapabilityKey): boolean =>
    data?.capabilities.some(c => c.key === key && c.enabled) ?? false, [data]);

  return { data, loading, error, setEnabled, isEnabled };
}
