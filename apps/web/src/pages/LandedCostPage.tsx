import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Checkbox } from '../components/ui/checkbox.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { EntityPicker, PickerItem } from '../components/EntityPicker.js';
import { CustomerLeadPicker, type CustomerLeadDetails } from '../components/CustomerLeadPicker.js';
import { usePageSEO } from '../hooks/usePageSEO.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { readXlsxSheets } from '../lib/xlsx-read.js';
import { Tip } from '../components/ui/tooltip.js';

import {
  HsResult, LandedCostResult, ShipmentMode, HsSuggestion, HsMemoryHit, HsRecommendation, AiPick,
  MultiItemRow, MultiLineItemResult, MultiItemResult, ExtraCharge, ContainerLot,
  RateCardKey, ReportMeta, ShareResult, ShipmentModeKey,
  OVERRIDE_LABELS, AI_PICK_BATCH, MAX_CARGO_ROWS, SEAPORT_SUGGESTIONS, AIRPORT_SUGGESTIONS, SHIPMENT_MODE_OPTIONS,
  newMultiItemRow, rowRateOverrides, rowHasOverride, extraChargeTzs, containerLotsPayload,
  rateCardKeyFor, fetchRateCardDefaults, fetchSizeCards, createShareForReport,
  fmt, fmtUsd3, fmtUsd,
  RowRate, RRow, Seg, Image1TotalStrip, BreakdownTable, FormattedLandedCostBreakdown,
} from './landedcost/shared.js';
import {
  printReport, printMultiReport, createShareForMulti, fetchSizeCardsForLots,
} from './landedcost/print.js';
import {
  WizardStep, STEP_ITEMS, VerticalStepBar, HorizontalStepBar, StepCaption,
  Field, TextInput, OverrideField,
  DRAFT_VERSION, draftKey, readDraft, writeDraft, clearDraft, fromDraft,
  CHARGE_HEAD_LABEL, ESTIMATE_BY_HEAD,
} from './landedcost/wizard.js';

// Re-exports for external callers that import from './LandedCostPage.js'
export type { RateCardKey } from './landedcost/shared.js';
export { rateCardKeyFor, fetchRateCardDefaults } from './landedcost/shared.js';
export { printSharedReport, fetchSizeCardsForLots } from './landedcost/print.js';
export const LandedCostPage: React.FC = () => {
  usePageSEO('Landed Cost Calculator', 'Tanzania EAC CET landed cost calculator — compute full landed cost from CIF to your door, with a live FX rate and a branded PDF estimate.');
  // Read once, before any state initialiser below reads from it.
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const draftRef = useRef<Record<string, any> | null | undefined>(undefined);
  if (draftRef.current === undefined) draftRef.current = readDraft();
  const d = draftRef.current;
  // ── Step 1: who this estimate is for. Purely descriptive — these never
  // feed the calculation, they only label the on-screen result and the
  // exported PDF (and give the PDF its filename).
  const [customerName,  setCustomerName]  = useState(() => fromDraft(d, 'customerName', ''));
  const [customerEmail, setCustomerEmail] = useState(() => fromDraft(d, 'customerEmail', ''));
  const [customerPhone, setCustomerPhone] = useState(() => fromDraft(d, 'customerPhone', ''));
  // Not draft-persisted — only the resulting name/email/phone strings above
  // are (and that's what the PDF actually uses); re-selecting the CRM
  // record itself isn't needed to restore a draft.
  const [customerLead, setCustomerLead] = useState<PickerItem | null>(null);
  const [destination,   setDestination]   = useState(() => fromDraft(d, 'destination', 'Dar es Salaam, Tanzania'));
  // Ties this estimate to a real shipment so its actual costs, once logged
  // on the shipment's Ledger, can be compared against it — see
  // shipmentVariance() / EstimateVarianceCard. The backend has taken
  // shipment_id on every save since migration 167; nothing on this page
  // ever collected or sent it, so the link was always null in practice.
  const [linkedShipment, setLinkedShipment] = useState<PickerItem | null>(() => fromDraft(d, 'linkedShipment', null));
  const shipmentCacheRef = useRef<Map<string, any>>(new Map());
  async function searchShipments(q: string): Promise<PickerItem[]> {
    const qs = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : '';
    const res = await apiFetch(`/v1/shipments${qs}`).catch(() => ({ data: [] }));
    const list: any[] = Array.isArray(res) ? res : (res.data ?? []);
    list.forEach((s) => shipmentCacheRef.current.set(s.id, s));
    return list.slice(0, 25).map((s) => ({
      id: s.id, label: s.ref_number,
      sublabel: [s.bl_number || s.awb_number, s.customer_name, s.goods_desc].filter(Boolean).join(' · '),
    }));
  }

  const [cif,        setCif]       = useState(() => fromDraft(d, 'cif', ''));
  // Plain-language replacement for asking the customer an Incoterm. The two
  // answers derive it: No/No = FOB, Yes/No = CFR, Yes/Yes = CIF.
  const [priceInclFreight,   setPriceInclFreight]   = useState(() => fromDraft(d, 'priceInclFreight', false));
  const [priceInclInsurance, setPriceInclInsurance] = useState(() => fromDraft(d, 'priceInclInsurance', false));
  // Corridor / source-market capture — persisted per calculation so the
  // platform accumulates real data on which ports and borders trade flows
  // through. Optional: blank stays NULL rather than becoming a fake value.
  const [originCountry, setOriginCountry] = useState(() => fromDraft(d, 'originCountry', ''));
  const [loadingPoint,  setLoadingPoint]  = useState(() => fromDraft(d, 'loadingPoint', ''));
  // True while Country of Origin holds a value derived from the port rather
  // than one the user chose — surfaced in the UI, since origin drives duty.
  const [originFromPort, setOriginFromPort] = useState(() => fromDraft(d, 'originFromPort', false));
  const [fob,        setFob]       = useState(() => fromDraft(d, 'fob', ''));
  const [freight,    setFreight]   = useState(() => fromDraft(d, 'freight', ''));
  const [insurancePct, setInsurancePct] = useState(() => fromDraft(d, 'insurancePct', '1'));
  const [hs,         setHs]        = useState(() => fromDraft(d, 'hs', ''));
  const [qty,        setQty]       = useState(() => fromDraft(d, 'qty', '1'));
  const [container,  setContainer] = useState<'20ft' | '40ft' | 'lcl'>(() => fromDraft(d, 'container', '20ft'));
  const [isAir,      setIsAir]     = useState(() => fromDraft(d, 'isAir', false));
  const [containerLots, setContainerLots] = useState<ContainerLot[]>(() => fromDraft(d, 'containerLots', [{ size: '20ft', count: '1' }]));

  // ── Advanced Settings: optional replacements for rates that otherwise come
  // from the tariff table (duty/VAT/RDL/CPF) or statute (wharfage, PID), plus
  // a pinned FX rate. Blank means "use the sourced value" — these are stored
  // as strings so an empty box stays empty rather than becoming 0.
  const [shareNotice, setShareNotice] = useState('');
  const [importNote, setImportNote] = useState(() => fromDraft(d, 'importNote', ''));
  const [importing, setImporting] = useState(false);
  // Currency the uploaded invoice was priced in, and the rate used to bring it
  // to USD. Null means USD (or nothing imported yet).
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [invoiceCurrency, setInvoiceCurrency] = useState<{ code: string; label: string; perUsd: number } | null>(() => fromDraft(d, 'invoiceCurrency', null));
  // Set when a file parsed but its layout was not recognised — the user maps it
  // by hand rather than being told the upload failed.
  const [mapper, setMapper] = useState<{ rows: string[][]; label: string; headerIdx: number | null; roles?: string[] } | null>(null);
  /** Suggested HS codes per row id. Suggestions only — nothing is written to a
   *  line until the user accepts it, because a wrong HS code is a
   *  misclassification, not a typo. */
  const [hsSuggestions, setHsSuggestions] = useState<Record<string, HsSuggestion[]>>(() => fromDraft(d, 'hsSuggestions', {}));
  /** Why the first suggestion on each row is first. */
  const [hsWhy, setHsWhy] = useState<Record<string, HsRecommendation>>(() => fromDraft(d, 'hsWhy', {}));
  /** What this workspace declared before, per row. */
  const [hsMem, setHsMem] = useState<Record<string, HsMemoryHit[]>>(() => fromDraft(d, 'hsMem', {}));
  /** The AI's opinion per row, when it was asked for one. */
  const [aiPicks, setAiPicks] = useState<Record<string, AiPick>>(() => fromDraft(d, 'aiPicks', {}));
  const [aiPicking, setAiPicking] = useState(false);
  const [aiPickError, setAiPickError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  /** The goods total the invoice states for itself, used to check our own sum. */
  const [declaredFob, setDeclaredFob] = useState<{ label: string; usd: number } | null>(() => fromDraft(d, 'declaredFob', null));
  const [showAdvanced, setShowAdvanced] = useState(() => fromDraft(d, 'showAdvanced', false));
  const [ovDuty,     setOvDuty]     = useState(() => fromDraft(d, 'ovDuty', ''));
  const [ovVat,      setOvVat]      = useState(() => fromDraft(d, 'ovVat', ''));
  const [ovRdl,      setOvRdl]      = useState(() => fromDraft(d, 'ovRdl', ''));
  const [ovCpf,      setOvCpf]      = useState(() => fromDraft(d, 'ovCpf', ''));
  const [ovWharfage, setOvWharfage] = useState(() => fromDraft(d, 'ovWharfage', ''));
  const [ovPid,      setOvPid]      = useState(() => fromDraft(d, 'ovPid', ''));
  const [ovFx,       setOvFx]       = useState(() => fromDraft(d, 'ovFx', ''));
  const [cbm,        setCbm]       = useState(() => fromDraft(d, 'cbm', ''));
  const [weightKg,   setWeightKg]  = useState(() => fromDraft(d, 'weightKg', ''));
  const [isUsedVehicle, setIsUsedVehicle] = useState(() => fromDraft(d, 'isUsedVehicle', false));
  const [vehicleAge,    setVehicleAge]    = useState(() => fromDraft(d, 'vehicleAge', ''));
  const [isClogs,       setIsClogs]       = useState(() => fromDraft(d, 'isClogs', false));
  const [itemMode,   setItemMode]  = useState<'single' | 'multi'>(() => fromDraft(d, 'itemMode', 'single'));
  const [multiItems, setMultiItems] = useState<MultiItemRow[]>(() => fromDraft(d, 'multiItems', [newMultiItemRow()]));
  const [multiFreight, setMultiFreight] = useState(() => fromDraft(d, 'multiFreight', ''));
  const [multiInsurance, setMultiInsurance] = useState(() => fromDraft(d, 'multiInsurance', ''));
  const [multiResult, setMultiResult] = useState<MultiItemResult | null>(() => fromDraft(d, 'multiResult', null));
  const [multiError,  setMultiError]  = useState('');
  const [result,     setResult]    = useState<LandedCostResult | null>(() => fromDraft(d, 'result', null));
  const [summary,    setSummary]   = useState('');
  const [aiPending,  setAiPending] = useState(false);
  const [aiError,    setAiError]   = useState('');
  const [error,      setError]     = useState('');
  const [step,       setStep]      = useState<WizardStep>(() => fromDraft(d, 'step', 1));
  const [fxRate,     setFxRate]    = useState<number | null>(null);
  const [hsSelected, setHsSelected] = useState<HsResult | null>(() => fromDraft(d, 'hsSelected', null));
  const [calcLoading, setCalcLoading] = useState(false);
  const [history,    setHistory]   = useState<LandedCostResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const hsCacheRef = useRef<Map<string, HsResult>>(new Map());
  /** Inputs the figures currently on screen were computed from, so an
   *  amendment made after seeing the results can't go unnoticed. Restored
   *  with the draft, so a reload shows the figures it was showing rather than
   *  silently re-pricing against a moved FX rate. */
  const calcSigRef = useRef<string>(d?.calcSig ?? '');
  /** Cargo-row id per result line, in the order the API received them. */
  const calcRowIdsRef = useRef<string[]>(d?.calcRowIds ?? []);
  /** Set when step 4 is being shown something other than a live calculation. */
  const skipNextCalcRef = useRef(false);
  /** Row to scroll to once step 3 has rendered. */
  const [pendingJump, setPendingJump] = useState<string | null>(null);

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
    // Needed to convert an invoice priced in something other than USD. Left
    // empty on failure so the importer refuses rather than assuming USD.
    apiFetch('/v1/customs/fx-rates').then((r: any) => setFxRates(r.rates ?? {})).catch(() => setFxRates({}));
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
  /** A line's FOB value: the invoice's own line total when it had one. */
  function lineFobUsd(r: MultiItemRow): number {
    const amt = parseFloat(r.amount_usd ?? '');
    if (Number.isFinite(amt) && amt > 0) return amt;
    return (parseFloat(r.qty) || 0) * (parseFloat(r.unit_price_usd) || 0);
  }

  // Switched-off rows are left out of the calculation, so they must be left
  // out of the total shown next to it too — otherwise the figure on screen is
  // not the figure being assessed.
  const multiTotalFobUsd = multiItems.reduce((s, r) => r.excluded ? s : s + lineFobUsd(r), 0);

  // Real ICD operators charge different rates for the same service (see
  // /clearos/rate-card) — picking one here scopes the calculator's ICD/C&F
  // defaults to that operator's own rate card instead of the card's generic
  // default. Only operators the tenant has actually priced show up, since
  // picking an un-priced one would just be a no-op.
  const [icdOperatorId, setIcdOperatorId] = useState<string | null>(() => fromDraft(d, 'icdOperatorId', null));

  /**
   * What this workspace has actually paid, per commercial charge head.
   *
   * Shown beside the result so an estimate can be sanity-checked against the
   * tenant's own outturn. Deliberately *not* applied to the figures: the
   * estimate is built from the Rate Card and the tariff, and silently
   * substituting a trailing median would make the report untraceable to any
   * source. It is a second opinion with its sample size attached.
   *
   * Statutory heads never appear here — the API excludes them, because a
   * "learned" duty rate is a fabricated duty rate.
   */
  const [priors, setPriors] = useState<{ head: string; medianTzs: number; sample: number; windowDays: number }[]>([]);
  useEffect(() => {
    apiFetch('/v1/intel/charge-priors')
      .then((r: any) => setPriors(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setPriors([]));   // no history yet is the normal early state
  }, []);
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
          shipment_ref: linkedShipment ? shipmentCacheRef.current.get(linkedShipment.id)?.ref_number : undefined,
          shipment_id: linkedShipment?.id || undefined,
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
          // Saved with the calculation so history is searchable by the
          // people and places it was for, and so amending it produces the
          // next version of the same estimate rather than a stray record.
          customer_name: customerName.trim() || undefined,
          customer_email: customerEmail.trim() || undefined,
          destination: destination.trim() || undefined,
          parent_record_id: amendingFrom?.id,
          parent_version: amendingFrom?.version,
          origin_country: originCountry.trim() || undefined,
          loading_point: loadingPoint.trim() || undefined,
          loading_point_type: loadingPointType,
          ...(isUsedVehicle ? { vehicle_condition: 'used', vehicle_age_years: parseFloat(vehicleAge) || undefined } : {}),
          ...(isClogs ? { is_plastic_rubber_clogs: true } : {}),
        }),
      });
      setResult(r);
      calcSigRef.current = calcSignature;
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
    const sent = multiItems
      // Rows the user switched off — nothing is dropped silently, but an
      // excluded row must not reach the assessment.
      .filter(r => !r.excluded)
      .map(r => ({
        row: r,
        payload: {
          description: r.description,
          hs_code: r.hs_code.trim(),
          qty: parseFloat(r.qty) || 0,
          // Derived at full precision from the line's value, so the assessed FOB
          // is the invoice's own figure rather than the rounded unit price shown
          // on screen.
          unit_price_usd: (parseFloat(r.qty) || 0) > 0 ? lineFobUsd(r) / (parseFloat(r.qty) || 1) : 0,
          rate_overrides: rowRateOverrides(r),
        },
      }))
      .filter(x => x.payload.hs_code && x.payload.qty > 0 && x.payload.unit_price_usd >= 0);
    const rows = sent.map(x => x.payload);
    // Result line N is whichever cargo row survived the filter in position N —
    // the only way back from a figure on the results table to the row that
    // produced it, since excluded and unpriced rows shift every index.
    calcRowIdsRef.current = sent.map(x => x.row.id);
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
          // Saved with the calculation so history is searchable by the
          // people and places it was for, and so amending it produces the
          // next version of the same estimate rather than a stray record.
          customer_name: customerName.trim() || undefined,
          customer_email: customerEmail.trim() || undefined,
          destination: destination.trim() || undefined,
          shipment_ref: linkedShipment ? shipmentCacheRef.current.get(linkedShipment.id)?.ref_number : undefined,
          shipment_id: linkedShipment?.id || undefined,
          parent_record_id: amendingFrom?.id,
          parent_version: amendingFrom?.version,
        }),
      });
      setMultiResult(r);
      calcSigRef.current = calcSignature;
    } catch (e: any) {
      setMultiError(e.message ?? 'Calculation failed');
    }
    setCalcLoading(false);
  }

  /**
   * Everything the calculation endpoints are actually sent, as one string.
   *
   * Results used to be computed once and then kept until New Calculation
   * cleared them, so going back to fix a quantity or an HS code and returning
   * to Results redisplayed the figures from *before* the edit — the old
   * numbers, silently, with no indication they were stale. The only reliable
   * way to see an amendment was to start the whole invoice again. Comparing
   * this against the signature the displayed result was computed from is what
   * makes stepping back a real amendment.
   */
  const calcSignature = JSON.stringify(
    itemMode === 'single'
      ? ['single', hs, effectiveCif(), qty, mode, container, numContainersVal, containerPayload,
         buildRateOverrides(), fxOverrideVal, cbmVal, weightKgVal, fobVal, priceInclFreight,
         priceInclInsurance, freightVal, insuranceVal, priceBasis, originCountry.trim(),
         loadingPoint.trim(), loadingPointType, isUsedVehicle, vehicleAge, isClogs]
      : ['multi', multiItems.filter(r => !r.excluded).map(r =>
           [r.description, r.hs_code.trim(), r.qty, r.unit_price_usd, r.amount_usd ?? '', rowRateOverrides(r)]),
         multiFreight, multiInsurance, mode, container, numContainersVal, containerPayload,
         buildRateOverrides(), fxOverrideVal, cbmVal, weightKgVal],
  );

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
    if (skipNextCalcRef.current) { skipNextCalcRef.current = false; return; }
    // Recalculate whenever the inputs no longer match what the figures on
    // screen were computed from — that is what makes Back an amendment rather
    // than a way to look at a stale answer.
    const stale = calcSigRef.current !== calcSignature;
    if (itemMode === 'single' && (!result || stale)) calculate();
    if (itemMode === 'multi' && (!multiResult || stale)) calculateMulti();
  }, [step]);

  /**
   * Keep the draft current. Deliberately not debounced: a reload can happen at
   * any keystroke, and writing a few hundred KB to localStorage is cheaper
   * than re-keying an invoice. `calcSignature` is in the dependency list, so
   * every input that can change a figure re-triggers this by construction —
   * a new field added to the calculation cannot be forgotten here.
   */
  useEffect(() => {
    writeDraft({
      customerName, customerEmail, customerPhone, destination, linkedShipment,
      cif, priceInclFreight, priceInclInsurance, originCountry, loadingPoint, originFromPort,
      fob, freight, insurancePct, hs, qty, container, isAir, containerLots,
      importNote, invoiceCurrency, hsSuggestions, hsWhy, hsMem, aiPicks, declaredFob, showAdvanced,
      ovDuty, ovVat, ovRdl, ovCpf, ovWharfage, ovPid, ovFx,
      cbm, weightKg, isUsedVehicle, vehicleAge, isClogs, icdOperatorId,
      itemMode, multiItems, multiFreight, multiInsurance,
      result, multiResult, hsSelected, step,
      calcSig: calcSigRef.current, calcRowIds: calcRowIdsRef.current,
    });
  }, [
    customerName, customerEmail, customerPhone, destination, linkedShipment,
    cif, priceInclFreight, priceInclInsurance, originCountry, loadingPoint, originFromPort,
    fob, freight, insurancePct, hs, qty, container, isAir, containerLots,
    importNote, invoiceCurrency, hsSuggestions, hsWhy, hsMem, aiPicks, declaredFob, showAdvanced,
    ovDuty, ovVat, ovRdl, ovCpf, ovWharfage, ovPid, ovFx,
    cbm, weightKg, isUsedVehicle, vehicleAge, isClogs, icdOperatorId,
    itemMode, multiItems, multiFreight, multiInsurance,
    result, multiResult, hsSelected, step, calcSignature,
  ]);

  /**
   * "Customise" from the history page: `?from=<record id>` loads that saved
   * calculation's inputs back into the wizard.
   *
   * The result is deliberately not restored — the point of amending is to
   * recalculate, and showing the old figures next to edited inputs is the
   * stale-result trap this page already had once. `amendingFrom` is what makes
   * the next calculation save as the next *version* of that estimate rather
   * than overwriting the figures a customer was already quoted.
   */
  const [amendingFrom, setAmendingFrom] = useState<{ id: string; version: number; title: string } | null>(null);
  useEffect(() => {
    const from = urlParams.get('from');
    if (!from || amendingFrom?.id === from) return;
    let cancelled = false;
    (async () => {
      try {
        const rec: any = await apiFetch(`/v1/customs/landed-cost/history/${from}`);
        if (cancelled) return;
        const inputs = rec?.payload?.inputs;
        if (!inputs) {
          setMultiError('That saved calculation has no stored inputs, so it cannot be amended. Its totals are still on record.');
          return;
        }
        applySavedInputs(rec, inputs);
        setAmendingFrom({ id: rec.id, version: rec.version ?? 1, title: rec.title || rec.description || 'saved estimate' });
        setStep(3);
      } catch (e: any) {
        if (!cancelled) setMultiError(e?.message ?? 'That saved calculation could not be loaded.');
      }
    })();
    return () => { cancelled = true; };
  }, [urlParams]);

  /** Restores a saved calculation's inputs into the wizard's own state. */
  function applySavedInputs(rec: any, inputs: any) {
    setCustomerName(rec.customer_name ?? '');
    setCustomerEmail(rec.customer_email ?? '');
    setDestination(rec.destination ?? 'Dar es Salaam, Tanzania');
    setOriginCountry(inputs.origin_country ?? '');
    setLoadingPoint(inputs.loading_point ?? '');
    if (inputs.mode) { setIsAir(inputs.mode === 'air'); }
    if (inputs.container) setContainer(inputs.container);
    if (Array.isArray(inputs.containers) && inputs.containers.length) {
      setContainerLots(inputs.containers.map((l: any) => ({ size: l.size, count: String(l.count) })));
    }
    setCbm(inputs.cbm ? String(inputs.cbm) : '');
    setWeightKg(inputs.weight_kg ? String(inputs.weight_kg) : '');
    if (Array.isArray(inputs.items)) {
      setItemMode('multi');
      setMultiItems(inputs.items.map((it: any) => ({
        ...newMultiItemRow(),
        description: it.description ?? '',
        hs_code: it.hs_code ?? '',
        qty: String(it.qty ?? ''),
        unit_price_usd: String(it.unit_price_usd ?? ''),
      })));
      setMultiFreight(inputs.freight_usd ? String(inputs.freight_usd) : '');
      setMultiInsurance(inputs.insurance_usd != null ? String(inputs.insurance_usd) : '');
      setMultiResult(null);
    } else {
      setItemMode('single');
      setHs(inputs.hs_code ?? '');
      setQty(String(inputs.qty ?? '1'));
      setFob(inputs.fob_usd ? String(inputs.fob_usd) : '');
      setFreight(inputs.freight_usd ? String(inputs.freight_usd) : '');
      setCif(inputs.cif_usd ? String(inputs.cif_usd) : '');
      setResult(null);
    }
    // Amending starts from unsaved figures by definition.
    calcSigRef.current = '';
  }

  /** Jumping to a line has to wait for step 3 to actually render it. */
  useEffect(() => {
    if (step !== 3 || !pendingJump) return;
    const id = pendingJump;
    setPendingJump(null);
    requestAnimationFrame(() => jumpToRow(id));
  }, [step, pendingJump]);

  /** Take the user back to the cargo line behind a figure on the results
   *  table, rather than making them find it in a 200-row list. */
  function amendLine(itemIndex: number) {
    setPendingJump(calcRowIdsRef.current[itemIndex] ?? null);
    setStep(3);
  }

  // ── Multi-item row management ────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<MultiItemRow>) {
    // Typing a quantity or a price is a decision about what this line is
    // worth, so it supersedes the amount carried over from the invoice.
    const supersedes = ('qty' in patch || 'unit_price_usd' in patch) && !('amount_usd' in patch);
    setMultiItems(rows => rows.map(r =>
      r.id === id ? { ...r, ...patch, ...(supersedes ? { amount_usd: undefined } : {}) } : r));
  }
  function addRow() { setMultiItems(rows => rows.length >= MAX_CARGO_ROWS ? rows : [...rows, newMultiItemRow()]); }
  function removeRow(id: string) { setMultiItems(rows => rows.length > 1 ? rows.filter(r => r.id !== id) : rows); }

  function handleRowHsChange(row: MultiItemRow, item: PickerItem | null) {
    if (!item) { updateRow(row.id, { hs_code: '' }); return; }
    // Searched for and chosen by hand — the strongest correction signal
    // there is, since the user rejected everything that was offered.
    recordClassification([{ rowId: row.id, code: item.id, source: 'manual' }]);
    const cached = hsCacheRef.current.get(item.id);
    updateRow(row.id, { hs_code: item.id, description: row.description || cached?.description || '' });
  }

  /**
   * The country a loading point sits in, read off the suggestion's own label.
   * Both lists share one shape — `… , Country (CODE)` — so the country is the
   * last comma-separated segment before the trailing UN/LOCODE or IATA code.
   * `Singapore (SGSIN)` has no comma and yields "Singapore", which is right.
   */
  function countryFromLoadingPoint(label: string): string | null {
    const base = label.replace(/\s*\([A-Z]{3,5}\)\s*$/, '').trim();
    if (!base) return null;
    const tail = base.includes(',') ? base.slice(base.lastIndexOf(',') + 1).trim() : base;
    return tail || null;
  }

  /**
   * Keeps Country of Origin in step with the loading point.
   *
   * A country the user picked is never touched. A country this function filled
   * earlier always follows the port — including being cleared when the new port
   * resolves to nothing, since a stale "China" under a Rotterdam sailing is
   * worse than an empty field the user has to complete.
   *
   * The name is confirmed against reference_countries before it is stored, so
   * the value stays canonical rather than a string scraped off a label.
   */
  async function autofillOriginFromPort(portLabel: string) {
    if (originCountry.trim() && !originFromPort) return;   // user's own choice

    const guess = countryFromLoadingPoint(portLabel);
    const clear = () => { if (originFromPort) { setOriginCountry(''); setOriginFromPort(false); } };
    if (!guess) { clear(); return; }

    try {
      const matches = await searchCountries(guess);
      const exact = matches.find(m => String(m.id).toLowerCase() === guess.toLowerCase());
      if (!exact) { clear(); return; }
      setOriginCountry(String(exact.id));
      setOriginFromPort(true);
    } catch { clear(); }
  }

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

  /**
   * Splits a whole CSV file into records.
   *
   * A newline inside a quoted field is part of the value, not a record break,
   * so the file cannot be split into lines first. Doing that tore a real
   * invoice row — `"2 steering cylinders, 2 boom cylinders,\n1 forearm
   * cylinder"` — into two: the first half kept the description but lost its
   * quantity and price columns, and the second half became a goods line that
   * does not exist on the invoice. Suppliers wrap long cells and put their
   * multi-line address in one cell, so this is normal, not malformed input.
   */
  function parseCsvGrid(text: string): string[][] {
    const rows: string[][] = [];
    let cells: string[] = [], cur = '', inQuotes = false;
    // A wrapped cell keeps its newline as part of the value; collapse it to a
    // space so "…boom cylinders, and\n1 forearm cylinder" reads as one phrase
    // rather than running together as "and1 forearm cylinder".
    const endCell = () => { cells.push(cur.replace(/\s*\n\s*/g, ' ').trim()); cur = ''; };
    const endRow  = () => { endCell(); rows.push(cells); cells = []; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;                                   // newlines land here
      } else if (c === '"') inQuotes = true;
      else if (c === ',') endCell();
      else if (c === '\n') endRow();
      else if (c !== '\r') cur += c;
    }
    if (cur || cells.length) endRow();
    return rows;
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

  /**
   * The currency an invoice's money columns are written in.
   *
   * This exists because the calculator's inputs are USD. A South African
   * invoice quoting "R 8,840.00" parsed to 8840 and was then treated as
   * $8,840 — overstating the customs value, and therefore the duty, by the
   * ZAR/USD rate (about 16x). Silence was the bug: the figures looked
   * plausible enough to sign.
   *
   * Symbols first (they are unambiguous in context), then ISO codes. "$" is
   * deliberately last among symbols so "R" wins on a Rand invoice.
   */
  const CURRENCY_MARKERS: { code: string; label: string; test: RegExp }[] = [
    { code: 'ZAR', label: 'South African Rand', test: /(^|\s)R\s?[\d.,]/ },
    { code: 'EUR', label: 'Euro',               test: /€/ },
    { code: 'GBP', label: 'Pound Sterling',     test: /£/ },
    { code: 'JPY', label: 'Japanese Yen',       test: /¥/ },
    { code: 'INR', label: 'Indian Rupee',       test: /₹/ },
    { code: 'USD', label: 'US Dollar',          test: /\$/ },
    { code: 'ZAR', label: 'South African Rand', test: /\bZAR\b/i },
    { code: 'EUR', label: 'Euro',               test: /\bEUR\b/i },
    { code: 'GBP', label: 'Pound Sterling',     test: /\bGBP\b/i },
    { code: 'KES', label: 'Kenyan Shilling',    test: /\b(KES|KSh)\b/i },
    { code: 'TZS', label: 'Tanzanian Shilling', test: /\b(TZS|TSh)\b/i },
    { code: 'AED', label: 'UAE Dirham',         test: /\bAED\b/i },
    { code: 'CNY', label: 'Chinese Yuan',       test: /\b(CNY|RMB)\b/i },
    { code: 'USD', label: 'US Dollar',          test: /\bUSD\b/i },
  ];

  /** Whichever currency marker appears most across the money cells. */
  function detectCurrency(samples: string[]): { code: string; label: string } | null {
    const tally = new Map<string, { label: string; n: number }>();
    for (const raw of samples) {
      const hit = CURRENCY_MARKERS.find(m => m.test.test(raw));
      if (!hit) continue;
      const prev = tally.get(hit.code);
      tally.set(hit.code, { label: hit.label, n: (prev?.n ?? 0) + 1 });
    }
    const best = [...tally.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return best ? { code: best[0], label: best[1].label } : null;
  }

  /** Rows that are invoice furniture rather than goods. Real invoices carry
   *  subtotals, freight lines and bank details that must never become cargo. */
  function isNonCargoRow(desc: string): boolean {
    return /^(sub[\s-]?total|total|grand\s*total|amount\s*due|balance|freight|shipping|insurance|discount|vat|tax|packing|handling|bank|swift|iban|terms|remarks?|notes?)/i
      .test(desc.trim());
  }

  /**
   * Trade terms that mark a summary line, but only trustworthy on a row that
   * carries no quantity.
   *
   * The anchored list above only catches these at the start of the cell, so
   * "SEA FREIGHT CHARGES" and "CIF DAR ES SALAAM" were imported as goods and
   * added their own totals back into the cargo value. Matching anywhere is not
   * safe by itself — a "Total station" is a real surveying instrument — so the
   * row must also have no quantity, which no genuine goods line lacks.
   */
  function isSummaryTerm(desc: string): boolean {
    return /\b(sub-?total|totals?|fob|cif|cfr|c\s*&\s*f|exw|ex\s*works|freight|insurance|charges?|balance|amount\s*due)\b/i
      .test(desc.trim());
  }

  interface InvoiceColumns { desc: number; qty: number; price: number; amt: number; hs: number; model: number; unit: number }

  function locateColumns(cells: string[]): InvoiceColumns {
    const header = cells.map(h => h.toLowerCase().trim());

    /**
     * Scored rather than first-match. A real invoice had these two headers:
     *
     *   "Unit of measure(i.e pcs, rolls etc)"   ← col 2
     *   "Quantity"                              ← col 5
     *
     * Plain `includes` matched "pcs" inside the first one and mapped Quantity
     * to the dimensions column, so "2000x100x100V" became a quantity of
     * 2,000,100,100. An exact header beats a prefix beats a mention, and a
     * longer matching term beats a shorter one.
     */
    const find = (...pats: string[]) => {
      let best = -1, bestScore = 0;
      header.forEach((h, i) => {
        if (!h) return;
        let score = 0;
        for (const p of pats) {
          const s = h === p ? 1000 : h.startsWith(p) ? 500 : h.includes(p) ? 100 : 0;
          if (s) score = Math.max(score, s + p.length);
        }
        if (score > bestScore) { bestScore = score; best = i; }
      });
      return best;
    };
    return {
      desc:  find('description', 'product', 'item', 'goods', 'particular', 'commodity', 'article'),
      qty:   find('qty', 'quantity', 'pcs', 'units', 'pieces'),
      price: find('unit price', 'unit cost', 'unit value', 'u/price', 'rate', 'price'),
      amt:   find('amount', 'line total', 'total value', 'extended', 'value', 'total'),
      // Substring 'hs' alone false-matches ordinary words, so an exact 'hs'
      // header is allowed but anything longer has to spell the column out.
      hs:    header.findIndex(h => h === 'hs' || ['hs code', 'hscode', 'hs-code', 'hs no', 'h.s', 'tariff'].some(p => h.includes(p))),
      // Real invoices carry these two constantly — "MODEL: M6x70", "unit: SET".
      // Model goes onto the description (customs needs the goods identified);
      // unit fills the row's existing unit-of-measure field.
      model: find('model', 'part no', 'part number', 'article no', 'spec'),
      unit:  find('unit of measure', 'uom', 'unit type', 'pack'),
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
   *  to the same rules and neither can drift away from the other.
   *
   *  `override` comes from the manual mapper. Auto-detection recognises the
   *  common header wordings, but real supplier invoices are endlessly varied —
   *  another language, a merged title row, "Art.-Nr." instead of "Description".
   *  Rather than failing those outright, the caller falls back to showing the
   *  sheet and letting a human point at the header row. */
  function importInvoiceGrid(
    grid: string[][],
    sourceLabel: string,
    override?: { headerIdx: number; col: InvoiceColumns },
  ) {
    const headerIdx = override ? override.headerIdx : findHeaderRow(grid);
    if (headerIdx < 0) {
      setMultiError(`Could not find the line-item table in ${sourceLabel}. It needs a header row with a description column and either a unit price or an amount column — download the template to see the layout.`);
      return;
    }
    const col = override ? override.col : locateColumns(grid[headerIdx]);

    // Read the money columns' currency before any value is trusted as USD.
    const moneySamples: string[] = [];
    for (const cells of grid.slice(headerIdx + 1)) {
      if (col.price >= 0) moneySamples.push(cells[col.price] ?? '');
      if (col.amt >= 0) moneySamples.push(cells[col.amt] ?? '');
    }
    const detected = detectCurrency(moneySamples);
    const foreign = !!detected && detected.code !== 'USD';
    const rate = foreign ? (fxRates[detected!.code] ?? null) : null;
    // A foreign currency with no rate must not be quietly treated as USD —
    // that is the 16x overstatement this whole block exists to prevent.
    if (foreign && !rate) {
      setMultiError(
        `This invoice is priced in ${detected!.label} (${detected!.code}), but no live exchange rate is available, ` +
        `so the values cannot be converted to USD. Try again shortly, or convert the invoice before uploading.`,
      );
      return;
    }
    const toUsd = (n: number) => (rate ? n / rate : n);
    setInvoiceCurrency(foreign && rate ? { ...detected!, perUsd: rate } : null);

    let excludedCount = 0, noValueCount = 0, missingHs = 0, shortHs = 0, truncated = false, conflictCount = 0;
    const money2 = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    // Money sitting on rows the importer treats as invoice furniture. The
    // supplier prints its own FOB/CIF totals there, and that is the one figure
    // in the file we can check our own arithmetic against.
    const declaredTotals: { label: string; usd: number }[] = [];
    const noValueExamples: string[] = [];
    let runningTotal = 0;
    const rows: MultiItemRow[] = [];
    for (const cells of grid.slice(headerIdx + 1)) {
      const description = (cells[col.desc] ?? '').trim();
      if (!description) continue;
      const looksNonCargo = isNonCargoRow(description);

      const qty = col.qty >= 0 ? parseMoneyCell(cells[col.qty] ?? '') : NaN;
      const unit = col.price >= 0 ? parseMoneyCell(cells[col.price] ?? '') : NaN;
      const amount = col.amt >= 0 ? parseMoneyCell(cells[col.amt] ?? '') : NaN;

      const qtyVal = Number.isFinite(qty) && qty > 0 ? qty : 1;
      // The line amount wins over the printed unit price.
      //
      // The amount is what the supplier is charging and what customs values;
      // the unit price is usually that amount divided down and rounded for
      // display. Recomputing qty x unit price therefore cannot reproduce the
      // invoice: a line billed at USD 2.23 for 200 pieces prints as 0.01 and
      // multiplies back to 2.00, understating it by 10%. Deriving the unit
      // price from the amount instead makes every line total match the
      // document it came from.
      const hasAmount = Number.isFinite(amount) && amount > 0;
      const hasUnit = Number.isFinite(unit) && unit > 0;
      const unitVal = hasAmount ? amount / qtyVal : (hasUnit ? unit : NaN);
      // Both present and materially apart is worth surfacing rather than
      // silently resolving — it can equally mean a mis-mapped column.
      const priceConflict = hasAmount && hasUnit
        && Math.abs(qtyVal * unit - amount) > Math.max(0.02, amount * 0.02);
      // No price is not a reason to discard a line. Free-of-charge goods carry
      // a real HS code and still have to be declared — "Chalk Markers, qty 1,
      // R 0.00, 9609.00.00" is cargo. It comes in at zero and gets flagged.
      const noValue = !Number.isFinite(unitVal) || unitVal <= 0;
      if (noValue) {
        noValueCount++;
        if (noValueExamples.length < 4) noValueExamples.push(description.slice(0, 42));
      }
      const priceUsd = noValue ? 0 : toUsd(unitVal);

      // The word list is English-only, so a total labelled "Gesamt" or "总计"
      // slips through. Structurally a total carries no quantity and its value
      // is the sum of the lines above it — that holds in any language.
      const lineTotal = noValue ? 0 : qtyVal * unitVal;
      const hasQty = Number.isFinite(qty) && qty > 0;
      const looksLikeTotal = !hasQty && !noValue && (
        (rows.length >= 2 && runningTotal > 0 && Math.abs(lineTotal - runningTotal) <= runningTotal * 0.005)
        || isSummaryTerm(description)
      );
      runningTotal += lineTotal;

      if (rows.length >= MAX_CARGO_ROWS) { truncated = true; break; }

      const hs = col.hs >= 0 ? (cells[col.hs] ?? '').replace(/\s/g, '') : '';
      if (!hs) missingHs++;
      else if (hs.replace(/\D/g, '').length < 8) shortHs++;

      // Only invoice furniture is excluded by default, and even then the row
      // stays visible with a one-click way back in.
      const excluded = looksNonCargo || looksLikeTotal;
      if (excluded) {
        excludedCount++;
        const stated = Number.isFinite(amount) && amount > 0 ? amount
          : (Number.isFinite(unit) && unit > 0 ? unit : NaN);
        if (Number.isFinite(stated)) declaredTotals.push({ label: description.slice(0, 48), usd: toUsd(stated) });
      }
      const flag = looksNonCargo || looksLikeTotal
        ? 'Looks like a total, freight or notes row rather than goods.'
        : noValue
          ? 'The invoice shows no price for this line. Set one, or leave it at zero if it is free of charge.'
          : priceConflict
            ? `The invoice's own line total (${money2(amount)}) does not match its quantity × unit price (${money2(qtyVal * unit)}). The line total was used — check the columns are mapped correctly.`
            : undefined;
      if (priceConflict) conflictCount++;

      // A model or part number identifies the goods, which is exactly what a
      // customs description is for — "Hex head bolts" alone does not
      // distinguish M6x70 from M10x70. Appended rather than dropped, and only
      // when it is not already part of the description.
      const model = col.model >= 0 ? (cells[col.model] ?? '').trim() : '';
      const fullDescription = model && !description.toLowerCase().includes(model.toLowerCase())
        ? `${description} — ${model}`
        : description;

      const uom = col.unit >= 0 ? (cells[col.unit] ?? '').trim() : '';

      rows.push({
        ...newMultiItemRow(),
        description: fullDescription,
        hs_code: hs,
        qty: String(qtyVal),
        unit: uom || 'unit',
        // Shown to 3 decimals; the exact value rides on amount_usd.
        unit_price_usd: String(Number(priceUsd.toFixed(3))),
        amount_usd: hasAmount ? String(toUsd(amount)) : undefined,
        excluded, flag,
      });
    }

    if (rows.length === 0) { setMultiError(`No rows with a description were found in ${sourceLabel} below the header.`); return; }
    setMultiItems(rows);

    // Reconcile against the invoice's own stated goods total.
    //
    // Every defect this importer has had — a row torn in half by a newline
    // inside a quoted cell, a column mapped to the wrong header, a unit price
    // multiplied back instead of the line amount being used — changes the sum
    // of the lines. The supplier already printed that sum. Comparing the two
    // catches the whole class at once, including failures not yet seen, so a
    // wrong figure cannot reach a duty calculation silently.
    // Held as the declared figure only; the comparison is recomputed live from
    // the rows, so it keeps checking as the user corrects lines by hand.
    setDeclaredFob(declaredTotals
      .filter(t => /\b(fob|total|sub-?total|goods|amount)\b/i.test(t.label) && !/freight|insurance|cif|c&f|cfr/i.test(t.label))
      .sort((a, b) => b.usd - a.usd)[0] ?? null);
    // Say plainly what happened, including what still needs a human.
    const notes = [
      `Imported ${rows.length} line${rows.length === 1 ? '' : 's'} from ${sourceLabel}.`,
      foreign && rate
        ? `Prices were in ${detected!.label} (${detected!.code}) — converted to USD at ${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${detected!.code} = 1 USD.`
        : null,
      truncated ? `Only the first ${MAX_CARGO_ROWS} were taken — this calculator caps a consignment at ${MAX_CARGO_ROWS} lines.` : null,
      missingHs > 0 ? `${missingHs} still need an HS code — add them below before calculating.` : null,
      // Excel stores a code typed as a number, so 6907.21.00 comes back as
      // 6907.21 and would be classified against the wrong subheading.
      shortHs > 0 ? `${shortHs} HS code${shortHs === 1 ? ' is' : 's are'} shorter than 8 digits — Excel drops trailing zeros from codes entered as numbers. Check them before calculating.` : null,
      excludedCount > 0 ? `${excludedCount} row${excludedCount === 1 ? ' looks' : 's look'} like totals or freight and ${excludedCount === 1 ? 'is' : 'are'} switched off below — switch ${excludedCount === 1 ? 'it' : 'them'} back on if ${excludedCount === 1 ? 'it belongs' : 'they belong'} on the declaration.` : null,
      conflictCount > 0 ? `On ${conflictCount} line${conflictCount === 1 ? '' : 's'} the quantity × unit price disagrees with the line total the invoice prints — the invoice's own total was used, since that is the amount being charged.` : null,
      noValueCount > 0
        ? `${noValueCount} line${noValueCount === 1 ? ' has' : 's have'} no price on the invoice and came in at zero` +
          (noValueExamples.length ? ` — e.g. ${noValueExamples.map(e => `"${e}"`).join(', ')}. Free-of-charge goods still have to be declared, so they are kept.` : '.')
        : null,
    ].filter(Boolean).join(' ');
    setImportNote(notes);
    setMultiError('');
  }

  /** base64 without the `data:…;base64,` prefix the API does not want. */
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
      r.onerror = () => reject(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
  }

  /**
   * PDFs, photos and scans go through OCR rather than a parser.
   *
   * The extracted lines always land in the mapper for confirmation, never
   * straight into the calculation: OCR misreads quantities and prices, and an
   * HS code it invented would be a misclassification. `allow_simulated: false`
   * makes the API refuse rather than hand back its demo document — fabricated
   * cargo must never reach a duty figure.
   */
  async function extractWithOcr(file: File) {
    const mediaType = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg');
    const res: any = await apiFetch('/v1/ocr/scan', {
      method: 'POST',
      body: JSON.stringify({ image_base64: await fileToBase64(file), media_type: mediaType, allow_simulated: false }),
    });

    const lines: any[] = res?.result?.hs_lines ?? [];
    const usable = lines.filter(l => (l.description ?? '').trim());
    if (usable.length === 0) {
      setMultiError(
        `No line items could be read from that ${/pdf$/i.test(mediaType) ? 'PDF' : 'image'}. ` +
        `If it is a scan, a sharper or straighter photo usually helps — or upload the supplier's Excel/CSV instead.`,
      );
      return;
    }

    // Presented as a grid so it goes through exactly the same confirmation and
    // column-mapping path as a spreadsheet — one review step, not two.
    const header = ['Description', 'Qty', 'Unit Price', 'Amount', 'HS Code'];
    const rows: string[][] = [header, ...usable.map(l => {
      const qty = String(l.quantity ?? '').trim();
      const value = String(l.value_usd ?? '').trim();
      const q = parseFloat(qty) || 0;
      const v = parseFloat(value) || 0;
      return [
        String(l.description ?? '').trim(),
        qty,
        // OCR gives a line total, not a unit price — derive it rather than
        // leaving the row valueless.
        q > 0 && v > 0 ? String(Number((v / q).toFixed(4))) : '',
        value,
        String(l.hs_code ?? '').trim(),
      ];
    })];

    setMapper({ rows, label: `that ${/pdf$/i.test(mediaType) ? 'PDF' : 'image'}`, headerIdx: 0 });
    setImportNote(
      `Read ${usable.length} line${usable.length === 1 ? '' : 's'} from the document. ` +
      `Check every figure and HS code before importing — OCR misreads, and a wrong HS code is a misclassification.`,
    );
  }

  async function handleInvoiceUpload(file: File) {
    setImporting(true);
    setImportNote('');
    setMultiError('');
    setMapper(null);
    try {
      if (/\.(pdf|png|jpe?g|webp|gif)$/i.test(file.name)) {
        await extractWithOcr(file);
      } else if (/\.(xlsx|xlsm)$/i.test(file.name)) {
        const sheets = await readXlsxSheets(file);
        const candidates = sheets
          .map(s => ({ sheet: s, headerIdx: findHeaderRow(s.rows) }))
          .map(c => ({ ...c, lines: c.headerIdx >= 0 ? countCargoRows(c.sheet.rows, c.headerIdx) : 0 }))
          .filter(c => c.lines > 0)
          .sort((a, b) => b.lines - a.lines);

        if (candidates.length === 0) {
          // Auto-detection failed. If the file actually contains data, hand it
          // to the mapper instead of refusing — the layout is unfamiliar, not
          // unusable. Only a genuinely empty parse is a dead end.
          const richest = sheets
            .map(s => ({ s, filled: s.rows.filter(r => r.some(c => c.trim())).length }))
            .sort((a, b) => b.filled - a.filled)[0];
          if (richest && richest.filled > 0) {
            setMapper({
              rows: richest.s.rows,
              label: sheets.length > 1 ? `sheet "${richest.s.name}"` : 'that workbook',
              headerIdx: null,
            });
            return;
          }
          setMultiError(
            `That workbook has no data this reader could see (${sheets.map(s => `${s.name}: ${s.rows.length} rows`).join(', ')}). ` +
            `If it was exported from Google Sheets or Numbers, re-save it as Excel (.xlsx) or CSV.`,
          );
          return;
        }
        importInvoiceGrid(candidates[0].sheet.rows, sheets.length > 1 ? `sheet "${candidates[0].sheet.name}"` : 'that workbook');
      } else {
        const text = await file.text();
        // Drop the '#' guidance rows the template ships with; blank lines are
        // kept so row positions still line up with what the user sees.
        const grid = parseCsvGrid(text).filter(r => !(r[0] ?? '').trim().startsWith('#'));
        if (findHeaderRow(grid) < 0 && grid.some(r => r.some(c => c.trim()))) {
          setMapper({ rows: grid, label: 'that CSV', headerIdx: null });
          return;
        }
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
    // A recalled entry is the stored result, not a fresh assessment of the
    // form's current contents — don't let the step-4 effect immediately
    // recalculate over it just because the form no longer matches.
    skipNextCalcRef.current = true;
    setStep(4);
    setHs(h.hs_code);
    setCif(String(h.cif_usd));
    setSummary('');
    setAiError('');
  }

  function newCalculation() {
    setResult(null);
    setMultiResult(null);
    calcSigRef.current = '';
    calcRowIdsRef.current = [];
    // Suggestions are keyed by row id, and every row is about to be replaced.
    setHsSuggestions({});
    setHsWhy({});
    setHsMem({});
    setAiPicks({});
    setAiPickError('');
    // Starting over is the one place a saved draft should not come back.
    clearDraft();
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
      // `container` deliberately keeps its FCL/LCL value while Airfreight is
      // selected, so switching back to sea restores the earlier choice. That
      // meant an air shipment was being told "LCL is charged per CBM".
      if (!isAir && container === 'lcl' && cbmVal <= 0) return 'LCL is charged per CBM — enter the total volume.';
      if (isAir && cbmVal <= 0 && weightKgVal <= 0) return 'Airfreight bills on chargeable weight — enter a volume or a gross weight.';
      return null;
    }
    if (s === 3) {
      if (itemMode === 'single') {
        if (!hs.trim()) return 'Select an HS code for the cargo.';
        if (effectiveCif() <= 0) return 'Enter a CIF value (or FOB + freight) greater than zero.';
        return null;
      }
      const usable = multiItems.filter(r => !r.excluded && r.hs_code.trim() && (parseFloat(r.qty) || 0) > 0);
      if (usable.length === 0) return 'Add at least one line with an HS code, quantity and unit price.';
      return null;
    }
    return null;
  }
  const stepError = validateStep(step);

  const navRow = (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      {stepError && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--r)', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="var(--red)" /> {stepError}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {step > 1
          ? <button type="button" onClick={() => setStep(s => (s - 1) as any)}
              style={{ height: 'var(--ctl-h)', padding: '0 22px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="arrowLeft" size={14} /> Back
            </button>
          : <div />
        }
        {step < 4
          ? <button type="button" disabled={!!stepError} onClick={() => { if (!validateStep(step)) setStep(s => (s + 1) as any); }}
              style={{ height: 'var(--ctl-h)', padding: '0 28px', borderRadius: 'var(--r-sm)', border: 'none', background: stepError ? 'var(--border)' : 'hsl(var(--primary))', color: stepError ? 'var(--ink3)' : 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 14, cursor: stepError ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: stepError ? 'none' : '0 4px 16px var(--teal-m)' }}>
              Continue <Icon name="arrowRight" size={14} color={stepError ? 'var(--ink3)' : '#fff'} />
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
      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Upload the supplier invoice — Excel, CSV, PDF or a photo. Or add each line by hand.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={downloadCsvTemplate} className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="download" size={13} /> Template
        </button>
        <label className="btn btn-secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: importing ? 'progress' : 'pointer', opacity: importing ? 0.55 : 1 }}>
          <Icon name="upload" size={13} /> {importing ? 'Reading…' : 'Upload Invoice'}
          <input type="file" accept=".csv,.xlsx,.xlsm,.pdf,.png,.jpg,.jpeg,.webp" disabled={importing} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleInvoiceUpload(f); e.target.value = ''; }} />
        </label>
      </div>
    </div>
  );

  const importFeedback = (
    <>
      {importNote && (
        <div style={{ marginTop: 14, padding: '11px 14px', borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <Icon name="info" size={15} color="var(--teal)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{importNote}</div>
        </div>
      )}
      {multiError && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--red)' }}>
          {multiError}
        </div>
      )}
    </>
  );

  /**
   * Manual column mapping, shown only when auto-detection could not read a
   * file that clearly contains data. Two steps: point at the header row, then
   * confirm which column is which. Supplier invoices come in every layout and
   * language there is; refusing the unfamiliar ones outright made the upload
   * feature useless exactly when it was needed most.
   */
  const invoiceMapper = (() => {
    if (!mapper) return null;
    // The preview is a sample for choosing the header row, not the import —
    // showing 14 of 260 with no indication of that read as "only 14 imported".
    const PREVIEW_ROWS = 30;
    const width = Math.max(...mapper.rows.slice(0, 40).map(r => r.length), 1);
    const auto = mapper.headerIdx != null ? locateColumns(mapper.rows[mapper.headerIdx] ?? []) : null;
    const roleFor = (c: number): string => {
      if (!auto) return '';
      if (c === auto.desc) return 'desc';
      if (c === auto.qty) return 'qty';
      if (c === auto.price) return 'price';
      if (c === auto.amt) return 'amt';
      if (c === auto.hs) return 'hs';
      if (c === auto.model) return 'model';
      if (c === auto.unit) return 'unit';
      return '';
    };
    // Seeded from whatever auto-detection did manage to recognise, so a
    // partially-understood header still saves the user most of the work.
    const roles = mapper.headerIdx == null
      ? []
      : mapper.roles ?? Array.from({ length: width }, (_, c) => roleFor(c));
    const setRole = (c: number, v: string) => {
      const next = [...roles];
      // A role belongs to exactly one column — clear it from wherever it was.
      if (v) next.forEach((r, i) => { if (r === v && i !== c) next[i] = ''; });
      next[c] = v;
      setMapper(m => (m ? { ...m, roles: next } : m));
    };
    const colOf = (role: string) => roles.findIndex(r => r === role);
    const ready = mapper.headerIdx != null && colOf('desc') >= 0 && (colOf('price') >= 0 || colOf('amt') >= 0);

    return (
      <div style={{ marginTop: 14, border: '1px solid var(--gold-l)', borderRadius: 'var(--r)', overflow: 'hidden', minWidth: 0, maxWidth: '100%' }}>
        <div style={{ padding: '11px 14px', background: 'var(--gold-l)', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <Icon name="alertCircle" size={15} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
            <strong>This layout isn't one I recognise.</strong> Nothing is lost — {mapper.label} is shown below.{' '}
            {mapper.headerIdx == null
              ? 'Click the row that holds the column titles.'
              : 'Now say which column is which. Only a description and a price or amount are required.'}
            {mapper.rows.length > PREVIEW_ROWS && (
              <> <strong>Showing the first {PREVIEW_ROWS} of {mapper.rows.length} rows</strong> — every row is imported, not just these.</>
            )}
          </div>
        </div>

        <div style={{ overflowX: 'auto', maxHeight: 330 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
            {mapper.headerIdx != null && (
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  {Array.from({ length: width }, (_, c) => (
                    <th key={c} style={{ padding: 5, borderBottom: '1px solid var(--border)', minWidth: 132 }}>
                      {/* Radix SelectItem cannot carry an empty-string value, so
                          "ignore" travels as a sentinel and is translated back
                          at the boundary (CLAUDE.md). */}
                      <Select value={roles[c] || '__ignore__'} onValueChange={v => setRole(c, v === '__ignore__' ? '' : v)}>
                        <SelectTrigger style={{ fontSize: 11.5 }}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ignore__">— ignore —</SelectItem>
                          <SelectItem value="desc">Description *</SelectItem>
                          <SelectItem value="qty">Quantity</SelectItem>
                          <SelectItem value="price">Unit price</SelectItem>
                          <SelectItem value="amt">Line amount</SelectItem>
                          <SelectItem value="model">Model / part no.</SelectItem>
                          <SelectItem value="unit">Unit of measure</SelectItem>
                          <SelectItem value="hs">HS code</SelectItem>
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {mapper.rows.slice(0, PREVIEW_ROWS).map((row, r) => {
                const isHeader = mapper.headerIdx === r;
                return (
                  <tr key={r}
                    onClick={() => mapper.headerIdx == null && setMapper(m => (m ? { ...m, headerIdx: r } : m))}
                    style={{
                      cursor: mapper.headerIdx == null ? 'pointer' : 'default',
                      background: isHeader ? 'var(--teal-l)' : undefined,
                    }}>
                    <td style={{ padding: '5px 6px', color: 'var(--ink3)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{r + 1}</td>
                    {Array.from({ length: width }, (_, c) => (
                      <td key={c} style={{
                        padding: '5px 8px', borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190,
                        fontWeight: isHeader ? 700 : 400, color: isHeader ? 'var(--teal)' : 'var(--ink2)',
                      }}>{row[c] ?? ''}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {mapper.headerIdx != null && (
            <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }}
              onClick={() => setMapper(m => (m ? { ...m, headerIdx: null, roles: undefined } : m))}>
              Pick a different row
            </button>
          )}
          <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} disabled={!ready}
            onClick={() => {
              importInvoiceGrid(mapper.rows, mapper.label, {
                headerIdx: mapper.headerIdx!,
                col: { desc: colOf('desc'), qty: colOf('qty'), price: colOf('price'), amt: colOf('amt'), hs: colOf('hs'), model: colOf('model'), unit: colOf('unit') },
              });
              setMapper(null);
            }}>
            Import these lines
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 12, marginLeft: 'auto' }}
            onClick={() => setMapper(null)}>Cancel</button>
        </div>
      </div>
    );
  })();

  /**
   * What still needs a human on a cargo line. Ordered by how badly it blocks a
   * calculation: without an HS code the line cannot be assessed at all.
   */
  type CargoIssue = 'hs' | 'price' | 'excluded';
  function rowIssue(r: MultiItemRow): CargoIssue | null {
    if (r.excluded) return 'excluded';
    if (!r.hs_code.trim()) return 'hs';
    if (!(parseFloat(r.unit_price_usd) > 0)) return 'price';
    return null;
  }

  const ISSUE_STYLE: Record<CargoIssue, { tint: string; edge: string; ink: string; label: string }> = {
    hs:       { tint: 'var(--red-l)',  edge: 'var(--red)',  ink: 'var(--red)',  label: 'need an HS code' },
    price:    { tint: 'var(--gold-l)', edge: 'var(--gold)', ink: 'var(--gold)', label: 'have no price' },
    excluded: { tint: 'var(--bg)',     edge: 'var(--border)', ink: 'var(--ink3)', label: 'switched off' },
  };

  /** Scrolls a flagged line into view and flashes it, so a jump on a 200-line
   *  list doesn't leave the user hunting for what just moved. */
  function jumpToRow(id: string) {
    const el = document.getElementById(`cargo-row-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.animate(
      [{ boxShadow: '0 0 0 0 var(--teal-m, rgba(0,0,0,.2))' }, { boxShadow: '0 0 0 5px var(--teal-m, rgba(0,0,0,.2))' }, { boxShadow: 'var(--elev-sm)' }],
      { duration: 1100, easing: 'ease-out' },
    );
  }

  /**
   * Asks the tariff database what these goods might be. Only rows without a
   * code are sent, and the answer is held separately from the rows — accepting
   * a suggestion is a separate, explicit act.
   */
  async function fetchHsSuggestions() {
    const targets = multiItems.filter(r => !r.excluded && !r.hs_code.trim() && r.description.trim());
    if (targets.length === 0) return;
    setSuggesting(true);
    setMultiError('');
    try {
      const res: any = await apiFetch('/v1/customs/hs-suggest', {
        method: 'POST',
        body: JSON.stringify({ items: targets.map(r => ({ id: r.id, text: r.description })), per_item: 3 }),
      });
      const next: Record<string, HsSuggestion[]> = {};
      const nextWhy: Record<string, HsRecommendation> = {};
      const nextMem: Record<string, HsMemoryHit[]> = {};
      for (const r of res?.data ?? []) {
        if (!r.suggestions?.length) continue;
        next[r.id] = r.suggestions;
        if (r.recommendation) nextWhy[r.id] = r.recommendation;
        if (r.memory?.length) nextMem[r.id] = r.memory;
      }
      setHsSuggestions(prev => ({ ...prev, ...next }));
      setHsWhy(prev => ({ ...prev, ...nextWhy }));
      setHsMem(prev => ({ ...prev, ...nextMem }));
      setAiPicks({});
      setAiPickError('');
      const found = Object.keys(next).length;
      setImportNote(
        found === 0
          ? `No tariff entry shares a word with any of those ${targets.length} descriptions. Search each code by hand.`
          : `Suggested codes for ${found} of ${targets.length} line${targets.length === 1 ? '' : 's'}. These are word matches against the tariff text, not a classification — check each one before accepting.`,
      );
    } catch (e: any) {
      setMultiError(e?.message ?? 'Could not fetch HS suggestions.');
    }
    setSuggesting(false);
  }

  /**
   * Records what was offered and what was actually declared.
   *
   * This is the corpus the suggester learns from — including the rejections,
   * which are as informative as the hits. Fire-and-forget by design: an
   * observation is worth having, but never at the cost of failing the
   * classification the user was making.
   */
  function recordClassification(rows: { rowId: string; code: string | null; source: 'suggested' | 'ai' | 'manual' | 'none' }[]) {
    const events = rows
      .map(({ rowId, code, source }) => {
        const row = multiItems.find(r => r.id === rowId);
        if (!row?.description.trim()) return null;
        return {
          description: row.description,
          suggested: (hsSuggestions[rowId] ?? []).map(s => ({ code: s.code, matchPct: s.matchPct, duty_rate: s.duty_rate })),
          accepted_code: code,
          source,
        };
      })
      .filter(Boolean);
    if (events.length === 0) return;
    void apiFetch('/v1/intel/hs-classifications', { method: 'POST', body: JSON.stringify({ events }) })
      .catch(() => { /* observation only — never surfaces to the user */ });
  }

  function acceptSuggestion(rowId: string, code: string) {
    const fromAi = aiPicks[rowId]?.code === code;
    recordClassification([{ rowId, code, source: fromAi ? 'ai' : 'suggested' }]);
    updateRow(rowId, { hs_code: code });
    setHsSuggestions(prev => { const next = { ...prev }; delete next[rowId]; return next; });
    setHsWhy(prev => { const next = { ...prev }; delete next[rowId]; return next; });
    setHsMem(prev => { const next = { ...prev }; delete next[rowId]; return next; });
    setAiPicks(prev => { const next = { ...prev }; delete next[rowId]; return next; });
  }

  /**
   * Asks the tenant's own configured AI which candidate heading actually fits.
   *
   * Word-frequency scoring cannot separate three headings that all matched the
   * single word "bolts" — they come back at an identical percentage, which is
   * honest and useless. A model that has read the headings can say which one
   * is about fasteners and which is a firearm mechanism.
   *
   * Only lines where the ranking genuinely tied are sent: an unambiguous match
   * needs no second opinion and every line sent costs tokens. If AI is not
   * configured the error says exactly that — it never falls back to the
   * word-count order and presents it as an AI opinion.
   */
  async function askAiToPick() {
    const rows = multiItems.filter(r =>
      !r.excluded && !r.hs_code.trim()
      && (hsSuggestions[r.id]?.length ?? 0) > 1
      && hsWhy[r.id]?.tied);
    if (rows.length === 0) { setAiPickError('Nothing to review — no line has two codes tied on wording.'); return; }
    const batch = rows.slice(0, AI_PICK_BATCH);
    setAiPicking(true);
    setAiPickError('');
    try {
      const res: any = await apiFetch('/v1/customs/hs-suggest/ai-pick', {
        method: 'POST',
        body: JSON.stringify({
          items: batch.map(r => ({
            id: r.id,
            text: r.description,
            candidates: hsSuggestions[r.id].map(s => ({ code: s.code, description: s.description, duty_rate: s.duty_rate })),
          })),
        }),
      });
      const picks: Record<string, AiPick> = {};
      for (const p of res?.picks ?? []) if (p?.id) picks[p.id] = p;
      setAiPicks(prev => ({ ...prev, ...picks }));
      const named = Object.values(picks).filter(p => p.code).length;
      setImportNote(
        named === 0
          ? `The AI did not settle on any of the candidate headings for those ${batch.length} line${batch.length === 1 ? '' : 's'} — classify them by hand.`
          : `The AI picked a heading on ${named} of ${batch.length} tied line${batch.length === 1 ? '' : 's'}`
            + `${rows.length > batch.length ? ` (${rows.length - batch.length} more still tied — run it again)` : ''}`
            + `. Its reasoning is shown against each; it is a second opinion, not a classification — you still accept each one.`,
      );
    } catch (e: any) {
      setAiPickError(e?.message ?? 'The AI review failed.');
    }
    setAiPicking(false);
  }

  /** Lines where wording alone could not choose between the top candidates. */
  const tiedCount = multiItems.filter(r =>
    !r.excluded && !r.hs_code.trim()
    && (hsSuggestions[r.id]?.length ?? 0) > 1
    && hsWhy[r.id]?.tied).length;

  /** Accepts the top suggestion on every row that still has none — the AI's
   *  pick where one was given, otherwise the word-ranking leader. */
  function acceptAllTopSuggestions() {
    const ids = Object.keys(hsSuggestions);
    // Record the bulk decision the same way a single acceptance is recorded —
    // 200 lines accepted at once is 200 observations, not one.
    recordClassification(ids.map(rowId => {
      const s = hsSuggestions[rowId];
      const ai = aiPicks[rowId]?.code;
      const code = ai && s?.some(x => x.code === ai) ? ai : s?.[0]?.code ?? null;
      return { rowId, code, source: (ai && code === ai ? 'ai' : 'suggested') as 'ai' | 'suggested' };
    }));
    setMultiItems(rows => rows.map(r => {
      const s = hsSuggestions[r.id];
      if (!s || r.hs_code.trim()) return r;
      const ai = aiPicks[r.id]?.code;
      return { ...r, hs_code: ai && s.some(x => x.code === ai) ? ai : s[0].code };
    }));
    setHsSuggestions({});
    setHsWhy({});
    setHsMem({});
    setAiPicks({});
    setImportNote(`Accepted the top suggestion on ${ids.length} line${ids.length === 1 ? '' : 's'}. Each one is now editable — correct any that are wrong before calculating.`);
  }

  const suggestedCount = Object.keys(hsSuggestions).length;
  const needsHsCount = multiItems.filter(r => !r.excluded && !r.hs_code.trim() && r.description.trim()).length;

  /**
   * Checks our sum against the one the invoice states for itself.
   *
   * This is the backstop for the whole importer: a torn row, a mis-mapped
   * column, a unit price multiplied back instead of the line amount — every
   * one of them moves this number. Shown whether it agrees or not, because
   * "we checked and it matches" is the useful half of the message.
   */
  const reconcileBar = (() => {
    if (itemMode !== 'multi' || !declaredFob || multiTotalFobUsd <= 0) return null;
    const diff = multiTotalFobUsd - declaredFob.usd;
    // A cent or two is the supplier's own rounding across a few hundred lines.
    const ok = Math.abs(diff) <= Math.max(0.5, declaredFob.usd * 0.001);
    const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return (
      <div style={{
        marginTop: 12, padding: '11px 14px', borderRadius: 'var(--r)',
        border: `1px solid ${ok ? 'var(--green)' : 'var(--red)'}`,
        background: ok ? 'var(--green-l)' : 'var(--red-l)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Icon name={ok ? 'checkCircle' : 'alertCircle'} size={15} color={ok ? 'var(--green)' : 'var(--red)'} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55 }}>
          {ok ? (
            <>Reconciled against the invoice. Its stated <strong>{declaredFob.label}</strong> is {money(declaredFob.usd)} and the imported lines sum to <strong>{money(multiTotalFobUsd)}</strong>.</>
          ) : (
            <>
              <strong>These lines do not add up to the invoice.</strong> It states <strong>{declaredFob.label}</strong> as {money(declaredFob.usd)}, but the {multiItems.filter(r => !r.excluded).length} included lines sum to <strong>{money(multiTotalFobUsd)}</strong> — {diff > 0 ? 'over' : 'under'} by {money(Math.abs(diff))}.
              <div style={{ marginTop: 4, color: 'var(--ink3)' }}>
                Usually a row switched off that shouldn't be, a line with no price, or a column mapped to the wrong header. Duty is charged on this value, so resolve it before calculating.
              </div>
            </>
          )}
        </div>
      </div>
    );
  })();

  const hsSuggestBar = (() => {
    if (itemMode !== 'multi' || (needsHsCount === 0 && suggestedCount === 0)) return null;
    return (
      <div style={{ marginTop: 12, padding: '11px 14px', border: '1px solid var(--teal-m, var(--teal-l))', background: 'var(--teal-l)', borderRadius: 'var(--r)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name="sparkle" size={15} color="var(--teal)" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: '1 1 260px', lineHeight: 1.5 }}>
          {suggestedCount > 0
            ? <>Suggestions ready on <strong>{suggestedCount}</strong> line{suggestedCount === 1 ? '' : 's'}. They match words in the tariff text — they are not a classification, so check each before accepting.</>
            : <>{needsHsCount} line{needsHsCount === 1 ? '' : 's'} still need an HS code. Match them against the tariff database from the description and model.</>}
        </span>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} disabled={suggesting || needsHsCount === 0} onClick={fetchHsSuggestions}>
          {suggesting ? 'Matching…' : suggestedCount > 0 ? 'Refresh suggestions' : 'Suggest HS codes'}
        </button>
        {/* Offered only when word matching genuinely tied, because that is the
            only case it can improve on — and every line sent costs tokens. */}
        {tiedCount > 0 && (
          <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} disabled={aiPicking} onClick={askAiToPick}
            title={`${tiedCount} line${tiedCount === 1 ? '' : 's'} where two or more codes matched the same words equally well`}>
            {aiPicking ? 'Asking AI…' : `Ask AI to break ${tiedCount} tie${tiedCount === 1 ? '' : 's'}`}
          </button>
        )}
        {suggestedCount > 0 && (
          <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={acceptAllTopSuggestions}>
            Accept top match on all {suggestedCount}
          </button>
        )}
        {aiPickError && (
          <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--red)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <Icon name="alertCircle" size={13} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
            {/* The real reason, verbatim. Falling back to the word-count order
                and calling it an AI opinion would be the worse failure. */}
            <span>{aiPickError}</span>
          </div>
        )}
      </div>
    );
  })();

  const cargoIssueBar = (() => {
    if (itemMode !== 'multi' || multiItems.length < 2) return null;
    const groups = (['hs', 'price', 'excluded'] as CargoIssue[])
      .map(kind => ({ kind, rows: multiItems.filter(r => rowIssue(r) === kind) }))
      .filter(g => g.rows.length > 0);
    if (groups.length === 0) return null;

    return (
      <div style={{ marginTop: 14, padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--card-bg, var(--white))', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>Jump to:</span>
        {groups.map(g => (
          <button key={g.kind} type="button" onClick={() => jumpToRow(g.rows[0].id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
              padding: 'var(--ds-btn-py-sm) 11px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
              background: ISSUE_STYLE[g.kind].tint,
              border: `1px solid ${ISSUE_STYLE[g.kind].edge}`,
              color: ISSUE_STYLE[g.kind].ink, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
            {g.rows.length} {ISSUE_STYLE[g.kind].label}
            <Icon name="arrowRight" size={12} color={ISSUE_STYLE[g.kind].ink} />
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--ink3)' }}>
          {multiItems.filter(r => !rowIssue(r)).length} of {multiItems.length} ready
        </span>
      </div>
    );
  })();

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
      {/* Inline responsive layout rules — this page is styled with inline
          style objects everywhere else, so media queries (which plain style
          objects can't express) live here instead. The spin keyframe used
          to be duplicated here too; it now lives once, shared, in index.css
          as @keyframes ds-spin. */}
      <style>{`
        .lcp-page { padding: 0; }
        /* minmax(0, 1fr), not 1fr: a grid track defaults to min-width:auto, so a wide
           child — the invoice mapper's preview table — stretched the track and the
           whole page sideways instead of scrolling inside its own box. */
        .lcp-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 24px; align-items: start; margin-top: 12px; }
        .lcp-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .lcp-card { min-width: 0; background: var(--card-bg, var(--white)); border: 1px solid var(--border); border-radius: 16px; padding: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .lcp-btn-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        /* auto-fit, not a fixed count: the results row grew from two actions
           to four, and a hardcoded repeat(3) would have wrapped the fourth
           into a lone full-width button. */
        .lcp-btn-row-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
        @media (max-width: 480px) { .lcp-btn-row-3 { grid-template-columns: 1fr; } }
        /* Port + ICD operator + Advanced toggle, on one row.
           Flex rather than a fixed three-column grid because the ICD Operator
           field only renders when the tenant actually has ICD operators — with
           a fixed 1fr 1fr 1fr those tenants got two fields and a third of the
           row as dead space. flex:1 divides whatever is present, so the row is
           full-width at two fields or three, and the basis lets it wrap on its
           own instead of needing a breakpoint per column count. */
        .lcp-row-3 { display: flex; flex-wrap: wrap; gap: 12px; align-items: stretch; }
        .lcp-row-3 > * { flex: 1 1 260px; min-width: 0; }
        /* The three hints are different lengths, and a hint that wraps to two
           lines pushes its own control half a line below the other two. Giving
           the hint a two-line floor inside this row keeps all three controls on
           one line without hard-coding anything about the text itself. */
        .lcp-row-3 .lcp-hint { line-height: 1.45; min-height: 2.9em; }
        /* One height for all three. The Advanced toggle and the Select trigger
           used to be pinned at 44px while the Combobox beside them is
           padding-driven, so at narrow widths the Combobox grew to 46 and the
           other two stayed at 44. Giving all three the same floor and letting
           padding drive them keeps them equal at every width.
           Note they settle at 44, not --ctl-h's 40: ui/combobox.tsx sizes
           itself from min-h-9 plus --ds-input-py rather than reading --ctl-h,
           so 44 is the Combobox's height everywhere in the app. Matching it
           here is right; making it read --ctl-h is a platform-level change to
           the shared component, not something one page should force. */
        .lcp-row-3 .lcp-ctl,
        .lcp-row-3 [role="combobox"] { min-height: var(--ctl-h); box-sizing: border-box; }

        /* A 200-line invoice made the page itself thousands of pixels tall, so
           the step's own Continue button was unreachable without a long scroll.
           The list scrolls inside its own box instead. */
        /* One control size for the whole page.
           Fields and buttons were previously sized inline at 32, 34, 36 and
           38px, so a row read as several different components sitting next to
           each other. Height comes from one token here and radius from the
           design system's --r-sm, which .input-field and .btn already use — so
           this only has to fix the height they were overriding. */
        .lcp-card { --ctl-h: 44px; }
        .lcp-card .input-field,
        .lcp-card .btn,
        .lcp-card label.btn,
        .lcp-card button[role="combobox"],
        .lcp-card [data-slot="combobox-trigger"],
        .lcp-card [data-slot="select-trigger"] {
          height: var(--ctl-h);
          border-radius: var(--r-sm);
          padding-top: 0;
          padding-bottom: 0;
        }
        .lcp-card .btn { line-height: 1; }
        /* Touch targets stay comfortable on a phone without changing desktop. */
        @media (max-width: 700px) { .lcp-card { --ctl-h: 46px; padding: 18px; } }

        /* Cargo line rows. Four number fields side by side are unusable at
           phone width — the qty box ends up about two characters wide — so
           they go to two columns, then the description and HS code stack. */
        .lcp-row-desc { display: grid; grid-template-columns: 2fr 1.4fr; gap: 8px; margin-bottom: 8px; }
        .lcp-row-nums { display: grid; grid-template-columns: 1fr 0.8fr 1fr 1fr; gap: 8px; }
        @media (max-width: 760px) { .lcp-row-nums { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px) { .lcp-row-desc { grid-template-columns: 1fr; } }

        .lcp-lines { max-height: 62vh; overflow-y: auto; overscroll-behavior: contain; padding-right: 8px; }
        @media (max-width: 700px) { .lcp-lines { max-height: 70vh; } }

        /* The per-item results table is the one thing on this page wider than
           a laptop column, and with 200 lines it was also ~6,000px tall — so
           its own horizontal scrollbar sat thousands of pixels below the fold
           and the right-hand columns (Landed Total among them) were, in
           practice, unreachable. It gets its own bounded box instead: scrolls
           in both directions inside the card, with the header and the totals
           row pinned so a figure is never read without its label. */
        .lcp-tscroll { max-height: 58vh; overflow: auto; overscroll-behavior: contain; }
        @media (max-width: 700px) { .lcp-tscroll { max-height: 62vh; } }
        .lcp-tscroll thead th { position: sticky; top: 0; z-index: 2; background: var(--card-bg, var(--white)); }
        /* --teal-l is a soft tint with alpha, so on its own the rows would
           scroll visibly through the pinned totals. Layering it over the card
           background keeps the app's tint and makes the row opaque. */
        .lcp-tscroll tfoot td {
          position: sticky; bottom: 0; z-index: 2;
          background: linear-gradient(var(--teal-l), var(--teal-l)), var(--card-bg, var(--white));
        }
        .lcp-tscroll tbody tr { cursor: pointer; transition: background .12s ease; }
        .lcp-tscroll tbody tr:hover,
        .lcp-tscroll tbody tr:focus-visible { background: var(--teal-l); outline: none; }

        /* Landed Total is the column the whole table exists to produce, and it
           is the one that fell off the right edge — nine columns do not fit a
           phone, or even the content column on a 1280px laptop. Pinning it
           means the figure is readable at every width and the rest scrolls
           under it. Opaque backgrounds throughout, since it sits over the
           scrolling cells. */
        .lcp-tscroll th:last-child,
        .lcp-tscroll td:last-child {
          position: sticky; right: 0; z-index: 1;
          background: var(--card-bg, var(--white));
          box-shadow: inset 1px 0 0 var(--border);
        }
        .lcp-tscroll thead th:last-child,
        .lcp-tscroll tfoot td:last-child { z-index: 3; }
        .lcp-tscroll tbody tr:hover td:last-child,
        .lcp-tscroll tbody tr:focus-visible td:last-child,
        .lcp-tscroll tfoot td:last-child {
          background: linear-gradient(var(--teal-l), var(--teal-l)), var(--card-bg, var(--white));
        }

        /* One thin scrollbar style for both scrolling regions. Overlay-style
           on the platforms that support it, always visible where they don't. */
        .lcp-lines, .lcp-tscroll { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .lcp-lines::-webkit-scrollbar,
        .lcp-tscroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .lcp-lines::-webkit-scrollbar-track,
        .lcp-tscroll::-webkit-scrollbar-track { background: transparent; }
        .lcp-lines::-webkit-scrollbar-thumb,
        .lcp-tscroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .lcp-lines::-webkit-scrollbar-thumb:hover,
        .lcp-tscroll::-webkit-scrollbar-thumb:hover { background: var(--ink3); }
        .lcp-tscroll::-webkit-scrollbar-corner { background: transparent; }
        .lcp-step-mobile { display: none; }
        .lcp-step-desktop { display: flex; flex-direction: column; gap: 20px; }

        /* No per-column-count breakpoints here any more: the 260px flex basis
           drops the row from three across to two, then to one, on its own. */
        @media (max-width: 860px) {
          .lcp-page { padding: 14px; }
          /* minmax(0, …) here too — a bare 1fr reintroduces min-width:auto and
             the mapper table widens the column again on a phone. */
          .lcp-layout { grid-template-columns: minmax(0, 1fr); gap: 14px; }
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
        titlePlain="Landed cost"
        titleEm="calculator"
        subtitle="Tanzania EAC CET — compute full landed cost from CIF to your door · Live FX rate from open.er-api.com"
        actions={
          <div className="lcp-actions">
            {/* The slide-over listed fifty totals and could do nothing with
                them. History is a page now: searchable, sortable, and every
                entry reopens as the report it produced. */}
            <button type="button" className="btn btn-secondary"
              onClick={() => navigate('/clearos/customs-tools/history')}
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
            <div style={{ background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 'var(--r)', padding: '14px 16px', fontSize: 12, color: 'var(--ink)' }}>
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
            <>
              <StepCaption index={0} />
              <SectionCard title="Your details" collapsible={false}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 22 }}>
                Who this estimate is for. These appear on the exported PDF and don't affect any figure.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <Field label="Company / Customer Name" hint="Search real customers & leads, or type a new name to add it as a lead.">
                  <CustomerLeadPicker
                    value={customerLead}
                    onChange={(item: PickerItem | null, details: CustomerLeadDetails | null) => {
                      setCustomerLead(item);
                      setCustomerName(details?.name || item?.label || '');
                      if (details?.email) setCustomerEmail(details.email);
                      if (details?.phone) setCustomerPhone(details.phone);
                    }}
                    source="Landed Cost Calculator"
                  />
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
                <Field label="Linked Shipment (optional)" hint="Ties this estimate to a real shipment, so once its actual costs are logged on the Ledger tab, they can be compared against this estimate.">
                  <EntityPicker value={linkedShipment} onChange={setLinkedShipment} search={searchShipments} placeholder="Search by ref, BL number or goods description…" />
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
                    {invoiceMapper}
                  </div>
                )}
              </div>

              {navRow}
              </SectionCard>
            </>
          )}

          {step === 3 && (
            <>
              <StepCaption index={2} />
              <SectionCard title={itemMode === 'multi' ? 'Confirm cargo lines' : 'Cargo items'} collapsible={false}>
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 18 }}>
                {itemMode === 'multi'
                  // An uploaded invoice carries no HS codes, or carries ones Excel
                  // has truncated. Nothing is assessed until an agent confirms them.
                  ? 'Every line needs a confirmed HS code before it can be assessed. A commercial invoice never carries one, so this is yours to set.'
                  : 'Enter the shipment value and HS classification.'}
              </div>

              <div style={{ padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', marginBottom: 24, fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6, display: 'flex', alignItems: 'center', gap: 10 }}>
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
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 6 }}>
                    The total on your supplier's invoice, before any Tanzanian duties.
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input className="input-field" type="number" min="0" placeholder="e.g. 15,000" value={fob} onChange={e => setFob(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 38, fontSize: 14 }} />
                    <Icon name="dollarSign" size={15} color="var(--ink3)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  </div>

                  <div style={{ marginTop: 14, padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r)', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                        <input className="input-field" type="number" min="0" placeholder="e.g. 3,500" value={freight} onChange={e => setFreight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13.5 }} />
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
                          <input className="input-field" type="number" min="0" step="0.1" value={insurancePct} onChange={e => setInsurancePct(e.target.value)} style={{ width: 64, boxSizing: 'border-box', fontSize: 13, textAlign: 'right' }} />
                          <span style={{ fontSize: 12, color: 'var(--ink3)' }}>% of goods + shipping — the usual rate if you don't have a figure</span>
                          <span style={{ fontSize: 12, color: 'var(--ink3)', marginLeft: 'auto' }}>= {fmtUsd(insuranceVal)}</span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px dashed var(--border)', fontSize: 12.5, gap: 10 }}>
                      <span style={{ color: 'var(--ink3)' }}>
                        Customs value (CIF) <span style={{ color: 'var(--ink3)' }}>· quoted {priceBasis}</span>
                      </span>
                      <strong style={{ color: 'var(--teal)' }}>{fmtUsd(effectiveCif())}</strong>
                    </div>
                  </div>
                </div>

                {/* Field 2: HS Code or Description Search */}
                <div style={{ position: 'relative' }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                    HS Code or Description
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 8, color: 'var(--ink3)', fontSize: 11 }}>— Search our EAC CET database</span>
                  </label>
                  <EntityPicker
                    value={hs ? { id: hs, label: hs } : null}
                    onChange={handleHsChange}
                    search={searchHs}
                    placeholder="e.g. 8471 or laptop computers"
                  />

                  {hsSelected && (
                    <div style={{ marginTop: 10, padding: '12px 16px', background: 'var(--teal-l)', border: '1px solid var(--teal-m)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--ink)' }}>
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
                        {/* Excise, alternatives and an HS finder all live on the
                            dedicated tool — opened in a new tab so a
                            part-filled calculation here isn't lost. */}
                        <a href={`/clearos/duty-check?hs=${encodeURIComponent(hsSelected.code)}`} target="_blank" rel="noreferrer"
                          style={{ marginLeft: 'auto', color: 'var(--teal)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                          Full duty check <Icon name="externalLink" size={11} color="var(--teal)" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Field 3: Quantity */}
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>Quantity (units)</label>
                  <input className="input-field" type="number" min="1" placeholder="e.g. 10" value={qty} onChange={e => setQty(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 14 }} />
                </div>

                {/* Field 4: Finance Act 2026 (July update) special excise flags */}
                <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r)'}}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 10 }}>
                    Special Excise — Finance Act 2026 (July update)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer', marginBottom: isUsedVehicle ? 10 : 0 }}>
                    <Checkbox checked={isUsedVehicle} onCheckedChange={c => setIsUsedVehicle(c === true)} />
                    This is a used motor vehicle
                  </label>
                  {isUsedVehicle && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 24 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Vehicle age (years)</span>
                      <input className="input-field" type="number" min="0" step="1" placeholder="e.g. 12" value={vehicleAge} onChange={e => setVehicleAge(e.target.value)}
                        style={{ width: 80, boxSizing: 'border-box', fontSize: 13 }} />
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink)', cursor: 'pointer' }}>
                    <Checkbox checked={isClogs} onCheckedChange={c => setIsClogs(c === true)} />
                    This is plastic or rubber clogs footwear
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8, lineHeight: 1.5 }}>
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
                  {invoiceMapper}
                  {cargoIssueBar}
                  {reconcileBar}
                  {hsSuggestBar}

                  <div className="lcp-lines" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {multiItems.map((row, idx) => {
                      const issue = rowIssue(row);
                      return (
                      <div key={row.id} id={`cargo-row-${row.id}`} style={{
                        padding: 12, borderRadius: 'var(--r)',
                        // A light tint marks what still needs attention without
                        // shouting: red for no HS code (which blocks assessment
                        // entirely), amber for no price, grey for switched off.
                        border: `1px solid ${issue ? ISSUE_STYLE[issue].edge : 'var(--border)'}`,
                        background: issue ? ISSUE_STYLE[issue].tint : 'rgba(255,255,255,0.03)',
                        opacity: row.excluded ? 0.62 : 1,
                        scrollMarginTop: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)' }}>LINE {idx + 1}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                            {/* Excluding is a decision the user makes and can undo,
                                not something the importer does behind their back. */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: row.excluded ? 'var(--ink3)' : 'var(--ink2)', cursor: 'pointer' }}>
                              <Checkbox checked={!row.excluded}
                                onCheckedChange={c => updateRow(row.id, { excluded: c !== true })} />
                              {row.excluded ? 'Excluded' : 'Include'}
                            </label>
                            <button type="button" onClick={() => removeRow(row.id)} disabled={multiItems.length === 1}
                              style={{ background: 'none', border: 'none', cursor: multiItems.length === 1 ? 'default' : 'pointer', opacity: multiItems.length === 1 ? 0.3 : 1, color: 'var(--red)', display: 'flex', alignItems: 'center' }}>
                              <Icon name="trash" size={13} color="var(--red)" />
                            </button>
                          </div>
                        </div>
                        {row.flag && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 8, fontSize: 11.5, color: 'var(--gold)' }}>
                            <Icon name="alertCircle" size={13} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>{row.flag}</span>
                          </div>
                        )}
                        <div className="lcp-row-desc">
                          <input className="input-field" placeholder="Product / description" value={row.description} onChange={e => updateRow(row.id, { description: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                          <EntityPicker
                            value={row.hs_code ? { id: row.hs_code, label: row.hs_code } : null}
                            onChange={item => handleRowHsChange(row, item)}
                            search={searchHs}
                            placeholder="HS code"
                          />
                        </div>
                        {hsSuggestions[row.id] && !row.hs_code.trim() && (
                          <div style={{ marginBottom: 8, padding: '8px 10px', border: '1px solid var(--teal-m, var(--teal-l))', background: 'var(--teal-l)', borderRadius: 'var(--r-sm)' }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>
                              Possible codes — check before accepting
                            </div>
                            {/* What this workspace declared before for goods
                                like these. Sits above the tariff-text ranking
                                because it is the stronger evidence — but it is
                                evidence, not an answer: a code used ten times
                                can still be ten times wrong, so it is offered
                                for acceptance the same way everything else is. */}
                            {hsMem[row.id]?.length > 0 && (
                              <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--teal-m, var(--border))' }}>
                                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <Icon name="clock" size={11} color="var(--green)" /> You have classified this before
                                </div>
                                {hsMem[row.id].map(m => (
                                  <div key={`mem-${m.code}`} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                    <button type="button" onClick={() => acceptSuggestion(row.id, m.code)}
                                      title={`Use ${m.code} — matches "${m.closestDescription}"`}
                                      style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid var(--green)', background: 'var(--green-l)', color: 'var(--green)', borderRadius: 'var(--badge-radius)', padding: 'var(--ds-btn-py-xs) 10px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono, monospace)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}>
                                      {m.code}
                                    </button>
                                    <span style={{ fontSize: 11.5, color: 'var(--ink2)', flex: '1 1 160px', minWidth: 0 }}>
                                      used <strong>{m.times}×</strong>, closest was “{m.closestDescription}”
                                    </span>
                                    <span style={{ fontSize: 10.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                                      {Math.round(m.similarity * 100)}% wording match
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {hsSuggestions[row.id].map(s => {
                                // Which code is put forward, and on whose say-so.
                                // The AI's answer supersedes the word-count order
                                // when there is one — that is the point of asking.
                                const ai = aiPicks[row.id];
                                const led = ai?.code ? ai.code === s.code : hsWhy[row.id]?.code === s.code;
                                return (
                                <div key={s.code} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => acceptSuggestion(row.id, s.code)}
                                    title={`Use ${s.code} for this line`}
                                    style={{ flexShrink: 0, cursor: 'pointer', border: '1px solid var(--teal)', background: led ? 'hsl(var(--primary))' : 'transparent', color: led ? 'hsl(var(--primary-foreground))' : 'var(--teal)', borderRadius: 'var(--badge-radius)', padding: 'var(--ds-btn-py-xs) 10px', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono, monospace)', minHeight: 'var(--ctl-h-xs)', boxSizing: 'border-box', lineHeight: 1.25}}
                                  >
                                    {s.code}
                                  </button>
                                  {led && (
                                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: ai?.code ? 'var(--green)' : 'var(--teal)', whiteSpace: 'nowrap' }}>
                                      {ai?.code ? `AI pick · ${ai.confidence}` : 'Put first'}
                                    </span>
                                  )}
                                  <span style={{ fontSize: 12, color: 'var(--ink2)', flex: '1 1 160px', minWidth: 0, lineHeight: 1.4 }}>{s.description}</span>
                                  {/* The match strength is the ranking score itself, not a
                                      separate estimate — how much of the description this
                                      entry's wording accounts for, weighted by how rare
                                      each word is. It measures wording, not correctness:
                                      100% means every searchable word was found, which a
                                      wrong heading can also achieve. */}
                                  <span
                                    title={`${s.matched} of ${s.totalWords} words matched (${s.matchedWords.join(', ')}). Measures wording overlap with the tariff text, not whether the classification is correct.`}
                                    style={{
                                      fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
                                      padding: '1px 7px', borderRadius: 'var(--badge-radius)',
                                      background: s.matchPct >= 70 ? 'var(--green-l)' : s.matchPct >= 40 ? 'var(--gold-l)' : 'rgba(0,0,0,.05)',
                                      color: s.matchPct >= 70 ? 'var(--green)' : s.matchPct >= 40 ? 'var(--gold)' : 'var(--ink3)',
                                    }}>
                                    {s.matchPct}% match
                                  </span>
                                  <span style={{ fontSize: 10.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                                    {s.matched}/{s.totalWords} words{s.duty_rate != null ? ` · ${s.duty_rate}% duty` : ''}
                                  </span>
                                </div>
                                );
                              })}
                            </div>
                            {/* Why one of them is put forward. Three codes at an
                                identical percentage is an honest reading of the
                                wording and no help at all in choosing — so the
                                grounds are stated instead of implied. */}
                            {aiPicks[row.id]?.reason ? (
                              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                <Icon name="sparkle" size={12} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span><strong style={{ color: 'var(--green)' }}>AI:</strong> {aiPicks[row.id].reason}</span>
                              </div>
                            ) : hsWhy[row.id]?.reason ? (
                              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
                                {hsWhy[row.id].reason}
                              </div>
                            ) : (
                              <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--ink3)' }}>
                                Matched on: {hsSuggestions[row.id][0].matchedWords.join(', ')} — or search the HS field above for the correct code.
                              </div>
                            )}
                          </div>
                        )}
                        <div className="lcp-row-nums">
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Qty</label>
                            <input className="input-field" type="number" min="0" value={row.qty} onChange={e => updateRow(row.id, { qty: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Unit</label>
                            <input className="input-field" placeholder="unit" value={row.unit} onChange={e => updateRow(row.id, { unit: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Unit Price (USD)</label>
                            <input className="input-field" type="number" min="0" value={row.unit_price_usd} onChange={e => updateRow(row.id, { unit_price_usd: e.target.value })} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Amount (USD)</label>
                            <div style={{ height: 36, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                              {fmtUsd3(lineFobUsd(row))}
                            </div>
                          </div>
                        </div>

                        {/* Per-line rate overrides — blank uses this HS code's
                            own tariff rate. Anything typed here is flagged as a
                            manual override on the result and the PDF. */}
                        <details style={{ marginTop: 10 }}>
                          <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: rowHasOverride(row) ? 'var(--gold)' : 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
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
                      );
                    })}
                  </div>

                  <button type="button" onClick={addRow} disabled={multiItems.length >= MAX_CARGO_ROWS} className="btn btn-secondary"
                    style={{ marginTop: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, opacity: multiItems.length >= MAX_CARGO_ROWS ? 0.45 : 1, cursor: multiItems.length >= MAX_CARGO_ROWS ? 'not-allowed' : 'pointer' }}>
                    <Icon name="plus" size={13} /> Add line item
                  </button>
                  <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{multiItems.length} of {MAX_CARGO_ROWS} lines</span>
                    <span>Total FOB Value: <strong style={{ color: 'var(--ink)' }}>{fmtUsd(multiTotalFobUsd)}</strong></span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>Freight (USD)</label>
                      <input className="input-field" type="number" min="0" placeholder="e.g. 800" value={multiFreight} onChange={e => setMultiFreight(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13.5 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6 }}>
                        Insurance (USD) <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--ink3)' }}>— blank = 1% of CFR</span>
                      </label>
                      <input className="input-field" type="number" min="0" placeholder="auto" value={multiInsurance} onChange={e => setMultiInsurance(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', fontSize: 13.5 }} />
                    </div>
                  </div>
                </div>
              )}

              {navRow}
              </SectionCard>
            </>
          )}

          {step === 2 && (
            <>
              <StepCaption index={1} />
              <SectionCard title="Shipment mode & dimensions" collapsible={false}>
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
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }}>Container Details</label>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 8 }}>
                      ICD, agency and shipping-line handling are billed per container. Each size is priced from its own rate card.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {containerLots.map((lot, i) => (
                        // Size, count, remove and "+ Add size" all sit on one
                        // line. The add button only renders on the last row —
                        // repeating it per row would imply it adds a size
                        // relative to that row, which it does not.
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'center' }}>
                          <Select value={lot.size} onValueChange={v => setContainerLots(l => l.map((x, j) => j === i ? { ...x, size: v as '20ft' | '40ft' } : x))}>
                            {/* Matches .input-field's height so the size and
                                count controls line up rather than one sitting
                                shorter than the other. */}
                            <SelectTrigger style={{ height: 44 }}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="20ft">20ft (TEU)</SelectItem>
                              <SelectItem value="40ft">40ft (FEU)</SelectItem>
                            </SelectContent>
                          </Select>
                          {/* .input-field computes to 49px while a SelectTrigger
                              is 44 — pinned so the two controls in this row are
                              the same height as well as the same width. */}
                          <input className="input-field" type="number" min="1" step="1" placeholder="Qty" value={lot.count}
                            onChange={e => setContainerLots(l => l.map((x, j) => j === i ? { ...x, count: e.target.value } : x))}
                            style={{ width: '100%', height: 44, boxSizing: 'border-box' }} />
                          <Tip label="Remove container size"><span><button type="button" aria-label="Remove container size"
                            onClick={() => setContainerLots(l => l.length > 1 ? l.filter((_, j) => j !== i) : l)}
                            disabled={containerLots.length === 1}
                            style={{ background: 'none', border: 'none', cursor: containerLots.length === 1 ? 'default' : 'pointer', opacity: containerLots.length === 1 ? 0.3 : 1, color: 'var(--red)', padding: 6, height: 44 }}>
                            <Icon name="trash" size={14} color="var(--red)" />
                          </button></span></Tip>
                          {i === containerLots.length - 1 ? (
                            <Tip label={containerLots.length >= 2 ? 'Both container sizes are already listed' : 'Add the other container size'}><span><button type="button"
                              onClick={() => setContainerLots(l => l.length >= 2 ? l : [...l, { size: l.some(x => x.size === '20ft') ? '40ft' : '20ft', count: '1' }])}
                              disabled={containerLots.length >= 2}
                              style={{ height: 44, whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, color: containerLots.length >= 2 ? 'var(--ink3)' : 'var(--teal)', background: 'none', border: `1px solid ${containerLots.length >= 2 ? 'var(--border)' : 'var(--teal)'}`, borderRadius: 'var(--r-sm)', padding: '0 12px', cursor: containerLots.length >= 2 ? 'not-allowed' : 'pointer' }}>
                              + Add size
                            </button></span></Tip>
                          ) : <span />}
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

                {/* LCL and Airfreight get the same two-column treatment FCL's
                    container row has, rather than a column of full-width boxes.
                    LCL shows only volume, so it sits in the first column and
                    lines up with the container select above it. */}
                {(needsCbm || isAir) && (
                  <div className="lcp-btn-row">
                    {needsCbm && (
                      <Field label="Total Volume (CBM)" hint={isAir ? 'Used to work out volumetric weight.' : 'LCL handling is charged per CBM.'}>
                        <input className="input-field" type="number" min="0" step="0.01" placeholder="e.g. 15.0" value={cbm}
                          onChange={e => setCbm(e.target.value)}
                          style={{ width: '100%', height: 44, boxSizing: 'border-box' }} />
                      </Field>
                    )}
                    {isAir && (
                      <Field label="Total Gross Weight (kg)" hint="Air bills on chargeable weight — the greater of gross and volumetric.">
                        <input className="input-field" type="number" min="0" placeholder="e.g. 3000" value={weightKg}
                          onChange={e => setWeightKg(e.target.value)}
                          style={{ width: '100%', height: 44, boxSizing: 'border-box' }} />
                      </Field>
                    )}
                  </div>
                )}

                {isAir && (cbmVal > 0 || weightKgVal > 0) && (
                  <div style={{ marginTop: -8, fontSize: 11.5, color: 'var(--ink3)' }}>
                    Volumetric: {volumetricKgVal.toFixed(0)} kg ({cbmVal} CBM × 166.67) vs. gross {weightKgVal.toFixed(0)} kg → chargeable weight <strong style={{ color: 'var(--teal)' }}>{chargeableKgPreview.toFixed(0)} kg</strong>
                  </div>
                )}

                {/* Port, ICD operator and the Advanced Settings toggle share one
                    row — three short controls that were each taking a full row.
                    The Advanced panel itself opens full-width below, since its
                    contents are far too wide for a third of a row. */}
                <div className="lcp-row-3">
                  {/* Country of origin is no longer its own field — every
                      loading point carries its country, so it is derived and
                      shown below rather than asked for twice. */}
                  <Field label={loadingPointLabel} hint="Where the cargo was loaded. The country of origin follows from it.">
                    <Combobox
                      options={(isAir ? AIRPORT_SUGGESTIONS : SEAPORT_SUGGESTIONS).map(p => ({ value: p, label: p }))}
                      value={loadingPoint}
                      onChange={v => {
                        setLoadingPoint(v);
                        if (v) void autofillOriginFromPort(v);
                        else if (originFromPort) { setOriginCountry(''); setOriginFromPort(false); }
                      }}
                      placeholder={isAir ? 'Choose an airport…' : 'Choose a port…'}
                      searchPlaceholder={isAir ? 'Search airports…' : 'Search ports…'}
                      emptyText={isAir ? 'No airport matches.' : 'No port matches.'}
                    />
                    {originCountry && (
                      <div style={{ marginTop: 7, fontSize: 12, color: 'var(--ink2)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Icon name="globe" size={13} color="var(--teal)" />
                        <span>Country of origin: <strong>{originCountry}</strong></span>
                        <span style={{ color: 'var(--ink3)' }}>— EAC origin affects duty treatment.</span>
                      </div>
                    )}
                  </Field>

                  {icdOperatorOptions.length > 0 && (
                    <Field label="ICD Operator" hint="Optional — uses your Rate Card's generic default otherwise.">
                      <Select value={icdOperatorId ?? '__generic__'} onValueChange={v => setIcdOperatorId(v === '__generic__' ? null : v)}>
                        <SelectTrigger className="lcp-ctl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__generic__">Generic default</SelectItem>
                          {icdOperatorOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}

                  <Field label="Advanced Settings" hint="Replace a sourced rate. Blank uses the tariff or TPA figure.">
                    <button type="button" className="lcp-ctl" onClick={() => setShowAdvanced(v => !v)}
                      style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--ink2)', fontSize: 13, fontWeight: 700 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="settings" size={15} color="var(--ink3)" />
                        {overrideCount > 0
                          ? <span style={{ color: 'var(--gold)' }}>{overrideCount} override{overrideCount > 1 ? 's' : ''}</span>
                          : 'None set'}
                      </span>
                      <Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={15} color="var(--ink3)" />
                    </button>
                  </Field>
                </div>

              </div>

              {/* Destination-charge basis info */}
              <div style={{ marginTop: 24, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--ink2)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
              {/* Opened by the toggle that now sits in the row above. Kept
                  full-width because six override fields cannot live in a third
                  of a row. */}
              {showAdvanced && (
                <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                </div>
              )}

              {navRow}
              </SectionCard>
            </>
          )}

          {step === 4 && (
            <>
              <StepCaption index={3} />
              <SectionCard title="Results breakdown" collapsible={false}>
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
                <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 18, padding: '12px 16px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="alertCircle" size={16} color="var(--red)" />
                  {itemMode === 'single' ? error : multiError}
                </div>
              )}

              {/* A missing QR should be explained, not silently absent — the
                  usual cause is the public domain not being configured yet. */}
              {shareNotice && (
                <div style={{ marginBottom: 18, padding: '11px 15px', borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon name="info" size={15} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <strong>Exported without a QR code.</strong> {shareNotice} The report link itself was still saved, so it will work once that's set.
                  </div>
                </div>
              )}

              {/* Manual-override banner — the figures below aren't purely
                  tariff-sourced, and that has to be visible on the result
                  itself, not only in the fine print. */}
              {result && (result.overridden_fields?.length ?? 0) > 0 && (
                <div style={{ marginBottom: 18, padding: '12px 16px', borderRadius: 'var(--r)', background: 'var(--gold-l)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Icon name="alertTriangle" size={16} color="var(--gold)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--gold)' }}>Manual rate override in effect.</strong>{' '}
                    {result.overridden_fields!.map(f => OVERRIDE_LABELS[f] ?? f).join(', ')}
                    {' '}— entered in Advanced Settings, not sourced from the EAC CET tariff database or a published TPA/TRA rate. Verify before sending this to a customer.
                  </div>
                </div>
              )}

              {calcLoading && (
                <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
                  <Icon name="sliders" size={32} color="var(--teal)" style={{ display: 'block', margin: '0 auto 12px', animation: 'ds-spin 1.2s linear infinite' }} />
                  Fetching live rates and calculating landed cost…
                </div>
              )}

              {itemMode === 'single' && result && !calcLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <div>
                    {/* Quick-read summary stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Effective Statutory Rate</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{result.effective_statutory_rate_pct.toFixed(1)}%</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>of CIF (duty+excise+RDL+CPF+VAT)</div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Landed Multiplier</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{result.landed_multiplier.toFixed(2)}×</div>
                        <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>landed cost ÷ CIF value</div>
                      </div>
                      {result.fob_usd != null && (
                        <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>FOB + Freight + Insurance</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>
                            {fmtUsd(result.fob_usd)} + {fmtUsd(result.freight_usd ?? 0)} + {fmtUsd(result.insurance_usd ?? 0)}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 2 }}>= {fmtUsd(result.cif_usd)} CIF</div>
                        </div>
                      )}
                    </div>

                    {/* Compliance alerts */}
                    {(result.pvoc_required || result.di_required || (result.permits?.length > 0)) && (
                      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--gold-l)', border: '1px solid var(--gold)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--ink)' }}>
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
                      <div style={{ background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                        <div style={{ padding: '14px 18px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '20px 18px', background: 'var(--card-bg, var(--white))' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Icon name="sparkle" size={16} color="var(--teal)" />
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>AI Analysis</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginBottom: 16, lineHeight: 1.6 }}>Review an explanation of the landed cost and compliance results.</div>

                        {aiError && (
                          <div style={{ marginBottom: 14, padding: '11px 14px', background: 'var(--red-l)', border: '1px solid var(--red)', borderRadius: 'var(--r)', fontSize: 12.5, color: 'var(--red)', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <Icon name="alertCircle" size={14} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
                            <span>
                              {aiError}
                              {aiError.toLowerCase().includes('not configured') && ' Ask an admin to add an AI provider key under Settings → Integrations → AI Integration.'}
                            </span>
                          </div>
                        )}

                        <button type="button" onClick={runAi} disabled={aiPending}
                          style={{ width: '100%', padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: 'none', background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))', fontWeight: 700, fontSize: 14, cursor: aiPending ? 'default' : 'pointer', opacity: aiPending ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px var(--teal-m)', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                          <Icon name="sparkle" size={14} color="#fff" />
                          {aiPending ? 'Analysing…' : aiError ? 'Retry AI Analysis' : 'Run AI Analysis'}
                        </button>
                      </div>
                    )}

                    {/* HS Tariff summary box */}
                    {hsSelected && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '18px 20px', background: 'rgba(255,255,255,0.03)', fontSize: 13 }}>
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
                      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', background: 'var(--card-bg, var(--white))', fontSize: 12.5 }}>
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

                    <div className="lcp-btn-row-3">
                      <button type="button" onClick={() => setStep(3)}
                        style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        <Icon name="edit" size={15} color="var(--ink2)" />
                        Amend details
                      </button>
                      <button type="button" onClick={async () => { if (!result) return; const rc = await fetchRateCardDefaults(rateCardKeyFor(result.mode, container), icdOperatorId); const sc = await fetchSizeCards(result, icdOperatorId); const share = await createShareForReport(result, reportMeta, { result, qty, summary, extraItems, container, rateCard: rc, sizeCards: sc, meta: reportMeta }); setShareNotice(share.qrUnavailableReason ?? ''); printReport(result, qty, summary, extraItems, container, rc, { ...reportMeta, ...share }, sc); }}
                        style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--teal)', background: 'var(--card-bg, var(--white))', color: 'var(--teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        <Icon name="download" size={15} color="var(--teal)" />
                        Export PDF
                      </button>

                      {/* Filing a report is a page, not a modal: it carries an attachment
                          upload and the calculation itself, and a half-written report
                          should survive a mis-click. */}
                      <button type="button" onClick={() => navigate('/clearos/report-issue')}
                        style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                        <Icon name="alertCircle" size={15} color="var(--ink2)" />
                        Report an issue
                      </button>
                      <button type="button" onClick={newCalculation}
                        style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
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
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Line Items</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.items.length}</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Effective Statutory Rate</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.totals.effective_statutory_rate_pct.toFixed(1)}%</div>
                    </div>
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Landed Multiplier</div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.totals.landed_multiplier.toFixed(2)}×</div>
                    </div>
                    {multiResult.chargeable_weight_kg != null && (
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Chargeable Weight</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{multiResult.chargeable_weight_kg.toFixed(0)} kg</div>
                      </div>
                    )}
                  </div>

                  {/* Per-item table */}
                  <div style={{ border: '1px solid var(--teal)', borderRadius: 'var(--card-radius)', overflow: 'hidden', boxShadow: '0 4px 20px var(--teal-l)' }}>
                    <div style={{ padding: '16px 22px', background: 'var(--teal-l)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Icon name="package" size={18} color="var(--teal)" />
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Per-Item Breakdown</span>
                      <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>— select a line to amend it</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink3)' }}>{multiResult.destination_charge_label}</span>
                    </div>
                    {/* Scrolls inside itself rather than lengthening the page:
                        200 lines used to push the summary, the warnings and the
                        Export button several thousand pixels below the fold. */}
                    <div className="lcp-tscroll">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                          {['#', 'Description', 'HS Code', 'Qty', 'CIF (TZS)', 'Duty', 'VAT', 'Other', 'Landed Total'].map(h => (
                            <th key={h} style={{ textAlign: h === 'Description' ? 'left' : 'right', padding: '8px 12px', color: 'var(--ink3)', fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {multiResult.items.map((it, i) => (
                          <tr key={it.line_no}
                            tabIndex={0}
                            title={`Amend "${it.description}" — opens this line on Cargo Items`}
                            onClick={() => amendLine(i)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); amendLine(i); } }}>
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
                        {/* --teal-l, not a hand-mixed tint: the totals row is
                            pinned over scrolling content, so it has to be
                            opaque, and this is the same tint the rest of the
                            app derives from the live brand colour. */}
                        <tr>
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
                  </div>

                  {/* What this workspace actually paid on comparable jobs.
                      A cross-check, not an input — the figures above stay
                      traceable to the Rate Card and the tariff. */}
                  {priors.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px', background: 'var(--card-bg, var(--white))' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Icon name="clock" size={15} color="var(--green)" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>What you actually paid before</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 10, lineHeight: 1.5 }}>
                        Median of your own recorded costs. Nothing here has been applied to the estimate above — that stays sourced from your Rate Card and the tariff.
                      </div>
                      {priors.map(p => {
                        const est = ESTIMATE_BY_HEAD(multiResult)[p.head];
                        const gap = est != null && est > 0 ? Math.round(((p.medianTzs - est) / est) * 1000) / 10 : null;
                        return (
                          <div key={p.head} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5, flexWrap: 'wrap' }}>
                            <span style={{ color: 'var(--ink2)' }}>
                              {CHARGE_HEAD_LABEL[p.head] ?? p.head}
                              <span style={{ color: 'var(--ink3)', fontSize: 11 }}> · {p.sample} job{p.sample === 1 ? '' : 's'} in {p.windowDays} days</span>
                            </span>
                            <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                              <strong style={{ color: 'var(--ink)' }}>TZS {fmt(p.medianTzs)}</strong>
                              {gap != null && (
                                <span style={{ marginLeft: 8, color: gap > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
                                  {gap > 0 ? '+' : ''}{gap}% vs this estimate
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* VAT incl/excl */}
                  <div style={{ padding: '12px 14px', borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal-m)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ink2)' }}>Total incl. VAT</span>
                      <strong style={{ color: 'var(--ink)' }}>TZS {fmt(multiResult.totals.total)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, marginTop: 6 }}>
                      <span style={{ color: 'var(--ink2)' }}>Total excl. VAT <span style={{ color: 'var(--ink3)' }}>(VAT recoverable)</span></span>
                      <strong style={{ color: 'var(--teal)' }}>TZS {fmt(multiResult.totals.total_ex_vat)}</strong>
                    </div>
                  </div>

                  {/* Warnings & assumptions */}
                  {(multiResult.warnings.length > 0 || multiResult.assumptions.length > 0) && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', background: 'var(--card-bg, var(--white))', fontSize: 12.5 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="alertCircle" size={15} color="var(--ink3)" /> Assumptions &amp; Warnings
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 500, color: 'var(--ink3)' }}>
                          {multiResult.warnings.length + multiResult.assumptions.length} note{multiResult.warnings.length + multiResult.assumptions.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      {/* A 200-line consignment raises a PVoC or inspection note
                          per line, which ran to several thousand pixels of page
                          below the results. Scrolls in place like the table. */}
                      <div className="lcp-tscroll" style={{ maxHeight: 260 }}>
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
                    </div>
                  )}

                  <div className="lcp-btn-row-3">
                    {/* Going back to fix one line should not mean re-entering
                        the whole invoice. Step 3 keeps every row, and the
                        figures recalculate on return. */}
                    <button type="button" onClick={() => setStep(3)}
                      style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="edit" size={15} color="var(--ink2)" />
                      Amend items
                    </button>
                    <button type="button" onClick={async () => {
                      if (!multiResult) return;
                      // Same Rate Card lookup the single-item report does — without it
                      // the ICD card fell back to one lump sum and the agency card was
                      // empty, on a report meant to be handed to a client.
                      const lots = containerLotsPayload(containerLots);
                      const rc = await fetchRateCardDefaults(rateCardKeyFor(multiResult.mode, container), icdOperatorId);
                      const sc = await fetchSizeCardsForLots(lots, icdOperatorId);
                      const share = await createShareForMulti(multiResult, reportMeta, { rateCard: rc, sizeCards: sc, lots });
                      setShareNotice(share.qrUnavailableReason ?? '');
                      printMultiReport(multiResult, { ...reportMeta, ...share }, rc, sc, lots);
                    }}
                      style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--teal)', background: 'var(--card-bg, var(--white))', color: 'var(--teal)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="download" size={15} color="var(--teal)" />
                      Export PDF
                    </button>
                    {/* Filing a report is a page, not a modal: it carries an
                        attachment upload and the calculation itself, and a
                        half-written report should survive a mis-click. */}
                    <button type="button" onClick={() => navigate('/clearos/report-issue')}
                      style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="alertCircle" size={15} color="var(--ink2)" />
                      Report an issue
                    </button>
                    <button type="button" onClick={newCalculation}
                      style={{ padding: 'var(--ds-btn-py) 0', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', background: 'var(--card-bg, var(--white))', color: 'var(--ink2)', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 'var(--ctl-h)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      New Calculation
                    </button>
                  </div>
                </div>
              )}

              {navRow}
              </SectionCard>
            </>
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
                    style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: isMulti ? 'default' : 'pointer', fontSize: 12.5, opacity: isMulti ? 0.7 : 1 }}
                    onMouseEnter={e => { if (!isMulti) e.currentTarget.style.borderColor = 'var(--teal)'; }}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ fontWeight: 700, color: 'var(--teal)' }}>{isMulti ? 'Multi-item' : `HS ${h.hs_code}`}</div>
                    <div style={{ color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{h.description}</div>
                    <div style={{ fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>TZS {fmt(h.total_tzs ?? h.total)}</div>
                    {isMulti && <div style={{ color: 'var(--ink3)', fontSize: 11, marginTop: 2 }}>View-only — re-enter items to recalculate</div>}
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
