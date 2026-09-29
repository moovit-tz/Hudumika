import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import type { FinanceCapabilitySummary, FinanceCapabilityKey } from '@hudumika/types';

let cache: FinanceCapabilitySummary | null = null;
let inflight: Promise<FinanceCapabilitySummary> | null = null;

async function fetchCapabilities(): Promise<FinanceCapabilitySummary> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiFetch('/v1/finance/capabilities')
      .then((r: any) => { cache = r; return cache!; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

export function resetFinanceCapabilitiesCache(): void {
  cache = null;
  inflight = null;
}

/** Returns loading/error/data state for Finance capabilities, plus a `setEnabled`
 *  mutation that PATCHes the backend and refreshes the cache. */
export function useFinanceCapabilities() {
  const [data, setData] = useState<FinanceCapabilitySummary | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(!cache);
    fetchCapabilities()
      .then(s => { if (alive) { setData(s); setLoading(false); } })
      .catch(err => { if (alive) { setError(err?.message ?? 'Failed to load capabilities'); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const setEnabled = useCallback(async (key: FinanceCapabilityKey, enabled: boolean) => {
    const result: FinanceCapabilitySummary = await apiFetch(`/v1/finance/capabilities/${key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    cache = result;
    setData(result);
    return result;
  }, []);

  /** Returns true when the capability is both entitled and enabled for this tenant. */
  const isEnabled = useCallback((key: FinanceCapabilityKey): boolean =>
    data?.capabilities.some(c => c.key === key && c.enabled) ?? false, [data]);

  return { data, loading, error, setEnabled, isEnabled };
}
