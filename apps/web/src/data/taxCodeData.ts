import { useSyncExternalStore } from 'react';
import { apiFetch } from '../lib/api.js';

/**
 * Tax treatments, loaded from the workspace rather than hardcoded.
 *
 * Three separate literals used to stand in for this: `TAX_RATES = [0, 18]` in
 * productData.ts, `TAX_RATES = [0, 10, 18]` in Sales.tsx (10% is not a rate any
 * of this platform's jurisdictions charge), and the products form's label that
 * called 0% "Exempt" — which is one of four different things 0% can mean, and
 * the wrong one most of the time.
 *
 * A rate cannot carry a treatment. Zero-rated, exempt, reverse-charge and
 * out-of-scope supplies are all charged at 0% and behave differently on a
 * return; only zero-rated lets the seller recover input tax on related costs.
 */

export type TaxCodeKind =
  | 'STANDARD' | 'REDUCED' | 'ZERO_RATED' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';

/**
 * Which side of the ledger a code may be used on.
 *
 * A sales code and a purchase code answer different questions with the same
 * word: on a sale, "recoverable" is about whether making this supply lets you
 * recover tax on its costs; on a purchase it is about whether the tax you were
 * charged is deductible. Blocked input tax only exists on the purchase side.
 */
export type TaxCodeScope = 'SALES' | 'PURCHASE' | 'BOTH';

export interface TaxCode {
  id: string;
  code: string;
  name: string;
  kind: TaxCodeKind;
  rate: number;
  jurisdiction: string;
  inputTaxRecoverable: boolean;
  appliesTo: TaxCodeScope;
  traTaxCode: number | null;
  /** EFDMS <VATRATE> letter for the VATTOTALS grouping. Blank tracks the TRA tax code. */
  traVatRate: string | null;
  /** Why this treatment, in the workspace's own words. Shown wherever the code is chosen. */
  guidance: string | null;
  isDefault: boolean;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export const TAX_CODE_KINDS: TaxCodeKind[] = [
  'STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE',
];

/** Kinds that always charge 0% — the API and the DB both enforce this. */
export const ZERO_RATE_KINDS: TaxCodeKind[] = [
  'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE',
];

export const TAX_CODE_KIND_LABEL: Record<TaxCodeKind, string> = {
  STANDARD:       'Standard rate',
  REDUCED:        'Reduced rate',
  ZERO_RATED:     'Zero-rated',
  EXEMPT:         'Exempt',
  REVERSE_CHARGE: 'Reverse charge',
  OUT_OF_SCOPE:   'Out of scope',
};

/** What actually differs between the four 0% treatments, in one line each. */
export const TAX_CODE_KIND_HINT: Record<TaxCodeKind, string> = {
  STANDARD:       'The jurisdiction’s headline rate.',
  REDUCED:        'A lower statutory rate for specific supplies.',
  ZERO_RATED:     'Taxable at 0%. Input tax on related costs is recoverable.',
  EXEMPT:         'Not taxable. Input tax on related costs is NOT recoverable.',
  REVERSE_CHARGE: 'The customer self-accounts for the tax, not you.',
  OUT_OF_SCOPE:   'Not a taxable supply; outside the return entirely.',
};

export const TAX_CODE_KIND_VARIANT: Record<TaxCodeKind, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  STANDARD:       'brand',
  REDUCED:        'info',
  ZERO_RATED:     'success',
  EXEMPT:         'warning',
  REVERSE_CHARGE: 'info',
  OUT_OF_SCOPE:   'gray',
};

function mapApi(d: any): TaxCode {
  return {
    id: d.id,
    code: d.code || '',
    name: d.name || '',
    kind: (d.kind || 'STANDARD') as TaxCodeKind,
    rate: Number(d.rate) || 0,
    jurisdiction: d.jurisdiction || '',
    inputTaxRecoverable: d.input_tax_recoverable !== false,
    appliesTo: (d.applies_to || 'BOTH') as TaxCodeScope,
    traTaxCode: d.tra_tax_code === null || d.tra_tax_code === undefined ? null : Number(d.tra_tax_code),
    traVatRate: d.tra_vat_rate || null,
    guidance: d.guidance || null,
    isDefault: !!d.is_default,
    status: d.status || 'active',
    effectiveFrom: d.effective_from ? String(d.effective_from).slice(0, 10) : null,
    effectiveTo: d.effective_to ? String(d.effective_to).slice(0, 10) : null,
  };
}

export function toApiPayload(c: Partial<TaxCode>) {
  return {
    code: c.code, name: c.name, kind: c.kind, rate: c.rate,
    jurisdiction: c.jurisdiction, input_tax_recoverable: c.inputTaxRecoverable,
    applies_to: c.appliesTo,
    tra_tax_code: c.traTaxCode, tra_vat_rate: c.traVatRate || null, guidance: c.guidance || null,
    is_default: c.isDefault, status: c.status,
    effective_from: c.effectiveFrom || null, effective_to: c.effectiveTo || null,
  };
}

let _codes: TaxCode[] = [];
const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(l => l()); }
function subscribe(cb: () => void) { _listeners.add(cb); return () => _listeners.delete(cb); }

// Same lazy-load discipline as productData: fetch on first real read, not at
// import, so pages that never show a tax code never fire an unauthenticated
// request.
let _loaded = false;
let _inFlight: Promise<void> | null = null;

function loadFromApi(all = false): Promise<void> {
  if (_inFlight) return _inFlight;
  _inFlight = apiFetch(`/v1/tax-codes${all ? '?all=1' : ''}`)
    .then((data: any) => { _codes = Array.isArray(data) ? data.map(mapApi) : []; notify(); })
    .catch(() => { _codes = []; notify(); })
    .finally(() => { _inFlight = null; });
  return _inFlight;
}

function ensureLoaded() {
  if (_loaded) return;
  _loaded = true;
  loadFromApi();
}

export function refreshTaxCodes(all = false) { _loaded = true; return loadFromApi(all); }

export function useTaxCodes(): TaxCode[] {
  return useSyncExternalStore(
    (cb) => { ensureLoaded(); return subscribe(cb); },
    () => _codes,
  );
}

export function getTaxCodes() { ensureLoaded(); return _codes; }

/** The workspace default, used to pre-fill a new product or invoice line. */
export function defaultTaxCode(codes: TaxCode[]): TaxCode | undefined {
  return codes.find(c => c.isDefault) ?? codes[0];
}

/** How a code reads on a picker row: "Standard rate (18%)". */
export function taxCodeLabel(c: TaxCode): string {
  return `${c.name}${c.name.includes('%') ? '' : ` — ${c.rate}%`}`;
}
