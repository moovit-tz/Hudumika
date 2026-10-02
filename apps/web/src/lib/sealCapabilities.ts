/**
 * Capability flags for SEAL compartment types.
 *
 * SEAL's dual ledger (seal_lots + seal_movements) is the platform's universal
 * inventory system.  The customs overlay — bond headroom, CustomsStatus
 * progression beyond DOMESTIC_FREE_CIRCULATION, guarantees, examinations,
 * DG segregation — only applies to facilities that hold goods under customs
 * control.
 *
 * A `standard_warehouse` compartment uses the same backend but exposes only
 * the standard WMS surface: receive → putaway → pick → transfer → adjust →
 * release, with product-catalog SKU linking and POS/FinOps/BOM integration.
 *
 * These flags drive what the UI shows — never fork the service layer or
 * add IF statements in routes for warehouse type.  The DB enforces what it
 * always has; the UI simply doesn't offer actions that don't apply.
 */

export type WarehouseType =
  | 'public_bonded'
  | 'private_bonded'
  | 'cfs'
  | 'icd'
  | 'virtual_icd'
  | 'free_zone'
  | 'duty_free_retail'
  | 'excise'
  | 'sorting_centre'
  | 'fulfillment_centre'
  | 'standard_warehouse';

/** Facility types that operate under customs control. */
const BONDED_TYPES = new Set<WarehouseType>([
  'public_bonded', 'private_bonded', 'cfs', 'icd', 'virtual_icd',
  'free_zone', 'duty_free_retail', 'excise',
]);

/** Human-readable label for each facility type — used in selects and badges. */
export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  public_bonded:      'Public Bonded Warehouse',
  private_bonded:     'Private Bonded Warehouse',
  cfs:                'Container Freight Station',
  icd:                'Inland Container Depot',
  virtual_icd:        'Virtual ICD',
  free_zone:          'Free Zone',
  duty_free_retail:   'Duty-Free Retail',
  excise:             'Excise Warehouse',
  sorting_centre:     'Sorting Centre',
  fulfillment_centre: 'Fulfilment Centre',
  standard_warehouse: 'Standard Warehouse',
};

/** Standard WMS types — no customs overlay, full product-catalog linkage. */
export const STANDARD_TYPES = new Set<WarehouseType>([
  'standard_warehouse',
  'sorting_centre',
  'fulfillment_centre',
]);

export interface SealCapabilities {
  /** Show Ex-warehouse Entries, CustomsStatus progression, bond headroom. */
  customs: boolean;
  /** Show Guarantees section and bond headroom check at receive time. */
  guarantees: boolean;
  /** Show Examinations tab and selectivity channel filter. */
  examinations: boolean;
  /** Show DG segregation UI and IMDG class fields on lot forms. */
  dangerousGoods: boolean;
  /** Link lots to product catalog SKUs; show SKU picker on receive. */
  productLink: boolean;
  /** Show POS / FinOps / BOM stock-deduction integration settings. */
  integrations: boolean;
}

/**
 * Returns capability flags for a single compartment's warehouse type.
 * Pass the `warehouse_type` string from a seal_compartments row.
 */
export function getSealCapabilities(warehouseType: string): SealCapabilities {
  const t = warehouseType as WarehouseType;
  const isBonded = BONDED_TYPES.has(t);
  const isStandard = STANDARD_TYPES.has(t);
  return {
    customs:       isBonded,
    guarantees:    isBonded,
    examinations:  isBonded,
    dangerousGoods: true,          // DG rules apply everywhere for safety
    productLink:   isStandard || !isBonded,
    integrations:  isStandard,
  };
}

/**
 * Given a list of all compartments a tenant has, returns the union of
 * capabilities — used by the shell to decide which nav sections to show.
 *
 * A tenant with one bonded + one standard compartment gets both nav sections.
 */
export function getTenantSealCapabilities(
  compartmentTypes: string[],
): SealCapabilities {
  const caps = compartmentTypes.map(getSealCapabilities);
  return {
    customs:       caps.some(c => c.customs),
    guarantees:    caps.some(c => c.guarantees),
    examinations:  caps.some(c => c.examinations),
    dangerousGoods: true,
    productLink:   caps.some(c => c.productLink),
    integrations:  caps.some(c => c.integrations),
  };
}
