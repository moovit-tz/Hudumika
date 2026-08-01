import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../lib/watermark.js';
import { readXlsxSheets } from '../lib/xlsx-read.js';
import { getCompany } from '../data/companyStore.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HsResult {
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

interface LandedCostResult {
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

type ShipmentMode = 'sea_fcl' | 'sea_lcl' | 'air';

/** Human-readable names for the `overridden_fields` keys the API returns. */
const OVERRIDE_LABELS: Record<string, string> = {
  duty_rate: 'Import Duty',
  vat_rate: 'VAT',
  rdl_rate: 'Railway Development Levy',
  cpf_rate: 'Customs Processing Fee',
  wharfage_rate: 'TPA Wharfage',
  pid_rate: 'Port Infrastructure Development',
  insurance_rate: 'Insurance',
};

interface MultiItemRow {
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
}

function newMultiItemRow(): MultiItemRow {
  return {
    id: Math.random().toString(36).slice(2),
    description: '', hs_code: '', qty: '1', unit: 'unit', unit_price_usd: '',
    ov_duty: '', ov_vat: '', ov_rdl: '', ov_cpf: '',
  };
}

/** Builds a row's rate_overrides payload, omitting blanks entirely. */
function rowRateOverrides(r: MultiItemRow): Record<string, number> | undefined {
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
const MAX_CARGO_ROWS = 20;

function rowHasOverride(r: MultiItemRow): boolean {
  return rowRateOverrides(r) !== undefined;
}

/** Compact per-line rate box. Amber when set, so an overridden row reads
 *  differently from one inheriting its tariff rate. */
function RowRate({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const active = value.trim() !== '';
  return (
    <div>
      <label style={{ fontSize: 9.5, fontWeight: 700, color: active ? 'var(--gold, #B8862F)' : 'var(--ink4)', textTransform: 'uppercase' }}>{label}</label>
      <input
        className="input-field"
        type="number"
        min="0"
        step="any"
        value={value}
        placeholder={placeholder ?? 'auto'}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', height: 34, fontSize: 12.5, borderColor: active ? 'var(--gold, #B8862F)' : undefined }}
      />
    </div>
  );
}

interface MultiLineItemResult {
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

interface MultiItemResult {
  fx_rate: number;
  mode: ShipmentMode;
  destination_charge_label: string;
  chargeable_weight_kg: number | null;
  items: MultiLineItemResult[];
  totals: {
    fob_usd: number; fob_tzs: number; freight_tzs: number; insurance_tzs: number; cif_tzs: number;
    duty: number; excise: number; rdl: number; cpf: number; vat: number; destination: number; wharfage: number;
    statutory_total: number; total: number; total_ex_vat: number;
    effective_statutory_rate_pct: number; landed_multiplier: number;
  };
  warnings: string[];
  assumptions: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt    = (n: number) => Math.round(n).toLocaleString('en-US');
const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function RRow({ label, value, hi, sub }: { label: string; value: string; hi?: boolean; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
      <span style={{ fontSize: sub ? 12 : hi ? 13 : 12.5, color: sub ? 'var(--ink4)' : 'var(--ink2)', fontWeight: hi ? 700 : 400, fontStyle: sub ? 'italic' : 'normal' }}>{label}</span>
      <span style={{ fontSize: hi ? 15 : 13, fontWeight: 700, color: hi ? 'var(--teal)' : 'var(--ink)', flexShrink: 0, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Seg({ active, onClick, label, icon, fullWidth, grow }: { active: boolean; onClick: () => void; label: string; icon?: string; fullWidth?: boolean; grow?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        width: fullWidth ? '100%' : 'auto',
        flex: grow ? '1 1 150px' : undefined,
        justifyContent: grow ? 'center' : undefined,
        padding: '11px 18px', borderRadius: 10,
        border: `1.5px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
        background: active ? 'color-mix(in srgb, var(--teal) 12%, transparent)' : 'var(--card-bg, var(--white))',
        color: active ? 'var(--teal)' : 'var(--ink2)',
        fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer',
        transition: 'all .15s ease', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 10
      }}>
      {icon && <Icon name={icon as IconName} size={15} color={active ? 'var(--teal)' : 'var(--ink3)'} />}
      {label}
    </button>
  );
}

function Image1TotalStrip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      marginTop: 14, padding: '12px 18px', borderRadius: 10,
      background: 'rgba(234, 88, 12, 0.07)', border: '1px solid rgba(234, 88, 12, 0.2)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--orange, #ea580c)' }}>{value}</span>
    </div>
  );
}

// Description / Unit / Rate / Sub-total / VAT / Total — same six columns and
// VAT math as the Export PDF's card tables (printReport), so what's shown on
// screen and what gets printed never drift apart again.
const BREAKDOWN_GRID_COLS = '1.9fr 0.85fr 0.95fr 1fr 0.85fr 1fr';
interface BreakdownRowData { label: string; unit: string; rate: string; netTzs: number; vat: boolean }
function breakdownRow(label: string, unit: string, rate: string, netTzs: number, vat: boolean): BreakdownRowData {
  return { label, unit, rate, netTzs, vat };
}
function breakdownRowsTotal(rows: BreakdownRowData[], vatRatePct: number): number {
  return rows.reduce((s, r) => s + r.netTzs + (r.vat ? r.netTzs * vatRatePct / 100 : 0), 0);
}

function BreakdownHeaderRow() {
  const cell: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.05em' };
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

function BreakdownRow({ r, vatRatePct }: { r: BreakdownRowData; vatRatePct: number }) {
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
function BreakdownTable({ rows, vatRatePct }: { rows: BreakdownRowData[]; vatRatePct: number }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <BreakdownHeaderRow />
      {rows.map((r, i) => <BreakdownRow key={i} r={r} vatRatePct={vatRatePct} />)}
    </div>
  );
}

interface ExtraCharge { key: string; item: any; qty: number }

function extraChargeTzs(e: ExtraCharge, fx: number): number {
  const rate = Number(e.item.rate_amount) || 0;
  const tzs = e.item.rate_currency === 'USD' ? rate * fx : rate;
  return tzs * e.qty;
}

function FormattedLandedCostBreakdown({
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
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          CIF VALUE
        </div>
        <BreakdownTable rows={cifRows} vatRatePct={vatRatePct} />
        <Image1TotalStrip label="Total CIF" value={`TZS ${fmt(result.cif_tzs)}`} />
      </div>

      {/* ── Card 2: DUTIES & TAXES ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
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
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          TPA CHARGES
        </div>
        <BreakdownTable rows={tpaRows} vatRatePct={vatRatePct} />
        {tpaRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', padding: '6px 0' }}>No TPA charges (air mode, or nothing added).</div>}
        <Image1TotalStrip label="Total TPA Charges" value={`TZS ${fmt(tpaSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Wharfage, Port Infrastructure Development and Green Port Initiatives are published TPA rates.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          ICD CHARGES
        </div>
        <BreakdownTable rows={icdRows} vatRatePct={vatRatePct} />
        {icdRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', padding: '6px 0' }}>Nothing entered yet — populate Shore/Port Handling, ICD Movement, Container Transfer, Customs Verification and Corridor Levy in Tools → Rate Card.</div>}
        <Image1TotalStrip label="Total ICD Charges" value={`TZS ${fmt(icdSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Sourced from your Rate Card (Tools → Rate Card) — a commercial estimate, not a TRA assessment.
          {icdBackendSubtotal > 0 && ` ClearOS separately computed a single ICD/destination charge of TZS ${fmt(icdBackendSubtotal)} (${result.destination_charge_label}) for reference — reconcile it against the itemised figures above rather than adding both.`}
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          CLEARANCE CHARGES <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(documentation, verification &amp; TASAC agency fee)</span>
        </div>
        <BreakdownTable rows={clearanceRows} vatRatePct={vatRatePct} />
        {clearanceRows.length === 0 && cfDocnDef === 0 && cfVerifDef === 0 && cfAgencyRateCardDef === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', padding: '6px 0' }}>No agency fee yet — set one in Tools → Rate Card, or pick one from the additional-charges search below (GN. 83-2026 minimum agency fees).</div>}
        <Image1TotalStrip label="Total Clearance Charges" value={`TZS ${fmt(clearanceCardTotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Documentation and Verification are sourced from your Rate Card; Agency Fee comes from what you've picked below if anything, otherwise your Rate Card's own default. Trucking and other clearing-service fees aren't included — add them from the Products &amp; Services catalog when writing the invoice.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          TBS CHARGES
        </div>
        <BreakdownTable rows={tbsRows} vatRatePct={vatRatePct} />
        {tbsRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', padding: '6px 0' }}>No TBS charge on this quote.</div>}
        <Image1TotalStrip label="Total TBS Charges" value={`TZS ${fmt(tbsSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Physical Verification Fee (TZS 150,000) + Service Fee (TZS 30,000) are flat reference rates from the clearing agent's own rate sheet — verify against your actual TBS invoice.
        </div>
      </div>

      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          SHIPPING LINE CHARGES
        </div>
        <BreakdownTable rows={shipRows} vatRatePct={vatRatePct} />
        {shipRows.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink4)', fontStyle: 'italic', padding: '6px 0' }}>Not applicable for air cargo.</div>}
        <Image1TotalStrip label="Total Shipping Line Charges" value={`TZS ${fmt(shippingSubtotal)}`} />
        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 10, lineHeight: 1.5 }}>
          Delivery Order Fee (TZS 56,286) and Handling/TASAC Fee (TZS 389,311.50, FCL only) are flat reference rates from the clearing agent's own rate sheet — verify against your actual shipping line invoice.
        </div>
      </div>

      {/* ── ADDITIONAL PORT / TPA / TASAC CHARGES (optional, user-selected) ── */}
      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
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
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{e.item.item_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{[e.item.clause_ref, e.item.category].filter(Boolean).join(' · ')} — {e.item.rate_currency} {Number(e.item.rate_amount).toLocaleString('en-US')}{e.item.unit ? ` / ${e.item.unit}` : ''}</div>
                </div>
                <input type="number" min={1} value={e.qty} onChange={ev => onSetExtraQty(e.key, parseInt(ev.target.value, 10) || 1)}
                  style={{ width: 56, height: 30, textAlign: 'center', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)', fontSize: 12.5 }} />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', minWidth: 90, textAlign: 'right' }}>TZS {fmt(extraLineTzs(e))}</div>
                <button type="button" onClick={() => onRemoveExtra(e.key)} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 4 }}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <Image1TotalStrip label="Total Additional Charges" value={`TZS ${fmt(extraTotalTzs)}`} />
          </div>
        )}
      </div>

      {/* ── GRAND TOTAL — LANDED COST ── */}
      <div style={{
        background: 'rgba(234, 88, 12, 0.06)',
        border: '1.5px solid rgba(234, 88, 12, 0.25)',
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
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>
            TOTAL LANDED COST
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--orange, #ea580c)', letterSpacing: '-0.02em', marginTop: 2 }}>
            TZS {fmt(grandTotalTzs)}
          </div>
        </div>

        {/* 2x2 Grid Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>PER UNIT</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(grandPerUnitTzs)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>CIF (USD)</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>USD {fmtUsd(result.cif_usd)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>DUTIES &amp; TAXES</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(result.statutory_total)}</div>
          </div>
          <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ink3)', textTransform: 'uppercase' }}>PORT + ICD + CLEARANCE</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginTop: 3 }}>TZS {fmt(portIcdClearanceTotal)}</div>
          </div>
        </div>

        {/* Recoverable VAT footnote — statutory VAT plus every service-VAT
            amount shown in the cards above. */}
        <div style={{ paddingTop: 10, borderTop: '1px solid rgba(234, 88, 12, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
          <span style={{ color: 'var(--ink3)' }}>Total excl. VAT (VAT recoverable)</span>
          <strong style={{ color: 'var(--teal)' }}>TZS {fmt(grandTotalExVatTzs)}</strong>
        </div>
        {/* Extras picked below are already folded into the TPA / Clearance /
            TBS / Shipping cards above (and therefore into the total), so they
            are not added again here — only ones with no matching card are. */}
        {otherExtraTzs > 0 && (
          <div style={{ paddingTop: 10, borderTop: '1px solid rgba(234, 88, 12, 0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
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
function statutoryUnit(label: string): string {
  if (label.startsWith('VAT')) return 'CIF + duties';
  if (label.startsWith('Customs Processing')) return 'FOB';
  return 'CIF';
}

/** TPA lines. PID is charged on the total duties and taxes, not import duty. */
function tpaUnitFor(label: string): string {
  if (label.startsWith('Port Infrastructure')) return 'Duties & taxes';
  if (label.startsWith('Green Port')) return 'Flat';
  return 'CIF';
}

type ShipmentModeKey = 'fcl' | 'lcl' | 'air';

/** One size within a consignment. A shipment can mix sizes, and each size has
 *  its own per-container rates (a 40ft is not simply twice a 20ft), so lots
 *  are priced separately and summed. */
interface ContainerLot { size: '20ft' | '40ft'; count: string }

/** Collapses lots to the {size,count} shape the API takes, dropping blanks
 *  and merging duplicate sizes. */
function containerLotsPayload(lots: ContainerLot[]): { size: '20ft' | '40ft'; count: number }[] {
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
const SEAPORT_SUGGESTIONS = [
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
const AIRPORT_SUGGESTIONS = [
  // Full airport name + IATA code.
  'Guangzhou Baiyun International Airport (CAN)',
  'Shanghai Pudong International Airport (PVG)',
  'Hong Kong International Airport (HKG)',
  'Dubai International Airport (DXB)',
  'Hamad International Airport, Doha (DOH)',
  'Istanbul Airport (IST)',
  'Chhatrapati Shivaji Maharaj International Airport, Mumbai (BOM)',
  'Jomo Kenyatta International Airport, Nairobi (NBO)',
  'Bole International Airport, Addis Ababa (ADD)',
  'Amsterdam Airport Schiphol (AMS)',
  'London Heathrow Airport (LHR)',
  'Julius Nyerere International Airport, Dar es Salaam (DAR)',
];

const SHIPMENT_MODE_OPTIONS: { key: ShipmentModeKey; label: string; icon: string }[] = [
  { key: 'fcl', label: 'Sea · FCL',  icon: 'box' },
  { key: 'lcl', label: 'Sea · LCL',  icon: 'layers' },
  { key: 'air', label: 'Airfreight', icon: 'plane' },
];

type RateCardKey = '20ft' | '40ft' | 'sea' | 'air' | 'road';

function rateCardKeyFor(mode: ShipmentMode, container: '20ft' | '40ft' | 'lcl'): RateCardKey {
  if (mode === 'sea_fcl') return container === '40ft' ? '40ft' : '20ft';
  if (mode === 'air') return 'air';
  return 'sea';
}

/** { CODE: amount } defaults from the tenant's own Rate Card tool
 *  (/clearos/rate-card) — empty object (all zero/editable) if the tenant
 *  hasn't populated it or the request fails, never a guessed fallback.
 *  icdOperatorId picks a specific ICD's own rates; omitted/null uses the
 *  card's generic default. */
async function fetchRateCardDefaults(cardKey: RateCardKey, icdOperatorId?: string | null): Promise<Record<string, number>> {
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
interface ReportMeta {
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

interface ShareResult {
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
async function fetchSizeCards(result: LandedCostResult, icdOperatorId: string | null): Promise<Record<string, Record<string, number>>> {
  const sizes = Array.from(new Set((result.containers ?? []).map(l => l.size)));
  if (sizes.length === 0) return {};
  const pairs = await Promise.all(sizes.map(async sz => [sz, await fetchRateCardDefaults(sz as RateCardKey, icdOperatorId)] as const));
  return Object.fromEntries(pairs);
}

async function createShareForReport(result: LandedCostResult, meta: ReportMeta, payload: Record<string, any>): Promise<ShareResult> {
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

function printReport(result: LandedCostResult, qty: string, summary: string, extraItems: ExtraCharge[] = [], container: '20ft' | '40ft' | 'lcl' = '20ft', rateCard: Record<string, number> = {}, meta: ReportMeta = {}, sizeCards: Record<string, Record<string, number>> = {}) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const fx = result.fx_rate;
  const company = getCompany();

  // Same statutory/port split used on-screen (FormattedLandedCostBreakdown)
  // — used here only to total up what the picker's extras contribute to
  // each named slot in the fixed-format sheet below (Shipping/TBS/Green/
  // Clearance), never to invent a new number.
  const STATUTORY_PREFIXES = ['Import Duty', 'Excise Duty', 'VAT', 'Railway Development Levy', 'Customs Processing Fee'];
  const isStatutory = (label: string) => STATUTORY_PREFIXES.some(p => label.startsWith(p));
  const lineItems = result.breakdown.filter(b => b.label !== 'CIF Value (TZS)' && b.label !== 'Total Landed Cost (TZS)' && !b.label.startsWith('Per Unit'));
  const icdBackendRow = lineItems.find(b => !isStatutory(b.label) && b.label === result.destination_charge_label);

  const asExtraRow = (e: ExtraCharge) => ({ label: `${e.item.item_name}${e.qty > 1 ? ` × ${e.qty}` : ''}`, amountTzs: extraChargeTzs(e, fx) });
  const clearanceExtra = extraItems.filter(e => e.item.authority === 'TASAC_CFA').map(asExtraRow);
  const tbsExtra = extraItems.filter(e => e.item.authority === 'TBS').map(asExtraRow);
  const shippingExtra = extraItems.filter(e => e.item.authority === 'SHIPPING_LINE').map(asExtraRow);
  const tpaExtra = extraItems.filter(e => e.item.authority === 'TPA').map(asExtraRow);
  const otherExtra = extraItems.filter(e => !['TASAC_CFA', 'TBS', 'SHIPPING_LINE', 'TPA'].includes(e.item.authority)).map(asExtraRow);

  const clearanceTotalUsd = clearanceExtra.reduce((s, r) => s + r.amountTzs, 0) / fx;
  // result.tbs_charge / result.shipping_line_charge are already the full,
  // correctly-summed backend totals (customs.service.ts) — reading them
  // straight off `result` rather than re-deriving from `result.breakdown`
  // avoids under-counting now that the backend emits TBS and Shipping Line
  // as two separate breakdown rows each (Physical Verification Fee/Service
  // Fee; Delivery Order/Handling), not one combined row.
  // Real flat fees (clearing agent's own rate sheet): Physical Verification
  // Fee TZS 150,000 + Service Fee TZS 30,000 when TBS applies (Destination
  // Inspection required and PVoC not also required — see customs.service.ts)
  const tbsVerifDefaultUsd = result.tbs_charge > 0 ? 150000 / fx : 0;
  const tbsServiceDefaultUsd = (result.tbs_charge > 0 ? 30000 / fx : 0) + tbsExtra.reduce((s, r) => s + r.amountTzs, 0) / fx;
  // Real flat fees (clearing agent's own rate sheet, same source the
  // backend uses): Delivery Order TZS 56,286 for any sea shipment,
  // Handling/TASAC Fee TZS 389,311.50 for FCL only — shown as two separate
  // rows below rather than lumped into one, so the split matches what's
  // actually being charged.
  // Taken from the backend's own breakdown rows rather than re-derived from
  // hardcoded shilling amounts here — duplicating them is what let the PDF
  // drift from the assessed figures when the rates changed.
  const shipDoRow = result.breakdown.find(b => b.label.includes('Delivery Order'));
  const shipHandleRow = result.breakdown.find(b => b.label.includes('Handling/TASAC'));
  const shipDoDefaultUsd = (shipDoRow?.amount ?? 0) / fx;
  const shipHandleDefaultUsd = ((shipHandleRow?.amount ?? 0) + shippingExtra.reduce((s, r) => s + r.amountTzs, 0)) / fx;

  const cargoUsd = result.fob_usd ?? result.cif_usd;
  const freightUsd = result.freight_usd ?? 0;
  const insuranceUsdCard = result.insurance_usd ?? (result.cif_usd * 0.01);
  const insurancePctCard = (cargoUsd + freightUsd) > 0 ? (insuranceUsdCard / (cargoUsd + freightUsd)) * 100 : 0;

  const companyAddrLine = [company.address, company.city, company.country].filter(Boolean).join(', ');
  const modeLabel = result.mode === 'sea_fcl' ? 'Sea · FCL' : result.mode === 'sea_lcl' ? 'Sea · LCL' : 'Air';
  const destinationLabel = (meta.destination || '').trim() || 'Dar es Salaam, Tanzania';
  /** "Dar es Salaam, Tanzania" → "Dar es Salaam" for the summary/DDP labels,
   *  which read as a place name rather than a full address. */
  const destinationShort = destinationLabel.split(',')[0].trim() || destinationLabel;
  const customerLine = [meta.customerName, meta.customerEmail, meta.customerPhone].map(s => (s || '').trim()).filter(Boolean).join(' · ');
  const overriddenLabels = (result.overridden_fields ?? []).map(f => OVERRIDE_LABELS[f] ?? f).join(', ');

  // VAT (18%) applies on top of TPA/ICD/Clearance/Shipping service charges,
  // same as the statutory VAT line itself — derived from what was actually
  // assessed (never a guessed flat 18%) so it stays correct if the rate
  // ever changes. TBS and CIF/Duties rows don't carry a separate VAT
  // column (TBS is VAT-exempt here; VAT is itself one of the Duties rows).
  // Read the VAT rate off the assessed line rather than reverse-deriving it
  // from vat / (CIF + duty): the VAT base is CIF plus every duty and levy, so
  // that division no longer yields the rate and would inflate the service-VAT
  // column on TPA/ICD/clearance charges.
  const vatRatePct = (() => {
    const row = result.breakdown.find(b => b.label.startsWith('VAT'));
    const parsed = row?.rate ? parseFloat(row.rate) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 18;
  })();

  // Per-consignment defaults for the 5 ICD charges and 3 C&F (agency)
  // charges — pulled from the tenant's own Rate Card tool
  // (/clearos/rate-card), keyed to whichever card matches this shipment's
  // container/mode. Empty/zero until the tenant populates that tool; never
  // a guessed fallback.
  const icdHandDef = rateCard['ICD_HANDLING'] ?? 0;
  const icdCorrDef = rateCard['ICD_CORRIDOR'] ?? 0;
  const icdVerifDef = rateCard['ICD_VERIFICATION'] ?? 0;
  const icdMoveDef = rateCard['ICD_MOVEMENT'] ?? 0;
  const icdXferDef = rateCard['ICD_TRANSFER'] ?? 0;
  const cfVerifDef = rateCard['CF_VERIFICATION'] ?? 0;
  const cfDocnDef = rateCard['CF_DOCUMENTATION'] ?? 0;
  const cfAgencyDef = clearanceTotalUsd > 0 ? clearanceTotalUsd : (rateCard['CF_AGENCY_FEE'] ?? 0);
  const hasRateCardDefaults = icdHandDef > 0 || icdCorrDef > 0 || icdVerifDef > 0 || icdMoveDef > 0 || icdXferDef > 0 || cfVerifDef > 0 || cfDocnDef > 0 || (rateCard['CF_AGENCY_FEE'] ?? 0) > 0;

  // ── Card body — mirrors the on-screen FormattedLandedCostBreakdown design
  // (same cards, same data), each rendered as a static, read-only table
  // (Description / Unit / Rate / Sub-total / VAT / Total) rather than an
  // interactive spreadsheet: this is a final estimate to hand to a client,
  // not a working sheet, so nothing here needs to be editable. VAT (18%)
  // applies on top of TPA/ICD/Clearance/Shipping service charges, same as
  // the old interactive sheet did — TBS and CIF/Duties rows don't carry a
  // separate VAT column (TBS is VAT-exempt here; VAT is itself one of the
  // Duties rows, so showing it twice would double-count it).
  const moneyN = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  interface Row { label: string; unit: string; rate: string; netTzs: number; vat: boolean }
  const row = (label: string, unit: string, rate: string, netTzs: number, vat: boolean): Row => ({ label, unit, rate, netTzs, vat });
  const tblRow = (r: Row) => {
    const vatTzs = r.vat ? r.netTzs * vatRatePct / 100 : 0;
    return `<tr><td class="td-desc">${r.label}</td><td class="td-unit">${r.unit}</td><td class="td-rate">${r.rate}</td><td class="td-num">TZS ${moneyN(r.netTzs)}</td><td class="td-num">${r.vat ? 'TZS ' + moneyN(vatTzs) : '&mdash;'}</td><td class="td-num td-total">TZS ${moneyN(r.netTzs + vatTzs)}</td></tr>`;
  };
  // th-unit / th-rate mirror the td-unit / td-rate body classes so the narrow
  // -screen rule can hide a column's header and its cells together. Hiding
  // only the cells leaves 6 headers over 4 cells and shifts every value one
  // column left, which put Total under the VAT heading.
  const cardTable = (rows: Row[]) => rows.length === 0 ? '' : `<table class="ctbl"><thead><tr><th>Description</th><th class="th-unit">Unit</th><th class="r th-rate">Rate</th><th class="r">Sub-total</th><th class="r">VAT</th><th class="r">Total</th></tr></thead><tbody>${rows.map(tblRow).join('')}</tbody></table>`;
  const rowsTotal = (rows: Row[]) => rows.reduce((s, r) => s + r.netTzs + (r.vat ? r.netTzs * vatRatePct / 100 : 0), 0);
  const cardTotal = (label: string, valueTzs: number) => `<div class="card-total"><span>${label}</span><span>TZS ${moneyN(valueTzs)}</span></div>`;
  const cardEmpty = (text: string) => `<div class="card-empty">${text}</div>`;
  const cardNote = (text: string) => `<div class="card-note">${text}</div>`;

  const statutoryItems = lineItems.filter(b => isStatutory(b.label));
  const tpaItems = lineItems.filter(b => !isStatutory(b.label) && b.label !== result.destination_charge_label && !b.label.startsWith('TBS Charges') && !b.label.startsWith('Shipping Line Charges'));

  const cifRows = [
    row('FOB Value', 'lot', `USD ${moneyN(cargoUsd)}`, cargoUsd * fx, false),
    row('Freight', modeLabel, `USD ${moneyN(freightUsd)}`, freightUsd * fx, false),
    row('Insurance', '% of CFR', `${insurancePctCard.toFixed(insurancePctCard % 1 === 0 ? 0 : 2)}%`, insuranceUsdCard * fx, false),
  ];
  const cifCardHtml = `<div class="card"><div class="card-h">CIF VALUE</div>${cardTable(cifRows)}${cardTotal('Total CIF', result.cif_tzs)}</div>`;

  const dutiesRows = statutoryItems.map(b => row(b.label, statutoryUnit(b.label), b.rate || '&mdash;', b.amount, false));
  const dutiesCardHtml = `<div class="card"><div class="card-h">DUTIES &amp; TAXES</div>${cardTable(dutiesRows)}${cardTotal('Total Duties &amp; Taxes', result.statutory_total)}</div>`;

  const tpaRows = [
    ...tpaItems.map(b => row(b.label, tpaUnitFor(b.label), b.rate || '&mdash;', b.amount, true)),
    ...tpaExtra.map(r => row(r.label, '&mdash;', '&mdash;', r.amountTzs, false)),
  ];
  const tpaSubtotalTzs = rowsTotal(tpaRows);
  const tpaCardHtml = `<div class="card"><div class="card-h">TPA CHARGES</div>${cardTable(tpaRows) || cardEmpty('No TPA charges (air mode, or nothing added).')}${cardTotal('Total TPA Charges', tpaSubtotalTzs)}${cardNote('Wharfage, Port Infrastructure Development and Green Port Initiatives are published TPA rates.')}</div>`;

  const icdRateAll: [string, number][] = [
    ['Customs Verification', icdVerifDef], ['Corridor Levy', icdCorrDef], ['Handling Charges', icdHandDef],
    ['ICD Movement Charges', icdMoveDef], ['Container Transfer', icdXferDef],
  ];
  const containerCount = Math.max(1, result.num_containers ?? 1);
  /** Container mix, falling back to the selected single size for results that
   *  predate the mixed-consignment field. */
  const lots: { size: '20ft' | '40ft'; count: number }[] =
    (result.containers && result.containers.length > 0)
      ? result.containers
      : (container === '20ft' || container === '40ft') ? [{ size: container, count: containerCount }] : [];
  const multiSize = lots.length > 1;
  /** ICD codes in the same order the rate card lists them, so the printed
   *  rows match the Rate Card tool. */
  const ICD_CODES: [string, string][] = [
    ['ICD_VERIFICATION', 'Customs Verification'],
    ['ICD_CORRIDOR', 'Corridor Levy'],
    ['ICD_HANDLING', 'Handling Charges'],
    ['ICD_MOVEMENT', 'ICD Movement Charges'],
    ['ICD_TRANSFER', 'Container Transfer'],
  ];
  // Each size is priced from its own card — a 40ft is not twice a 20ft — and
  // multiplied by that lot's count.
  const icdRows = lots.length > 0
    ? lots.flatMap(lot => {
        const card = sizeCards[lot.size] ?? rateCard;
        return ICD_CODES
          .map(([code, label]) => ({ label, usd: card[code] ?? 0 }))
          .filter(r => r.usd > 0)
          .map(r => row(
            multiSize ? `${r.label} (${lot.size})` : r.label,
            lot.count > 1 ? `per container &times; ${lot.count}` : 'per container',
            `USD ${moneyN(r.usd)}`,
            r.usd * fx * lot.count,
            true,
          ));
      })
    : icdRateAll.filter(([, v]) => v > 0).map(([label, usd]) => row(label, 'per consignment', `USD ${moneyN(usd)}`, usd * fx, true));
  const icdSubtotalTzs = rowsTotal(icdRows);
  // `brk` starts page 2 here — page 1 ends after Total TPA Charges.
  const icdCardHtml = `<div class="card"><div class="card-h">ICD CHARGES</div>${cardTable(icdRows) || cardEmpty('Nothing entered yet — populate your Rate Card (Tools → Rate Card).')}${cardTotal('Total ICD Charges', icdSubtotalTzs)}${cardNote(`Sourced from your Rate Card — a commercial estimate, not a TRA assessment.${icdBackendRow ? ` ClearOS separately computed a single ICD/destination charge of TZS ${moneyN(icdBackendRow.amount)} (${icdBackendRow.label}) for reference — reconcile it against the itemised figures above rather than adding both.` : ''}`)}</div>`;

  const clearanceRows = [
    ...(cfDocnDef > 0 ? [row('Documentation', 'per BL', `USD ${moneyN(cfDocnDef)}`, cfDocnDef * fx, true)] : []),
    ...(cfVerifDef > 0 ? [row('Verification', 'per BL', `USD ${moneyN(cfVerifDef)}`, cfVerifDef * fx, true)] : []),
    ...(clearanceExtra.length > 0 ? clearanceExtra.map(e => row(e.label, '&mdash;', '&mdash;', e.amountTzs, false))
      : lots.length > 0
        ? lots.flatMap(lot => {
            const usd = (sizeCards[lot.size] ?? rateCard)['CF_AGENCY_FEE'] ?? 0;
            return usd > 0 ? [row(
              multiSize ? `Agency Fees (${lot.size})` : 'Agency Fees',
              lot.count > 1 ? `per container &times; ${lot.count}` : 'per container',
              `USD ${moneyN(usd)}`, usd * fx * lot.count, true,
            )] : [];
          })
        : cfAgencyDef > 0
          ? [row('Agency Fees', 'per BL', `USD ${moneyN(cfAgencyDef)}`, cfAgencyDef * fx, true)] : []),
  ];
  const clearanceTotalTzs = rowsTotal(clearanceRows);
  const clearanceCardHtml = `<div class="card"><div class="card-h">CLEARANCE CHARGES <span class="card-h-sub">(documentation, verification &amp; TASAC agency fee)</span></div>${cardTable(clearanceRows) || cardEmpty('No agency fee yet — set one in Tools → Rate Card, or pick one from the additional-charges search below.')}${cardTotal('Total Clearance Charges', clearanceTotalTzs)}${cardNote(`Documentation and Verification are sourced from your Rate Card; Agency Fee comes from what you've picked below if anything, otherwise your Rate Card's default.`)}</div>`;

  const tbsRows = [
    ...(tbsVerifDefaultUsd > 0 ? [row('Physical Verification Fee (DI)', 'per BL', `USD ${moneyN(tbsVerifDefaultUsd)}`, tbsVerifDefaultUsd * fx, false)] : []),
    ...(tbsServiceDefaultUsd > 0 ? [row('Service Fee', 'per BL', `USD ${moneyN(tbsServiceDefaultUsd)}`, tbsServiceDefaultUsd * fx, false)] : []),
  ];
  const tbsTotalTzs = rowsTotal(tbsRows);
  const tbsCardHtml = `<div class="card"><div class="card-h">TBS CHARGES</div>${cardTable(tbsRows) || cardEmpty("No TBS charge on this quote.")}${cardTotal('Total TBS Charges', tbsTotalTzs)}${cardNote('Physical Verification Fee (TZS 150,000) + Service Fee (TZS 30,000) are flat reference rates from the clearing agent’s own rate sheet.')}</div>`;

  // Delivery Order carries VAT; Handling/TASAC does not — per the tenant's own
  // Landed Cost Model workbook, which shows a blank VAT column and a total
  // equal to the sub-total on that line.
  const shipRows = [
    ...(shipDoDefaultUsd > 0 ? [row('Delivery Order Fee', 'per BL', `USD ${moneyN(shipDoDefaultUsd)}`, shipDoDefaultUsd * fx, true)] : []),
    ...(shipHandleDefaultUsd > 0 ? [row('Handling / TASAC Fee', 'per container', `USD ${moneyN(shipHandleDefaultUsd)}`, shipHandleDefaultUsd * fx, false)] : []),
  ];
  const shipTotalTzs = rowsTotal(shipRows);
  const shipCardHtml = `<div class="card"><div class="card-h">SHIPPING LINE CHARGES</div>${cardTable(shipRows) || cardEmpty('Not applicable for air cargo.')}${cardTotal('Total Shipping Line Charges', shipTotalTzs)}${cardNote('Delivery Order (TZS 56,286) and Handling/TASAC Fee (TZS 389,311.50, FCL only) are flat reference rates from the clearing agent’s own rate sheet.')}</div>`;

  const freightinsTzs = freightUsd * fx + insuranceUsdCard * fx;
  const tzpayTzs = shipTotalTzs + result.statutory_total + tbsTotalTzs + tpaSubtotalTzs + icdSubtotalTzs + clearanceTotalTzs;
  const prepTzs = freightinsTzs + tzpayTzs;
  const prepUsd = prepTzs / fx;
  const ddpTzs = cargoUsd * fx + prepTzs;
  const ddpUsd = cargoUsd + prepUsd;

  const notesExtra: string[] = [];
  if (otherExtra.length > 0) {
    notesExtra.push(`Added via the on-screen picker but with no matching card above — add manually: ${otherExtra.map(e => `${e.label} (TZS ${e.amountTzs.toLocaleString('en-US')})`).join('; ')}.`);
  }
  if (hasRateCardDefaults) notesExtra.push(`ICD and C&F charges are sourced from ${company.name}'s own Rate Card tool (Tools → Rate Card) for the "${rateCardKeyFor(result.mode, container)}" card — not a government tariff. Any line still at zero hasn't been entered there yet.`);
  const allNotes = [...result.warnings, ...result.assumptions, ...notesExtra];

  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Calculator &middot; ${result.hs_code} &middot; ClearOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--acc:#FF5E1A;--acc-600:#E8480A;--acc-050:#FFF4EC;--acc-100:#FFE0CE;--ink:#14181B;--ink-700:#2A3035;--slate:#5B646D;--slate-400:#8A939C;--line:#E5E9EC;--line-soft:#EEF2F4;--paper:#FFFFFF;--backdrop:#E7EBEE;--panel:#161A1E;--tint:#F7F9FA;--gold:#B8862F;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--backdrop);color:var(--ink);font-family:"Inter",system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.toolbar{position:fixed;top:18px;right:18px;z-index:50;display:flex;gap:8px}
.toolbar button{font-family:inherit;font-size:12.5px;font-weight:600;letter-spacing:.02em;border:1px solid var(--line);background:#fff;color:var(--ink-700);padding:9px 15px;border-radius:9px;cursor:pointer;box-shadow:0 2px 8px rgba(20,25,30,.10);transition:.15s}
.toolbar button:hover{border-color:var(--acc);color:var(--acc-600)}
.toolbar .primary{background:var(--acc);color:#fff;border-color:var(--acc)}
.toolbar .primary:hover{background:var(--acc-600);color:#fff}
.sheet{width:210mm;min-height:297mm;margin:34px auto;background:var(--paper);box-shadow:0 12px 40px rgba(20,25,30,.14);padding:16mm 15mm 13mm;position:relative}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:2px solid var(--ink);position:relative}
.head::after{content:"";position:absolute;left:0;bottom:-2px;width:88px;height:2px;background:var(--acc)}
.brand{display:flex;gap:12px;align-items:flex-start}
.mark{width:44px;height:44px;border-radius:13px;background:var(--acc);flex:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,94,26,.28)}
.mark svg{width:27px;height:27px}
.brand .name{font-family:"Space Grotesk",sans-serif;font-size:21px;font-weight:700;line-height:1;color:var(--ink)}
.brand .name span{color:var(--acc)}
.brand .role{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--slate);font-weight:600;margin-top:5px}
.brand .addr{font-size:10.5px;color:var(--slate);margin-top:7px;line-height:1.55}
.brand .addr b{color:var(--ink-700);font-weight:600}
.doc{text-align:right;flex:none}
.doc .kick{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.doc h1{font-family:"Space Grotesk",sans-serif;font-size:23px;font-weight:700;line-height:1.05;margin-top:3px;color:var(--ink)}
.doc .pi{margin-top:10px;font-size:11.5px;color:var(--slate);line-height:1.7}
.doc .pi b{color:var(--ink-700);font-weight:600}
.doc .pi .mono{font-family:"IBM Plex Mono",monospace;font-weight:600;color:var(--ink)}
.client{display:flex;align-items:baseline;gap:10px;margin-top:14px;padding:9px 14px;border:1px solid var(--line);border-radius:9px;background:var(--tint)}
.client .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700;flex:none}
.client .val{font-size:11.5px;color:var(--ink-700);font-weight:600}
.override{margin-top:10px;padding:9px 14px;border:1px solid #E4C06A;border-radius:9px;background:#FDF6E3;font-size:10.5px;color:#6B5518;line-height:1.5}
.override b{color:#8A6D14}
.parties{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.parties .p{padding:13px 16px}
.parties .p:first-child{border-right:1px solid var(--line);background:var(--tint)}
.parties .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.parties .big{font-family:"Space Grotesk",sans-serif;font-size:15px;font-weight:600;margin-top:5px;color:var(--ink)}
.parties .kv{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-top:6px}
.parties .kv .k{color:var(--slate)}
.parties .kv .v{color:var(--ink-700);font-weight:600;text-align:right}
.cards{margin-top:16px;display:flex;flex-direction:column;gap:10px}
.card{border:1px solid var(--line);border-radius:12px;padding:12px 16px;background:#fff}
.card-h{font-size:10px;font-weight:800;color:var(--slate);text-transform:uppercase;letter-spacing:.08em;margin-bottom:7px}
.card-h-sub{font-weight:500;text-transform:none;letter-spacing:0;color:var(--slate-400)}
table.ctbl{width:100%;border-collapse:collapse;font-size:10px}
table.ctbl thead th{background:var(--tint);color:var(--slate);font-weight:700;font-size:8.5px;letter-spacing:.04em;text-transform:uppercase;padding:5px 6px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
table.ctbl thead th.r{text-align:right}
table.ctbl td{padding:4.5px 6px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
table.ctbl .td-desc{color:var(--ink-700);font-weight:600;overflow-wrap:break-word}
table.ctbl .td-unit{width:1%;color:var(--slate);font-size:9px;white-space:nowrap}
table.ctbl .td-rate{width:1%;text-align:right;color:var(--slate);font-style:italic;white-space:nowrap}
table.ctbl .td-num{width:1%;text-align:right;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}
table.ctbl .td-total{font-weight:700}
.card-total{margin-top:8px;padding:7px 12px;border-radius:8px;background:var(--acc-050);border:1px solid var(--acc-100);display:flex;justify-content:space-between;align-items:center}
.card-total span:first-child{font-size:11px;font-weight:700;color:var(--ink)}
.card-total span:last-child{font-size:12.5px;font-weight:800;color:var(--acc-600)}
.card-empty{font-size:10.5px;color:var(--slate-400);font-style:italic;padding:4px 0}
.card-note{margin-top:6px;font-size:9.5px;color:var(--slate);line-height:1.45}
.summary{margin-top:22px;display:grid;grid-template-columns:1.12fr 0.88fr;border-radius:14px;overflow:hidden;border:1px solid var(--line)}
.sum-l{padding:18px 18px;background:var(--tint)}
.sum-l h3{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:13px;display:flex;align-items:center}
.sum-l h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.sum-l .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:5.5px 0;border-bottom:1px solid var(--line-soft)}
.sum-l .row.head{color:var(--slate);font-weight:600;border-bottom:none;padding-bottom:2px;padding-top:9px;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase}
.sum-l .row.sub{padding-left:14px}
.sum-l .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.sum-l .row.sub .k{color:var(--slate)}
.sum-l .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.sum-l .row.cifrow{border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:3px}
.sum-l .row.cifrow .k{font-weight:700}
.sum-l .row.cifrow .v{font-family:"Space Grotesk",sans-serif;font-size:12px}
.sum-r{background:var(--panel);color:#fff;padding:18px 18px;display:flex;flex-direction:column;justify-content:center}
.sum-r .prep-lab{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--acc-100);font-weight:700}
.sum-r .prep-tzs{font-family:"Space Grotesk",sans-serif;font-size:22px;font-weight:700;line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.sum-r .prep-usd{margin-top:6px;font-size:12px;color:#9fb2ac;font-variant-numeric:tabular-nums}
.sum-r .fx{margin-top:4px;font-size:10.5px;color:#75897f}
.sum-r .ddp{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.sum-r .ddp .l{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa39d;font-weight:600;white-space:nowrap}
.sum-r .ddp .v{font-family:"Space Grotesk",sans-serif;font-size:19px;font-weight:700;margin-top:5px;color:#FF8A4C;font-variant-numeric:tabular-nums;white-space:nowrap}
.sum-r .ddp .n{font-size:10px;color:#75897f;margin-top:3px}
.foot{margin-top:20px}
.terms{width:100%}
.terms h4{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700;margin-bottom:8px}
.terms ul{list-style:none;font-size:10.5px;color:var(--slate);line-height:1.6;columns:2;column-gap:26px}
.terms ul li{padding-left:13px;position:relative;margin-bottom:3px;break-inside:avoid}
.terms ul li::before{content:"";position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.qr{margin-top:14px;display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--tint)}
.qr img{width:74px;height:74px;flex:none;display:block;border-radius:6px;background:#fff}
.qr-h{font-size:10.5px;font-weight:800;color:var(--ink);text-transform:uppercase;letter-spacing:.07em}
.qr-b{font-size:9.5px;color:var(--slate);line-height:1.5;margin-top:4px}
.qr-u{font-family:"IBM Plex Mono",monospace;font-size:8.5px;color:var(--acc-600);margin-top:5px;word-break:break-all}
/* Each .page is one printed sheet. Wrapping content this way (rather than
   forcing breaks on arbitrary elements) gives the watermark a box to centre
   itself in, and makes the pagination explicit instead of inferred. */
.page{position:relative}
.page > *{position:relative;z-index:1}
/* Watermark: pages 1 and 2 carry one, the final page does not. Sits in front
   of the content at 70% transparency (0.3 opacity). z-index beats the
   .page > * rule above; pointer-events:none keeps it from swallowing clicks
   or text selection in the on-screen preview. */
.wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:118mm;max-width:70%;z-index:5;pointer-events:none;line-height:0}
.wm svg{width:100%;height:auto;display:block;fill:var(--acc);opacity:.075}
.page-last .wm{display:none}
.sign-row{margin-top:16px;border-top:1px solid var(--line);padding-top:11px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.sign .w{font-size:12px;font-weight:600;color:var(--ink-700)}
.sign .r{font-size:10.5px;color:var(--slate);margin-top:2px}
.sign-row .stamp{padding-top:7px;border-top:1px dashed var(--slate-400);font-size:10px;color:var(--slate-400);min-width:220px;text-align:right}
.legal{margin-top:14px;font-size:9.5px;color:var(--slate-400);line-height:1.55;background:var(--tint);border-radius:9px;padding:10px 13px}
.credit{margin-top:14px;padding-top:11px;border-top:2px solid var(--ink);position:relative;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--slate)}
.credit::after{content:"";position:absolute;left:0;top:-2px;width:88px;height:2px;background:var(--acc)}
.credit b{color:var(--ink-700)}
@media print{
  /* Real A4 pages with normal margins. Each .page container is exactly one
     printed sheet: page 1 ends after Total TPA Charges, page 2 runs ICD →
     Shipping Line, page 3 is the Landed Cost Summary, notes and footer. */
  @page{size:A4;margin:14mm}
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  /* break-after on every page but the last — a trailing break would emit a
     blank extra sheet.

     Deliberately NO min-height. Pinning it to the 269mm printable height
     (297mm less two 14mm margins) meant any sub-pixel rounding overflowed a
     hairline onto the following sheet, and the forced break then pushed the
     next page one further — producing a blank sheet before the summary. The
     watermark now centres on its page's content box rather than on the paper,
     which on these content-heavy pages is nearly the same place and cannot
     manufacture a blank page. */
  .page{break-after:page;page-break-after:always}
  .page-last{break-after:auto;page-break-after:auto}
  /* Flex containers fragment unreliably across print engines, so the card
     stack becomes plain block flow for printing — forced breaks on block
     children are dependable. The gap property doesn't apply in block layout,
     hence the explicit margin. */
  .cards{display:block}
  .cards > .card{margin-bottom:10px}
  .card{page-break-inside:avoid}
  .summary,.parties,.head,.terms,.client,.override,.qr{page-break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
/* SCREEN ONLY. Must never apply to print: an A4 page is 210mm, about 794 CSS
   px, so an unscoped max-width:900px rule matches while printing and wrecks
   the exported document — stacking the header, the Cargo/Shipment pair and
   the summary, and dropping table columns. */
@media screen and (max-width:900px){
  .sheet{width:100%;margin:0;padding:20px 12px}
  .parties,.summary{grid-template-columns:1fr}
  .terms ul{columns:1}
  .sign-row{flex-direction:column;align-items:flex-start}
  .sign-row .stamp{text-align:left;min-width:0}
  table.ctbl{font-size:10px}
  table.ctbl .td-unit,table.ctbl .td-rate,table.ctbl .th-unit,table.ctbl .th-rate{display:none}
  .toolbar{position:static;justify-content:flex-end;padding:10px}
  .head{flex-direction:column}.doc{text-align:left}
}
</style></head><body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">Download / Print PDF</button>
</div>

<div class="sheet">
 <section class="page">
  <div class="wm" aria-hidden="true"><svg viewBox="7 20 111 110"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z"/></svg></div>
  <header class="head">
    <div class="brand">
      <div class="mark"><svg viewBox="7 20 111 110" fill="none"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z" fill="#fff"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z" fill="#fff"/></svg></div>
      <div>
        <div class="name">Clear<span>OS</span></div>
        <div class="role">Customs &amp; Landed Cost Intelligence</div>
        <div class="addr">Clearing agent: <b>${company.name}</b>${company.businessType ? ` &middot; ${company.businessType}` : ''}<br>${companyAddrLine}${companyAddrLine ? ' &middot; ' : ''}${company.email || ''}</div>
      </div>
    </div>
    <div class="doc">
      <div class="kick">Estimate</div><h1>Landed Cost</h1>
      <div class="pi">Ref <span class="mono">${result.hs_code}-${now.replace(/\s/g, '')}</span><br>Generated <b>${now}</b></div>
    </div>
  </header>

  ${customerLine ? `<section class="client"><span class="lab">Prepared for</span><span class="val">${customerLine}</span></section>` : ''}
  ${overriddenLabels ? `<section class="override"><b>Manual rate override:</b> ${overriddenLabels} — entered by the preparer, not sourced from the EAC CET tariff database or a published TPA/TRA rate.</section>` : ''}

  <section class="parties">
    <div class="p"><div class="lab">Cargo</div><div class="big">${result.description}</div>
      <div class="kv"><span class="k">HS Code</span><span class="v">${result.hs_code}</span></div>
      <div class="kv"><span class="k">Quantity</span><span class="v">${qty || '1'} unit(s)</span></div></div>
    <div class="p"><div class="lab">Shipment</div>
      <div class="kv"><span class="k">Mode</span><span class="v">${modeLabel}</span></div>
      <div class="kv"><span class="k">Destination basis</span><span class="v">${result.destination_charge_label}</span></div>
      <div class="kv"><span class="k">Destination</span><span class="v">${destinationLabel}</span></div></div>
  </section>

  <div class="cards">
    ${cifCardHtml}
    ${dutiesCardHtml}
    ${tpaCardHtml}
  </div>
 </section>

 <section class="page">
  <div class="wm" aria-hidden="true"><svg viewBox="7 20 111 110"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z"/></svg></div>
  <div class="cards">
    ${icdCardHtml}
    ${clearanceCardHtml}
    ${tbsCardHtml}
    ${shipCardHtml}
  </div>
 </section>

 <section class="page page-last">
  <section class="summary">
    <div class="sum-l">
      <h3><span class="n">10</span>Landed Cost Summary</h3>
      <div class="row cifrow"><span class="k">CIF ${destinationShort} <span style="color:var(--slate);font-weight:400;font-size:8.5px">cargo, freight, insurance</span></span><span class="v">TZS ${moneyN(result.cif_tzs)}</span></div>
      <div class="row"><span class="k">1&nbsp; Freight &amp; insurance — export country</span><span class="v">TZS ${moneyN(freightinsTzs)}</span></div>
      <div class="row head"><span class="k">2&nbsp; Amount to pay in Tanzania</span><span></span></div>
      <div class="row sub"><span class="k">Local shipping line charges</span><span class="v">TZS ${moneyN(shipTotalTzs)}</span></div>
      <div class="row sub"><span class="k">Duties &amp; taxes — TRA (incl. VAT)</span><span class="v">TZS ${moneyN(result.statutory_total)}</span></div>
      <div class="row sub"><span class="k">TBS charges</span><span class="v">TZS ${moneyN(tbsTotalTzs)}</span></div>
      <div class="row sub"><span class="k">Port &amp; handling — TPA</span><span class="v">TZS ${moneyN(tpaSubtotalTzs)}</span></div>
      <div class="row sub"><span class="k">ICD charges</span><span class="v">TZS ${moneyN(icdSubtotalTzs)}</span></div>
      <div class="row sub"><span class="k">C&amp;F charges</span><span class="v">TZS ${moneyN(clearanceTotalTzs)}</span></div>
    </div>
    <div class="sum-r">
      <div class="prep-lab">Total Amount to Prepare</div>
      <div class="prep-tzs">TZS ${moneyN(prepTzs)}</div>
      <div class="prep-usd">USD ${moneyN(prepUsd)}</div>
      <div class="fx">@ USD &rarr; TZS ${fx.toLocaleString('en-US')}</div>
      <div class="ddp">
        <div class="l">Total Landed Cost — DDP ${destinationShort} <span style="text-transform:none;letter-spacing:0">(incl. VAT)</span></div>
        <div class="v">TZS ${moneyN(ddpTzs)}</div>
        <div class="n">USD ${moneyN(ddpUsd)} = Cargo ${`$${moneyN(cargoUsd)}`} + costs to prepare ${`$${moneyN(prepUsd)}`}</div>
      </div>
    </div>
  </section>

  <div class="foot">
    <div class="terms">
      <h4>Notes &amp; Assumptions</h4>
      <ul>${allNotes.map(w => `<li>${w}</li>`).join('') || '<li>No warnings — statutory rates matched this HS code exactly.</li>'}</ul>
    </div>
    ${meta.qrDataUri ? `<div class="qr">
      <img src="${meta.qrDataUri}" alt="Scan to open this estimate">
      <div class="qr-t">
        <div class="qr-h">Scan for the full report</div>
        <div class="qr-b">Opens this estimate on ${company.name}'s ClearOS workspace, where you can download it as a PDF. You'll be asked for an email address so we can send you the follow-up.</div>
        ${meta.shareUrl ? `<div class="qr-u">${meta.shareUrl}</div>` : ''}
      </div>
    </div>` : ''}
    <div class="sign-row">
      <div class="sign"><div class="w">For ${company.name}</div>
        <div class="r">${company.businessType || 'Customs Clearing & Forwarding Agent'}</div></div>
      <div class="stamp">Authorised signature &amp; company stamp</div>
    </div>
    ${summary ? `<h4 style="margin-top:14px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700">AI Summary</h4><div style="white-space:pre-wrap;background:var(--tint);padding:14px;border-radius:8px;font-size:11.5px;line-height:1.7;border:1px solid var(--line);margin-top:8px">${summary}</div>` : ''}
    <div class="legal">This is a decision-support estimate, not a customs assessment or tax invoice. Final duties, taxes and charges are those determined by the Tanzania Revenue Authority on the lodged declaration. TBS, Port, ICD and C&amp;F figures are estimates pending your final third-party invoices — see Notes &amp; Assumptions above for sourcing.</div>
    <div class="credit"><span>Prepared on <b>ClearOS</b> &middot; Hudumika Platform</span><span>${result.hs_code} &middot; Confidential</span></div>
  </div>
 </section>
</div>

<script>
/** Pagination is now plain A4 with two forced breaks (see the .brk rule), so
 *  there's no dynamic page sizing to do — but the print still has to wait for
 *  the web fonts. Printing against fallback-font metrics reflows the layout
 *  once the real fonts land, which is what previously made the preview and
 *  the saved file disagree and pushed rows onto phantom pages. */
var didPrint = false;
function goPrint(){
  if(didPrint) return;
  didPrint = true;
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.print(); }); });
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(goPrint);
  setTimeout(goPrint, 2000); // fallback if the fonts API stalls or a font 404s
} else {
  setTimeout(goPrint, 700);
}
</script>
</body></html>`);
  w.document.close();
  w.focus();
}

/** Re-renders a shared estimate from a stored share payload, using the exact
 *  same document generator as the original export so a downloaded copy is
 *  identical to the printed one. The QR is deliberately dropped — the reader
 *  is already on the share page, and re-printing it would encode a link back
 *  to the page they came from. */
export function printSharedReport(payload: {
  result?: LandedCostResult;
  multiResult?: MultiItemResult;
  qty?: string;
  summary?: string;
  extraItems?: ExtraCharge[];
  container?: '20ft' | '40ft' | 'lcl';
  rateCard?: Record<string, number>;
  sizeCards?: Record<string, Record<string, number>>;
  meta?: ReportMeta;
}) {
  if (!payload) return;
  const { qrDataUri, shareUrl, ...meta } = payload.meta ?? {};
  if (payload.multiResult) { printMultiReport(payload.multiResult, meta); return; }
  if (!payload.result) return;
  printReport(
    payload.result,
    payload.qty ?? '1',
    payload.summary ?? '',
    payload.extraItems ?? [],
    payload.container ?? '20ft',
    payload.rateCard ?? {},
    meta,
    payload.sizeCards ?? {},
  );
}

/** Multi-item equivalent of createShareForReport. Same never-throws contract:
 *  a failed share just means the printed copy carries no QR code. */
async function createShareForMulti(result: MultiItemResult, meta: ReportMeta): Promise<ShareResult> {
  try {
    const primary = result.items?.[0];
    const r: any = await apiFetch('/v1/landed-cost-shares', {
      method: 'POST',
      body: JSON.stringify({
        hs_code: primary?.hs_code ?? null,
        description: result.items?.length > 1 ? `${result.items.length} line items` : (primary?.description ?? null),
        customer_name: meta.customerName || null,
        payload: { multiResult: result, meta },
      }),
    });
    return { qrDataUri: r?.qr_data_uri ?? undefined, shareUrl: r?.url ?? undefined, qrUnavailableReason: r?.qr_unavailable_reason ?? undefined };
  } catch {
    return { qrUnavailableReason: 'The report link could not be created, so this copy has no QR code.' };
  }
}

function printMultiReport(result: MultiItemResult, meta: ReportMeta = {}) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const company = getCompany();
  const companyAddrLine = [company.address, company.city, company.country].filter(Boolean).join(', ');
  const modeLabel = result.mode === 'sea_fcl' ? 'Sea · FCL' : result.mode === 'sea_lcl' ? 'Sea · LCL' : 'Air';
  const allNotes = [...result.warnings, ...result.assumptions];
  const destinationLabel = (meta.destination || '').trim() || 'Dar es Salaam, Tanzania';
  const destinationShort = destinationLabel.split(',')[0].trim() || destinationLabel;
  const customerLine = [meta.customerName, meta.customerEmail, meta.customerPhone].map(s => (s || '').trim()).filter(Boolean).join(' · ');

  const cifTotalTzs = result.totals.fob_tzs + result.totals.freight_tzs + result.totals.insurance_tzs;
  const freightInsTzs = result.totals.freight_tzs + result.totals.insurance_tzs;
  /** What the importer actually has to fund: everything except the cargo's
   *  own FOB value. `totals.total` is the full landed cost and includes the
   *  cargo, so using it here would overstate the figure by the whole FOB. */
  const amountToPrepareTzs = result.totals.total - result.totals.fob_tzs;

  const itemRows = result.items.map(it => `
    <tr>
      <td>${it.line_no}</td>
      <td class="desc">${it.description}</td>
      <td class="code">${it.hs_code}</td>
      <td class="r unit">${it.qty}</td>
      <td class="r">TZS ${fmt(it.cif_tzs)}</td>
      <td class="r">TZS ${fmt(it.duty)}</td>
      <td class="r">TZS ${fmt(it.vat)}</td>
      <td class="r tot">TZS ${fmt(it.landed_total)}</td>
    </tr>
  `).join('');

  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Report (Multi-Item) &middot; ClearOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
:root{--acc:#FF5E1A;--acc-600:#E8480A;--acc-050:#FFF4EC;--acc-100:#FFE0CE;--ink:#14181B;--ink-700:#2A3035;--slate:#5B646D;--slate-400:#8A939C;--line:#E5E9EC;--line-soft:#EEF2F4;--paper:#FFFFFF;--backdrop:#E7EBEE;--panel:#161A1E;--tint:#F7F9FA;--gold:#B8862F;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:var(--backdrop);color:var(--ink);font-family:"Inter",system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.toolbar{position:fixed;top:18px;right:18px;z-index:50;display:flex;gap:8px}
.toolbar button{font-family:inherit;font-size:12.5px;font-weight:600;letter-spacing:.02em;border:1px solid var(--line);background:#fff;color:var(--ink-700);padding:9px 15px;border-radius:9px;cursor:pointer;box-shadow:0 2px 8px rgba(20,25,30,.10);transition:.15s}
.toolbar button:hover{border-color:var(--acc);color:var(--acc-600)}
.toolbar .primary{background:var(--acc);color:#fff;border-color:var(--acc)}
.toolbar .primary:hover{background:var(--acc-600);color:#fff}
.sheet{width:210mm;min-height:297mm;margin:34px auto;background:var(--paper);box-shadow:0 12px 40px rgba(20,25,30,.14);padding:16mm 15mm 13mm;position:relative}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;border-bottom:2px solid var(--ink);position:relative}
.head::after{content:"";position:absolute;left:0;bottom:-2px;width:88px;height:2px;background:var(--acc)}
.brand{display:flex;gap:12px;align-items:flex-start}
.mark{width:44px;height:44px;border-radius:13px;background:var(--acc);flex:none;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(255,94,26,.28)}
.mark svg{width:27px;height:27px}
.brand .name{font-family:"Space Grotesk",sans-serif;font-size:21px;font-weight:700;line-height:1;color:var(--ink)}
.brand .name span{color:var(--acc)}
.brand .role{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:var(--slate);font-weight:600;margin-top:5px}
.brand .addr{font-size:10.5px;color:var(--slate);margin-top:7px;line-height:1.55}
.brand .addr b{color:var(--ink-700);font-weight:600}
.doc{text-align:right;flex:none}
.doc .kick{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.doc h1{font-family:"Space Grotesk",sans-serif;font-size:23px;font-weight:700;line-height:1.05;margin-top:3px;color:var(--ink)}
.doc .pi{margin-top:10px;font-size:11.5px;color:var(--slate);line-height:1.7}
.doc .pi b{color:var(--ink-700);font-weight:600}
.doc .pi .mono{font-family:"IBM Plex Mono",monospace;font-weight:600;color:var(--ink)}
.parties{display:grid;grid-template-columns:1fr 1fr;margin-top:16px;border:1px solid var(--line);border-radius:11px;overflow:hidden}
.parties .p{padding:13px 16px}
.parties .p:first-child{border-right:1px solid var(--line);background:var(--tint)}
.parties .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700}
.parties .big{font-family:"Space Grotesk",sans-serif;font-size:15px;font-weight:600;margin-top:5px;color:var(--ink)}
.parties .kv{display:flex;justify-content:space-between;gap:12px;font-size:11.5px;margin-top:6px}
.parties .kv .k{color:var(--slate)}
.parties .kv .v{color:var(--ink-700);font-weight:600;text-align:right}
.tbl-wrap{margin-top:18px}
table.cost{width:100%;border-collapse:collapse;font-size:11px}
table.cost thead th{background:var(--ink);color:#fff;font-weight:600;font-size:9px;letter-spacing:.04em;text-transform:uppercase;padding:8px 9px;text-align:left;white-space:nowrap}
table.cost thead th.r{text-align:right}
table.cost td{padding:7px 9px;border-bottom:1px solid var(--line-soft);vertical-align:middle}
table.cost td.r{text-align:right;font-variant-numeric:tabular-nums}
.desc{color:var(--ink-700);font-weight:600}
.code{font-family:"IBM Plex Mono",monospace;font-size:9.5px;font-weight:600;color:var(--acc-600)}
.unit{font-size:10px;color:var(--slate)}
td.tot{font-weight:700;color:var(--ink)}
tr.subt td{background:#FBFCFC;border-top:1.5px solid var(--ink-700);border-bottom:1px solid var(--line);padding:8px 9px;font-weight:700;color:var(--ink-700)}
tr.subt td.tot{color:var(--acc-600)}
.summary{margin-top:22px;display:grid;grid-template-columns:1.12fr 0.88fr;border-radius:14px;overflow:hidden;border:1px solid var(--line)}
.sum-l{padding:18px 18px;background:var(--tint)}
.sum-l h3{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc-600);font-weight:700;margin-bottom:13px;display:flex;align-items:center}
.sum-l .row{display:flex;flex-wrap:nowrap;align-items:baseline;justify-content:space-between;gap:10px;font-size:11px;padding:5.5px 0;border-bottom:1px solid var(--line-soft)}
.sum-l .row .k{color:var(--ink-700);min-width:0;overflow-wrap:break-word}
.sum-l .row .v{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none}
.sum-l h3 .n{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:var(--acc);color:#fff;border-radius:5px;font-family:'Space Grotesk';font-size:10.5px;margin-right:8px}
.sum-l .row.head{color:var(--slate);font-weight:600;border-bottom:none;padding-bottom:2px;padding-top:9px;font-size:10.5px;letter-spacing:.03em;text-transform:uppercase}
.sum-l .row.sub{padding-left:14px}
.sum-l .row.sub .k{color:var(--slate)}
.sum-l .row.cifrow{border-bottom:1.5px solid var(--ink);padding-bottom:9px;margin-bottom:3px}
.sum-l .row.cifrow .k{font-weight:700}
.sum-l .row.cifrow .v{font-family:"Space Grotesk",sans-serif;font-size:12px}
.sum-r .ddp .n{font-size:10px;color:#75897f;margin-top:3px}
.client{display:flex;align-items:baseline;gap:10px;margin-top:14px;padding:9px 14px;border:1px solid var(--line);border-radius:9px;background:var(--tint)}
.client .lab{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--acc-600);font-weight:700;flex:none}
.client .val{font-size:11.5px;color:var(--ink-700);font-weight:600}
.sum-r{background:var(--panel);color:#fff;padding:18px 18px;display:flex;flex-direction:column;justify-content:center}
.sum-r .prep-lab{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--acc-100);font-weight:700}
.sum-r .prep-tzs{font-family:"Space Grotesk",sans-serif;font-size:22px;font-weight:700;line-height:1.05;margin-top:8px;font-variant-numeric:tabular-nums;letter-spacing:-.01em;white-space:nowrap}
.sum-r .prep-usd{margin-top:6px;font-size:12px;color:#9fb2ac;font-variant-numeric:tabular-nums}
.sum-r .fx{margin-top:4px;font-size:10.5px;color:#75897f}
.sum-r .ddp{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}
.sum-r .ddp .l{font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa39d;font-weight:600;white-space:nowrap}
.sum-r .ddp .v{font-family:"Space Grotesk",sans-serif;font-size:19px;font-weight:700;margin-top:5px;color:#FF8A4C;font-variant-numeric:tabular-nums;white-space:nowrap}
.foot{margin-top:20px}
.terms{width:100%}
.terms h4{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);font-weight:700;margin-bottom:8px}
.terms ul{list-style:none;font-size:10.5px;color:var(--slate);line-height:1.6;columns:2;column-gap:26px}
.terms ul li{padding-left:13px;position:relative;margin-bottom:3px;break-inside:avoid}
.terms ul li::before{content:"";position:absolute;left:0;top:7px;width:4px;height:4px;border-radius:50%;background:var(--acc)}
.qr{margin-top:14px;display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--tint)}
.qr img{width:74px;height:74px;flex:none;display:block;border-radius:6px;background:#fff}
.qr-h{font-size:10.5px;font-weight:800;color:var(--ink);text-transform:uppercase;letter-spacing:.07em}
.qr-b{font-size:9.5px;color:var(--slate);line-height:1.5;margin-top:4px}
.qr-u{font-family:"IBM Plex Mono",monospace;font-size:8.5px;color:var(--acc-600);margin-top:5px;word-break:break-all}
.sign-row{margin-top:16px;border-top:1px solid var(--line);padding-top:11px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.sign .w{font-size:12px;font-weight:600;color:var(--ink-700)}
.sign .r{font-size:10.5px;color:var(--slate);margin-top:2px}
.sign-row .stamp{padding-top:7px;border-top:1px dashed var(--slate-400);font-size:10px;color:var(--slate-400);min-width:220px;text-align:right}
.legal{margin-top:14px;font-size:9.5px;color:var(--slate-400);line-height:1.55;background:var(--tint);border-radius:9px;padding:10px 13px}
.credit{margin-top:14px;padding-top:11px;border-top:2px solid var(--ink);position:relative;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--slate)}
.credit::after{content:"";position:absolute;left:0;top:-2px;width:88px;height:2px;background:var(--acc)}
.credit b{color:var(--ink-700)}
@media print{
  /* Page height is set dynamically by fitPageToContent() below so the export
     is one continuous page with real 14mm margins, matching the single-item
     report. This fallback only applies if that JS hasn't run yet. */
  @page{size:210mm 400mm;margin:14mm}
  html,body{background:#fff}
  .toolbar{display:none}
  .sheet{width:auto;min-height:auto;margin:0;padding:0;box-shadow:none}
  .summary,.parties,.head,.terms,.client,.override{page-break-inside:avoid}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">Download / Print PDF</button>
</div>

<div class="sheet">
  <header class="head">
    <div class="brand">
      <div class="mark"><svg viewBox="7 20 111 110" fill="none"><path d="M61.765,38.617l-27.572,20.592l1.549,4.902l26.023,-19.436l26.023,19.436l1.549,-4.902l-27.572,-20.592Zm-0,-8.491l35.426,26.459l-5.891,18.64l-29.535,-22.059l-29.535,22.059l-5.891,-18.64l35.426,-26.459Z" fill="#fff"/><path d="M61.765,73.383l-17.704,13.223l6.762,21.395l7.847,0l3.095,-21.333l3.095,21.333l7.847,0l6.762,-21.395l-17.704,-13.223Zm0,-10.147l27.091,20.235l-10.348,32.74l-33.487,0l-10.348,-32.74l27.091,-20.235Z" fill="#fff"/></svg></div>
      <div>
        <div class="name">Clear<span>OS</span></div>
        <div class="role">Customs &amp; Landed Cost Intelligence</div>
        <div class="addr">Clearing agent: <b>${company.name}</b>${company.businessType ? ` &middot; ${company.businessType}` : ''}<br>${companyAddrLine}${companyAddrLine ? ' &middot; ' : ''}${company.email || ''}</div>
      </div>
    </div>
    <div class="doc">
      <div class="kick">Multi-Item Estimate</div><h1>Landed Cost</h1>
      <div class="pi">Ref <span class="mono">MULTI-${result.items.length}ITEMS-${now.replace(/\s/g, '')}</span><br>Generated <b>${now}</b></div>
    </div>
  </header>

  ${customerLine ? `<section class="client"><span class="lab">Prepared for</span><span class="val">${customerLine}</span></section>` : ''}

  <section class="parties">
    <div class="p"><div class="lab">Cargo</div><div class="big">${result.items.length} Line Items</div>
      <div class="kv"><span class="k">FX Rate</span><span class="v">1 USD = TZS ${result.fx_rate.toLocaleString()}</span></div></div>
    <div class="p"><div class="lab">Shipment</div>
      <div class="kv"><span class="k">Mode</span><span class="v">${modeLabel}</span></div>
      <div class="kv"><span class="k">Destination basis</span><span class="v">${result.destination_charge_label}</span></div>
      <div class="kv"><span class="k">Destination</span><span class="v">${destinationLabel}</span></div></div>
  </section>

  <div class="tbl-wrap">
  <table class="cost">
    <thead><tr><th>#</th><th>Description</th><th>HS Code</th><th class="r">Qty</th><th class="r">CIF (TZS)</th><th class="r">Duty</th><th class="r">VAT</th><th class="r">Landed Total</th></tr></thead>
    <tbody>${itemRows}
    <tr class="subt">
      <td colSpan="3" class="desc">Totals (${result.items.length} items)</td>
      <td class="r unit">${result.items.reduce((s, x) => s + x.qty, 0)}</td>
      <td class="r">TZS ${fmt(result.totals.cif_tzs)}</td>
      <td class="r">TZS ${fmt(result.totals.duty)}</td>
      <td class="r">TZS ${fmt(result.totals.vat)}</td>
      <td class="r tot">TZS ${fmt(result.totals.total)}</td>
    </tr>
    </tbody>
  </table>
  </div>

  <section class="summary">
    <div class="sum-l">
      <h3><span class="n">10</span>Landed Cost Summary</h3>
      <div class="row cifrow"><span class="k">CIF ${destinationShort} <span style="color:var(--slate);font-weight:400;font-size:8.5px">cargo, freight, insurance</span></span><span class="v">TZS ${fmt(cifTotalTzs)}</span></div>
      <div class="row"><span class="k">1&nbsp; Freight &amp; insurance — export country</span><span class="v">TZS ${fmt(freightInsTzs)}</span></div>
      <div class="row head"><span class="k">2&nbsp; Amount to pay in Tanzania</span><span></span></div>
      <div class="row sub"><span class="k">Duties &amp; taxes — TRA (incl. VAT)</span><span class="v">TZS ${fmt(result.totals.statutory_total)}</span></div>
      <div class="row sub"><span class="k">Port &amp; handling — TPA wharfage</span><span class="v">TZS ${fmt(result.totals.wharfage)}</span></div>
      <div class="row sub"><span class="k">ICD / destination charges</span><span class="v">TZS ${fmt(result.totals.destination)}</span></div>
    </div>
    <div class="sum-r">
      <div class="prep-lab">Total Amount to Prepare</div>
      <div class="prep-tzs">TZS ${fmt(amountToPrepareTzs)}</div>
      <div class="prep-usd">USD ${(amountToPrepareTzs / result.fx_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="fx">@ USD &rarr; TZS ${result.fx_rate.toLocaleString('en-US')}</div>
      <div class="ddp">
        <div class="l">Total Landed Cost — DDP ${destinationShort} <span style="text-transform:none;letter-spacing:0">(incl. VAT)</span></div>
        <div class="v">TZS ${fmt(result.totals.total)}</div>
        <div class="n">USD ${(result.totals.total / result.fx_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} = Cargo TZS ${fmt(result.totals.fob_tzs)} + costs to prepare TZS ${fmt(amountToPrepareTzs)}</div>
      </div>
    </div>
  </section>

  <div class="foot">
    <div class="terms">
      <h4>Notes &amp; Assumptions</h4>
      <ul>${allNotes.map(w => `<li>${w}</li>`).join('') || '<li>All items computed according to TRA EAC CET 2026 tariff schedule.</li>'}</ul>
    </div>
    ${meta.qrDataUri ? `<div class="qr">
      <img src="${meta.qrDataUri}" alt="Scan to open this estimate">
      <div class="qr-t">
        <div class="qr-h">Scan for the full report</div>
        <div class="qr-b">Opens this estimate on ${company.name}'s ClearOS workspace, where you can download it as a PDF. You'll be asked for an email address so we can send you the follow-up.</div>
        ${meta.shareUrl ? `<div class="qr-u">${meta.shareUrl}</div>` : ''}
      </div>
    </div>` : ''}
    <div class="sign-row">
      <div class="sign"><div class="w">For ${company.name}</div>
        <div class="r">${company.businessType || 'Customs Clearing & Forwarding Agent'}</div></div>
      <div class="stamp">Authorised signature &amp; company stamp</div>
    </div>
    <div class="legal">This is a decision-support estimate, not a customs assessment or tax invoice. Final duties, taxes and charges are those determined by the Tanzania Revenue Authority on the lodged declaration.</div>
    <div class="credit"><span>Prepared on <b>ClearOS</b> &middot; Hudumika Platform</span><span>Multi-Item &middot; Confidential</span></div>
  </div>
</div>

<script>
/** Same single-continuous-page sizing and font-ready print gate as the
 *  single-item report — without these the export paginates on a default A4
 *  and is measured against fallback-font metrics, so what's previewed and
 *  what's saved don't match. */
function fitPageToContent(){
  const sheet = document.querySelector('.sheet');
  if(!sheet) return;
  const mm = sheet.getBoundingClientRect().height * 25.4 / 96;
  let style = document.getElementById('dyn-page-size');
  if(!style){ style = document.createElement('style'); style.id = 'dyn-page-size'; document.head.appendChild(style); }
  style.textContent = '@page{size:210mm ' + (Math.ceil(mm) + 30) + 'mm;margin:14mm}';
}
window.addEventListener('beforeprint', fitPageToContent);
fitPageToContent();
var didPrint = false;
function goPrint(){ if(didPrint) return; didPrint = true; fitPageToContent(); requestAnimationFrame(function(){ requestAnimationFrame(function(){ window.print(); }); }); }
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(goPrint);
  setTimeout(goPrint, 2000);
} else {
  setTimeout(goPrint, 700);
}
</script>
</body></html>`);
  w.document.close();
  w.focus();
}

// ── Step Indicator (vertical on desktop, horizontal on mobile) ─────────────────

type WizardStep = 1 | 2 | 3 | 4;

const STEP_ITEMS = [
  { step: 1, label: 'Your Details', shortLabel: 'Details', desc: 'Customer, contact & destination', icon: 'user' },
  { step: 2, label: 'Shipment Mode', shortLabel: 'Shipment', desc: 'Mode, containers, CBM & weight', icon: 'truck' },
  { step: 3, label: 'Cargo Items', shortLabel: 'Cargo', desc: 'HS codes, quantities & FOB values', icon: 'box' },
  { step: 4, label: 'Review & Results', shortLabel: 'Results', desc: 'Duties, taxes & landed cost', icon: 'calculator' },
];

function VerticalStepBar({ current, setStep }: { current: number; setStep: (s: WizardStep) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {STEP_ITEMS.map((item, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <div key={i} style={{ display: 'flex', gap: 14, cursor: isDone ? 'pointer' : 'default' }} onClick={() => isDone && setStep((i + 1) as any)}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                background: isActive ? 'var(--teal)' : isDone ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--surface, rgba(255,255,255,0.05))',
                border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                color: isActive ? '#fff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                boxShadow: isActive ? '0 0 14px color-mix(in srgb, var(--teal) 35%, transparent)' : 'none',
                transition: 'all 0.2s ease'
              }}>
                {isDone ? <Icon name="check" size={15} color="var(--teal)" strokeWidth={3} /> : i + 1}
              </div>
              {i < STEP_ITEMS.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 28, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '6px 0', borderRadius: 2 }} />
              )}
            </div>
            <div style={{ paddingTop: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--ink)' : isDone ? 'var(--teal)' : 'var(--ink3)', transition: 'color 0.2s' }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                {item.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact horizontal progress bar for narrow screens — same step state, laid out for a small viewport. */
function HorizontalStepBar({ current, setStep }: { current: number; setStep: (s: WizardStep) => void }) {
  return (
    <div className="lcp-card lcp-step-mobile">
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {STEP_ITEMS.map((item, i) => {
          const isDone = i < current;
          const isActive = i === current;
          return (
            <React.Fragment key={i}>
              <div
                onClick={() => isDone && setStep((i + 1) as any)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: isDone ? 'pointer' : 'default', flexShrink: 0 }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, flexShrink: 0,
                  background: isActive ? 'var(--teal)' : isDone ? 'color-mix(in srgb, var(--teal) 15%, transparent)' : 'var(--surface, rgba(255,255,255,0.05))',
                  border: `1.5px solid ${isActive || isDone ? 'var(--teal)' : 'var(--border)'}`,
                  color: isActive ? '#fff' : isDone ? 'var(--teal)' : 'var(--ink3)',
                }}>
                  {isDone ? <Icon name="check" size={13} color="var(--teal)" strokeWidth={3} /> : i + 1}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--teal)' : 'var(--ink3)', whiteSpace: 'nowrap' }}>
                  {item.shortLabel}
                </div>
              </div>
              {i < STEP_ITEMS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: isDone ? 'var(--teal)' : 'var(--border)', margin: '0 6px 16px', borderRadius: 2 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** "Step X of 3 — Label" caption shown at the top of every step's card, so the current
 *  position in the flow is always unambiguous regardless of viewport or stepper style. */
/** Labelled form field wrapper — matches the uppercase-label + optional
 *  helper-line convention the rest of this page's inputs already use. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {hint && <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      className="input-field"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ width: '100%', boxSizing: 'border-box', height: 44, fontSize: 14 }}
    />
  );
}

/** One Advanced Settings row. Renders amber when filled in, so an overridden
 *  rate is visually distinct from an inherited one at a glance. */
function OverrideField({ label, suffix, value, onChange, placeholder, hint }: {
  label: string; suffix: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  const active = value.trim() !== '';
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: active ? 'var(--gold, #B8862F)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 5 }}>
        {label}{active && ' · override'}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="input-field"
          type="number"
          min="0"
          step="any"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box', height: 40, fontSize: 13.5,
            borderColor: active ? 'var(--gold, #B8862F)' : undefined,
          }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--ink3)', flexShrink: 0 }}>{suffix}</span>
        {active && (
          <button type="button" onClick={() => onChange('')} title="Clear override"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 2, flexShrink: 0 }}>
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      {hint && <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function StepCaption({ index }: { index: number }) {
  const item = STEP_ITEMS[index];
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 8 }}>
      Step {index + 1} of {STEP_ITEMS.length} · {item.label}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const LandedCostPage: React.FC = () => {
  // ── Step 1: who this estimate is for. Purely descriptive — these never
  // feed the calculation, they only label the on-screen result and the
  // exported PDF (and give the PDF its filename).
  const [customerName,  setCustomerName]  = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [destination,   setDestination]   = useState('Dar es Salaam, Tanzania');

  const [cif,        setCif]       = useState('');
  // Plain-language replacement for asking the customer an Incoterm. The two
  // answers derive it: No/No = FOB, Yes/No = CFR, Yes/Yes = CIF.
  const [priceInclFreight,   setPriceInclFreight]   = useState(false);
  const [priceInclInsurance, setPriceInclInsurance] = useState(false);
  // Corridor / source-market capture — persisted per calculation so the
  // platform accumulates real data on which ports and borders trade flows
  // through. Optional: blank stays NULL rather than becoming a fake value.
  const [originCountry, setOriginCountry] = useState('');
  const [loadingPoint,  setLoadingPoint]  = useState('');
  const [fob,        setFob]       = useState('');
  const [freight,    setFreight]   = useState('');
  const [insurancePct, setInsurancePct] = useState('1');
  const [hs,         setHs]        = useState('');
  const [qty,        setQty]       = useState('1');
  const [container,  setContainer] = useState<'20ft' | '40ft' | 'lcl'>('20ft');
  const [isAir,      setIsAir]     = useState(false);
  const [containerLots, setContainerLots] = useState<ContainerLot[]>([{ size: '20ft', count: '1' }]);

  // ── Advanced Settings: optional replacements for rates that otherwise come
  // from the tariff table (duty/VAT/RDL/CPF) or statute (wharfage, PID), plus
  // a pinned FX rate. Blank means "use the sourced value" — these are stored
  // as strings so an empty box stays empty rather than becoming 0.
  const [shareNotice, setShareNotice] = useState('');
  const [importNote, setImportNote] = useState('');
  const [importing, setImporting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ovDuty,     setOvDuty]     = useState('');
  const [ovVat,      setOvVat]      = useState('');
  const [ovRdl,      setOvRdl]      = useState('');
  const [ovCpf,      setOvCpf]      = useState('');
  const [ovWharfage, setOvWharfage] = useState('');
  const [ovPid,      setOvPid]      = useState('');
  const [ovFx,       setOvFx]       = useState('');
  const [cbm,        setCbm]       = useState('');
  const [weightKg,   setWeightKg]  = useState('');
  const [isUsedVehicle, setIsUsedVehicle] = useState(false);
  const [vehicleAge,    setVehicleAge]    = useState('');
  const [isClogs,       setIsClogs]       = useState(false);
  const [itemMode,   setItemMode]  = useState<'single' | 'multi'>('single');
  const [multiItems, setMultiItems] = useState<MultiItemRow[]>([newMultiItemRow()]);
  const [multiFreight, setMultiFreight] = useState('');
  const [multiInsurance, setMultiInsurance] = useState('');
  const [multiResult, setMultiResult] = useState<MultiItemResult | null>(null);
  const [multiError,  setMultiError]  = useState('');
  const [result,     setResult]    = useState<LandedCostResult | null>(null);
  const [summary,    setSummary]   = useState('');
  const [aiPending,  setAiPending] = useState(false);
  const [aiError,    setAiError]   = useState('');
  const [error,      setError]     = useState('');
  const [step,       setStep]      = useState<WizardStep>(1);
  const [fxRate,     setFxRate]    = useState<number | null>(null);
  const [hsSelected, setHsSelected] = useState<HsResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [history,    setHistory]   = useState<LandedCostResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const hsCacheRef = useRef<Map<string, HsResult>>(new Map());

  // ── Additional Port/TPA/TASAC charges (Export PDF needs these too, so the
  // state lives here rather than inside FormattedLandedCostBreakdown) ──
  const [extraItems, setExtraItems] = useState<ExtraCharge[]>([]);
  const [extraPicker, setExtraPicker] = useState<PickerItem | null>(null);
  const extraCache = useRef<Map<string, any>>(new Map());

  const searchTariff = useCallback(async (q: string): Promise<PickerItem[]> => {
    const res = await apiFetch(`/v1/reference/tariff?q=${encodeURIComponent(q)}&limit=25`);
    const rows: any[] = res.data ?? [];
    return rows.filter(r => r.rate_amount != null).map(r => {
      extraCache.current.set(r.id, r);
      const rate = Number(r.rate_amount);
      return {
        id: r.id,
        label: r.item_name,
        sublabel: `${[r.clause_ref, r.category, r.subcategory].filter(Boolean).join(' · ')} — ${r.rate_currency} ${rate.toLocaleString('en-US')}${r.unit ? ` / ${r.unit}` : ''}`,
      };
    });
  }, []);

  function addExtraItem(picked: PickerItem | null) {
    if (!picked) return;
    const full = extraCache.current.get(picked.id);
    if (!full) return;
    setExtraItems(prev => prev.some(e => e.item.id === full.id) ? prev : [...prev, { key: full.id, item: full, qty: 1 }]);
    setExtraPicker(null);
  }
  function removeExtraItem(key: string) { setExtraItems(prev => prev.filter(e => e.key !== key)); }
  function setExtraQty(key: string, qty: number) { setExtraItems(prev => prev.map(e => e.key === key ? { ...e, qty: Math.max(1, qty) } : e)); }

  // Load live FX rate and history on mount
  useEffect(() => {
    apiFetch('/v1/customs/fx-rate').then((r: any) => setFxRate(r.rate)).catch(() => setFxRate(2540));
    apiFetch('/v1/customs/landed-cost/history').then((r: any) => setHistory(Array.isArray(r) ? r.slice(0, 10) : [])).catch(() => {});
  }, []);

  async function searchHs(query: string): Promise<PickerItem[]> {
    if (!query || query.trim().length < 2) return [];
    try {
      const r = await apiFetch(`/v1/customs/hs-search?q=${encodeURIComponent(query.trim())}&limit=8`);
      const results: HsResult[] = Array.isArray(r) ? r : [];
      results.forEach(item => hsCacheRef.current.set(item.code, item));
      return results.map(item => ({ id: item.code, label: item.code, sublabel: `${item.description} · ${Number(item.import_duty_rate)}% duty` }));
    } catch { return []; }
  }

  function handleHsChange(item: PickerItem | null) {
    if (!item) { setHs(''); setHsSelected(null); return; }
    setHs(item.id);
    setHsSelected(hsCacheRef.current.get(item.id) ?? null);
  }

  // In breakdown mode, insurance defaults to a % of CFR (FOB + Freight) rather
  // than being silently absent from the CIF math — the % itself is editable
  // since the "right" default varies by policy/route.
  const fobVal = parseFloat(fob) || 0;
  const freightVal = parseFloat(freight) || 0;
  const insurancePctVal = parseFloat(insurancePct) || 0;
  const cfrVal = fobVal + freightVal;
  const insuranceVal = cfrVal * (insurancePctVal / 100);
  const breakdownCif = cfrVal + insuranceVal;

  /** What kind of place the goods were loaded at, from the transport mode —
   *  so the corridor data is classified without asking another question. */
  const loadingPointType: 'SEA_PORT' | 'AIRPORT' | 'BORDER_POST' = isAir ? 'AIRPORT' : 'SEA_PORT';
  const loadingPointLabel = isAir ? 'Airport of Loading' : 'Port of Loading';

  /** Incoterm implied by the two plain answers — never typed by the user. */
  const priceBasis: 'FOB' | 'CFR' | 'CIF' =
    priceInclFreight ? (priceInclInsurance ? 'CIF' : 'CFR') : 'FOB';

  /** Customs value. The invoice figure plus whatever it doesn't already
   *  cover — so a CIF invoice is used as-is, and an FOB one has shipping and
   *  insurance added on top. */
  function effectiveCif(): number {
    const invoice = parseFloat(fob) || 0;
    const shipping = priceInclFreight ? 0 : (parseFloat(freight) || 0);
    const base = invoice + shipping;
    const ins = priceInclInsurance ? 0 : base * ((parseFloat(insurancePct) || 0) / 100);
    return base + ins;
  }

  // Sea FCL charges per container; Sea LCL and Air don't fill a whole
  // container, so they're charged by CBM / chargeable weight instead —
  // the backend's computeDestinationCharge() is the single source of truth
  // for all three, this just tells it which mode applies.
  const mode: ShipmentMode = isAir ? 'air' : container === 'lcl' ? 'sea_lcl' : 'sea_fcl';
  const cbmVal = parseFloat(cbm) || 0;
  const weightKgVal = parseFloat(weightKg) || 0;
  const volumetricKgVal = cbmVal * 166.67;
  const chargeableKgPreview = Math.max(weightKgVal, volumetricKgVal);
  const containerPayload = containerLotsPayload(containerLots);
  /** Keep `container` tracking the first container row while on FCL. It still
   *  selects which single rate card is fetched (for the per-BL clearance
   *  lines), so leaving it stale after a size change would price those off
   *  the wrong card. */
  const primaryLotSize = containerLots[0]?.size ?? '20ft';
  useEffect(() => {
    if (!isAir && container !== 'lcl' && container !== primaryLotSize) setContainer(primaryLotSize);
  }, [isAir, container, primaryLotSize]);
  /** At least 1 — a blank or 0 count would zero out every per-container
   *  charge rather than meaning "none". */
  const numContainersVal = Math.max(1, containerPayload.reduce((n, l) => n + l.count, 0));

  /** Only non-empty, valid, non-negative entries are sent. A blank box means
   *  "keep the tariff/statutory rate" — it must never be transmitted as 0,
   *  which the API would read as a real 0% and wipe out that tax line. */
  function buildRateOverrides(): Record<string, number> | undefined {
    const entries: [string, string][] = [
      ['duty_rate', ovDuty], ['vat_rate', ovVat], ['rdl_rate', ovRdl],
      ['cpf_rate', ovCpf], ['wharfage_rate', ovWharfage], ['pid_rate', ovPid],
    ];
    const out: Record<string, number> = {};
    for (const [key, raw] of entries) {
      if (raw.trim() === '') continue;
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= 0) out[key] = n;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  const fxOverrideVal = ovFx.trim() === '' ? undefined : (parseFloat(ovFx) > 0 ? parseFloat(ovFx) : undefined);
  const overrideCount = Object.keys(buildRateOverrides() ?? {}).length + (fxOverrideVal ? 1 : 0);
  const multiTotalFobUsd = multiItems.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.unit_price_usd) || 0), 0);

  // Real ICD operators charge different rates for the same service (see
  // /clearos/rate-card) — picking one here scopes the calculator's ICD/C&F
  // defaults to that operator's own rate card instead of the card's generic
  // default. Only operators the tenant has actually priced show up, since
  // picking an un-priced one would just be a no-op.
  const [icdOperatorId, setIcdOperatorId] = useState<string | null>(null);
  const [icdOperatorOptions, setIcdOperatorOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    setIcdOperatorId(null);
    apiFetch(`/v1/rate-card/${rateCardKeyFor(mode, container)}/icd-operators`)
      .then(res => setIcdOperatorOptions(res.data ?? []))
      .catch(() => setIcdOperatorOptions([]));
  }, [mode, container]);

  async function calculate() {
    const cifVal = effectiveCif();
    if (!cifVal || cifVal <= 0) {
      setError('Enter the invoice value in USD.');
      return;
    }
    if (!hs.trim()) { setError('Enter an HS code or description.'); return; }
    setError('');
    setCalcLoading(true);

    try {
      const r = await apiFetch('/v1/customs/landed-cost', {
        method: 'POST',
        body: JSON.stringify({
          hs_code: hs,
          cif_usd: cifVal,
          qty: parseInt(qty) || 1,
          shipment_ref: undefined,
          mode,
          container: mode === 'sea_fcl' ? container : undefined,
          num_containers: numContainersVal,
          containers: mode === 'sea_fcl' ? containerPayload : undefined,
          rate_overrides: buildRateOverrides(),
          fx_rate_override: fxOverrideVal,
          cbm: mode !== 'sea_fcl' ? cbmVal : undefined,
          weight_kg: mode === 'air' ? weightKgVal : undefined,
          // Always send the working, so the report can show how CIF was built.
          fob_usd: fobVal,
          freight_usd: priceInclFreight ? 0 : freightVal,
          insurance_usd: priceInclInsurance ? 0 : insuranceVal,
          price_basis: priceBasis,
          origin_country: originCountry.trim() || undefined,
          loading_point: loadingPoint.trim() || undefined,
          loading_point_type: loadingPointType,
          ...(isUsedVehicle ? { vehicle_condition: 'used', vehicle_age_years: parseFloat(vehicleAge) || undefined } : {}),
          ...(isClogs ? { is_plastic_rubber_clogs: true } : {}),
        }),
      });
      setResult(r);
      setSummary('');
      setAiError('');
      setExtraItems([]);
      setExtraPicker(null);
    } catch (e: any) {
      setError(e.message ?? 'Calculation failed');
    }
    setCalcLoading(false);
  }

  async function calculateMulti() {
    const rows = multiItems
      .map(r => ({
        description: r.description,
        hs_code: r.hs_code.trim(),
        qty: parseFloat(r.qty) || 0,
        unit_price_usd: parseFloat(r.unit_price_usd) || 0,
        rate_overrides: rowRateOverrides(r),
      }))
      .filter(r => r.hs_code && r.qty > 0 && r.unit_price_usd >= 0);
    if (rows.length === 0) { setMultiError('Add at least one line item with an HS code, quantity and unit price.'); return; }
    setMultiError('');
    setCalcLoading(true);
    try {
      const r = await apiFetch('/v1/customs/landed-cost/multi-item', {
        method: 'POST',
        body: JSON.stringify({
          items: rows,
          freight_usd: parseFloat(multiFreight) || 0,
          insurance_usd: multiInsurance.trim() ? parseFloat(multiInsurance) : undefined,
          mode,
          container: mode === 'sea_fcl' ? container : undefined,
          num_containers: numContainersVal,
          containers: mode === 'sea_fcl' ? containerPayload : undefined,
          rate_overrides: buildRateOverrides(),
          fx_rate_override: fxOverrideVal,
          cbm: mode !== 'sea_fcl' ? cbmVal : undefined,
          weight_kg: mode === 'air' ? weightKgVal : undefined,
        }),
      });
      setMultiResult(r);
    } catch (e: any) {
      setMultiError(e.message ?? 'Calculation failed');
    }
    setCalcLoading(false);
  }

  const runAi = useCallback(async () => {
    if (!result) return;
    setAiPending(true);
    setAiError('');
    const text =
      `Landed Cost Analysis — HS Code ${result.hs_code}: ${result.description}\n` +
      `CIF: $${fmtUsd(result.cif_usd)} (TZS ${fmt(result.cif_tzs)} @${result.fx_rate.toFixed(0)})\n` +
      `Import Duty (${result.duty_rate}% EAC CET): TZS ${fmt(result.duty)}\n` +
      (result.excise > 0 ? `Excise Duty: TZS ${fmt(result.excise)}\n` : '') +
      `VAT ${result.vat > 0 ? '18%' : '0%'}: TZS ${fmt(result.vat)}\n` +
      `RDL + CPF: TZS ${fmt(result.rdl + result.cpf)}\n` +
      `ICD + Wharfage: TZS ${fmt(result.icd + result.wharfage)}\n` +
      `Total Landed Cost: TZS ${fmt(result.total)}\n` +
      (result.qty > 1 ? `Per Unit: TZS ${fmt(result.per_unit)}\n` : '') +
      (result.pvoc_required ? 'PVoC/CoC certificate required\n' : '') +
      (result.di_required ? 'Destination Inspection required\n' : '') +
      (result.permits?.length ? `Permits needed: ${result.permits.join(', ')}\n` : '');
    try {
      const res = await apiFetch('/v1/ai/summarise', { method: 'POST', body: JSON.stringify({ text, mode: 'brief' }) });
      if (res.summary) {
        setSummary(res.summary);
      } else {
        setAiError('AI analysis returned no summary. Please try again.');
      }
    } catch (e: any) {
      // Surface the real reason (e.g. "AI not configured.") instead of silently
      // faking a summary from the raw input text — that made the feature look
      // like it worked while never actually calling the AI.
      setAiError(e?.message || 'AI analysis failed. Please try again.');
    }
    setAiPending(false);
  }, [result]);

  useEffect(() => {
    // Results is step 4 in the four-step wizard — calculating on step 3
    // (Cargo Items) would fire before the cargo rows are even filled in.
    if (step !== 4) return;
    if (itemMode === 'single' && !result) calculate();
    if (itemMode === 'multi' && !multiResult) calculateMulti();
  }, [step]);

  // ── Multi-item row management ────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<MultiItemRow>) {
    setMultiItems(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function addRow() { setMultiItems(rows => rows.length >= MAX_CARGO_ROWS ? rows : [...rows, newMultiItemRow()]); }
  function removeRow(id: string) { setMultiItems(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows); }

  function handleRowHsChange(row: MultiItemRow, item: PickerItem | null) {
    if (!item) { updateRow(row.id, { hs_code: '' }); return; }
    const cached = hsCacheRef.current.get(item.id);
    updateRow(row.id, { hs_code: item.id, description: row.description || cached?.description || '' });
  }

  /** Port/airport lookup. Backed by the curated suggestion list for now, not
   *  a table — deliberately an async search with the same shape the country
   *  picker uses, so pointing it at a real UN/LOCODE endpoint later is a
   *  one-line change with no UI churn. Free text is preserved via onCreate:
   *  the list is suggestions, not an exhaustive set of ports. */
  const searchPorts = useCallback(async (q: string): Promise<PickerItem[]> => {
    const list = isAir ? AIRPORT_SUGGESTIONS : SEAPORT_SUGGESTIONS;
    const needle = q.trim().toLowerCase();
    const hits = needle ? list.filter(p => p.toLowerCase().includes(needle)) : list;
    return hits
      .sort((x, y) => (x.toLowerCase().startsWith(needle) ? 0 : 1) - (y.toLowerCase().startsWith(needle) ? 0 : 1))
      .slice(0, 25)
      .map(p => ({ id: p, label: p }));
  }, [isAir]);

  /** Async country lookup against reference_countries (249 ISO entries), so
   *  origin data lands on a canonical name instead of free-typed spellings. */
  const searchCountries = useCallback(async (q: string): Promise<PickerItem[]> => {
    try {
      const r: any = await apiFetch(`/v1/customs/countries?q=${encodeURIComponent(q)}`);
      return (r?.data ?? []).map((c: any) => ({
        id: c.name,
        label: c.is_eac ? `${c.name} · EAC` : c.name,
        code: c.code,
      }));
    } catch { return []; }
  }, []);

  function downloadCsvTemplate() {
    // Only what a real commercial invoice actually carries. HS Code is left
    // blank on purpose — the customer doesn't know it, the clearing agent
    // assigns it afterwards. Freight and insurance are NOT per line: they're
    // shipment-level and get apportioned across lines by value, so they're
    // entered once on the form rather than asked for per row.
    const csv = [
      'Description,Qty,Unit Price,Amount,HS Code',
      'Ceramic floor tiles 60x60,400,12.50,5000,',
      'Tile adhesive 25kg bags,120,8,960,',
      'Grouting compound 5kg,50,,300,',
      '',
      '# Description and either (Qty + Unit Price) or Amount are all that is required.',
      '# Leave HS Code blank if you do not know it - your clearing agent fills it in.',
      '# Do not add freight/insurance/shipping rows here - enter those once on the form.',
    ].join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'commercial-invoice-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function parseCsvLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQuotes = false; }
        else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { cells.push(cur); cur = ''; }
        else cur += c;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  }

  /** Money off a real invoice: "USD 1,234.56", "$1,234.56", "1 234,56 ".
   *  Returns NaN when there's no number, so callers can tell blank from zero. */
  function parseMoneyCell(raw: string): number {
    if (!raw) return NaN;
    let t = raw.replace(/[^\d.,\-]/g, '').trim();      // drop currency codes/symbols
    if (!t) return NaN;
    const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Comma last: decimal separator only if 1-2 digits follow (1.234,56).
      // Exactly three digits means a thousands separator (5,000) — reading
      // that as a decimal turned 5,000 into 5, understating the line 1000x.
      const digitsAfter = t.length - lastComma - 1;
      if (digitsAfter === 3) t = t.replace(/,/g, '');
      else t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');                                            // 1,234.56
    }
    const n = parseFloat(t);
    return Number.isFinite(n) ? n : NaN;
  }

  /** Rows that are invoice furniture rather than goods. Real invoices carry
   *  subtotals, freight lines and bank details that must never become cargo. */
  function isNonCargoRow(desc: string): boolean {
    return /^(sub[\s-]?total|total|grand\s*total|amount\s*due|balance|freight|shipping|insurance|discount|vat|tax|packing|handling|bank|swift|iban|terms|remarks?|notes?)/i
      .test(desc.trim());
  }

  interface InvoiceColumns { desc: number; qty: number; price: number; amt: number; hs: number }

  function locateColumns(cells: string[]): InvoiceColumns {
    const header = cells.map(h => h.toLowerCase().trim());
    const find = (...pats: string[]) => header.findIndex(h => h.length > 0 && pats.some(p => h.includes(p)));
    return {
      desc:  find('description', 'product', 'item', 'goods', 'particular', 'commodity', 'article'),
      qty:   find('qty', 'quantity', 'pcs', 'units', 'pieces'),
      price: find('unit price', 'unit cost', 'unit value', 'u/price', 'rate', 'price'),
      amt:   find('amount', 'line total', 'total value', 'extended', 'value', 'total'),
      // Substring 'hs' alone false-matches ordinary words, so an exact 'hs'
      // header is allowed but anything longer has to spell the column out.
      hs:    header.findIndex(h => h === 'hs' || ['hs code', 'hscode', 'hs-code', 'hs no', 'h.s', 'tariff'].some(p => h.includes(p))),
    };
  }

  /** A real invoice puts a letterhead, invoice number and addresses above the
   *  line-item table, so the header is rarely the first row. Scan the top of the
   *  sheet for the row that names a description column plus a value column. */
  function findHeaderRow(grid: string[][]): number {
    let best = -1, bestScore = 0;
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      const c = locateColumns(grid[i] ?? []);
      if (c.desc < 0 || (c.price < 0 && c.amt < 0)) continue;
      const score = [c.desc, c.qty, c.price, c.amt, c.hs].filter(v => v >= 0).length;
      if (score > bestScore) { best = i; bestScore = score; }
    }
    return best;
  }

  /** Counts the rows a grid would actually yield — used to pick the right tab in
   *  a workbook that also holds a packing list, price list or cover sheet. */
  function countCargoRows(grid: string[][], headerIdx: number): number {
    const col = locateColumns(grid[headerIdx] ?? []);
    return grid.slice(headerIdx + 1).filter(r => {
      const d = (r[col.desc] ?? '').trim();
      return d.length > 0 && !isNonCargoRow(d);
    }).length;
  }

  /** Shared by the CSV and Excel paths: one normaliser, so both formats are held
   *  to the same rules and neither can drift away from the other. */
  function importInvoiceGrid(grid: string[][], sourceLabel: string) {
    const headerIdx = findHeaderRow(grid);
    if (headerIdx < 0) {
      setMultiError(`Could not find the line-item table in ${sourceLabel}. It needs a header row with a description column and either a unit price or an amount column — download the template to see the layout.`);
      return;
    }
    const col = locateColumns(grid[headerIdx]);

    let skippedNonCargo = 0, skippedNoValue = 0, missingHs = 0, shortHs = 0, truncated = false;
    let runningTotal = 0;
    const rows: MultiItemRow[] = [];
    for (const cells of grid.slice(headerIdx + 1)) {
      const description = (cells[col.desc] ?? '').trim();
      if (!description) continue;
      if (isNonCargoRow(description)) { skippedNonCargo++; continue; }

      const qty = col.qty >= 0 ? parseMoneyCell(cells[col.qty] ?? '') : NaN;
      const unit = col.price >= 0 ? parseMoneyCell(cells[col.price] ?? '') : NaN;
      const amount = col.amt >= 0 ? parseMoneyCell(cells[col.amt] ?? '') : NaN;

      const qtyVal = Number.isFinite(qty) && qty > 0 ? qty : 1;
      // Prefer an explicit unit price; otherwise derive it from the line
      // amount, which is what most invoices actually print.
      const unitVal = Number.isFinite(unit) && unit > 0 ? unit
        : (Number.isFinite(amount) && amount > 0 ? amount / qtyVal : NaN);
      if (!Number.isFinite(unitVal) || unitVal <= 0) { skippedNoValue++; continue; }

      // The word list above is English-only, so a total labelled "Gesamt",
      // "Montant total" or "总计" slips through and lands as cargo worth the
      // whole invoice. Structurally a total carries no quantity and its value
      // is the sum of the lines above it — that holds in any language.
      const lineTotal = qtyVal * unitVal;
      const hasQty = Number.isFinite(qty) && qty > 0;
      if (!hasQty && rows.length >= 2 && runningTotal > 0 && Math.abs(lineTotal - runningTotal) <= runningTotal * 0.005) {
        skippedNonCargo++; continue;
      }
      runningTotal += lineTotal;

      if (rows.length >= MAX_CARGO_ROWS) { truncated = true; break; }

      const hs = col.hs >= 0 ? (cells[col.hs] ?? '').replace(/\s/g, '') : '';
      if (!hs) missingHs++;
      else if (hs.replace(/\D/g, '').length < 8) shortHs++;
      rows.push({ ...newMultiItemRow(), description, hs_code: hs, qty: String(qtyVal), unit_price_usd: String(Number(unitVal.toFixed(4))) });
    }

    if (rows.length === 0) { setMultiError(`No cargo lines found in ${sourceLabel} — every row below the header was blank, a subtotal, or had no value.`); return; }
    setMultiItems(rows);
    // Say plainly what happened, including what still needs a human.
    const notes = [
      `Imported ${rows.length} line${rows.length === 1 ? '' : 's'} from ${sourceLabel}.`,
      truncated ? `Only the first ${MAX_CARGO_ROWS} were taken — this calculator caps a consignment at ${MAX_CARGO_ROWS} lines.` : null,
      missingHs > 0 ? `${missingHs} still need an HS code — add them below before calculating.` : null,
      // Excel stores a code typed as a number, so 6907.21.00 comes back as
      // 6907.21 and would be classified against the wrong subheading.
      shortHs > 0 ? `${shortHs} HS code${shortHs === 1 ? ' is' : 's are'} shorter than 8 digits — Excel drops trailing zeros from codes entered as numbers. Check them before calculating.` : null,
      skippedNonCargo > 0 ? `Skipped ${skippedNonCargo} non-cargo row${skippedNonCargo === 1 ? '' : 's'} (totals, freight, notes).` : null,
      skippedNoValue > 0 ? `Skipped ${skippedNoValue} row${skippedNoValue === 1 ? '' : 's'} with no usable value.` : null,
    ].filter(Boolean).join(' ');
    setImportNote(notes);
    setMultiError('');
  }

  async function handleInvoiceUpload(file: File) {
    setImporting(true);
    setImportNote('');
    setMultiError('');
    try {
      if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const sheets = await readXlsxSheets(file);
        const candidates = sheets
          .map(s => ({ sheet: s, headerIdx: findHeaderRow(s.rows) }))
          .map(c => ({ ...c, lines: c.headerIdx >= 0 ? countCargoRows(c.sheet.rows, c.headerIdx) : 0 }))
          .filter(c => c.lines > 0)
          .sort((a, b) => b.lines - a.lines);
        if (candidates.length === 0) {
          setMultiError(sheets.length === 1
            ? 'Could not find a line-item table in that workbook. It needs a header row with a description column and either a unit price or an amount column.'
            : `Could not find a line-item table in any sheet (${sheets.map(s => s.name).join(', ')}). One of them needs a header row with a description column and either a unit price or an amount column.`);
          return;
        }
        importInvoiceGrid(candidates[0].sheet.rows, sheets.length > 1 ? `sheet "${candidates[0].sheet.name}"` : 'that workbook');
      } else {
        const text = await file.text();
        // Drop the '#' guidance rows the template ships with; blank lines are
        // kept so row positions still line up with what the user sees.
        const grid = text.split(/\r?\n/).filter(l => !l.trim().startsWith('#')).map(parseCsvLine);
        importInvoiceGrid(grid, 'that CSV');
      }
    } catch (e) {
      setMultiError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setImporting(false);
    }
  }

  function recallHistory(h: LandedCostResult) {
    setItemMode('single');
    setResult(h);
    setShowHistory(false);
    setStep(4);
    setHs(h.hs_code);
    setCif(String(h.cif_usd));
    setSummary('');
    setAiError('');
  }

  function newCalculation() {
    setResult(null);
    setMultiResult(null);
    setMultiItems([newMultiItemRow()]);
    setMultiFreight('');
    setMultiInsurance('');
    setMultiError('');
    setStep(1);
    setHs('');
    setCif('');
    setPriceInclFreight(false);
    setPriceInclInsurance(false);
    setOriginCountry('');
    setLoadingPoint('');
    setFob('');
    setFreight('');
    setInsurancePct('1');
    setCbm('');
    setWeightKg('');
    setHsSelected(null);
    setSummary('');
    setAiError('');
    // Anything that changes the arithmetic has to be cleared, or a rate
    // typed for the previous shipment silently reapplies to a different HS
    // code. Customer name/contact/destination deliberately persist — they're
    // descriptive only, and an agent usually quotes the same client twice.
    setContainerLots([{ size: '20ft', count: '1' }]);
    setImportNote('');
    setOvDuty(''); setOvVat(''); setOvRdl(''); setOvCpf('');
    setOvWharfage(''); setOvPid(''); setOvFx('');
  }

  /** Blocks Continue until the current step has what the next one needs.
   *  Returns null when the step is satisfied, otherwise the message to show
   *  inline. Step 1 is contact detail only, so nothing is mandatory there. */
  // Which dimension fields the selected mode actually bills on. Declared here
  // rather than further down because validateStep() below reads them during
  // render — a later `const` would be in the temporal dead zone and throw the
  // moment the wizard reached step 2.
  const isFcl = !isAir && (container === '20ft' || container === '40ft');
  const needsCbm = isAir || container === 'lcl';

  function validateStep(s: WizardStep): string | null {
    if (s === 2) {
      if (isFcl && numContainersVal < 1) return 'Enter at least one container.';
      if (container === 'lcl' && cbmVal <= 0) return 'LCL is charged per CBM — enter the total volume.';
      if (isAir && cbmVal <= 0 && weightKgVal <= 0) return 'Airfreight bills on chargeable weight — enter a volume or a gross weight.';
      return null;
    }
    if (s === 3) {
      if (itemMode === 'single') {
        if (!hs.trim()) return 'Select an HS code for the cargo.';
        if (effectiveCif() <= 0) return 'Enter a CIF value (or FOB + freight) greater than zero.';
        return null;
      }
      const usable = multiItems.filter(r => r.hs_code.trim() && (parseFloat(r.qty) || 0) > 0 && (parseFloat(r.unit_price_usd) || 0) > 0);
      if (usable.length === 0) return 'Add at least one line with an HS code, quantity and unit price.';
      return null;
    }
    return null;
  }
  const stepError = validateStep(step);

  const navRow = (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      {stepError && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 9, background: 'color-mix(in srgb, var(--red) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', color: 'var(--red)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {stepError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {step > 1
          ? <button type="button" onClick={() => setStep(s => (s - 1) as any)}
              style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="arrowLeft" size={14} /> Back
            </button>
          : <div />
        }
        {step < 4
          ? <button type="button" disabled={!!stepError} onClick={() => { if (!validateStep(step)) setStep(s => (s + 1) as any); }}
              style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: stepError ? 'var(--border)' : 'var(--teal)', color: stepError ? 'var(--ink4)' : '#fff', fontWeight: 700, fontSize: 13.5, cursor: stepError ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: stepError ? 'none' : '0 4px 16px color-mix(in srgb, var(--teal) 30%, transparent)' }}>
              Continue <Icon name="arrowRight" size={14} color={stepError ? 'var(--ink4)' : '#fff'} />
            </button>
          : null
        }
      </div>
    </div>
  );

  // Upload lives on step 1 (so a long invoice is loaded before the wizard asks
  // about containers) but stays reachable on step 3 for a re-import. One
  // fragment rather than two copies that can drift apart.
  const invoiceImportBar = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Upload the supplier invoice as Excel or CSV, or add each line by hand.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={downloadCsvTemplate} className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="download" size={13} /> Template
        </button>
        <label className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: importing ? 'progress' : 'pointer', opacity: importing ? 0.55 : 1 }}>
          <Icon name="upload" size={13} /> {importing ? 'Reading…' : 'Upload Invoice'}
          <input type="file" accept=".csv,.xlsx,.xlsm" disabled={importing} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleInvoiceUpload(f); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );

  const importFeedback = (
    <>
      {importNote && (
        <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 9, background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <Icon name="info" size={15} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{importNote}</div>
        </div>
      )}
      {multiError && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>
          {multiError}
        </div>
      )}
    </>
  );

  const reportMeta: ReportMeta = { customerName, customerEmail, customerPhone, destination };

  // The Step 2 dropdown projected onto the page's existing isAir/container
  // state. Selecting Airfreight leaves `container` alone so switching back to
  // sea restores whatever FCL/LCL choice was made before.
  const shipmentModeKey: ShipmentModeKey = isAir ? 'air' : container === 'lcl' ? 'lcl' : 'fcl';
  const setShipmentModeKey = (k: ShipmentModeKey) => {
    if (k === 'air') { setIsAir(true); return; }
    setIsAir(false);
    // FCL keeps whichever size the container rows are on — that's now the
    // single source of truth for size, so the mode only picks the transport.
    setContainer(k === 'lcl' ? 'lcl' : (containerLots[0]?.size ?? '20ft'));
  };

  return (
    <div className="lcp-page" style={{ flex: 1, overflowY: 'auto' }}>
      {/* Inline responsive layout rules + spinner keyframe — this page is styled
          with inline style objects everywhere else, so media queries (which
          plain style objects can't express) live here instead. */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1.2s linear infinite; }

        .lcp-page { padding: 24px 32px; }
        .lcp-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; margin-top: 12px; }
        .lcp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .lcp-card { background: var(--card-bg, var(--white)); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .lcp-btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .lcp-step-mobile { display: none; }
        .lcp-step-desktop { display: flex; flex-direction: column; gap: 20px; }

        @media (max-width: 860px) {
          .lcp-page { padding: 14px; }
          .lcp-layout { grid-template-columns: 1fr; gap: 14px; }
          .lcp-step-desktop { display: none; }
          .lcp-step-mobile { display: block; padding: 16px 14px; }
        }
        @media (max-width: 520px) {
          .lcp-card { padding: 18px; border-radius: 12px; }
          .lcp-actions { width: 100%; }
          .lcp-actions > button { flex: 1 1 auto; justify-content: center; }
        }
        @media (max-width: 380px) {
          .lcp-btn-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <PageHeader
        crumbs={['Customs Tools', 'Landed Cost']}
        titlePlain="Landed Cost"
        titleEm="Calculator"
        subtitle="Tanzania EAC CET — compute full landed cost from CIF to your door · Live FX rate from open.er-api.com"
        actions={
          <div className="lcp-actions">
            <button type="button" className="btn btn-secondary"
              onClick={() => setShowHistory(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, border: '1.5px solid var(--border)', color: 'var(--ink2)', background: 'var(--card-bg, var(--white))' }}>
              <Icon name="clock" size={14} color="var(--teal)" /> History
            </button>
            {result && (
              <button type="button" className="btn btn-secondary"
                onClick={async () => { const rc = await fetchRateCardDefaults(rateCardKeyFor(result.mode, container), icdOperatorId); const sc = await fetchSizeCards(result, icdOperatorId); const share = await createShareForReport(result, reportMeta, { result, qty, summary, extraItems, container, rateCard: rc, sizeCards: sc, meta: reportMeta }); setShareNotice(share.qrUnavailableReason ?? ''); printReport(result, qty, summary, extraItems, container, rc, { ...reportMeta, ...share }, sc); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, border: '1.5px solid var(--teal)', color: 'var(--teal)', background: 'var(--card-bg, var(--white))' }}>
                <Icon name="download" size={14} color="var(--teal)" /> Export PDF
              </button>
            )}
            <button type="button" className="btn btn-primary"
              disabled={!result || aiPending} onClick={runAi}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Icon name="sparkle" size={14} color="#fff" />
              {aiPending ? 'Analysing…' : 'AI Analysis'}
            </button>
          </div>
        }
      />

      {/* Compact horizontal stepper — mobile only */}
      <HorizontalStepBar current={step - 1} setStep={setStep} />

      {/* Main 2-Column Layout: sidebar stacks above content below 860px */}
      <div className="lcp-layout">

        {/* LEFT COLUMN: Vertical Stepper Navigation Sidebar (desktop only) + FX rate */}
        <div className="lcp-step-desktop">
          {/* Stepper Card */}
          <div className="lcp-card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 16 }}>
              Calculation Steps
            </div>
            <VerticalStepBar current={step - 1} setStep={setStep} />
          </div>

          {/* Live FX Rate Card */}
          {fxRate && (
            <div style={{ background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 22%, transparent)', borderRadius: 12, padding: '14px 16px', fontSize: 12, color: 'var(--ink)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--teal)', fontWeight: 700, marginBottom: 4 }}>
                <Icon name="trendingUp" size={14} color="var(--teal)" /> Live FX Exchange Rate
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', margin: '4px 0' }}>
                1 USD = TZS {fxRate.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                Source: open.er-api.com · EAC CET 2022
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Step Content Area */}
        <div>
          {step === 1 && (
            <div className="lcp-card">
              <StepCaption index={0} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="user" size={18} color="var(--teal)" /> Your Details
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 22 }}>
                Who this estimate is for. These appear on the exported PDF and don't affect any figure.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Field label="Company / Customer Name">
                  <TextInput value={customerName} onChange={setCustomerName} placeholder="e.g. Harmony New Energy Tanzania Auto Services Ltd" />
                </Field>
                <div className="lcp-btn-row">
                  <Field label="Contact Email">
                    <TextInput value={customerEmail} onChange={setCustomerEmail} placeholder="name@company.co.tz" type="email" />
                  </Field>
                  <Field label="Contact Phone">
                    <TextInput value={customerPhone} onChange={setCustomerPhone} placeholder="+255 …" type="tel" />
                  </Field>
                </div>
                <Field label="Destination" hint="Where the cargo is being cleared to — shown on the estimate and used for the DDP label.">
                  <TextInput value={destination} onChange={setDestination} placeholder="Dar es Salaam, Tanzania" />
                </Field>
              </div>

              <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>What are you costing?</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 14 }}>
                  Each line is assessed against its own HS code — duty, excise, VAT, RDL and CPF are all per item.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Seg active={itemMode === 'single'} onClick={() => setItemMode('single')} label="Single item" icon="box" grow />
                  <Seg active={itemMode === 'multi'} onClick={() => setItemMode('multi')} label="Full invoice" icon="layers" grow />
                </div>

                {itemMode === 'multi' && (
                  <div style={{ marginTop: 16 }}>
                    {invoiceImportBar}
                    {importFeedback}
                  </div>
                )}
              </div>

              {navRow}
            </div>
          )}

          {step === 3 && (
            <div className="lcp-card">
              <StepCaption index={2} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="package" size={18} color="var(--teal)" /> {itemMode === 'multi' ? 'Confirm Cargo Lines' : 'Cargo Items'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 18 }}>
                {itemMode === 'multi'
                  // An uploaded invoice carries no HS codes, or carries ones Excel
                  // has truncated. Nothing is assessed until an agent confirms them.
                  ? 'Every line needs a confirmed HS code before it can be assessed. A commercial invoice never carries one, so this is yours to set.'
                  : 'Enter the shipment value and HS classification.'}
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 22%, transparent)', marginBottom: 24, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="info" size={16} color="var(--teal)" style={{ flexShrink: 0 }} />
                <div>
                  Rates: <strong>EAC CET 2022</strong> · VAT 18% · RDL 2% · CPF 1% (Finance Act 2026) · TPA Wharfage 1.6% ·{' '}
                  {fxRate ? <><strong>Live rate: 1 USD = TZS {fxRate.toLocaleString()}</strong></> : 'Loading live FX rate…'}
                </div>
              </div>

              {itemMode === 'single' && (
              <>
              {/* Form Fields Stacked Vertically */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* What the invoice price covers — asked in plain language.
                    Customers don't know EXW/FOB/CFR/CIF, so the two yes/no
                    answers derive the Incoterm instead of demanding it. */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                    Invoice Value (USD)
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 6 }}>
                    The total on your supplier's invoice, before any Tanzanian duties.
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input className="input-field" type="number" min="0" placeholder="e.g. 15,000" value={fob} onChange={e => setFob(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, height: 44, fontSize: 14 }} />
                    <Icon name="dollarSign" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  </div>

                  <div style={{ marginTop: 14, padding: 14, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 8 }}>Does that price already include shipping to Tanzania?</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Seg active={priceInclFreight} onClick={() => setPriceInclFreight(true)} label="Yes" grow />
                        <Seg active={!priceInclFreight} onClick={() => setPriceInclFreight(false)} label="No" grow />
                      </div>
                    </div>

                    {!priceInclFreight && (
                      <div>
                        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Shipping cost you paid (USD)</label>
                        <input className="input-field" type="number" min="0" placeholder="e.g. 3,500" value={freight} onChange={e => setFreight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginBottom: 8 }}>Does it already include insurance?</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Seg active={priceInclInsurance} onClick={() => setPriceInclInsurance(true)} label="Yes" grow />
                        <Seg active={!priceInclInsurance} onClick={() => setPriceInclInsurance(false)} label="No" grow />
                      </div>
                      {!priceInclInsurance && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <input className="input-field" type="number" min="0" step="0.1" value={insurancePct} onChange={e => setInsurancePct(e.target.value)} style={{ width: 64, boxSizing: 'border-box', height: 34, fontSize: 13, textAlign: 'right' }} />
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>% of goods + shipping — the usual rate if you don't have a figure</span>
                          <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 'auto' }}>= {fmtUsd(insuranceVal)}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12.5, gap: 10 }}>
                      <span style={{ color: 'var(--ink3)' }}>
                        Customs value (CIF) <span style={{ color: 'var(--ink4)' }}>· quoted {priceBasis}</span>
                      </span>
                      <strong style={{ color: 'var(--teal)' }}>{fmtUsd(effectiveCif())}</strong>
                    </div>
                  </div>
                </div>

                {/* Field 2: HS Code or Description Search */}
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                    HS Code or Description
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8, color: 'var(--ink4)', fontSize: 11 }}>— Search our EAC CET database</span>
                  </label>
                  <EntityPicker
                    value={hs ? { id: hs, label: hs } : null}
                    onChange={handleHsChange}
                    search={searchHs}
                    placeholder="e.g. 8471 or laptop computers"
                  />

                  {hsSelected && (
                    <div style={{ marginTop: 10, padding: '12px 16px', background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 25%, transparent)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="checkCircle" size={16} color="var(--teal)" />
                        <strong>{hsSelected.code}</strong> — {hsSelected.description}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 14, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--teal)', fontWeight: 700 }}>{Number(hsSelected.import_duty_rate)}% duty</span>
                        {hsSelected.pvoc_required && (
                          <span style={{ color: 'var(--gold)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="shield" size={13} color="var(--gold)" /> PVoC
                          </span>
                        )}
                        {hsSelected.di_required && (
                          <span style={{ color: 'var(--gold)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="shield" size={13} color="var(--gold)" /> DI
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Field 3: Quantity */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>Quantity (units)</label>
                  <input className="input-field" type="number" min="1" placeholder="e.g. 10" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 44, fontSize: 14 }} />
                </div>

                {/* Field 4: Finance Act 2026 (July update) special excise flags */}
                <div style={{ padding: 14, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>
                    Special Excise — Finance Act 2026 (July update)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', marginBottom: isUsedVehicle ? 10 : 0 }}>
                    <input type="checkbox" checked={isUsedVehicle} onChange={e => setIsUsedVehicle(e.target.checked)} />
                    This is a used motor vehicle
                  </label>
                  {isUsedVehicle && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 24 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Vehicle age (years)</span>
                      <input className="input-field" type="number" min="0" step="1" placeholder="e.g. 12" value={vehicleAge} onChange={e => setVehicleAge(e.target.value)}
                        style={{ width: 80, boxSizing: 'border-box', height: 32, fontSize: 13 }} />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={isClogs} onChange={e => setIsClogs(e.target.checked)} />
                    This is plastic or rubber clogs footwear
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--ink4)', marginTop: 8, lineHeight: 1.5 }}>
                    Used-vehicle excise bands (18%/35%/40% by age) and the 20% clogs excise aren't derivable from HS classification alone — flag them explicitly here rather than guessing from the HS code.
                  </div>
                </div>

              </div>
              </>
              )}

              {itemMode === 'multi' && (
                <div>
                  {invoiceImportBar}
                  {importFeedback}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {multiItems.map((row, idx) => (
                      <div key={row.id} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>LINE {idx + 1}</span>
                          <button type="button" onClick={() => removeRow(row.id)} disabled={multiItems.length === 1}
                            style={{ background: 'none', border: 'none', cursor: multiItems.length === 1 ? 'default' : 'pointer', opacity: multiItems.length === 1 ? 0.3 : 1, color: 'var(--red)', display: 'flex', alignItems: 'center' }}>
                            <Icon name="trash" size={13} color="var(--red)" />
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.4fr', gap: 8, marginBottom: 8 }}>
                          <input className="input-field" placeholder="Product / description" value={row.description} onChange={e => updateRow(row.id, { description: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 38, fontSize: 13 }} />
                          <EntityPicker
                            value={row.hs_code ? { id: row.hs_code, label: row.hs_code } : null}
                            onChange={item => handleRowHsChange(row, item)}
                            search={searchHs}
                            placeholder="HS code"
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Qty</label>
                            <input className="input-field" type="number" min="0" value={row.qty} onChange={e => updateRow(row.id, { qty: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 36, fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Unit</label>
                            <input className="input-field" placeholder="unit" value={row.unit} onChange={e => updateRow(row.id, { unit: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 36, fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Unit Price (USD)</label>
                            <input className="input-field" type="number" min="0" value={row.unit_price_usd} onChange={e => updateRow(row.id, { unit_price_usd: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 36, fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Amount (USD)</label>
                            <div style={{ height: 36, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                              {fmtUsd((parseFloat(row.qty) || 0) * (parseFloat(row.unit_price_usd) || 0))}
                            </div>
                          </div>
                        </div>

                        {/* Per-line rate overrides — blank uses this HS code's
                            own tariff rate. Anything typed here is flagged as a
                            manual override on the result and the PDF. */}
                        <details style={{ marginTop: 10 }}>
                          <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: rowHasOverride(row) ? 'var(--gold, #B8862F)' : 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                            Rates {rowHasOverride(row) ? '· overridden' : '· from tariff database'}
                          </summary>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                            <RowRate label="Duty %"  value={row.ov_duty} onChange={v => updateRow(row.id, { ov_duty: v })} />
                            <RowRate label="VAT %"   value={row.ov_vat}  onChange={v => updateRow(row.id, { ov_vat: v })}  placeholder="18" />
                            <RowRate label="RDL %"   value={row.ov_rdl}  onChange={v => updateRow(row.id, { ov_rdl: v })}  placeholder="2" />
                            <RowRate label="CPF %"   value={row.ov_cpf}  onChange={v => updateRow(row.id, { ov_cpf: v })}  placeholder="1" />
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addRow} disabled={multiItems.length >= MAX_CARGO_ROWS} className="btn btn-secondary"
                    style={{ marginTop: 10, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, opacity: multiItems.length >= MAX_CARGO_ROWS ? 0.45 : 1, cursor: multiItems.length >= MAX_CARGO_ROWS ? 'not-allowed' : 'pointer' }}>
                    <Icon name="plus" size={13} /> Add line item
                  </button>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{multiItems.length} of {MAX_CARGO_ROWS} lines</span>
                    <span>Total FOB Value: <strong style={{ color: 'var(--ink)' }}>{fmtUsd(multiTotalFobUsd)}</strong></span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>Freight (USD)</label>
                      <input className="input-field" type="number" min="0" placeholder="e.g. 800" value={multiFreight} onChange={e => setMultiFreight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                        Insurance (USD) <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--ink4)' }}>— blank = 1% of CFR</span>
                      </label>
                      <input className="input-field" type="number" min="0" placeholder="auto" value={multiInsurance} onChange={e => setMultiInsurance(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                    </div>
                  </div>
                </div>
              )}

              {navRow}
            </div>
          )}

          {step === 2 && (
            <div className="lcp-card">
              <StepCaption index={1} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="truck" size={18} color="var(--teal)" /> Shipment Mode &amp; Dimensions
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 24 }}>How the cargo travels. This drives which rate card is used and how port/handling charges are computed.</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Mode as selectable tiles, and only the fields that mode
                    actually bills on. Container sizes live in Container
                    Details below, so the mode itself is just the transport
                    method — having "20ft FCL" here as well duplicated it. */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>Shipment Mode</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {SHIPMENT_MODE_OPTIONS.map(o => (
                      <Seg key={o.key} active={shipmentModeKey === o.key} onClick={() => setShipmentModeKey(o.key)} label={o.label} icon={o.icon} grow />
                    ))}
                  </div>
                </div>

                {isFcl && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Container Details</label>
                      <button type="button"
                        onClick={() => setContainerLots(l => l.length >= 2 ? l : [...l, { size: l.some(x => x.size === '20ft') ? '40ft' : '20ft', count: '1' }])}
                        disabled={containerLots.length >= 2}
                        style={{ fontSize: 12, fontWeight: 700, color: containerLots.length >= 2 ? 'var(--ink4)' : 'var(--teal)', background: 'none', border: `1px solid ${containerLots.length >= 2 ? 'var(--border)' : 'var(--teal)'}`, borderRadius: 8, padding: '5px 12px', cursor: containerLots.length >= 2 ? 'not-allowed' : 'pointer' }}>
                        + Add size
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 8 }}>
                      ICD, agency and shipping-line handling are billed per container. Each size is priced from its own rate card.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {containerLots.map((lot, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr auto', gap: 8, alignItems: 'center' }}>
                          <Select value={lot.size} onValueChange={v => setContainerLots(l => l.map((x, j) => j === i ? { ...x, size: v as '20ft' | '40ft' } : x))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="20ft">20ft (TEU)</SelectItem>
                              <SelectItem value="40ft">40ft (FEU)</SelectItem>
                            </SelectContent>
                          </Select>
                          <input className="input-field" type="number" min="1" step="1" placeholder="Qty" value={lot.count}
                            onChange={e => setContainerLots(l => l.map((x, j) => j === i ? { ...x, count: e.target.value } : x))}
                            style={{ width: '100%', boxSizing: 'border-box' }} />
                          <button type="button" title="Remove"
                            onClick={() => setContainerLots(l => l.length > 1 ? l.filter((_, j) => j !== i) : l)}
                            disabled={containerLots.length === 1}
                            style={{ background: 'none', border: 'none', cursor: containerLots.length === 1 ? 'default' : 'pointer', opacity: containerLots.length === 1 ? 0.3 : 1, color: 'var(--red)', padding: 6 }}>
                            <Icon name="trash" size={14} color="var(--red)" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--ink3)' }}>
                      {containerLots.length === 2 && containerLots[0].size === containerLots[1].size
                        ? `Both rows are ${containerLots[0].size} — they'll be added together (${numContainersVal} total).`
                        : `${numContainersVal} container${numContainersVal === 1 ? '' : 's'} total.`}
                    </div>
                  </div>
                )}

                {needsCbm && (
                  <Field label="Total Volume (CBM)" hint={isAir ? 'Used to work out volumetric weight.' : 'LCL handling is charged per CBM.'}>
                    <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 15.0" value={cbm}
                      onChange={e => setCbm(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }} />
                  </Field>
                )}

                {isAir && (
                  <Field label="Total Gross Weight (kg)" hint="Air bills on chargeable weight — the greater of gross and volumetric.">
                    <input className="input-field" type="number" min="0" placeholder="e.g. 3000" value={weightKg}
                      onChange={e => setWeightKg(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box' }} />
                  </Field>
                )}

                {isAir && (cbmVal > 0 || weightKgVal > 0) && (
                  <div style={{ marginTop: -8, fontSize: 11.5, color: 'var(--ink3)' }}>
                    Volumetric: {volumetricKgVal.toFixed(0)} kg ({cbmVal} CBM × 166.67) vs. gross {weightKgVal.toFixed(0)} kg → chargeable weight <strong style={{ color: 'var(--teal)' }}>{chargeableKgPreview.toFixed(0)} kg</strong>
                  </div>
                )}

                {/* Origin capture. Free text, but with real suggestions so the
                    same port doesn't accumulate as five spellings — the value
                    of this data depends entirely on it aggregating. */}
                <div className="lcp-btn-row">
                  <Field label={loadingPointLabel} hint="Where the cargo was loaded. Helps us track the corridors you actually trade through.">
                    <EntityPicker
                      value={loadingPoint ? { id: loadingPoint, label: loadingPoint } : null}
                      onChange={item => setLoadingPoint(item ? String(item.id) : '')}
                      search={searchPorts}
                      placeholder={isAir ? 'Search airports…' : 'Search ports…'}
                    />
                  </Field>
                  <Field label="Country of Origin" hint="Where the goods were made or shipped from. EAC origin affects duty treatment.">
                    <EntityPicker
                      value={originCountry ? { id: originCountry, label: originCountry } : null}
                      onChange={item => setOriginCountry(item ? String(item.id) : '')}
                      search={searchCountries}
                      placeholder="Search countries…"
                    />
                  </Field>
                </div>

                {icdOperatorOptions.length > 0 && (
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>
                      ICD Operator <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink4)' }}>— optional, uses your Rate Card's generic default otherwise</span>
                    </label>
                    <Select value={icdOperatorId ?? '__generic__'} onValueChange={v => setIcdOperatorId(v === '__generic__' ? null : v)}>
                      <SelectTrigger style={{ height: 44 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__generic__">Generic default</SelectItem>
                        {icdOperatorOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

              </div>

              {/* Destination-charge basis info */}
              <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="info" size={15} color="var(--teal)" style={{ flexShrink: 0 }} />
                {isAir
                  ? <span>Air handling: TZS 55,000 documentation + TZS 242/kg chargeable weight · TPA Wharfage: 1.6% of CIF</span>
                  : container === 'lcl'
                    ? <span>LCL handling: TZS 130,000/CBM · TPA Wharfage: 1.6% of CIF</span>
                    : <span>ICD charges: TZS 450,000 (20ft) · TZS 560,000 (40ft) · TPA Wharfage: 1.6% of CIF</span>}
              </div>

              {/* ── Advanced Settings ──────────────────────────────────────
                  Everything here replaces a rate that would otherwise come
                  from the EAC CET tariff table or a published TPA/TRA figure.
                  Blank = use the sourced value. Anything actually changed is
                  labelled as a manual override on the result and the PDF, so
                  a typed rate is never presented with the authority of a
                  looked-up one. */}
              <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button type="button" onClick={() => setShowAdvanced(v => !v)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px', background: 'var(--surface, rgba(255,255,255,0.03))', border: 'none', cursor: 'pointer', color: 'var(--ink2)', fontSize: 12.5, fontWeight: 700 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="settings" size={15} color="var(--ink3)" />
                    Advanced Settings
                    {overrideCount > 0 && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--gold-l, rgba(184,134,47,.15))', color: 'var(--gold, #B8862F)' }}>
                        {overrideCount} override{overrideCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </span>
                  <Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={15} color="var(--ink3)" />
                </button>
                {showAdvanced && (
                  <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.6 }}>
                      Leave blank to use the rate from the EAC CET tariff database or the published TPA/TRA figure.
                      Anything you enter here is flagged as a manual override on the estimate and the exported PDF.
                    </div>
                    <div className="lcp-btn-row">
                      <OverrideField label="Import Duty" suffix="%" value={ovDuty} onChange={setOvDuty} placeholder="from tariff DB" />
                      <OverrideField label="VAT" suffix="%" value={ovVat} onChange={setOvVat} placeholder="18" />
                    </div>
                    <div className="lcp-btn-row">
                      <OverrideField label="Railway Dev. Levy" suffix="% of CIF" value={ovRdl} onChange={setOvRdl} placeholder="2" />
                      <OverrideField label="Customs Processing Fee" suffix="% of CIF" value={ovCpf} onChange={setOvCpf} placeholder="1" />
                    </div>
                    <div className="lcp-btn-row">
                      <OverrideField label="TPA Wharfage" suffix="% of CIF" value={ovWharfage} onChange={setOvWharfage} placeholder="1.6" />
                      <OverrideField label="Port Infra. Development" suffix="% of duty" value={ovPid} onChange={setOvPid} placeholder="4.5" />
                    </div>
                    <OverrideField
                      label="Exchange rate (USD → TZS)"
                      suffix="TZS"
                      value={ovFx}
                      onChange={setOvFx}
                      placeholder={fxRate ? `live: ${fxRate.toLocaleString()}` : 'live rate'}
                      hint="Pin a rate when quoting against a fixed contract rate. Blank uses the live feed."
                    />
                  </div>
                )}
              </div>

              {navRow}
            </div>
          )}

          {step === 4 && (
            <div className="lcp-card">
              <StepCaption index={3} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="calculator" size={18} color="var(--teal)" /> Results Breakdown
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 24 }}>
                {itemMode === 'single' ? (
                  <>
                    Full landed cost breakdown for HS {hs || '—'} · {effectiveCif() > 0 ? fmtUsd(effectiveCif()) : '—'} CIF
                    {result && <> · Live FX Rate: 1 USD = TZS {result.fx_rate.toLocaleString()}</>}
                  </>
                ) : (
                  <>
                    Full landed cost breakdown for {multiItems.filter(r => r.hs_code).length} line item{multiItems.filter(r => r.hs_code).length === 1 ? '' : 's'}
                    {multiResult && <> · Live FX Rate: 1 USD = TZS {multiResult.fx_rate.toLocaleString()}</>}
                  </>
                )}
              </div>

              {(itemMode === 'single' ? error : multiError) && (
                <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 18, padding: '12px 16px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="alertCircle" size={16} color="var(--red)" />
                  {itemMode === 'single' ? error : multiError}
                </div>
              )}

              {/* A missing QR should be explained, not silently absent — the
                  usual cause is the public domain not being configured yet. */}
              {shareNotice && (
                <div style={{ marginBottom: 18, padding: '11px 15px', borderRadius: 10, background: 'var(--gold-l, rgba(184,134,47,.10))', border: '1px solid var(--gold-m, rgba(184,134,47,.30))', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon name="info" size={15} color="var(--gold, #B8862F)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <strong>Exported without a QR code.</strong> {shareNotice} The report link itself was still saved, so it will work once that's set.
                  </div>
                </div>
              )}

              {/* Manual-override banner — the figures below aren't purely
                  tariff-sourced, and that has to be visible on the result
                  itself, not only in the fine print. */}
              {result && (result.overridden_fields?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 10, background: 'var(--gold-l, rgba(184,134,47,.12))', border: '1px solid var(--gold-m, rgba(184,134,47,.35))', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon name="alertTriangle" size={16} color="var(--gold, #B8862F)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--gold, #B8862F)' }}>Manual rate override in effect.</strong>{' '}
                    {result.overridden_fields!.map(f => OVERRIDE_LABELS[f] ?? f).join(', ')}
                    {' '}— entered in Advanced Settings, not sourced from the EAC CET tariff database or a published TPA/TRA rate. Verify before sending this to a customer.
                  </div>
                </div>
              )}

              {calcLoading && (
                <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  <Icon name="sliders" size={32} color="var(--teal)" className="spin" style={{ display: 'block', margin: '0 auto 12px' }} />
                  Fetching live rates and calculating landed cost…
                </div>
              )}

              {itemMode === 'single' && result && !calcLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div>
                    {/* Quick-read summary stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Effective Statutory Rate</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{result.effective_statutory_rate_pct.toFixed(1)}%</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 2 }}>of CIF (duty+excise+RDL+CPF+VAT)</div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Landed Multiplier</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{result.landed_multiplier.toFixed(2)}×</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 2 }}>landed cost ÷ CIF value</div>
                      </div>
                      {result.fob_usd != null && (
                        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>FOB + Freight + Insurance</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                            {fmtUsd(result.fob_usd)} + {fmtUsd(result.freight_usd ?? 0)} + {fmtUsd(result.insurance_usd ?? 0)}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 2 }}>= {fmtUsd(result.cif_usd)} CIF</div>
                        </div>
                      )}
                    </div>

                    {/* Compliance alerts */}
                    {(result.pvoc_required || result.di_required || (result.permits?.length > 0)) && (
                      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'color-mix(in srgb, var(--gold) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--gold) 30%, transparent)', borderRadius: 12, fontSize: 13, color: 'var(--ink)' }}>
                        <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="alertTriangle" size={16} color="var(--gold)" /> Compliance Requirements
                        </div>
                        {result.pvoc_required && <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="shield" size={14} color="var(--gold)" /> Pre-Verification of Conformity (PVoC/CoC) required before shipment</div>}
                        {result.di_required && <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="shield" size={14} color="var(--gold)" /> Destination Inspection (DI) required on arrival</div>}
                        {result.permits?.map((p: string) => <div key={p} style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="fileText" size={14} color="var(--gold)" /> {p} permit/approval required</div>)}
                      </div>
                    )}

                    <FormattedLandedCostBreakdown
                      result={result}
                      fobUsd={fobVal || (result.cif_usd - freightVal - (insuranceVal || result.cif_usd * 0.01))}
                      freightUsd={freightVal}
                      insuranceUsd={insuranceVal || (result.cif_usd * 0.01)}
                      mode={mode}
                      container={container}
                      icdOperatorId={icdOperatorId}
                      qty={parseFloat(qty) || 0}
                      extraItems={extraItems}
                      extraPicker={extraPicker}
                      onExtraPickerChange={addExtraItem}
                      onRemoveExtra={removeExtraItem}
                      onSetExtraQty={setExtraQty}
                      searchTariff={searchTariff}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {summary && (
                      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ padding: '14px 18px', background: 'color-mix(in srgb, var(--teal) 8%, transparent)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="sparkle" size={16} color="var(--teal)" />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>AI Analysis</span>
                          <button type="button" onClick={() => setSummary('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', fontSize: 16, padding: 0, display: 'flex', alignItems: 'center' }}>
                            <Icon name="close" size={14} color="var(--ink3)" />
                          </button>
                        </div>
                        <div style={{ padding: '18px 20px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{summary}</div>
                      </div>
                    )}

                    {!summary && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '20px 18px', background: 'var(--card-bg, var(--white))' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Icon name="sparkle" size={16} color="var(--teal)" />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>AI Analysis</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16, lineHeight: 1.6 }}>Get AI-powered interpretation of your landed cost and compliance status.</div>

                        {aiError && (
                          <div style={{ marginBottom: 14, padding: '11px 14px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <Icon name="alertCircle" size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                              {aiError}
                              {aiError.toLowerCase().includes('not configured') && ' Ask an admin to add an AI provider key under Settings → Integrations → AI Integration.'}
                            </span>
                          </div>
                        )}

                        <button type="button" onClick={runAi} disabled={aiPending}
                          style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: aiPending ? 'default' : 'pointer', opacity: aiPending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px color-mix(in srgb, var(--teal) 25%, transparent)' }}>
                          <Icon name="sparkle" size={14} color="#fff" />
                          {aiPending ? 'Analysing…' : aiError ? 'Retry AI Analysis' : 'Run AI Analysis'}
                        </button>
                      </div>
                    )}

                    {/* HS Tariff summary box */}
                    {hsSelected && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', background: 'var(--surface, rgba(255,255,255,0.03))', fontSize: 13 }}>
                        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13.5, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="clipboardList" size={16} color="var(--teal)" /> Tariff Details
                        </div>
                        <RRow label="Import Duty" value={`${hsSelected.import_duty_rate}%`} />
                        <RRow label="VAT" value={`${hsSelected.vat_rate}%`} />
                        {hsSelected.excise_rate > 0 && <RRow label="Excise" value={`${hsSelected.excise_rate}%`} />}
                        <RRow label="RDL" value={`${hsSelected.rdl_rate}%`} />
                        <RRow label="CPF" value={`${hsSelected.cpf_rate}%`} />
                        {hsSelected.notes && (
                          <div style={{ marginTop: 12, color: 'var(--ink3)', fontSize: 12, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <Icon name="info" size={14} color="var(--ink3)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>{hsSelected.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Warnings & assumptions — structured, not buried in prose, so
                        nothing that matters gets missed scanning the page. */}
                    {(result.warnings.length > 0 || result.assumptions.length > 0) && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', background: 'var(--card-bg, var(--white))', fontSize: 12.5 }}>
                        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="alertCircle" size={15} color="var(--ink3)" /> Assumptions &amp; Warnings
                        </div>
                        {result.warnings.map((w, i) => (
                          <div key={`w${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, color: 'var(--gold)' }}>
                            <Icon name="alertTriangle" size={13} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>{w}</span>
                          </div>
                        ))}
                        {result.assumptions.map((a, i) => (
                          <div key={`a${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, color: 'var(--ink3)' }}>
                            <Icon name="info" size={13} color="var(--ink3)" style={{ marginTop: 2, flexShrink: 0 }} />
                            <span>{a}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="lcp-btn-row">
                      <button type="button" onClick={async () => { if (!result) return; const rc = await fetchRateCardDefaults(rateCardKeyFor(result.mode, container), icdOperatorId); const sc = await fetchSizeCards(result, icdOperatorId); const share = await createShareForReport(result, reportMeta, { result, qty, summary, extraItems, container, rateCard: rc, sizeCards: sc, meta: reportMeta }); setShareNotice(share.qrUnavailableReason ?? ''); printReport(result, qty, summary, extraItems, container, rc, { ...reportMeta, ...share }, sc); }}
                        style={{ padding: '11px 0', borderRadius: 8, border: '1.5px solid var(--teal)', background: 'var(--card-bg, var(--white))', color: 'var(--teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Icon name="download" size={15} color="var(--teal)" />
                        Export PDF
                      </button>

                      <button type="button" onClick={newCalculation}
                        style={{ padding: '11px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        New Calculation
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {itemMode === 'multi' && multiResult && !calcLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {/* Quick-read summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Line Items</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.items.length}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Effective Statutory Rate</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.totals.effective_statutory_rate_pct.toFixed(1)}%</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Landed Multiplier</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.totals.landed_multiplier.toFixed(2)}×</div>
                    </div>
                    {multiResult.chargeable_weight_kg != null && (
                      <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Chargeable Weight</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.chargeable_weight_kg.toFixed(0)} kg</div>
                      </div>
                    )}
                  </div>

                  {/* Per-item table */}
                  <div style={{ border: '1px solid var(--teal)', borderRadius: 14, overflow: 'auto', boxShadow: '0 4px 20px color-mix(in srgb, var(--teal) 8%, transparent)' }}>
                    <div style={{ padding: '16px 22px', background: 'color-mix(in srgb, var(--teal) 10%, transparent)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="package" size={18} color="var(--teal)" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Per-Item Breakdown</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>{multiResult.destination_charge_label}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface, rgba(255,255,255,0.03))' }}>
                          {['#', 'Description', 'HS Code', 'Qty', 'CIF (TZS)', 'Duty', 'VAT', 'Other', 'Landed Total'].map(h => (
                            <th key={h} style={{ textAlign: h === 'Description' ? 'left' : 'right', padding: '8px 12px', color: 'var(--ink3)', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {multiResult.items.map(it => (
                          <tr key={it.line_no}>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--ink3)' }}>{it.line_no}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--ink)', fontWeight: 600 }}>
                              {it.description}
                              {!it.hs_found && <span title="HS code not found — fallback rates used"><Icon name="alertTriangle" size={11} color="var(--gold)" style={{ marginLeft: 6, verticalAlign: 'middle' }} /></span>}
                            </td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', color: 'var(--teal)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{it.hs_code}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.qty}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.cif_tzs)}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.duty)}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.vat)}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.excise + it.rdl + it.cpf + it.allocated_destination_tzs + it.wharfage)}</td>
                            <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 800, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>{fmt(it.landed_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'color-mix(in srgb, var(--teal) 6%, transparent)' }}>
                          <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--ink)' }}>Total</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(multiResult.totals.cif_tzs)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(multiResult.totals.duty)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(multiResult.totals.vat)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmt(multiResult.totals.excise + multiResult.totals.rdl + multiResult.totals.cpf + multiResult.totals.destination + multiResult.totals.wharfage)}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--teal)', fontVariantNumeric: 'tabular-nums' }}>{fmt(multiResult.totals.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* VAT incl/excl */}
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ink2)' }}>Total incl. VAT</span>
                      <strong style={{ color: 'var(--ink)' }}>TZS {fmt(multiResult.totals.total)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginTop: 6 }}>
                      <span style={{ color: 'var(--ink2)' }}>Total excl. VAT <span style={{ color: 'var(--ink4)' }}>(VAT recoverable)</span></span>
                      <strong style={{ color: 'var(--teal)' }}>TZS {fmt(multiResult.totals.total_ex_vat)}</strong>
                    </div>
                  </div>

                  {/* Warnings & assumptions */}
                  {(multiResult.warnings.length > 0 || multiResult.assumptions.length > 0) && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', background: 'var(--card-bg, var(--white))', fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="alertCircle" size={15} color="var(--ink3)" /> Assumptions &amp; Warnings
                      </div>
                      {multiResult.warnings.map((w, i) => (
                        <div key={`w${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, color: 'var(--gold)' }}>
                          <Icon name="alertTriangle" size={13} color="var(--gold)" style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>{w}</span>
                        </div>
                      ))}
                      {multiResult.assumptions.map((a, i) => (
                        <div key={`a${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8, color: 'var(--ink3)' }}>
                          <Icon name="info" size={13} color="var(--ink3)" style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>{a}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="lcp-btn-row">
                    <button type="button" onClick={async () => { if (!multiResult) return; const share = await createShareForMulti(multiResult, reportMeta); setShareNotice(share.qrUnavailableReason ?? ''); printMultiReport(multiResult, { ...reportMeta, ...share }); }}
                      style={{ padding: '11px 0', borderRadius: 8, border: '1.5px solid var(--teal)', background: 'var(--card-bg, var(--white))', color: 'var(--teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <Icon name="download" size={15} color="var(--teal)" />
                      Export PDF
                    </button>
                    <button type="button" onClick={newCalculation}
                      style={{ padding: '11px 0', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      New Calculation
                    </button>
                  </div>
                </div>
              )}

              {navRow}
            </div>
          )}
        </div>

      </div>

      {/* History — a right-side panel rather than something that reflows the
          page layout, so it works the same way on mobile and desktop. Recalling
          an entry behaves exactly as before (loads it into step 3). */}
      <Sheet open={showHistory} onOpenChange={setShowHistory}>
        <SheetContent side="right" style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', padding: 0 }}>
          <SheetHeader style={{ padding: '20px 20px 0' }}>
            <SheetTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={16} color="var(--teal)" /> Recent Calculations
            </SheetTitle>
          </SheetHeader>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '24px 0', textAlign: 'center' }}>No calculations yet.</div>
            ) : (
              history.map((h: any, i) => {
                const isMulti = h.hs_code === 'MULTI';
                return (
                  <div key={i}
                    onClick={() => !isMulti && recallHistory(h)}
                    style={{ padding: '12px 14px', background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10, cursor: isMulti ? 'default' : 'pointer', fontSize: 12.5, opacity: isMulti ? 0.7 : 1 }}
                    onMouseEnter={e => { if (!isMulti) e.currentTarget.style.borderColor = 'var(--teal)'; }}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ fontWeight: 700, color: 'var(--teal)' }}>{isMulti ? 'Multi-item' : `HS ${h.hs_code}`}</div>
                    <div style={{ color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{h.description}</div>
                    <div style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>TZS {fmt(h.total_tzs ?? h.total)}</div>
                    {isMulti && <div style={{ color: 'var(--ink4)', fontSize: 11, marginTop: 2 }}>View-only — re-enter items to recalculate</div>}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
