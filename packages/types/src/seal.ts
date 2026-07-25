// ── SEAL (bonded/customs-controlled warehouse) — shared domain types ──
// Kept dependency-free (no framework, no I/O) and shared between apps/api
// and apps/web so the exact same legal-transition table drives both the
// backend's hard validation and the frontend's "disable the action, show
// the reason" UX — never two copies that can drift apart.

export type CustomsStatus =
  | 'FOREIGN_DUTY_SUSPENDED'
  | 'FOREIGN_DUTY_PAID'
  | 'TRANSIT'
  | 'TEMPORARY_ADMISSION'
  | 'INWARD_PROCESSING'
  | 'OUTWARD_PROCESSING'
  | 'EXPORT_DECLARED'
  | 'EXPORTED'
  | 'DOMESTIC'
  | 'ZONE_RESTRICTED'
  | 'ABANDONED'
  | 'SEIZED'
  | 'DESTROYED';

export const CUSTOMS_STATUSES: CustomsStatus[] = [
  'FOREIGN_DUTY_SUSPENDED', 'FOREIGN_DUTY_PAID', 'TRANSIT', 'TEMPORARY_ADMISSION',
  'INWARD_PROCESSING', 'OUTWARD_PROCESSING', 'EXPORT_DECLARED', 'EXPORTED',
  'DOMESTIC', 'ZONE_RESTRICTED', 'ABANDONED', 'SEIZED', 'DESTROYED',
];

export const CUSTOMS_STATUS_LABELS: Record<CustomsStatus, string> = {
  FOREIGN_DUTY_SUSPENDED: 'Under Bond',
  FOREIGN_DUTY_PAID: 'Duty Paid',
  TRANSIT: 'In Transit',
  TEMPORARY_ADMISSION: 'Temporary Admission',
  INWARD_PROCESSING: 'Inward Processing',
  OUTWARD_PROCESSING: 'Outward Processing',
  EXPORT_DECLARED: 'Export Declared',
  EXPORTED: 'Exported',
  DOMESTIC: 'Domestic',
  ZONE_RESTRICTED: 'Zone Restricted',
  ABANDONED: 'Abandoned',
  SEIZED: 'Seized',
  DESTROYED: 'Destroyed',
};

/** Short description of the evidence a legal transition requires — shown in
 *  the UI next to the action and required (non-empty) on the API request. */
export const CUSTOMS_STATUS_TRANSITIONS: Record<CustomsStatus, { to: CustomsStatus; evidenceHint: string }[]> = {
  FOREIGN_DUTY_SUSPENDED: [
    { to: 'FOREIGN_DUTY_PAID', evidenceHint: 'Entry reference, payment reference, release note' },
    { to: 'TRANSIT', evidenceHint: 'Transit reference, seal number, route' },
    { to: 'EXPORT_DECLARED', evidenceHint: 'Export entry reference' },
    { to: 'INWARD_PROCESSING', evidenceHint: 'IP authorization reference, yield coefficient' },
    { to: 'DESTROYED', evidenceHint: 'Destruction certificate, officer ID' },
    { to: 'ABANDONED', evidenceHint: 'Abandonment notice or expiry record' },
    { to: 'SEIZED', evidenceHint: 'Detention notice reference' },
  ],
  TRANSIT: [
    { to: 'FOREIGN_DUTY_SUSPENDED', evidenceHint: 'Arrival confirmation, seal verification' },
  ],
  EXPORT_DECLARED: [
    { to: 'EXPORTED', evidenceHint: 'Loading confirmation, outbound manifest' },
  ],
  SEIZED: [
    { to: 'FOREIGN_DUTY_SUSPENDED', evidenceHint: 'Release order reference' },
  ],
  ABANDONED: [
    { to: 'DESTROYED', evidenceHint: 'Disposal instruction reference' },
  ],
  // Terminal or not-yet-modeled-forward states (Increment 1 scope): no
  // legal outbound transition yet. Reaching these is still valid (e.g. a
  // lot can be received directly as DOMESTIC), they just don't move again
  // from here until a later increment (e.g. re-import, IP yield output).
  FOREIGN_DUTY_PAID: [],
  TEMPORARY_ADMISSION: [],
  INWARD_PROCESSING: [],
  OUTWARD_PROCESSING: [],
  EXPORTED: [],
  DOMESTIC: [],
  ZONE_RESTRICTED: [],
  DESTROYED: [],
};

/** The two entry points a lot can be *created* in — everything else is a
 *  transition from an existing lot's current status. */
export const CUSTOMS_STATUS_ENTRY_POINTS: CustomsStatus[] = ['FOREIGN_DUTY_SUSPENDED', 'DOMESTIC'];

export function isLegalCustomsTransition(from: CustomsStatus, to: CustomsStatus): boolean {
  return CUSTOMS_STATUS_TRANSITIONS[from]?.some(t => t.to === to) ?? false;
}

export function legalNextCustomsStatuses(from: CustomsStatus): CustomsStatus[] {
  return (CUSTOMS_STATUS_TRANSITIONS[from] ?? []).map(t => t.to);
}

export type SealMovementType = 'receipt' | 'putaway' | 'pick' | 'transfer' | 'adjust' | 'release' | 'destroy' | 'status_change';

export interface SealCompartment {
  id: string;
  code: string;
  name: string;
  warehouseType: string;
  licenceNumber: string | null;
  licenceExpiry: string | null;
  customsOfficeCode: string | null;
  jurisdiction: string;
  defaultStorageDays: number;
  active: boolean;
}

export interface SealZone {
  id: string;
  compartmentId: string;
  code: string;
  name: string;
  zoneType: string;
}

export interface SealLocation {
  id: string;
  compartmentId: string;
  zoneId: string;
  code: string;
  locationType: string;
  isPickable: boolean;
}

export interface SealLot {
  id: string;
  compartmentId: string;
  ownerId: string;
  ownerName?: string;
  shipmentCaseId: string | null;
  description: string;
  hsCode: string | null;
  countryOfOrigin: string | null;
  marksAndNumbers: string | null;
  customsStatus: CustomsStatus;
  entryReference: string | null;
  procedureCode: string | null;
  currentLocationId: string | null;
  currentLocationCode?: string | null;
  qtyOnHand: number;
  qtyAllocated: number;
  uom: string;
  customsValue: number | null;
  currency: string | null;
  dutyAtRisk: number;
  taxAtRisk: number;
  batch: string | null;
  serial: string | null;
  expiryDate: string | null;
  warehousedOn: string | null;
  expiresOn: string | null;
  daysRemaining: number | null;
  isDangerousGoods: boolean;
  unNumber: string | null;
  imdgClass: string | null;
  requiresReefer: boolean;
  reeferSetpointC: number | null;
  stackTier: number;
  createdAt: string;
}

export interface SealMovement {
  id: string;
  occurredAt: string;
  actorType: string;
  movementType: SealMovementType;
  lotId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  qtyDelta: number;
  fromCustomsStatus: CustomsStatus | null;
  toCustomsStatus: CustomsStatus | null;
  entryReference: string | null;
  reasonCode: string | null;
  reference: string | null;
  hash: string;
}

// ── ISO 6346 container number check-digit validation ──
// No implementation of this existed anywhere in the codebase — written from
// the ISO 6346 spec directly, not approximated. Format: 3-letter owner code
// + 1 category letter (almost always 'U') + 6-digit serial + 1 check digit.
// Each of the first 10 characters gets a numeric value (letters use the
// table below, which deliberately skips multiples of 11), multiplied by
// 2^position, summed, then mod 11 (a result of 10 maps to check digit 0).
const ISO6346_LETTER_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29, S: 30, T: 31,
  U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
};

export interface ContainerNumberCheck {
  valid: boolean;
  formatted: string;
  expectedCheckDigit?: number;
  reason?: string;
}

export function validateContainerNumber(raw: string): ContainerNumberCheck {
  const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{4}\d{7}$/.test(s)) {
    return { valid: false, formatted: s, reason: 'Must be 4 letters followed by 7 digits (ISO 6346), e.g. MSCU1234567.' };
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = s[i];
    const value = ch >= '0' && ch <= '9' ? Number(ch) : ISO6346_LETTER_VALUES[ch];
    sum += value * Math.pow(2, i);
  }
  let expected = sum % 11;
  if (expected === 10) expected = 0;
  const given = Number(s[10]);
  const formatted = `${s.slice(0, 4)}-${s.slice(4, 10)}-${s[10]}`;
  if (expected !== given) {
    return { valid: false, formatted, expectedCheckDigit: expected, reason: `Check digit should be ${expected}, got ${given} — this container number is not valid.` };
  }
  return { valid: true, formatted };
}

// ── Declaration lifecycle (spec §6.3, trimmed to what an ex-warehouse
// release actually needs). Prefixed Seal* — packages/types/src/declaration.ts
// already owns the unprefixed `DeclarationStatus` name for ClearOS's own
// (differently-shaped) TANESW/TANSAD declaration model; the two are
// deliberately separate aggregates (see 109_seal_duty_and_declarations.sql's
// header comment), so this is a real second concept, not a naming accident. ──
export type SealDeclarationStatus = 'DRAFT' | 'SUBMITTED' | 'QUERIED' | 'ASSESSED' | 'PAID' | 'RELEASED' | 'CANCELLED';

export const SEAL_DECLARATION_STATUS_LABELS: Record<SealDeclarationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  QUERIED: 'Queried',
  ASSESSED: 'Assessed',
  PAID: 'Paid',
  RELEASED: 'Released',
  CANCELLED: 'Cancelled',
};

export const SEAL_DECLARATION_STATUS_TRANSITIONS: Record<SealDeclarationStatus, SealDeclarationStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['QUERIED', 'ASSESSED', 'CANCELLED'],
  QUERIED: ['ASSESSED', 'CANCELLED'],
  ASSESSED: ['PAID', 'CANCELLED'],
  PAID: ['RELEASED'],
  RELEASED: [],
  CANCELLED: [],
};

export function legalNextSealDeclarationStatuses(status: SealDeclarationStatus): SealDeclarationStatus[] {
  return SEAL_DECLARATION_STATUS_TRANSITIONS[status] ?? [];
}

export const SEAL_DECLARATION_PROCEDURE_LABELS: Record<string, string> = {
  EX_WAREHOUSE_HOME_USE: 'Ex-Warehouse for Home Use',
  EX_WAREHOUSE_RE_EXPORT: 'Ex-Warehouse for Re-Export',
  EX_WAREHOUSE_TRANSFER: 'Ex-Warehouse for Transfer',
};
