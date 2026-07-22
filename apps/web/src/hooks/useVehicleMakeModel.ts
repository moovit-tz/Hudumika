import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

/**
 * Make/model reference data for the vehicle form's Make/Model pickers,
 * backed by the free NHTSA vPIC API (proxied + cached server-side —
 * see GET /v1/tracking/vehicle-makes|vehicle-models). Coverage of non-US
 * commercial truck brands is incomplete, so callers should still allow
 * free-text entry alongside these suggestions, not force a hard match.
 */
export function useVehicleMakes(type: string = 'truck') {
  const [makes, setMakes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/v1/tracking/vehicle-makes?type=${encodeURIComponent(type)}`)
      .then((rows: { name: string }[]) => { if (!cancelled) setMakes(rows.map(r => r.name)); })
      .catch(() => { if (!cancelled) setMakes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  return { makes, loading };
}

export function useVehicleModels(make: string) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!make?.trim()) { setModels([]); return; }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/v1/tracking/vehicle-models?make=${encodeURIComponent(make.trim())}`)
      .then((rows: { name: string }[]) => { if (!cancelled) setModels(rows.map(r => r.name)); })
      .catch(() => { if (!cancelled) setModels([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [make]);

  return { models, loading };
}
