import React, { useState, useCallback, useEffect, useRef } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { apiFetch } from '../lib/api.js';
import { HUDUMIKA_FOOTER_HTML } from '../lib/watermark.js';

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
  vat: number;
  rdl: number;
  cpf: number;
  excise: number;
  icd: number;
  wharfage: number;
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
  chargeable_weight_kg: number | null;
  warnings: string[];
  assumptions: string[];
}

type ShipmentMode = 'sea_fcl' | 'sea_lcl' | 'air';

interface MultiItemRow {
  id: string;
  description: string;
  hs_code: string;
  qty: string;
  unit_price_usd: string;
}

function newMultiItemRow(): MultiItemRow {
  return { id: Math.random().toString(36).slice(2), description: '', hs_code: '', qty: '1', unit_price_usd: '' };
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

const fmt    = (n: number) => Math.round(n).toLocaleString();
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

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

function printReport(result: LandedCostResult, qty: string, summary: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Report</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:720px;margin:0 auto}h1{font-size:20px;font-weight:800;margin:0 0 4px}.meta{font-size:12px;color:#64748b;margin-bottom:24px}h2{font-size:12px;font-weight:700;color:#0b1e3a;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #0b1e3a40;padding-bottom:5px;margin:24px 0 10px}table{width:100%;border-collapse:collapse}td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:13px}td:last-child{text-align:right;font-weight:600}tr.hi td{background:#0b1e3a0d;font-weight:800;font-size:14px}pre{white-space:pre-wrap;background:#f8fafc;padding:16px;border-radius:8px;font-size:12.5px;line-height:1.7;border:1px solid #e2e8f0}ul.notes{margin:0;padding-left:18px;font-size:12px;color:#475569;line-height:1.7}.footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:16px}}</style></head><body>
<h1>Landed Cost Report</h1><p class="meta">Generated ${now} · HS Code: ${result.hs_code} · FX Rate: 1 USD = TZS ${result.fx_rate.toLocaleString()}</p>
<h2>Cargo: ${result.description}</h2>
<h2>Cost Breakdown</h2>
<table>
${result.breakdown.map(b => `<tr><td>${b.label}</td><td>TZS ${fmt(b.amount)}</td></tr>`).join('')}
<tr class="hi"><td>Total excl. VAT (VAT recoverable)</td><td>TZS ${fmt(result.total_ex_vat)}</td></tr>
</table>
${(result.warnings.length > 0 || result.assumptions.length > 0) ? `<h2>Assumptions &amp; Warnings</h2><ul class="notes">${[...result.warnings, ...result.assumptions].map(w => `<li>${w}</li>`).join('')}</ul>` : ''}
${summary ? `<h2>AI Summary</h2><pre>${summary}</pre>` : ''}
${HUDUMIKA_FOOTER_HTML}
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

function printMultiReport(result: MultiItemResult) {
  const w = window.open('', '_blank');
  if (!w) return;
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const rows = result.items.map(it => `<tr><td>${it.line_no}</td><td>${it.description}</td><td>${it.hs_code}</td><td style="text-align:right">${it.qty}</td><td style="text-align:right">TZS ${fmt(it.cif_tzs)}</td><td style="text-align:right">TZS ${fmt(it.duty)}</td><td style="text-align:right">TZS ${fmt(it.vat)}</td><td style="text-align:right;font-weight:700">TZS ${fmt(it.landed_total)}</td></tr>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Landed Cost Report — Multi-Item</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#111;max-width:960px;margin:0 auto}h1{font-size:20px;font-weight:800;margin:0 0 4px}.meta{font-size:12px;color:#64748b;margin-bottom:24px}h2{font-size:12px;font-weight:700;color:#0b1e3a;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #0b1e3a40;padding-bottom:5px;margin:24px 0 10px}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;border-bottom:1px solid #e5e7eb;font-size:12.5px;text-align:left}th{font-size:10.5px;text-transform:uppercase;color:#64748b}tr.hi td{background:#0b1e3a0d;font-weight:800;font-size:14px}ul.notes{margin:0;padding-left:18px;font-size:12px;color:#475569;line-height:1.7}.footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:16px}}</style></head><body>
<h1>Landed Cost Report — Multi-Item</h1><p class="meta">Generated ${now} · ${result.items.length} line items · FX Rate: 1 USD = TZS ${result.fx_rate.toLocaleString()}</p>
<h2>Per-Item Breakdown</h2>
<table><thead><tr><th>#</th><th>Description</th><th>HS Code</th><th style="text-align:right">Qty</th><th style="text-align:right">CIF</th><th style="text-align:right">Duty</th><th style="text-align:right">VAT</th><th style="text-align:right">Landed Total</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>Totals</h2>
<table>
<tr><td>Total incl. VAT</td><td style="text-align:right;font-weight:600">TZS ${fmt(result.totals.total)}</td></tr>
<tr class="hi"><td>Total excl. VAT (VAT recoverable)</td><td style="text-align:right">TZS ${fmt(result.totals.total_ex_vat)}</td></tr>
</table>
${(result.warnings.length > 0 || result.assumptions.length > 0) ? `<h2>Assumptions &amp; Warnings</h2><ul class="notes">${[...result.warnings, ...result.assumptions].map(w => `<li>${w}</li>`).join('')}</ul>` : ''}
${HUDUMIKA_FOOTER_HTML}
</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

// ── Step Indicator (vertical on desktop, horizontal on mobile) ─────────────────

const STEP_ITEMS = [
  { step: 1, label: 'Cargo Details', shortLabel: 'Cargo', desc: 'CIF Value, HS Code, Quantity', icon: 'box' },
  { step: 2, label: 'Transport & Logistics', shortLabel: 'Transport', desc: 'Shipping Mode, Container Type', icon: 'truck' },
  { step: 3, label: 'Results & Analysis', shortLabel: 'Results', desc: 'Duties, Taxes & Compliance', icon: 'calculator' },
];

function VerticalStepBar({ current, setStep }: { current: number; setStep: (s: 1 | 2 | 3) => void }) {
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
function HorizontalStepBar({ current, setStep }: { current: number; setStep: (s: 1 | 2 | 3) => void }) {
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
  const [cif,        setCif]       = useState('');
  const [cifMode,    setCifMode]   = useState<'direct' | 'breakdown'>('direct');
  const [fob,        setFob]       = useState('');
  const [freight,    setFreight]   = useState('');
  const [insurancePct, setInsurancePct] = useState('1');
  const [hs,         setHs]        = useState('');
  const [qty,        setQty]       = useState('1');
  const [container,  setContainer] = useState<'20ft' | '40ft' | 'lcl'>('20ft');
  const [isAir,      setIsAir]     = useState(false);
  const [cbm,        setCbm]       = useState('');
  const [weightKg,   setWeightKg]  = useState('');
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
  const [step,       setStep]      = useState<1 | 2 | 3>(1);
  const [fxRate,     setFxRate]    = useState<number | null>(null);
  const [hsSelected, setHsSelected] = useState<HsResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [history,    setHistory]   = useState<LandedCostResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const hsCacheRef = useRef<Map<string, HsResult>>(new Map());

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

  async function createHsFreeText(name: string): Promise<PickerItem> {
    const code = name.trim();
    return { id: code, label: code };
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

  function effectiveCif(): number {
    return cifMode === 'breakdown' ? breakdownCif : parseFloat(cif) || 0;
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

  async function calculate() {
    const cifVal = effectiveCif();
    if (!cifVal || cifVal <= 0) {
      setError(cifMode === 'breakdown' ? 'Enter a valid FOB value in USD.' : 'Enter a valid CIF value in USD.');
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
          num_containers: 1,
          cbm: mode !== 'sea_fcl' ? cbmVal : undefined,
          weight_kg: mode === 'air' ? weightKgVal : undefined,
          ...(cifMode === 'breakdown' ? { fob_usd: fobVal, freight_usd: freightVal, insurance_usd: insuranceVal } : {}),
        }),
      });
      setResult(r);
      setSummary('');
      setAiError('');
    } catch (e: any) {
      setError(e.message ?? 'Calculation failed');
    }
    setCalcLoading(false);
  }

  async function calculateMulti() {
    const rows = multiItems
      .map(r => ({ description: r.description, hs_code: r.hs_code.trim(), qty: parseFloat(r.qty) || 0, unit_price_usd: parseFloat(r.unit_price_usd) || 0 }))
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
          num_containers: 1,
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
    if (step !== 3) return;
    if (itemMode === 'single' && !result) calculate();
    if (itemMode === 'multi' && !multiResult) calculateMulti();
  }, [step]);

  // ── Multi-item row management ────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<MultiItemRow>) {
    setMultiItems(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function addRow() { setMultiItems(rows => [...rows, newMultiItemRow()]); }
  function removeRow(id: string) { setMultiItems(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows); }

  function handleRowHsChange(row: MultiItemRow, item: PickerItem | null) {
    if (!item) { updateRow(row.id, { hs_code: '' }); return; }
    const cached = hsCacheRef.current.get(item.id);
    updateRow(row.id, { hs_code: item.id, description: row.description || cached?.description || '' });
  }

  function downloadCsvTemplate() {
    const csv = 'Product,HS Code,Qty,Unit Price\nRice (husk),1006.10.00,100,30\nLaptop computers,8471,5,800\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'landed-cost-items-template.csv';
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

  function handleCsvUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length < 2) { setMultiError('CSV file has no data rows.'); return; }
      const header = parseCsvLine(lines[0]).map(h => h.toLowerCase());
      const idxProduct = header.findIndex(h => h.includes('product') || h.includes('description'));
      const idxHs = header.findIndex(h => h.includes('hs'));
      const idxQty = header.findIndex(h => h.includes('qty') || h.includes('quantity'));
      const idxPrice = header.findIndex(h => h.includes('price'));
      if (idxHs === -1 || idxQty === -1 || idxPrice === -1) {
        setMultiError('CSV must have columns for HS Code, Qty and Unit Price (download the template for the exact format).');
        return;
      }
      const rows: MultiItemRow[] = lines.slice(1).map(line => {
        const cells = parseCsvLine(line);
        return {
          id: Math.random().toString(36).slice(2),
          description: idxProduct >= 0 ? (cells[idxProduct] || '') : '',
          hs_code: cells[idxHs] || '',
          qty: cells[idxQty] || '1',
          unit_price_usd: cells[idxPrice] || '0',
        };
      }).filter(r => r.hs_code);
      if (rows.length === 0) { setMultiError('No valid rows found in the CSV.'); return; }
      setMultiItems(rows);
      setMultiError('');
    };
    reader.readAsText(file);
  }

  function recallHistory(h: LandedCostResult) {
    setItemMode('single');
    setResult(h);
    setShowHistory(false);
    setStep(3);
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
    setCifMode('direct');
    setFob('');
    setFreight('');
    setInsurancePct('1');
    setCbm('');
    setWeightKg('');
    setHsSelected(null);
    setSummary('');
    setAiError('');
  }

  const navRow = (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      {step > 1
        ? <button type="button" onClick={() => setStep(s => (s - 1) as any)}
            style={{ padding: '9px 22px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="arrowLeft" size={14} /> Back
          </button>
        : <div />
      }
      {step < 3
        ? <button type="button" onClick={() => setStep(s => (s + 1) as any)}
            style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 16px color-mix(in srgb, var(--teal) 30%, transparent)' }}>
            Continue <Icon name="arrowRight" size={14} color="#fff" />
          </button>
        : null
      }
    </div>
  );

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
                onClick={() => printReport(result, qty, summary)}
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
                <Icon name="package" size={18} color="var(--teal)" /> Cargo Details
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 18 }}>Enter the shipment value and HS classification.</div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <Seg active={itemMode === 'single'} onClick={() => setItemMode('single')} label="Single item" icon="box" grow />
                <Seg active={itemMode === 'multi'} onClick={() => setItemMode('multi')} label="Multiple items" icon="layers" grow />
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 22%, transparent)', marginBottom: 24, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="info" size={16} color="var(--teal)" style={{ flexShrink: 0 }} />
                <div>
                  Rates: <strong>EAC CET 2022</strong> · VAT 18% · RDL 1.5% · CPF 1% (Finance Act 2026) · TPA Wharfage 0.5% ·{' '}
                  {fxRate ? <><strong>Live rate: 1 USD = TZS {fxRate.toLocaleString()}</strong></> : 'Loading live FX rate…'}
                </div>
              </div>

              {itemMode === 'single' && (
              <>
              {/* Form Fields Stacked Vertically */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

                {/* Field 1: CIF Value */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                      {cifMode === 'direct' ? 'CIF Value (USD)' : 'FOB + Freight + Insurance (USD)'}
                    </label>
                    <button type="button" onClick={() => setCifMode(m => m === 'direct' ? 'breakdown' : 'direct')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--teal)', fontSize: 11.5, fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="refresh" size={12} color="var(--teal)" />
                      {cifMode === 'direct' ? 'I only have FOB + Freight' : 'I already know my CIF'}
                    </button>
                  </div>

                  {cifMode === 'direct' ? (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--ink4)', marginBottom: 6 }}>Cost + Insurance + Freight, all combined</div>
                      <div style={{ position: 'relative' }}>
                        <input className="input-field" type="number" min="0" placeholder="e.g. 15,000" value={cif} onChange={e => setCif(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, height: 44, fontSize: 14 }} />
                        <Icon name="dollarSign" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>FOB (USD)</label>
                          <input className="input-field" type="number" min="0" placeholder="e.g. 14,000" value={fob} onChange={e => setFob(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Freight (USD)</label>
                          <input className="input-field" type="number" min="0" placeholder="e.g. 800" value={freight} onChange={e => setFreight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Insurance</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input className="input-field" type="number" min="0" step="0.1" value={insurancePct} onChange={e => setInsurancePct(e.target.value)} style={{ width: 64, boxSizing: 'border-box', height: 34, fontSize: 13, textAlign: 'right' }} />
                          <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>% of CFR (editable default)</span>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 'auto' }}>= {fmtUsd(insuranceVal)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--ink3)' }}>Computed CIF</span>
                        <strong style={{ color: 'var(--teal)' }}>{fmtUsd(breakdownCif)}</strong>
                      </div>
                    </div>
                  )}
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
                    onCreate={createHsFreeText}
                    createLabel={(q) => `Use HS code "${q}" (not matched)`}
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

              </div>
              </>
              )}

              {itemMode === 'multi' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Add each invoice line, or upload a CSV.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={downloadCsvTemplate} className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="download" size={13} /> CSV Template
                      </button>
                      <label className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <Icon name="upload" size={13} /> Upload CSV
                        <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ''; }} />
                      </label>
                    </div>
                  </div>

                  {multiError && (
                    <div style={{ marginBottom: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)', borderRadius: 9, fontSize: 12.5, color: 'var(--red)' }}>
                      {multiError}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                            onCreate={createHsFreeText}
                            createLabel={(q) => `Use HS code "${q}"`}
                            placeholder="HS code"
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase' }}>Qty</label>
                            <input className="input-field" type="number" min="0" value={row.qty} onChange={e => updateRow(row.id, { qty: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', height: 36, fontSize: 13 }} />
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
                      </div>
                    ))}
                  </div>

                  <button type="button" onClick={addRow} className="btn btn-secondary" style={{ marginTop: 10, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="plus" size={13} /> Add line item
                  </button>

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
                <Icon name="truck" size={18} color="var(--teal)" /> Transport & Logistics
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 24 }}>Select the shipping mode and container type.</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>Shipping Mode</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    <Seg active={!isAir} onClick={() => setIsAir(false)} label="Sea / Road / Rail" icon="ship" grow />
                    <Seg active={isAir}  onClick={() => setIsAir(true)}  label="Air Freight" icon="plane" grow />
                  </div>
                </div>
                {!isAir && (
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>Container Type</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {(['20ft','40ft','lcl'] as const).map(c => (
                        <Seg key={c} active={container === c} onClick={() => setContainer(c)} label={c === 'lcl' ? 'LCL' : `${c} FCL`} icon="box" grow />
                      ))}
                    </div>
                  </div>
                )}

                {/* Sea LCL is charged by CBM, not per-container; Air is charged by
                    chargeable weight — the greater of gross weight and volumetric
                    weight (CBM × 166.67, the IATA divisor) — so both need these
                    cargo-measurement fields instead of a container selection. */}
                {(isAir || container === 'lcl') && (
                  <div>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>
                      Cargo Measurements <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--ink4)' }}>— {isAir ? 'CBM + weight, for chargeable-weight billing' : 'CBM, for LCL handling charges'}</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: isAir ? '1fr 1fr' : '1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Volume (CBM)</label>
                        <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 2.5" value={cbm} onChange={e => setCbm(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                      </div>
                      {isAir && (
                        <div>
                          <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Gross Weight (KG)</label>
                          <input className="input-field" type="number" min="0" placeholder="e.g. 180" value={weightKg} onChange={e => setWeightKg(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', height: 40, fontSize: 13.5 }} />
                        </div>
                      )}
                    </div>
                    {isAir && (cbmVal > 0 || weightKgVal > 0) && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink3)' }}>
                        Volumetric: {volumetricKgVal.toFixed(0)} kg ({cbmVal} CBM × 166.67) vs. gross {weightKgVal.toFixed(0)} kg → chargeable weight <strong style={{ color: 'var(--teal)' }}>{chargeableKgPreview.toFixed(0)} kg</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Destination-charge basis info */}
              <div style={{ marginTop: 24, padding: '12px 16px', background: 'var(--surface, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="info" size={15} color="var(--teal)" style={{ flexShrink: 0 }} />
                {isAir
                  ? <span>Air handling: TZS 55,000 documentation + TZS 242/kg chargeable weight · TPA Wharfage: 0.5% of CIF</span>
                  : container === 'lcl'
                    ? <span>LCL handling: TZS 130,000/CBM · TPA Wharfage: 0.5% of CIF</span>
                    : <span>ICD charges: TZS 450,000 (20ft) · TZS 560,000 (40ft) · TPA Wharfage: 0.5% of CIF</span>}
              </div>

              {navRow}
            </div>
          )}

          {step === 3 && (
            <div className="lcp-card">
              <StepCaption index={2} />
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

                    <div style={{ border: '1px solid var(--teal)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 20px color-mix(in srgb, var(--teal) 8%, transparent)' }}>
                      <div style={{ padding: '16px 22px', background: 'color-mix(in srgb, var(--teal) 10%, transparent)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Icon name="package" size={18} color="var(--teal)" />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Landed Cost Breakdown</span>
                        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>HS {result.hs_code} · {fmtUsd(result.cif_usd)} CIF</span>
                      </div>
                      <div style={{ padding: '20px 26px', background: 'var(--card-bg, var(--white))' }}>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16 }}>
                          <em>{result.description}</em> · Live FX: 1 USD = TZS {result.fx_rate.toLocaleString()}
                        </div>
                        {result.breakdown?.map((b, i) => (
                          <RRow key={i}
                            label={b.label}
                            value={`TZS ${fmt(b.amount)}`}
                            hi={b.label.includes('Total') || b.label.includes('Per Unit')}
                          />
                        ))}

                        {/* VAT is usually a recoverable input credit for VAT-registered
                            importers — showing only the inclusive total overstates true
                            unit cost for them, so both figures are always shown together. */}
                        <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--teal) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--teal) 20%, transparent)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                            <span style={{ color: 'var(--ink2)' }}>Total incl. VAT</span>
                            <strong style={{ color: 'var(--ink)' }}>TZS {fmt(result.total)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginTop: 6 }}>
                            <span style={{ color: 'var(--ink2)' }}>Total excl. VAT <span style={{ color: 'var(--ink4)' }}>(VAT recoverable)</span></span>
                            <strong style={{ color: 'var(--teal)' }}>TZS {fmt(result.total_ex_vat)}</strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink4)', marginTop: 8, lineHeight: 1.5 }}>
                            For VAT-registered importers, the TZS {fmt(result.vat_recoverable)} import VAT is usually a recoverable input credit — real cash at the border, but not part of true unit cost.
                          </div>
                        </div>
                      </div>
                    </div>
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
                      <button type="button" onClick={() => result && printReport(result, qty, summary)}
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
                    <button type="button" onClick={() => multiResult && printMultiReport(multiResult)}
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
