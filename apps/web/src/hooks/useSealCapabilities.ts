import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { getTenantSealCapabilities, type SealCapabilities } from '../lib/sealCapabilities.js';

const DEFAULT: SealCapabilities = {
  customs: false,
  guarantees: false,
  examinations: false,
  dangerousGoods: true,
  productLink: true,
  integrations: false,
};

/**
 * Fetches all compartments once and derives which SEAL capabilities are
 * active for this tenant, ANDed with the plan-level `seal_advanced`
 * entitlement flag.
 *
 * - `seal` (base plan): standard inventory surface — Items, Stock Levels,
 *   Stock Counts, Lots, Transfers, Warehouses. No customs overlay.
 * - `seal_advanced`: adds bonded warehouse, ICD, CFS, ex-warehouse entries,
 *   guarantees, examinations, and the full customs-status progression.
 *
 * Starts with standard warehouse navigation; customs is added after capabilities load.
 */
export function useSealCapabilities(): SealCapabilities {
  const [caps, setCaps] = useState<SealCapabilities>(DEFAULT);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener('seal-warehouses-updated', refresh);
    return () => window.removeEventListener('seal-warehouses-updated', refresh);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/seal/compartments').catch(() => [] as { warehouse_type: string }[]),
      apiFetch('/v1/entitlements').catch(() => ({ features: {} as Record<string, boolean> })),
    ]).then(([rows, ent]) => {
      const types = Array.isArray(rows) && rows.length > 0
        ? (rows as { warehouse_type: string }[]).map(r => r.warehouse_type)
        : [];
      const base = types.length > 0 ? getTenantSealCapabilities(types) : DEFAULT;

      const sealAdvanced = (ent as { features: Record<string, boolean> })?.features?.['seal_advanced'] === true;

      setCaps({
        ...base,
        customs:      base.customs && sealAdvanced,
        guarantees:   base.guarantees && sealAdvanced,
        examinations: base.examinations && sealAdvanced,
      });
    });
  }, [version]);

  return caps;
}
