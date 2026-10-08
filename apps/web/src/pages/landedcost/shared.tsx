import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { EntityPicker } from '../../components/EntityPicker.js';
import type { PickerItem } from '../../components/EntityPicker.js';
import { apiFetch } from '../../lib/api.js';
// ── Types ─────────────────────────────────────────────────────────────────────

export interface HsResult {
  code: string;
  description: string;
  import_duty_rate: number;
  vat_rate: number;
  excise_rate: number;
  rdl_rate: number;
  cpf_rate: number;
  pvoc_required: boolean;
  di_required: boolean;
  permits: string | null;
  notes: string | null;
}

export interface LandedCostResult {
  hs_code: string;
  description: string;
  cif_usd: number;
  fx_rate: number;
  cif_tzs: number;
  duty_rate: number;
  duty: number;
  excise_override_note: string | null;
  vat: number;
  rdl: number;
  cpf: number;
  excise: number;
  icd: number;
  wharfage: number;
  pid: number;
  green_port_initiative: number;
  tbs_charge: number;
  shipping_line_charge: number;
  total: number;
  per_unit: number;
  qty: number;
  pvoc_required: boolean;
  di_required: boolean;
  permits: string[];
  notes: string | null;
  breakdown: { label: string; amount: number; rate?: string }[];
  statutory_total: number;
  total_ex_vat: number;
  vat_recoverable: number;
  effective_statutory_rate_pct: number;
  landed_multiplier: number;
  fob_usd?: number;
  freight_usd?: number;
  insurance_usd?: number;
  mode: ShipmentMode;
  destination_charge_label: string;
  /** Containers this quote covers; per-container charge lines multiply by it. */
  num_containers?: number;
  /** The size mix behind that total. Each size is priced from its own rate
   *  card, so per-container lines are computed per lot and summed. */
  containers?: { size: '20ft' | '40ft'; count: number }[];
  chargeable_weight_kg: number | null;
  warnings: string[];
  assumptions: string[];
  /** Rate fields replaced via Advanced Settings — e.g. ['duty_rate'].
   *  Optional because history rows saved before overrides existed won't
   *  carry it. */
  overridden_fields?: string[];
}

export type ShipmentMode = 'sea_fcl' | 'sea_lcl' | 'air';

/** Human-readable names for the `overridden_fields` keys the API returns. */
export const OVERRIDE_LABELS: Record<string, string> = {
  duty_rate: 'Import Duty',
  vat_rate: 'VAT',
  rdl_rate: 'Railway Development Levy',
  cpf_rate: 'Customs Processing Fee',
  wharfage_rate: 'TPA Wharfage',
  pid_rate: 'Port Infrastructure Development',
  insurance_rate: 'Insurance',
};

export interface HsSuggestion {
  code: string;
  description: string;
  duty_rate: number | null;
  vat_rate: number | null;
  /** How many words of the goods description this tariff entry contains. */
  matched: number;
  matchedWords: string[];
  totalWords: number;
  /** The ranking score as a percentage — how much of the description this
   *  entry's wording accounts for, weighted by how rare each word is. It is
   *  not a probability that the classification is correct, which is why a
   *  person still accepts every code. See hs-suggest.service.ts. */
  matchPct: number;
}

/**
 * What this workspace declared before for goods described like this.
 *
 * The strongest signal there is, and one the tariff text cannot supply:
 * word-frequency ranking cannot separate "Screws; bolts and nuts" from "Bolt
 * action", but a workspace that has classified fasteners fourteen times has
 * already answered the question. Shown as evidence, never auto-applied — a
 * code declared consistently can still be the wrong code.
 */
export interface HsMemoryHit {
  code: string;
  times: number;
  closestDescription: string;
  similarity: number;
  lastUsed: string;
}

/** Which suggestion the server put first and why — three codes at an identical
 *  percentage say nothing about which to take, so the grounds are stated. */
export interface HsRecommendation {
  code: string;
  reason: string;
  /** Wording alone could not separate the top candidates. */
  tied: boolean;
}

/** One line's answer from the AI review. `code` is null when the AI declined
 *  to choose any of the candidates — which is an answer, not a failure. */
export interface AiPick {
  id: string;
  code: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/** Lines per AI request. The route caps it at 40; batching keeps a 200-line
 *  invoice from becoming one enormous prompt. */
export const AI_PICK_BATCH = 25;

export interface MultiItemRow {
  id: string;
  description: string;
  hs_code: string;
  qty: string;
  unit: string;
  unit_price_usd: string;
  /** Per-row rate overrides. Blank means "use this HS code's tariff rate" —
   *  they're kept as strings so an empty box stays empty rather than being
   *  sent as a real 0%. */
  ov_duty: string;
  ov_vat: string;
  ov_rdl: string;
  ov_cpf: string;
  /** Left out of the calculation. Set by the importer for rows that look like
   *  invoice furniture — always visible, always one click to reverse. Nothing
   *  the importer reads is ever discarded without the user seeing it. */
  excluded?: boolean;
  /** Why the importer flagged this row, shown beside it. */
  flag?: string;
  /**
   * The line total the invoice itself printed, when it had one.
   *
   * Kept alongside the unit price because the two do not always agree: a line
   * billed at USD 2.23 for 200 pieces prints a unit price of 0.01, and 200 x
   * 0.01 is 2.00. The unit price on screen is rounded to 3 decimals for
   * legibility, so recomputing the line from it would lose the invoice's own
   * figure a second time. This is what the assessment actually uses. It is
   * cleared the moment the user edits the quantity or the price, because
   * their edit is then the more recent statement of what the line is worth.
   */
  amount_usd?: string;
}

export function newMultiItemRow(): MultiItemRow {
  return {
    id: Math.random().toString(36).slice(2),
    description: '', hs_code: '', qty: '1', unit: 'unit', unit_price_usd: '',
    ov_duty: '', ov_vat: '', ov_rdl: '', ov_cpf: '',
  };
}

/** Builds a row's rate_overrides payload, omitting blanks entirely. */
export function rowRateOverrides(r: MultiItemRow): Record<string, number> | undefined {
  const entries: [string, string][] = [
    ['duty_rate', r.ov_duty], ['vat_rate', r.ov_vat], ['rdl_rate', r.ov_rdl], ['cpf_rate', r.ov_cpf],
  ];
  const out: Record<string, number> = {};
  for (const [k, raw] of entries) {
    if (raw.trim() === '') continue;
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Spec caps the cargo table at 20 rows. */
// A real commercial invoice runs to hundreds of lines — 20 silently discarded
// most of a 260-line upload. The backend deduplicates HS lookups per distinct
// code rather than per line, so length costs little; this is a guard against a
// runaway paste, not a product limit.
export const MAX_CARGO_ROWS = 400;

export function rowHasOverride(r: MultiItemRow): boolean {
  return rowRateOverrides(r) !== undefined;
}

/** Compact per-line rate box. Amber when set, so an overridden row reads
 *  differently from one inheriting its tariff rate. */
export function RowRate({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const active = value.trim() !== '';
  return (
    <div>
      <label style={{ fontSize: 9.5, fontWeight: 700, color: active ? 'var(--gold)' : 'var(--ink3)', textTransform: 'uppercase' }}>{label}</label>
      <input
        className="input-field"
        type="number"
        min="0"
        step="any"
        value={value}
        placeholder={placeholder ?? 'auto'}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, borderColor: active ? 'var(--gold)' : undefined }}
      />
    </div>
  );
}

export interface MultiLineItemResult {
  line_no: number;
  description: string;
  hs_code: string;
  qty: number;
  unit_price_usd: number;
  fob_usd: number;
  fob_tzs: number;
  allocated_freight_tzs: number;
  allocated_insurance_tzs: number;
  cif_tzs: number;
  duty_rate: number;
  vat_rate: number;
  excise_rate: number;
  rdl_rate: number;
  cpf_rate: number;
  duty: number;
  excise: number;
  rdl: number;
  cpf: number;
  vat: number;
  allocated_destination_tzs: number;
  wharfage: number;
  statutory_total: number;
  landed_total: number;
  landed_total_ex_vat: number;
  pvoc_required: boolean;
  di_required: boolean;
  permits: string[];
  hs_found: boolean;
}

export interface MultiItemResult {
  fx_rate: number;
  mode: ShipmentMode;
  destination_charge_label: string;
  chargeable_weight_kg: number | null;
  items: MultiLineItemResult[];
  totals: {
    fob_usd: number; fob_tzs: number; freight_tzs: number; insurance_tzs: number; cif_tzs: number;
    duty: number; excise: number; rdl: number; cpf: number; vat: number; destination: number; wharfage: number;
    // Consignment-level charges, matching the single-item report's cards.
    pid: number; green_port_initiative: number; green_port_label: string;
    tbs_charge: number; shipping_do_fee: number; shipping_handling_fee: number; shipping_line_charge: number;
    statutory_total: number; total: number; total_ex_vat: number;
    effective_statutory_rate_pct: number; landed_multiplier: number;
  };
  warnings: string[];
  assumptions: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const fmt    = (n: number) => Math.round(n).toLocaleString('en-US');
/** Money to 3 decimals — enough to carry a unit price like 0.011 without
 *  implying a precision the invoice never stated. */
export const fmtUsd3 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
export const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function RRow({ label, value, hi, sub }: { label: string; value: string; hi?: boolean; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
      <span style={{ fontSize: sub ? 12 : hi ? 13 : 12.5, color: sub ? 'var(--ink3)' : 'var(--ink2)', fontWeight: hi ? 700 : 400, fontStyle: sub ? 'italic' : 'normal' }}>{label}</span>
      <span style={{ fontSize: hi ? 15 : 13, fontWeight: 700, color: hi ? 'var(--teal)' : 'var(--ink)', flexShrink: 0, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function Seg({ active, onClick, label, icon, fullWidth, grow }: { active: boolean; onClick: () => void; label: string; icon?: string; fullWidth?: boolean; grow?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        width: fullWidth ? '100%' : 'auto',
        flex: grow ? '1 1 150px' : undefined,
        justifyContent: grow ? 'center' : undefined,
        // One radius token for every control on the page, not a hand-picked
        // 10 next to the fields' 5 — the toggle and the field beside it are
        // the same kind of thing and should not read as two components.
        padding: 'var(--ds-btn-py) 18px', borderRadius: 'var(--r-sm)',
        border: `1.5px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
        background: active ? 'var(--teal-l)' : 'var(--card-bg, var(--white))',
        color: active ? 'var(--teal)' : 'var(--ink2)',
        fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
        transition: 'all .15s ease', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}} data-ui-native-button="">
      {icon && <Icon name={icon as IconName} size={15} color={active ? 'var(--teal)' : 'var(--ink3)'} />}
      {label}
    </button>
  );
}

export function Image1TotalStrip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      marginTop: 14, padding: '12px 18px', borderRadius: 'var(--r)',
      background: 'var(--teal-l)', border: '1px solid var(--teal-m)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--teal)' }}>{value}</span>
    </div>
  );
}

// Description / Unit / Rate / Sub-total / VAT / Total — same six columns and
// VAT math as the Export PDF's card tables (printReport), so what's shown on
// screen and what gets printed never drift apart again.
export const BREAKDOWN_GRID_COLS = '1.9fr 0.85fr 0.95fr 1fr 0.85fr 1fr';
export interface BreakdownRowData { label: string; unit: string; rate: string; netTzs: number; vat: boolean }
export function breakdownRow(label: string, unit: string, rate: string, netTzs: number, vat: boolean): BreakdownRowData {
  return { label, unit, rate, netTzs, vat };
}
export function breakdownRowsTotal(rows: BreakdownRowData[], vatRatePct: number): number {
  return rows.reduce((s, r) => s + r.netTzs + (r.vat ? r.netTzs * vatRatePct / 100 : 0), 0);
}

export function BreakdownHeaderRow() {
  const cell: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.05em' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: BREAKDOWN_GRID_COLS, gap: 10, padding: '0 0 7px', borderBottom: '1px solid var(--border)' }}>
      <span style={cell}>Description</span>
      <span style={{ ...cell, textAlign: 'right' }}>Unit</span>
      <span style={{ ...cell, textAlign: 'right' }}>Rate</span>
      <span style={{ ...cell, textAlign: 'right' }}>Sub-total</span>
      <span style={{ ...cell, textAlign: 'right' }}>VAT</span>
      <span style={{ ...cell, textAlign: 'right' }}>Total</span>
    </div>
  );
}

export function BreakdownRow({ r, vatRatePct }: { r: BreakdownRowData; vatRatePct: number }) {
  const vatTzs = r.vat ? r.netTzs * vatRatePct / 100 : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: BREAKDOWN_GRID_COLS, alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{r.label}</span>
      <span style={{ fontSize: 11, color: 'var(--ink3)', textAlign: 'right' }}>{r.unit}</span>
      <span style={{ fontSize: 11, color: 'var(--ink3)', fontStyle: 'italic', textAlign: 'right' }}>{r.rate}</span>
      <span style={{ fontSize: 12, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>TZS {fmt(r.netTzs)}</span>
      <span style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.vat ? `TZS ${fmt(vatTzs)}` : '—'}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>TZS {fmt(r.netTzs + vatTzs)}</span>
    </div>
  );
}
export function BreakdownTable({ rows, vatRatePct }: { rows: BreakdownRowData[]; vatRatePct: number }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <BreakdownHeaderRow />
      {rows.map((r, i) => <BreakdownRow key={i} r={r} vatRatePct={vatRatePct} />)}
    </div>
  );
}

export interface ExtraCharge { key: string; item: any; qty: number }

export function extraChargeTzs(e: ExtraCharge, fx: number): number {
  const rate = Number(e.item.rate_amount) || 0;
  const tzs = e.item.rate_currency === 'USD' ? rate * fx : rate;
  return tzs * e.qty;
}

export function FormattedLandedCostBreakdown({
  result,
  fobUsd,
  freightUsd,
  insuranceUsd,
  mode,
  container,
  icdOperatorId,
  qty,
  extraItems,
  extraPicker,
  onExtraPickerChange,
  onRemoveExtra,
  onSetExtraQty,
  searchTariff,
}: {
  result: LandedCostResult;
  fobUsd: number;
  freightUsd: number;
  insuranceUsd: number;
  mode: ShipmentMode;
  container: '20ft' | '40ft' | 'lcl';
  icdOperatorId: string | null;
  qty: number;
  extraItems: ExtraCharge[];
  extraPicker: PickerItem | null;
  onExtraPickerChange: (item: PickerItem | null) => void;
  onRemoveExtra: (key: string) => void;
  onSetExtraQty: (key: string, qty: number) => void;
  searchTariff: (q: string) => Promise<PickerItem[]>;
}) {
  const fx = result.fx_rate;

  // ICD Charges and Clearance/Agency Charges are tenant-editable commercial
  // rates, not a TRA/TPA-published tariff — sourced from the tenant's own
  // Rate Card tool (Tools → Rate Card) for whichever card matches this
  // shipment (and ICD operator, if one's selected), same as the Export PDF
  // report. Empty/zero until the tenant populates that tool; never a
  // guessed fallback.
  const [rateCard, setRateCard] = useState<Record<string, number>>({});
  /** Per-size rate cards, keyed '20ft'/'40ft'. A mixed consignment needs both,
   *  because a 40ft is not simply twice a 20ft. */
  const [sizeCards, setSizeCards] = useState<Record<string, Record<string, number>>>({});
  const lotsKey = JSON.stringify(result.containers ?? []);
  useEffect(() => {
    let cancelled = false;
    fetchRateCardDefaults(rateCardKeyFor(mode, container), icdOperatorId).then(rc => { if (!cancelled) setRateCard(rc); });
    const sizes = (result.containers ?? []).map(l => l.size);
    if (sizes.length > 0) {
      Promise.all(sizes.map(sz => fetchRateCardDefaults(sz as RateCardKey, icdOperatorId).then(rc => [sz, rc] as const)))
        .then(pairs => { if (!cancelled) setSizeCards(Object.fromEntries(pairs)); });
    }
    return () => { cancelled = true; };
  }, [mode, container, icdOperatorId, lotsKey]);
  const cfrUsd = fobUsd + freightUsd;
  const fobTzs = (fobUsd || (result.cif_usd - freightUsd - insuranceUsd)) * fx;
  const freightTzs = freightUsd * fx;
  const insuranceTzs = insuranceUsd * fx;
  const insurancePct = cfrUsd > 0 ? (insuranceUsd / cfrUsd) * 100 : 0;
  const modeLabel = mode === 'sea_fcl' ? 'Sea · FCL' : mode === 'sea_lcl' ? 'Sea · LCL' : 'Air';

  // VAT (18%) applies on top of TPA/ICD/Clearance/Shipping service charges,
  // same as the Export PDF and the old interactive sheet — derived from what
  // was actually assessed (never a guessed flat 18%). CIF, Duties & Taxes
  // and TBS rows don't carry a VAT column (VAT is itself one of the Duties
  // rows; TBS is VAT-exempt here).
  // Read the VAT rate off the assessed line rather than reverse-deriving it
  // from vat / (CIF + duty): the VAT base is CIF plus every duty and levy, so
  // that division no longer yields the rate and would inflate the service-VAT
  // column on TPA/ICD/clearance charges.
  const vatRatePct = (() => {
    const row = result.breakdown.find(b => b.label.startsWith('VAT'));
    const parsed = row?.rate ? parseFloat(row.rate) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
  })();

  // Everything below is read straight off `result` — nothing here is a
  // frontend-invented number. `result.breakdown` (customs.service.ts
  // calculateLandedCost) is the single source of truth for every duty/tax/
  // port line item and its current rate; hand-rolling a parallel copy here
  // previously meant this view silently drifted from the real calculation
  // (e.g. still showing a stale "0.6% of FOB" CPF label after the Finance
  // Act 2026 change to 1%) and, worse, displayed a whole card of made-up
  // port/agency/trucking fees (TPA port handling, DO fee, ICD handling,
  // agency fee, trucking, drop-off...) that the backend never computes at
  // all — a real user could have quoted a client off fabricated numbers.
  const STATUTORY_PREFIXES = ['Import Duty', 'Excise Duty', 'VAT', 'Railway Development Levy', 'Customs Processing Fee'];
  const isStatutory = (label: string) => STATUTORY_PREFIXES.some(p => label.startsWith(p));
  const lineItems = result.breakdown.filter(b => b.label !== 'CIF Value (TZS)' && b.label !== 'Total Landed Cost (TZS)' && !b.label.startsWith('Per Unit'));
  const statutoryItems = lineItems.filter(b => isStatutory(b.label));
  const portClearanceItems = lineItems.filter(b => !isStatutory(b.label));

  // ── Additional Port/TPA/TASAC charges — user-selected, not auto-computed.
  // The backend only knows the statutory duty/tax/VAT stack and a generic
  // ICD/wharfage estimate; real per-shipment extras (demurrage, equipment
  // hire, agency fees, transshipment stevedoring, ...) depend on facts the
  // calculator has no way to know (does this shipment sit past free storage?
  // is a forklift needed?), so they're picked in explicitly here rather than
  // guessed at — same anti-fabrication rule that drove the Card 3 rewrite.
  // State lives in the parent (LandedCostPage) so the Export PDF report can
  // include whatever's been added here.
  const extraLineTzs = (e: ExtraCharge) => extraChargeTzs(e, fx);
  const extraTotalTzs = extraItems.reduce((sum, e) => sum + extraLineTzs(e), 0);

  // ── Sub-section split within "PORT, ICD & CLEARANCE" — same buckets the
  // Export PDF report uses, so what's on screen and what's printed always
  // agree. TPA Charges / ICD Charges are backend-computed; Clearance / TBS /
  // Shipping Line combine whatever the backend computed (TBS/Shipping Line
  // only) with anything picked from the additional-charges picker below,
  // categorized by the reference item's authority field.
  const icdItems = portClearanceItems.filter(b => b.label === result.destination_charge_label);
  const tbsBackendItems = portClearanceItems.filter(b => b.label.startsWith('TBS Charges'));
  const shippingBackendItems = portClearanceItems.filter(b => b.label.startsWith('Shipping Line Charges'));
  const tpaItems = portClearanceItems.filter(b => b.label !== result.destination_charge_label && !b.label.startsWith('TBS Charges') && !b.label.startsWith('Shipping Line Charges'));

  const tpaExtra = extraItems.filter(e => e.item.authority === 'TPA');
  const clearanceExtra = extraItems.filter(e => e.item.authority === 'TASAC_CFA');
  const tbsExtra = extraItems.filter(e => e.item.authority === 'TBS');
  const shippingExtra = extraItems.filter(e => e.item.authority === 'SHIPPING_LINE');

  const icdBackendSubtotal = icdItems.reduce((s, b) => s + b.amount, 0);
  const clearanceSubtotal = clearanceExtra.reduce((s, e) => s + extraLineTzs(e), 0);

  // ICD Charges — the 5 "compulsory" items confirmed against real ICD
  // operator invoices (Shore/Port Handling, ICD Movement, Container
  // Transfer, Customs Verification, Corridor Levy) — from the tenant's Rate
  // Card (USD, converted at the live FX rate), not the single generic
  // backend estimate above (kept only as a reconciliation note, same
  // pattern as the Export PDF).
  const icdVerifDef = rateCard['ICD_VERIFICATION'] ?? 0;
  const icdCorrDef = rateCard['ICD_CORRIDOR'] ?? 0;
  const icdHandDef = rateCard['ICD_HANDLING'] ?? 0;
  const icdMoveDef = rateCard['ICD_MOVEMENT'] ?? 0;
  const icdXferDef = rateCard['ICD_TRANSFER'] ?? 0;
  const icdRateCardItems = [
    { label: 'Shore / Port Handling', usd: icdHandDef },
    { label: 'ICD Movement Charges', usd: icdMoveDef },
    { label: 'Container Transfer', usd: icdXferDef },
    { label: 'Customs Verification', usd: icdVerifDef },
    { label: 'Corridor Levy', usd: icdCorrDef },
  ].filter(r => r.usd > 0);

  // Clearance Charges — Documentation + Verification from the Rate Card,
  // Agency Fee from whatever's been picked below (real, situation-specific)
  // or the Rate Card's own default if nothing's been picked yet.
  const cfVerifDef = rateCard['CF_VERIFICATION'] ?? 0;
  const cfDocnDef = rateCard['CF_DOCUMENTATION'] ?? 0;
  const cfAgencyRateCardDef = rateCard['CF_AGENCY_FEE'] ?? 0;

  // ── Row/table data for the six Description|Unit|Rate|Sub-total|VAT|Total
  // cards below — identical shape and VAT rules to the Export PDF's
  // printReport() cards, so the two never disagree again.
  const cifRows: BreakdownRowData[] = [
    breakdownRow('FOB Value', 'lot', `USD ${fmt(fobUsd)}`, fobTzs, false),
    breakdownRow('Freight', modeLabel, `USD ${fmt(freightUsd)}`, freightTzs, false),
    breakdownRow('Insurance', '% of CFR', `${insurancePct.toFixed(insurancePct % 1 === 0 ? 0 : 2)}%`, insuranceTzs, false),
  ];

  const dutiesRows: BreakdownRowData[] = statutoryItems.map(b => breakdownRow(b.label, statutoryUnit(b.label), b.rate || '—', b.amount, false));

  const tpaRows: BreakdownRowData[] = [
    ...tpaItems.map(b => breakdownRow(b.label, tpaUnitFor(b.label), b.rate || '—', b.amount, true)),
    ...tpaExtra.map(e => breakdownRow(e.item.item_name, '—', '—', extraLineTzs(e), false)),
  ];
  const tpaSubtotal = breakdownRowsTotal(tpaRows, vatRatePct);

  const containerCount = Math.max(1, result.num_containers ?? 1);
  /** The container mix, falling back to the selected single size for legacy
   *  results that predate the mixed-consignment field. */
  const lots: { size: '20ft' | '40ft'; count: number }[] =
    (result.containers && result.containers.length > 0)
      ? result.containers
      : (container === '20ft' || container === '40ft') ? [{ size: container, count: containerCount }] : [];

  // ICD lines bill per container, and each size has its own rates — a 40ft is
  // not twice a 20ft — so every lot is priced from its own rate card and the
  // rows are emitted per size. Falls back to the single fetched card when the
  // per-size cards haven't loaded (or the shipment isn't containerised).
  const ICD_CODES: [string, string][] = [
    ['ICD_HANDLING', 'Shore / Port Handling'],
    ['ICD_MOVEMENT', 'ICD Movement Charges'],
    ['ICD_TRANSFER', 'Container Transfer'],
    ['ICD_VERIFICATION', 'Customs Verification'],
    ['ICD_CORRIDOR', 'Corridor Levy'],
  ];
  const multiSize = lots.length > 1;
  const icdRows: BreakdownRowData[] = lots.length > 0
    ? lots.flatMap(lot => {
        const card = sizeCards[lot.size] ?? rateCard;
        return ICD_CODES
          .map(([code, label]) => ({ label, usd: card[code] ?? 0, code }))
          .filter(r => r.usd > 0)
          .map(r => breakdownRow(
            multiSize ? `${r.label} (${lot.size})` : r.label,
            lot.count > 1 ? `per container × ${lot.count}` : 'per container',
            `USD ${r.usd.toFixed(2)}`,
            r.usd * fx * lot.count,
            true,
          ));
      })
    : icdRateCardItems.map(r => breakdownRow(r.label, 'per consignment', `USD ${r.usd.toFixed(2)}`, r.usd * fx, true));
  const icdSubtotal = breakdownRowsTotal(icdRows, vatRatePct);

  const clearanceRows: BreakdownRowData[] = [
    ...(cfDocnDef > 0 ? [breakdownRow('Documentation', 'per BL', `USD ${cfDocnDef.toFixed(2)}`, cfDocnDef * fx, true)] : []),
    ...(cfVerifDef > 0 ? [breakdownRow('Verification', 'per BL', `USD ${cfVerifDef.toFixed(2)}`, cfVerifDef * fx, true)] : []),
    ...(clearanceExtra.length > 0 ? clearanceExtra.map(e => breakdownRow(e.item.item_name, '—', '—', extraLineTzs(e), false))
      : lots.length > 0
        ? lots.flatMap(lot => {
            const usd = (sizeCards[lot.size] ?? rateCard)['CF_AGENCY_FEE'] ?? 0;
            return usd > 0 ? [breakdownRow(
              multiSize ? `Agency Fees (${lot.size})` : 'Agency Fees',
              lot.count > 1 ? `per container × ${lot.count}` : 'per container',
              `USD ${usd.toFixed(2)}`, usd * fx * lot.count, true,
            )] : [];
          })
        : cfAgencyRateCardDef > 0
          ? [breakdownRow('Agency Fees', 'per BL', `USD ${cfAgencyRateCardDef.toFixed(2)}`, cfAgencyRateCardDef * fx, true)] : []),
  ];
  const clearanceCardTotal = breakdownRowsTotal(clearanceRows, vatRatePct);

  const tbsRows: BreakdownRowData[] = [
    ...tbsBackendItems.map(b => breakdownRow(b.label, 'per BL', b.rate || '—', b.amount, false)),
    ...tbsExtra.map(e => breakdownRow(e.item.item_name, '—', '—', extraLineTzs(e), false)),
  ];
  const tbsSubtotal = breakdownRowsTotal(tbsRows, vatRatePct);

  // Delivery Order carries VAT; Handling/TASAC does not — matches the tenant's
  // own workbook and the Export PDF.
  const shipRowVat = (label: string) => !/Handling|TASAC/i.test(label);
  const shipRows: BreakdownRowData[] = [
    ...shippingBackendItems.map(b => breakdownRow(b.label, 'per BL', b.rate || '—', b.amount, shipRowVat(b.label))),
    ...shippingExtra.map(e => breakdownRow(e.item.item_name, '—', '—', extraLineTzs(e), false)),
  ];
  const shippingSubtotal = breakdownRowsTotal(shipRows, vatRatePct);

  // Grand total summed from the six cards actually rendered above — not
  // `result.total`, which predates both the service-VAT column and the
  // itemised Rate Card ICD/Clearance rows (it still carries the backend's
  // single generic ICD estimate instead). Same arithmetic as the Export
  // PDF's summary panel, so screen and print agree line for line.
  // Extras whose authority matches no card above (so they appear in none of
  // the six tables) — still real charges the user picked, so they're carried
  // into the grand total and called out separately rather than dropped.
  const otherExtraTzs = extraItems
    .filter(e => !['TPA', 'TASAC_CFA', 'TBS', 'SHIPPING_LINE'].includes(e.item.authority))
    .reduce((s, e) => s + extraLineTzs(e), 0);
  const portIcdClearanceTotal = tpaSubtotal + icdSubtotal + clearanceCardTotal + tbsSubtotal + shippingSubtotal;
  const grandTotalTzs = result.cif_tzs + result.statutory_total + portIcdClearanceTotal + otherExtraTzs;
  const grandPerUnitTzs = qty > 0 ? grandTotalTzs / qty : grandTotalTzs;
  // VAT recoverable = the statutory VAT line plus every service-VAT amount
  // shown in the cards above.
  const serviceVatTzs = [tpaRows, icdRows, clearanceRows, tbsRows, shipRows]
    .flat()
    .reduce((s, r) => s + (r.vat ? r.netTzs * vatRatePct / 100 : 0), 0);
  const grandTotalExVatTzs = grandTotalTzs - result.vat - serviceVatTzs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Card 1: CIF VALUE ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          CIF VALUE
        </div>
        <BreakdownTable rows={cifRows} vatRatePct={vatRatePct} />
        <Image1TotalStrip label="Total CIF" value={`TZS ${fmt(result.cif_tzs)}`} />
      </div>

      {/* ── Card 2: DUTIES & TAXES ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          DUTIES &amp; TAXES
        </div>
        <BreakdownTable rows={dutiesRows} vatRatePct={vatRatePct} />
        <Image1TotalStrip label="Total Duties & Taxes" value={`TZS ${fmt(result.statutory_total)}`} />
      </div>

      {/* ── Cards 3a-3e: TPA / ICD / Clearance / TBS / Shipping Line — each its
           own card with its own subtotal, matching the same buckets the
           Export PDF report uses so what's on screen and what's printed
           always agree. ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          TPA CHARGES
        </div>
        <BreakdownTable rows={tpaRows} vatRatePct={vatRatePct} />
        {tpaRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '6px 0' }}>No TPA charges (air mode, or nothing added).</div>}
        <Image1TotalStrip label="Total TPA Charges" value={`TZS ${fmt(tpaSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Wharfage, Port Infrastructure Development and Green Port Initiatives are published TPA rates.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          ICD CHARGES
        </div>
        <BreakdownTable rows={icdRows} vatRatePct={vatRatePct} />
        {icdRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '6px 0' }}>Nothing entered yet — populate Shore/Port Handling, ICD Movement, Container Transfer, Customs Verification and Corridor Levy in Tools → Rate Card.</div>}
        <Image1TotalStrip label="Total ICD Charges" value={`TZS ${fmt(icdSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Sourced from your Rate Card (Tools → Rate Card) — a commercial estimate, not a TRA assessment.
          {icdBackendSubtotal > 0 && ` ClearOS separately computed a single ICD/destination charge of TZS ${fmt(icdBackendSubtotal)} (${result.destination_charge_label}) for reference — reconcile it against the itemised figures above rather than adding both.`}
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          CLEARANCE CHARGES <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(documentation, verification &amp; TASAC agency fee)</span>
        </div>
        <BreakdownTable rows={clearanceRows} vatRatePct={vatRatePct} />
        {clearanceRows.length === 0 && cfDocnDef === 0 && cfVerifDef === 0 && cfAgencyRateCardDef === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '6px 0' }}>No agency fee yet — set one in Tools → Rate Card, or pick one from the additional-charges search below (GN. 83-2026 minimum agency fees).</div>}
        <Image1TotalStrip label="Total Clearance Charges" value={`TZS ${fmt(clearanceCardTotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Documentation and Verification are sourced from your Rate Card; Agency Fee comes from what you've picked below if anything, otherwise your Rate Card's own default. Trucking and other clearing-service fees aren't included — add them from the Products &amp; Services catalog when writing the invoice.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          TBS CHARGES
        </div>
        <BreakdownTable rows={tbsRows} vatRatePct={vatRatePct} />
        {tbsRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '6px 0' }}>No TBS charge on this quote.</div>}
        <Image1TotalStrip label="Total TBS Charges" value={`TZS ${fmt(tbsSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Physical Verification Fee (TZS 150,000) + Service Fee (TZS 30,000) are flat reference rates from the clearing agent's own rate sheet — verify against your actual TBS invoice.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          SHIPPING LINE CHARGES
        </div>
        <BreakdownTable rows={shipRows} vatRatePct={vatRatePct} />
        {shipRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic', padding: '6px 0' }}>Not applicable for air cargo.</div>}
        <Image1TotalStrip label="Total Shipping Line Charges" value={`TZS ${fmt(shippingSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Delivery Order Fee (TZS 56,286) and Handling/TASAC Fee (TZS 389,311.50, FCL only) are flat reference rates from the clearing agent's own rate sheet — verify against your actual shipping line invoice.
        </div>
      </div>

      {/* ── ADDITIONAL PORT / TPA / TASAC CHARGES (optional, user-selected) ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--card-radius)', padding: '20px 24px', boxShadow: 'var(--elev)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
          ADDITIONAL PORT / TPA / TASAC CHARGES <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14, lineHeight: 1.5 }}>
          Search the TPA Sea Ports Tariff Book and TASAC agency-fee guide (Tools → Reference → Tariff) for real, situation-specific extras — demurrage, equipment hire, agency fees, transshipment stevedoring — and add only what applies to this shipment. Anything added here also appears under its matching sub-section (TPA / Clearance / TBS / Shipping Line) above — this list is where you adjust quantity or remove one.
        </div>
        <EntityPicker
          value={extraPicker}
          onChange={onExtraPickerChange}
          search={searchTariff}
          placeholder="Search TPA / TASAC tariff items to add…"
        />
        {extraItems.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {extraItems.map(e => (
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{e.item.item_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{[e.item.clause_ref, e.item.category].filter(Boolean).join(' · ')} — {e.item.rate_currency} {Number(e.item.rate_amount).toLocaleString('en-US')}{e.item.unit ? ` / ${e.item.unit}` : ''}</div>
                </div>
                <input type="number" min={1} value={e.qty} onChange={ev => onSetExtraQty(e.key, parseInt(ev.target.value, 10) || 1)}
                  style={{ width: 56, height: 30, textAlign: 'center', borderRadius: 'var(--r)', border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5 }} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', minWidth: 90, textAlign: 'right' }}>TZS {fmt(extraLineTzs(e))}</div>
                <button type="button" onClick={() => onRemoveExtra(e.key)} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }} data-ui-native-button=""><Icon name="x" size={14} /></button>
              </div>
            ))}
            <Image1TotalStrip label="Total Additional Charges" value={`TZS ${fmt(extraTotalTzs)}`} />
          </div>
        )}
      </div>

      {/* ── GRAND TOTAL — LANDED COST ── */}
      <div style={{
        background: 'var(--teal-l)',
        border: '1.5px solid var(--teal-m)',
        borderRadius: 16,
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
            GRAND TOTAL — LANDED COST
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
            TOTAL LANDED COST
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--teal)', letterSpacing: '-0.02em', marginTop: 2 }}>
            TZS {fmt(grandTotalTzs)}
          </div>
        </div>

        {/* 2x2 Grid Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>PER UNIT</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(grandPerUnitTzs)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>CIF (USD)</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>USD {fmtUsd(result.cif_usd)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>DUTIES &amp; TAXES</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(result.statutory_total)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>PORT + ICD + CLEARANCE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(portIcdClearanceTotal)}</div>
          </div>
        </div>

        {/* Recoverable VAT footnote — statutory VAT plus every service-VAT
            amount shown in the cards above. */}
        <div style={{ paddingTop: 10, borderTop: '1px solid var(--teal-m)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--ink3)' }}>Total excl. VAT (VAT recoverable)</span>
          <strong style={{ color: 'var(--teal)' }}>TZS {fmt(grandTotalExVatTzs)}</strong>
        </div>
        {/* Extras picked below are already folded into the TPA / Clearance /
            TBS / Shipping cards above (and therefore into the total), so they
            are not added again here — only ones with no matching card are. */}
        {otherExtraTzs > 0 && (
          <div style={{ paddingTop: 10, borderTop: '1px solid var(--teal-m)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--ink3)' }}>+ Additional charges with no matching card above</span>
            <strong style={{ color: 'var(--ink)' }}>TZS {fmt(otherExtraTzs)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/** The four shipment modes the wizard offers as one dropdown. Internally the
 *  page still carries `isAir` + `container` (the shapes the API and the rate
 *  card already speak), so this is just the single user-facing control the
 *  two of them project onto. */
/** What each statutory line is actually assessed on. Kept in one place
 *  because the unit column is shown to customers as an explanation of the
 *  arithmetic — if it says "CIF" while the figure was computed on FOB, the
 *  document is lying about its own working. */
export function statutoryUnit(label: string): string {
  if (label.startsWith('VAT')) return 'CIF + duties';
  if (label.startsWith('Customs Processing')) return 'FOB';
  return 'CIF';
}

/** TPA lines. PID is charged on the total duties and taxes, not import duty. */
export function tpaUnitFor(label: string): string {
  if (label.startsWith('Port Infrastructure')) return 'Duties & taxes';
  if (label.startsWith('Green Port')) return 'Flat';
  return 'CIF';
}

export type ShipmentModeKey = 'fcl' | 'lcl' | 'air';

/** One size within a consignment. A shipment can mix sizes, and each size has
 *  its own per-container rates (a 40ft is not simply twice a 20ft), so lots
 *  are priced separately and summed. */
export interface ContainerLot { size: '20ft' | '40ft'; count: string }

/** Collapses lots to the {size,count} shape the API takes, dropping blanks
 *  and merging duplicate sizes. */
export function containerLotsPayload(lots: ContainerLot[]): { size: '20ft' | '40ft'; count: number }[] {
  const merged = new Map<'20ft' | '40ft', number>();
  for (const l of lots) {
    const n = Math.floor(parseFloat(l.count) || 0);
    if (n > 0) merged.set(l.size, (merged.get(l.size) ?? 0) + n);
  }
  return (['20ft', '40ft'] as const).filter(s => merged.has(s)).map(s => ({ size: s, count: merged.get(s)! }));
}

/** Suggestions only — the field stays free text, but offering the common
 *  ones keeps "Jebel Ali" from also arriving as "jebel ali"/"JEBEL ALI"/
 *  "Dubai JA", which would make the corridor data useless to aggregate. */
export const SEAPORT_SUGGESTIONS = [
  // Full name + UN/LOCODE, the code customs paperwork and carriers actually use.
  'Ningbo-Zhoushan, China (CNNGB)',
  'Shanghai, China (CNSHA)',
  'Yantian, Shenzhen, China (CNYTN)',
  'Qingdao, China (CNTAO)',
  'Tianjin Xingang, China (CNTSN)',
  'Jebel Ali, United Arab Emirates (AEJEA)',
  'Nhava Sheva (JNPT), India (INNSA)',
  'Mundra, India (INMUN)',
  'Chennai, India (INMAA)',
  'Port Klang, Malaysia (MYPKG)',
  'Singapore (SGSIN)',
  'Jeddah Islamic Port, Saudi Arabia (SAJED)',
  'Salalah, Oman (OMSLL)',
  'Mombasa, Kenya (KEMBA)',
  'Durban, South Africa (ZADUR)',
  'Dar es Salaam, Tanzania (TZDAR)',
  'Rotterdam, Netherlands (NLRTM)',
  'Antwerp, Belgium (BEANR)',
  'Hamburg, Germany (DEHAM)',
];
// Full airport name + country + IATA code. The country is part of the label on
// purpose: it makes the entry self-describing (two "International Airport"s are
// otherwise hard to tell apart) and lets Country of Origin autofill from an
// airport exactly as it does from a sea port. The country is always the last
// comma-separated segment before the code — same shape as SEAPORT_SUGGESTIONS.
export const AIRPORT_SUGGESTIONS = [
  'Guangzhou Baiyun International Airport, China (CAN)',
  'Shanghai Pudong International Airport, China (PVG)',
  'Hong Kong International Airport, Hong Kong (HKG)',
  'Dubai International Airport, United Arab Emirates (DXB)',
  'Hamad International Airport, Doha, Qatar (DOH)',
  // "Türkiye", not "Turkey" — that is the ISO 3166 name reference_countries
  // stores, and the autofill only accepts an exact match against it.
  'Istanbul Airport, Türkiye (IST)',
  'Chhatrapati Shivaji Maharaj International Airport, Mumbai, India (BOM)',
  'Jomo Kenyatta International Airport, Nairobi, Kenya (NBO)',
  'Bole International Airport, Addis Ababa, Ethiopia (ADD)',
  'Amsterdam Airport Schiphol, Netherlands (AMS)',
  'London Heathrow Airport, United Kingdom (LHR)',
  'Julius Nyerere International Airport, Dar es Salaam, Tanzania (DAR)',
];

export const SHIPMENT_MODE_OPTIONS: { key: ShipmentModeKey; label: string; icon: string }[] = [
  { key: 'fcl', label: 'Sea · FCL',  icon: 'box' },
  { key: 'lcl', label: 'Sea · LCL',  icon: 'layers' },
  { key: 'air', label: 'Airfreight', icon: 'plane' },
];

export type RateCardKey = '20ft' | '40ft' | 'sea' | 'air' | 'road';

export function rateCardKeyFor(mode: ShipmentMode, container: '20ft' | '40ft' | 'lcl'): RateCardKey {
  if (mode === 'sea_fcl') return container === '40ft' ? '40ft' : '20ft';
  if (mode === 'air') return 'air';
  return 'sea';
}

/** { CODE: amount } defaults from the tenant's own Rate Card tool
 *  (/clearos/rate-card) — empty object (all zero/editable) if the tenant
 *  hasn't populated it or the request fails, never a guessed fallback.
 *  icdOperatorId picks a specific ICD's own rates; omitted/null uses the
 *  card's generic default. */
export async function fetchRateCardDefaults(cardKey: RateCardKey, icdOperatorId?: string | null): Promise<Record<string, number>> {
  try {
    const res = await apiFetch(`/v1/rate-card/${cardKey}/defaults${icdOperatorId ? `?icd_operator_id=${icdOperatorId}` : ''}`);
    return res.data ?? {};
  } catch {
    return {};
  }
}

/** Who the estimate is addressed to and where the cargo is cleared to.
 *  Descriptive only — none of it feeds the arithmetic, it just labels the
 *  document (and names the downloaded file). */
export interface ReportMeta {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  destination?: string;
  /** QR PNG (data URI) and the public URL it encodes. Rendered server-side by
   *  POST /v1/landed-cost-shares — the print popup has no bundler, so it can
   *  only embed a ready-made image. Both absent when share creation failed;
   *  the document then simply prints without the QR block. */
  qrDataUri?: string;
  shareUrl?: string;
}

export interface ShareResult {
  qrDataUri?: string;
  shareUrl?: string;
  /** Set when the share exists but no QR could be printed — most often
   *  because the public domain isn't configured yet. Surfaced to the user so
   *  a missing QR is explained rather than silently absent. */
  qrUnavailableReason?: string;
}

/** Registers this estimate as a publicly-scannable report and returns the QR
 *  to print on it. Never throws: a failed share must not block the export, it
 *  just means the printed copy carries no QR code. */
/** Rate card per container size present in the result. A mixed consignment
 *  needs both cards because the sizes price differently; falls back to an
 *  empty map, and printReport then uses the single selected card. */
export async function fetchSizeCards(result: LandedCostResult, icdOperatorId: string | null): Promise<Record<string, Record<string, number>>> {
  const sizes = Array.from(new Set((result.containers ?? []).map(l => l.size)));
  if (sizes.length === 0) return {};
  const pairs = await Promise.all(sizes.map(async sz => [sz, await fetchRateCardDefaults(sz as RateCardKey, icdOperatorId)] as const));
  return Object.fromEntries(pairs);
}

export async function createShareForReport(result: LandedCostResult, meta: ReportMeta, payload: Record<string, any>): Promise<ShareResult> {
  try {
    const r: any = await apiFetch('/v1/landed-cost-shares', {
      method: 'POST',
      body: JSON.stringify({
        hs_code: result.hs_code,
        description: result.description,
        customer_name: meta.customerName || null,
        payload,
      }),
    });
    return { qrDataUri: r?.qr_data_uri ?? undefined, shareUrl: r?.url ?? undefined, qrUnavailableReason: r?.qr_unavailable_reason ?? undefined };
  } catch {
    return { qrUnavailableReason: 'The report link could not be created, so this copy has no QR code.' };
  }
}
