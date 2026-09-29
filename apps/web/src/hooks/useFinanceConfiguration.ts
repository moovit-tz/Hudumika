import { useCallback, useEffect, useState } from 'react';
import type { FinanceConfiguration, FinanceIndustryKey } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';

export function useFinanceConfiguration() {
  const [data, setData] = useState<FinanceConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch('/v1/finance/capabilities/configuration')
      .then((result: FinanceConfiguration) => { if (alive) setData(result); })
      .catch(err => { if (alive) setError(err?.message ?? 'Failed to load Finance configuration'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const saveIndustries = useCallback(async (industries: FinanceIndustryKey[]) => {
    const result: FinanceConfiguration = await apiFetch('/v1/finance/capabilities/configuration/industries', { method: 'PUT', body: JSON.stringify({ industries }) });
    setData(result);
    return result;
  }, []);

  const createBusinessLine = useCallback(async (input: { name: string; code: string; description?: string }) => {
    const result: FinanceConfiguration = await apiFetch('/v1/finance/capabilities/configuration/business-lines', { method: 'POST', body: JSON.stringify(input) });
    setData(result);
    return result;
  }, []);

  const updateBusinessLine = useCallback(async (id: string, patch: { name?: string; code?: string; description?: string | null; active?: boolean }) => {
    const result: FinanceConfiguration = await apiFetch(`/v1/finance/capabilities/configuration/business-lines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    setData(result);
    return result;
  }, []);

  return { data, loading, error, saveIndustries, createBusinessLine, updateBusinessLine };
}
