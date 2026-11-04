import { useCallback, useEffect, useState } from 'react';
import type { SealStockRow } from '@hudumika/types';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from './useSealCompartment.js';

export function useSealStock() {
  const [compartmentId] = useSealCompartmentId();
  const [rows, setRows] = useState<SealStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch(`/v1/seal/stock-overview${compartmentId ? `?compartment_id=${encodeURIComponent(compartmentId)}` : ''}`)
      .then(data => { if (active) { setRows(data); setError(null); } })
      .catch(e => { if (active) { setRows([]); setError(e.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [compartmentId, version]);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  return { rows, loading, error, refresh };
}
