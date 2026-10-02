import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { getTenantSealCapabilities, type SealCapabilities } from '../lib/sealCapabilities.js';

const DEFAULT: SealCapabilities = {
  customs: true,
  guarantees: true,
  examinations: true,
  dangerousGoods: true,
  productLink: false,
  integrations: false,
};

/**
 * Fetches all compartments once and derives which SEAL capabilities are
 * active for this tenant.  A tenant with only standard_warehouse compartments
 * gets the inventory surface; one with bonded/ICD compartments gets the
 * customs surface; a mixed tenant gets both.
 *
 * Defaults to all-customs-on while loading so the nav doesn't flicker
 * items away on mount.
 */
export function useSealCapabilities(): SealCapabilities {
  const [caps, setCaps] = useState<SealCapabilities>(DEFAULT);

  useEffect(() => {
    apiFetch('/v1/seal/compartments')
      .then((rows: { warehouse_type: string }[]) => {
        if (!Array.isArray(rows) || rows.length === 0) return;
        setCaps(getTenantSealCapabilities(rows.map(r => r.warehouse_type)));
      })
      .catch(() => {/* keep default */});
  }, []);

  return caps;
}
