/**
 * Customs Intelligence Service
 * Handles HS code lookups, tariff calculations, landed cost,
 * compliance checks, penalty assessment, and vessel tracking.
 *
 * Free APIs used:
 * - open.er-api.com  (FX rates, no key needed)
 * - aisstream.io     (AIS vessel tracking, free key)
 * - Internal HS codes DB seeded with EAC CET 2022 data
 */

import https from 'https';
import { db } from '../db/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// FX Rate (open.er-api.com — truly free, no key required)
// ─────────────────────────────────────────────────────────────────────────────

let _fxCache: { rate: number; fetchedAt: number } | null = null;

export async function getUsdToTzs(): Promise<number> {
  // Cache for 1 hour
  if (_fxCache && Date.now() - _fxCache.fetchedAt < 3_600_000) {
    return _fxCache.rate;
  }

  try {
    const data = await new Promise<any>((resolve, reject) => {
      const req = https.get('https://open.er-api.com/v6/latest/USD', (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Bad JSON')); }
        });
      });
      req.on('error', reject);
      req.setTimeout(6000, () => req.destroy(new Error('Timeout')));
    });

    const rate = data?.rates?.TZS ?? 2540;
    _fxCache = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    return _fxCache?.rate ?? 2540; // fallback
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HS Code Lookup
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_ALIASES: Record<string, string[]> = {
  laptop: ['portable', 'data processing', 'computer', 'notebook'],
  laptops: ['portable', 'data processing', 'computer', 'notebook'],
  notebook: ['portable', 'data processing', 'computer'],
  pc: ['computer', 'data processing'],
  phone: ['telephone', 'cellular', 'mobile'],
  phones: ['telephone', 'cellular', 'mobile'],
  mobile: ['cellular', 'telephone', 'mobile'],
  car: ['passenger', 'motor vehicle', 'automobile'],
  cars: ['passenger', 'motor vehicle', 'automobile'],
  auto: ['motor vehicle'],
  automobile: ['motor vehicle'],
  truck: ['goods vehicle', 'lorry', 'motor vehicle'],
  trucks: ['goods vehicle', 'lorry', 'motor vehicle'],
  clothing: ['apparel', 'garment', 'textile'],
  clothes: ['apparel', 'garment', 'textile'],
  garment: ['apparel', 'textile'],
  shoes: ['footwear'],
  shoe: ['footwear'],
  boots: ['footwear'],
  tv: ['television'],
  tvs: ['television'],
  solar: ['photovoltaic', 'solar'],
  panel: ['photovoltaic'],
  medicine: ['medicament', 'pharmaceutical'],
  medication: ['medicament'],
  drug: ['medicament'],
  drugs: ['medicament'],
  maize: ['corn'],
  corn: ['maize'],
  wheat: ['meslin'],
  rice: ['paddy'],
  cement: ['hydraulic', 'portland'],
};

export async function searchHsCodes(query: string, limit = 20) {
  if (!query || query.trim().length < 2) return [];

  const q = query.trim();
  const isNumeric = /^[\d.]+$/.test(q);

  const { sql } = await import('kysely');

  if (isNumeric) {
    // Numeric: match by code prefix, dot-insensitively — codes are stored
    // dotted ("2523.29.00") but users type/paste with or without dots.
    const digits = q.replace(/\./g, '');
    return db.selectFrom('hs_codes')
      .selectAll()
      .where(sql<boolean>`replace(code, '.', '') LIKE ${digits + '%'}`)
      .orderBy('level', 'desc')
      .orderBy('code', 'asc')
      .limit(limit)
      .execute();
  }

  const qLower = q.toLowerCase();
  const searchTerms = Array.from(new Set([qLower, ...(COMMON_ALIASES[qLower] || [])]));

  // Text search across terms using ILIKE
  return db.selectFrom('hs_codes')
    .selectAll()
    .where(eb => eb.or(
      searchTerms.flatMap(term => [
        eb('description', 'ilike', `%${term}%`),
        eb('notes', 'ilike', `%${term}%`),
        eb('code', 'ilike', `%${term}%`),
      ])
    ))
    .orderBy('level', 'desc')
    .orderBy('code', 'asc')
    .limit(limit)
    .execute();
}

export async function getHsCode(code: string) {
  const { sql } = await import('kysely');
  const normalized = code.replace(/\s/g, '');
  const digits = normalized.replace(/\./g, '');

  // Exact match, dot-insensitive ("25232900" and "2523.29.00" both hit)
  const entry = await db.selectFrom('hs_codes')
    .selectAll()
    .where(sql<boolean>`replace(code, '.', '') = ${digits}`)
    .orderBy('level', 'desc')
    .executeTakeFirst();

  if (entry) return entry;

  // Fall back to the closest ancestor: longest code prefix wins
  // (8471.30 not found → try 8471.* line, then 84.71 heading, then 84).
  if (/^\d+$/.test(digits) && digits.length >= 2) {
    const parent = await db.selectFrom('hs_codes')
      .selectAll()
      .where(sql<boolean>`${digits} LIKE replace(code, '.', '') || '%'`)
      .orderBy('level', 'desc')
      .executeTakeFirst();
    return parent ?? null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Destination charge — shared between the single-item and multi-item
// calculators. Sea FCL is charged per container, Sea LCL and Air are charged
// per CBM / chargeable weight rather than a flat container rate (LCL/Air
// consignments don't occupy a whole container, so a flat per-container
// charge was previously either $0 for these modes or wrong).
// ─────────────────────────────────────────────────────────────────────────────

export type ShipmentMode = 'sea_fcl' | 'sea_lcl' | 'air';

export interface DestinationChargeInput {
  mode: ShipmentMode;
  container?: '20ft' | '40ft';   // sea_fcl
  num_containers?: number;       // sea_fcl, default 1
  cbm?: number;                  // sea_lcl, air
  weight_kg?: number;            // air
  /** Escape hatch for a caller-supplied flat charge (e.g. an agreed FCL rate
   *  that differs from the defaults below) — takes priority over the mode
   *  defaults when provided. */
  override_tzs?: number;
}

export interface DestinationChargeResult {
  amount_tzs: number;
  label: string;
  chargeable_weight_kg: number | null;
}

// IATA volumetric-weight divisor: 1 CBM ≈ 166.67 kg for air chargeable-weight
// purposes (1,000,000 cm³ / 6,000 cm³-per-kg).
const AIR_VOLUMETRIC_KG_PER_CBM = 166.67;
const AIR_HANDLING_TZS_PER_KG = 242;       // general cargo handling rate
const AIR_DOCUMENTATION_TZS = 55_000;      // flat, per AWB
const SEA_LCL_TZS_PER_CBM = 130_000;       // consolidated LCL handling estimate
const SEA_FCL_ICD_TZS = { '20ft': 450_000, '40ft': 560_000 } as const;

export function computeDestinationCharge(input: DestinationChargeInput): DestinationChargeResult {
  if (input.override_tzs != null) {
    return { amount_tzs: input.override_tzs, label: 'ICD / Port Charges (custom rate)', chargeable_weight_kg: null };
  }

  if (input.mode === 'air') {
    const cbm = input.cbm ?? 0;
    const grossKg = input.weight_kg ?? 0;
    const volumetricKg = cbm * AIR_VOLUMETRIC_KG_PER_CBM;
    const chargeableKg = Math.max(grossKg, volumetricKg);
    const amount = AIR_DOCUMENTATION_TZS + chargeableKg * AIR_HANDLING_TZS_PER_KG;
    return {
      amount_tzs: amount,
      label: `Air Handling (${chargeableKg.toFixed(0)} kg chargeable)`,
      chargeable_weight_kg: chargeableKg,
    };
  }

  if (input.mode === 'sea_lcl') {
    const cbm = input.cbm ?? 0;
    return {
      amount_tzs: cbm * SEA_LCL_TZS_PER_CBM,
      label: `LCL Handling (${cbm} CBM)`,
      chargeable_weight_kg: null,
    };
  }

  // sea_fcl
  const container = input.container ?? '20ft';
  const numContainers = input.num_containers ?? 1;
  const perContainer = SEA_FCL_ICD_TZS[container];
  return {
    amount_tzs: perContainer * numContainers,
    label: `ICD / Port Charges (${numContainers}× ${container})`,
    chargeable_weight_kg: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Landed Cost Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface LandedCostInput {
  hs_code: string;
  cif_usd: number;
  qty?: number;
  icd_per_container?: number;    // TZS — legacy flat override, see DestinationChargeInput.override_tzs
  num_containers?: number;       // default 1
  fx_rate_override?: number;     // override live rate
  shipment_ref?: string;
  description?: string;
  /** Optional breakdown of how cif_usd was derived — informational only,
   *  doesn't change the calculation (the caller has already summed these
   *  into cif_usd), but lets the UI show its working. */
  fob_usd?: number;
  freight_usd?: number;
  insurance_usd?: number;
  mode?: ShipmentMode;           // default 'sea_fcl'
  container?: '20ft' | '40ft';
  cbm?: number;
  weight_kg?: number;
}

export interface LandedCostResult {
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
  /** Government-assessed charges only (duty+excise+rdl+cpf+vat), excluding
   *  commercial/port charges (ICD, wharfage) — the "TRA will assess this" vs
   *  "we estimate this" split. */
  statutory_total: number;
  /** Total landed cost minus VAT — for VAT-registered importers, import VAT
   *  is a recoverable input credit and shouldn't be counted as unit cost. */
  total_ex_vat: number;
  vat_recoverable: number;
  /** statutory_total / cif_tzs, as a percentage — "how much government take
   *  is layered on top of the goods' customs value". */
  effective_statutory_rate_pct: number;
  /** total / cif_tzs — "landed cost is this many times your CIF value". */
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

export async function calculateLandedCost(input: LandedCostInput): Promise<LandedCostResult> {
  const hsEntry = await getHsCode(input.hs_code);
  const fxRate = input.fx_rate_override ?? await getUsdToTzs();
  const qty = input.qty ?? 1;

  // CPF raised from 0.6% to 1% of FOB under the Finance Act 2026 (effective
  // 2026-07-01) — hs_codes.cpf_rate was bulk-updated to 1.0 accordingly; the
  // fallback below (used only when an HS code isn't found in our DB) mirrors
  // that same rate rather than the old, now-incorrect 0.6.
  const dutyRate    = hsEntry ? Number(hsEntry.import_duty_rate) : 25;
  const vatRate     = hsEntry ? Number(hsEntry.vat_rate) : 18;
  const exciseRate  = hsEntry ? Number(hsEntry.excise_rate) : 0;
  const rdlRate     = hsEntry ? Number(hsEntry.rdl_rate) : 1.5;
  const cpfRate     = hsEntry ? Number(hsEntry.cpf_rate) : 1;
  const description = hsEntry?.description ?? 'General goods';
  const pvocReq     = hsEntry?.pvoc_required ?? false;
  const diReq       = hsEntry?.di_required ?? false;
  const permits     = hsEntry?.permits ? hsEntry.permits.split(',').map((p: string) => p.trim()) : [];

  const mode = input.mode ?? 'sea_fcl';
  const destCharge = computeDestinationCharge({
    mode, container: input.container, num_containers: input.num_containers,
    cbm: input.cbm, weight_kg: input.weight_kg, override_tzs: input.icd_per_container,
  });

  const cifTzs   = input.cif_usd * fxRate;
  const duty     = cifTzs * dutyRate / 100;
  const excise   = cifTzs * exciseRate / 100;
  const rdl      = cifTzs * rdlRate / 100;
  const cpf      = cifTzs * cpfRate / 100;
  const vat      = (cifTzs + duty + excise) * vatRate / 100;
  const icd      = destCharge.amount_tzs;
  const wharfage = cifTzs * 0.005; // TPA wharfage 0.5%
  const total    = cifTzs + duty + excise + vat + rdl + cpf + icd + wharfage;
  const perUnit  = total / qty;

  // Statutory (TRA-assessed) vs commercial (port/agency-estimated) split —
  // duty/excise/rdl/cpf/vat are government charges; icd/wharfage are our
  // best estimate of port and handling costs, not a TRA assessment.
  const statutoryTotal = duty + excise + rdl + cpf + vat;
  const totalExVat = total - vat;
  const effectiveStatutoryRatePct = cifTzs > 0 ? (statutoryTotal / cifTzs) * 100 : 0;
  const landedMultiplier = cifTzs > 0 ? total / cifTzs : 0;

  const breakdown = [
    { label: 'CIF Value (TZS)', amount: cifTzs },
    { label: `Import Duty (${dutyRate}% EAC CET)`, amount: duty, rate: `${dutyRate}%` },
    ...(exciseRate > 0 ? [{ label: `Excise Duty (${exciseRate}%)`, amount: excise, rate: `${exciseRate}%` }] : []),
    { label: `VAT ${vatRate}%  (CIF + Duty${exciseRate ? ' + Excise' : ''})`, amount: vat, rate: `${vatRate}%` },
    { label: `Railway Development Levy (${rdlRate}%)`, amount: rdl, rate: `${rdlRate}%` },
    { label: `Customs Processing Fee (${cpfRate}%)`, amount: cpf, rate: `${cpfRate}%` },
    { label: destCharge.label, amount: icd },
    { label: 'TPA Wharfage (0.5%)', amount: wharfage, rate: '0.5%' },
    { label: 'Total Landed Cost (TZS)', amount: total },
    ...(qty > 1 ? [{ label: `Per Unit (÷ ${qty})`, amount: perUnit }] : []),
  ];

  const destAssumption = mode === 'air'
    ? `Air handling is estimated at TZS ${AIR_DOCUMENTATION_TZS.toLocaleString()} documentation + TZS ${AIR_HANDLING_TZS_PER_KG}/kg chargeable weight (gross vs. volumetric CBM×166.67, whichever is greater) — confirm against your airline/agent's actual tariff.`
    : mode === 'sea_lcl'
      ? `LCL handling is estimated at TZS ${SEA_LCL_TZS_PER_CBM.toLocaleString()}/CBM — confirm against your consolidator's actual rate.`
      : 'ICD/port charges are a default per-container estimate; confirm your actual container handling agreement.';

  const warnings: string[] = [];
  const assumptions: string[] = [
    'Duty, excise, RDL, CPF and VAT rates are sourced from our EAC CET 2022 tariff database — verify current rates with TRA before final declaration.',
    destAssumption,
    'CPF is calculated at 1% per the Finance Act 2026 (effective 1 Jul 2026) — verify with TRA if your declaration predates this.',
  ];
  if (pvocReq) warnings.push('Pre-Verification of Conformity (PVoC/CoC) certificate is required before shipment.');
  if (diReq) warnings.push('Destination Inspection (DI) is required on arrival.');
  for (const p of permits) warnings.push(`${p} permit/approval is required for this HS code.`);
  if (!hsEntry) warnings.push(`HS code ${input.hs_code} was not found in our tariff database — rates shown use generic fallback values, not this code's actual EAC CET rate.`);
  for (const w of await checkWmaCompliance(input.hs_code)) {
    if (w.confidence === 'broad') continue; // chapter-wide "pending TBS guidance" flags are informational, not per-line
    warnings.push(`Weights and Measures Act: ${w.obligation_trigger} (${w.wma_class}, derived mapping — verify with WMA/TBS).`);
  }

  return {
    hs_code: input.hs_code,
    description,
    cif_usd: input.cif_usd,
    fx_rate: fxRate,
    cif_tzs: cifTzs,
    duty_rate: dutyRate,
    duty,
    vat,
    rdl,
    cpf,
    excise,
    icd,
    wharfage,
    total,
    per_unit: perUnit,
    qty,
    pvoc_required: pvocReq,
    di_required: diReq,
    permits,
    notes: hsEntry?.notes ?? null,
    breakdown,
    statutory_total: statutoryTotal,
    total_ex_vat: totalExVat,
    vat_recoverable: vat,
    mode,
    destination_charge_label: destCharge.label,
    chargeable_weight_kg: destCharge.chargeable_weight_kg,
    effective_statutory_rate_pct: effectiveStatutoryRatePct,
    landed_multiplier: landedMultiplier,
    fob_usd: input.fob_usd,
    freight_usd: input.freight_usd,
    insurance_usd: input.insurance_usd,
    warnings,
    assumptions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Item Landed Cost Calculator
//
// Real invoices are rarely one HS code. Duty/excise/RDL/CPF/VAT are assessed
// per line item (each can carry a different rate), while freight/insurance
// and the destination charge are shipment-level costs that must be
// apportioned down to line level — otherwise line-level duty can't be
// computed at all. Apportionment basis is FOB value share (the standard,
// simplest-to-defend basis), using largest-remainder rounding so allocated
// amounts always sum exactly to the shipment total instead of leaking
// rounding error the way naive per-line division does.
// ─────────────────────────────────────────────────────────────────────────────

export interface MultiLineItemInput {
  description: string;
  hs_code: string;
  qty: number;
  unit_price_usd: number;
}

export interface MultiItemInput {
  items: MultiLineItemInput[];
  freight_usd: number;
  /** Defaults to 1% of CFR (FOB + freight) if omitted. */
  insurance_usd?: number;
  fx_rate_override?: number;
  mode: ShipmentMode;
  container?: '20ft' | '40ft';
  num_containers?: number;
  cbm?: number;
  weight_kg?: number;
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
    fob_usd: number;
    fob_tzs: number;
    freight_tzs: number;
    insurance_tzs: number;
    cif_tzs: number;
    duty: number;
    excise: number;
    rdl: number;
    cpf: number;
    vat: number;
    destination: number;
    wharfage: number;
    statutory_total: number;
    total: number;
    total_ex_vat: number;
    effective_statutory_rate_pct: number;
    landed_multiplier: number;
  };
  warnings: string[];
  assumptions: string[];
}

export async function calculateMultiItemLandedCost(input: MultiItemInput): Promise<MultiItemResult> {
  const items = (input.items ?? []).filter(it => it.qty > 0 && it.unit_price_usd >= 0 && it.hs_code?.trim());
  if (items.length === 0) {
    throw new Error('At least one line item with a valid HS code, quantity and unit price is required.');
  }

  const fxRate = input.fx_rate_override ?? await getUsdToTzs();
  const hsEntries = await Promise.all(items.map(it => getHsCode(it.hs_code)));
  const wmaMatchesPerItem = await Promise.all(items.map(it => checkWmaCompliance(it.hs_code)));

  const fobUsdPerItem = items.map(it => it.qty * it.unit_price_usd);
  const totalFobUsd = fobUsdPerItem.reduce((a, b) => a + b, 0);
  if (totalFobUsd <= 0) throw new Error('Total FOB value must be greater than zero.');

  const freightUsd = input.freight_usd ?? 0;
  const insuranceUsd = input.insurance_usd ?? (totalFobUsd + freightUsd) * 0.01;

  const destCharge = computeDestinationCharge({
    mode: input.mode, container: input.container, num_containers: input.num_containers,
    cbm: input.cbm, weight_kg: input.weight_kg,
  });

  const totalFobTzs = totalFobUsd * fxRate;
  const totalFreightTzs = freightUsd * fxRate;
  const totalInsuranceTzs = insuranceUsd * fxRate;
  const totalDestinationTzs = destCharge.amount_tzs;

  /** Largest-remainder apportionment by FOB-value share — the allocated
   *  shares always sum exactly to the rounded total (see module comment). */
  function apportion(total: number): number[] {
    const totalInt = Math.round(total);
    if (totalFobUsd === 0 || totalInt === 0) return items.map(() => 0);
    const raw = fobUsdPerItem.map(fob => (fob / totalFobUsd) * totalInt);
    const floors = raw.map(Math.floor);
    const remainder = totalInt - floors.reduce((a, b) => a + b, 0);
    const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac);
    const result = [...floors];
    for (let k = 0; k < remainder; k++) result[order[k % order.length].i] += 1;
    return result;
  }

  const freightAlloc = apportion(totalFreightTzs);
  const insuranceAlloc = apportion(totalInsuranceTzs);
  const destinationAlloc = apportion(totalDestinationTzs);

  const lineResults: MultiLineItemResult[] = [];
  const warnings: string[] = [];
  let sumDuty = 0, sumExcise = 0, sumRdl = 0, sumCpf = 0, sumVat = 0, sumWharfage = 0,
      sumStatutory = 0, sumLanded = 0, sumLandedExVat = 0;

  items.forEach((it, i) => {
    const hsEntry = hsEntries[i];
    const dutyRate = hsEntry ? Number(hsEntry.import_duty_rate) : 25;
    const vatRate = hsEntry ? Number(hsEntry.vat_rate) : 18;
    const exciseRate = hsEntry ? Number(hsEntry.excise_rate) : 0;
    const rdlRate = hsEntry ? Number(hsEntry.rdl_rate) : 1.5;
    const cpfRate = hsEntry ? Number(hsEntry.cpf_rate) : 1;
    const pvocReq = hsEntry?.pvoc_required ?? false;
    const diReq = hsEntry?.di_required ?? false;
    const permits = hsEntry?.permits ? hsEntry.permits.split(',').map((p: string) => p.trim()) : [];

    const fobTzs = fobUsdPerItem[i] * fxRate;
    const freightTzs = freightAlloc[i];
    const insuranceTzs = insuranceAlloc[i];
    const cifTzs = fobTzs + freightTzs + insuranceTzs;

    const duty = cifTzs * dutyRate / 100;
    const excise = cifTzs * exciseRate / 100;
    const rdl = cifTzs * rdlRate / 100;
    const cpf = cifTzs * cpfRate / 100;
    const vat = (cifTzs + duty + excise) * vatRate / 100;
    const destinationTzs = destinationAlloc[i];
    const wharfage = cifTzs * 0.005;
    const statutoryTotal = duty + excise + rdl + cpf + vat;
    const landedTotal = cifTzs + duty + excise + vat + rdl + cpf + destinationTzs + wharfage;
    const landedTotalExVat = landedTotal - vat;

    const label = it.description || hsEntry?.description || it.hs_code;
    if (pvocReq) warnings.push(`Line ${i + 1} (${label}): PVoC/CoC certificate required.`);
    if (diReq) warnings.push(`Line ${i + 1} (${label}): Destination Inspection required.`);
    for (const p of permits) warnings.push(`Line ${i + 1} (${label}): ${p} permit/approval required.`);
    if (!hsEntry) warnings.push(`Line ${i + 1}: HS code "${it.hs_code}" not found in tariff database — generic fallback rates used, not this code's actual EAC CET rate.`);
    for (const w of wmaMatchesPerItem[i]) {
      if (w.confidence === 'broad') continue;
      warnings.push(`Line ${i + 1} (${label}): Weights and Measures Act — ${w.obligation_trigger} (${w.wma_class}, derived mapping — verify with WMA/TBS).`);
    }

    sumDuty += duty; sumExcise += excise; sumRdl += rdl; sumCpf += cpf; sumVat += vat; sumWharfage += wharfage;
    sumStatutory += statutoryTotal; sumLanded += landedTotal; sumLandedExVat += landedTotalExVat;

    lineResults.push({
      line_no: i + 1, description: it.description || hsEntry?.description || 'Unclassified', hs_code: it.hs_code,
      qty: it.qty, unit_price_usd: it.unit_price_usd, fob_usd: fobUsdPerItem[i], fob_tzs: fobTzs,
      allocated_freight_tzs: freightTzs, allocated_insurance_tzs: insuranceTzs, cif_tzs: cifTzs,
      duty_rate: dutyRate, vat_rate: vatRate, excise_rate: exciseRate, rdl_rate: rdlRate, cpf_rate: cpfRate,
      duty, excise, rdl, cpf, vat, allocated_destination_tzs: destinationTzs, wharfage,
      statutory_total: statutoryTotal, landed_total: landedTotal, landed_total_ex_vat: landedTotalExVat,
      pvoc_required: pvocReq, di_required: diReq, permits, hs_found: !!hsEntry,
    });
  });

  const cifTzsTotal = totalFobTzs + totalFreightTzs + totalInsuranceTzs;
  const effectiveStatutoryRatePct = cifTzsTotal > 0 ? (sumStatutory / cifTzsTotal) * 100 : 0;
  const landedMultiplier = cifTzsTotal > 0 ? sumLanded / cifTzsTotal : 0;

  const destAssumption = input.mode === 'air'
    ? `Air handling is estimated at TZS ${AIR_DOCUMENTATION_TZS.toLocaleString()} documentation + TZS ${AIR_HANDLING_TZS_PER_KG}/kg chargeable weight — confirm against your airline/agent's actual tariff.`
    : input.mode === 'sea_lcl'
      ? `LCL handling is estimated at TZS ${SEA_LCL_TZS_PER_CBM.toLocaleString()}/CBM — confirm against your consolidator's actual rate.`
      : 'ICD/port charges are a default per-container estimate; confirm your actual container handling agreement.';

  return {
    fx_rate: fxRate,
    mode: input.mode,
    destination_charge_label: destCharge.label,
    chargeable_weight_kg: destCharge.chargeable_weight_kg,
    items: lineResults,
    totals: {
      fob_usd: totalFobUsd, fob_tzs: totalFobTzs, freight_tzs: totalFreightTzs, insurance_tzs: totalInsuranceTzs,
      cif_tzs: cifTzsTotal, duty: sumDuty, excise: sumExcise, rdl: sumRdl, cpf: sumCpf, vat: sumVat,
      destination: totalDestinationTzs, wharfage: sumWharfage, statutory_total: sumStatutory,
      total: sumLanded, total_ex_vat: sumLandedExVat,
      effective_statutory_rate_pct: effectiveStatutoryRatePct, landed_multiplier: landedMultiplier,
    },
    warnings,
    assumptions: [
      'Duty, excise, RDL, CPF and VAT rates are sourced from our EAC CET 2022 tariff database, per line item — verify current rates with TRA before final declaration.',
      'Freight, insurance and destination charges are apportioned across line items by FOB value share (largest-remainder rounding), the standard WTO valuation basis.',
      destAssumption,
      'CPF is calculated at 1% per the Finance Act 2026 (effective 1 Jul 2026) — verify with TRA if your declaration predates this.',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance Check
// ─────────────────────────────────────────────────────────────────────────────

const EAC_ORIGINS = new Set(['KE', 'UG', 'RW', 'BI', 'SS', 'TZ']);

export interface ComplianceInput {
  hs_code: string;
  origin_country: string;
  goods_value_usd?: number;
  import_or_export?: 'import' | 'export';
}

export interface ComplianceCheck {
  key: string;
  name: string;
  required: boolean;
  note: string;
  authority: string;
  link?: string;
  color: 'green' | 'amber' | 'red';
}

// ─────────────────────────────────────────────────────────────────────────────
// Weights and Measures Act (Cap 340) compliance flag
//
// The Act contains ZERO HS codes — it regulates by goods description and
// instrument type. wma_hs_codes (migration 091, seeded by
// seed-wma-compliance.ts) is a *derived* mapping, not an official crosswalk,
// and every match carries that caveat through to the UI via source_note.
// ─────────────────────────────────────────────────────────────────────────────

let _wmaCache: { rows: Awaited<ReturnType<typeof fetchWmaRows>>; fetchedAt: number } | null = null;

function fetchWmaRows() {
  return db.selectFrom('wma_hs_codes').selectAll().execute();
}

async function getWmaRows() {
  if (_wmaCache && Date.now() - _wmaCache.fetchedAt < 3_600_000) return _wmaCache.rows;
  const rows = await fetchWmaRows();
  _wmaCache = { rows, fetchedAt: Date.now() };
  return rows;
}

/** Ranges/codes are stored as digit-only strings at whatever precision the
 *  source data supports (4-digit heading or 6-digit subheading); comparison
 *  truncates to the shorter of query vs. reference precision so a specific
 *  query still matches a broader heading-level entry and vice versa. */
function hsInWmaRange(queryDigits: string, from: string, to: string): boolean {
  const len = Math.min(queryDigits.length, from.length);
  if (len === 0) return false;
  const q = queryDigits.slice(0, len);
  return q >= from.slice(0, len) && q <= to.slice(0, len);
}

export async function checkWmaCompliance(hsCode: string) {
  const digits = hsCode.replace(/\D/g, '');
  if (!digits) return [];
  const rows = await getWmaRows();
  return rows.filter(r => hsInWmaRange(digits, r.hs_code_from, r.hs_code_to));
}

export async function checkCompliance(input: ComplianceInput): Promise<ComplianceCheck[]> {
  const hs = await getHsCode(input.hs_code);
  const origin = input.origin_country.toUpperCase().trim();
  const isEAC = EAC_ORIGINS.has(origin);
  const ch = parseInt(input.hs_code.slice(0, 2), 10);
  const wmaMatches = await checkWmaCompliance(input.hs_code);

  const isFood     = ch >= 1  && ch <= 24;
  const isChem     = ch >= 28 && ch <= 38;
  const isPharma   = ch === 30;
  const isMach     = (ch >= 82 && ch <= 84) || ch === 87;
  const isTelecom  = ch === 85;
  const isVehicle  = ch === 87;
  const isPetro    = ch === 27;
  const isAlcohol  = ch === 22;

  const pvocReq = hs ? hs.pvoc_required : (!isEAC);
  const diReq   = hs ? hs.di_required : (!isEAC);
  const permits  = hs?.permits?.split(',').map((p: string) => p.trim()) ?? [];

  const checks: ComplianceCheck[] = [
    {
      key: 'tra_customs',
      name: 'TRA Customs Declaration (C17)',
      required: true,
      note: 'All imports require a TRA customs entry, duty assessment and payment via TANCIS.',
      authority: 'Tanzania Revenue Authority (TRA)',
      link: 'https://www.tra.go.tz',
      color: 'red',
    },
    {
      key: 'pvoc',
      name: 'Pre-Verification of Conformity (PVoC / CoC)',
      required: pvocReq,
      note: isEAC
        ? 'EAC origin — PVoC waived under the EAC Customs Union Protocol.'
        : pvocReq
          ? 'Certificate of Conformity required from a TBS-approved inspection body BEFORE shipment.'
          : 'Not required for this HS chapter.',
      authority: 'Tanzania Bureau of Standards (TBS)',
      link: 'https://www.tbs.go.tz',
      color: pvocReq ? 'red' : 'green',
    },
    {
      key: 'di',
      name: 'Destination Inspection (DI)',
      required: diReq,
      note: isEAC
        ? 'EAC origin — Destination Inspection waived.'
        : diReq
          ? 'Non-EAC imports must undergo Destination Inspection by COTECNA or appointed agent.'
          : 'Not mandatory for this HS chapter.',
      authority: 'TRA / COTECNA',
      link: 'https://www.cotecna.com/en/locations/tanzania',
      color: diReq ? 'red' : 'green',
    },
    {
      key: 'gcla',
      name: 'GCLA Import Permit',
      required: isFood || isChem || isPharma || permits.includes('GCLA'),
      note: (isFood || isChem || isPharma)
        ? 'Food, chemicals, cosmetics and pharmaceuticals require a GCLA import permit.'
        : 'Not required for this HS chapter.',
      authority: 'Government Chemist Laboratory Authority (GCLA)',
      link: 'https://www.gcla.go.tz',
      color: (isFood || isChem || isPharma) ? 'amber' : 'green',
    },
    {
      key: 'tbs',
      name: 'TBS Product Certification',
      required: !!hs?.pvoc_required || permits.includes('TBS'),
      note: 'Products must comply with Tanzania Bureau of Standards quality specifications.',
      authority: 'Tanzania Bureau of Standards (TBS)',
      link: 'https://www.tbs.go.tz',
      color: hs?.pvoc_required ? 'amber' : 'green',
    },
    ...(isMach ? [{
      key: 'camartec',
      name: 'CAMARTEC Type-Approval',
      required: true,
      note: 'Agricultural and rural-technology machinery requires CAMARTEC type-approval.',
      authority: 'CAMARTEC',
      link: 'https://www.camartec.or.tz',
      color: 'amber' as const,
    }] : []),
    ...(isTelecom ? [{
      key: 'tcra',
      name: 'TCRA Type Approval',
      required: true,
      note: 'Telecommunications equipment must be type-approved by TCRA before import.',
      authority: 'Tanzania Communications Regulatory Authority (TCRA)',
      link: 'https://www.tcra.go.tz',
      color: 'red' as const,
    }] : []),
    ...(isVehicle ? [{
      key: 'sumatra',
      name: 'SUMATRA Import Permit',
      required: true,
      note: 'Motor vehicles require SUMATRA import permit and roadworthiness inspection.',
      authority: 'Surface and Marine Transport Regulatory Authority (SUMATRA)',
      link: 'https://www.sumatra.go.tz',
      color: 'red' as const,
    }] : []),
    ...(isPetro ? [{
      key: 'ewura',
      name: 'EWURA Petroleum Import Licence',
      required: true,
      note: 'Petroleum products require an EWURA import licence and downstream sector compliance.',
      authority: 'Energy and Water Utilities Regulatory Authority (EWURA)',
      link: 'https://www.ewura.go.tz',
      color: 'red' as const,
    }] : []),
    ...(isAlcohol ? [{
      key: 'excise',
      name: 'Excise Duty & Liquor Licence',
      required: true,
      note: 'Alcoholic beverages attract high excise duty (35–110%) and require a retail liquor licence.',
      authority: 'TRA / Local Authority',
      link: 'https://www.tra.go.tz',
      color: 'red' as const,
    }] : []),
    ...(isPharma ? [{
      key: 'tmda',
      name: 'TMDA Product Registration',
      required: true,
      note: 'Pharmaceutical products must be registered with the Tanzania Medicines & Medical Devices Authority.',
      authority: 'Tanzania Medicines and Medical Devices Authority (TMDA)',
      link: 'https://www.tmda.go.tz',
      color: 'red' as const,
    }] : []),
    // Weights and Measures Act (Cap 340) — derived mapping, not an official
    // crosswalk (the Act itself has no HS codes). Confidence drives severity:
    // 'direct'/'derived' are treated as a real requirement to flag; 'broad'
    // (a whole chapter flagged pending TBS guidance) is informational.
    ...wmaMatches.map((m): ComplianceCheck => {
      const packNote = m.rigid_container_qty || m.other_container_qty
        ? ` Prescribed pack sizes — rigid: ${m.rigid_container_qty ?? 'n/a'}; other: ${m.other_container_qty ?? 'n/a'}.`
        : '';
      return {
        key: `wma-${m.id}`,
        name: m.sheet === 'A' ? `WMA Instrument Approval — ${m.wma_class}` : `WMA Pre-Packed Goods — ${m.wma_class}`,
        required: m.confidence !== 'broad',
        note: `${m.obligation_trigger} (${m.hs_code_display}: ${m.hs_description ?? m.wma_class}).${packNote} Confidence: ${m.confidence}. Derived mapping — verify with the Weights and Measures Agency / TBS before relying on it.`,
        authority: 'Weights and Measures Agency (WMA)',
        color: m.confidence === 'direct' ? 'red' : 'amber',
      };
    }),
  ];

  return checks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Penalty Calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface PenaltyInput {
  violation_type: 'under_declaration' | 'misclassification' | 'late_payment' | 'no_pvoc' | 'no_di' | 'prohibited_goods';
  hs_code?: string;
  declared_value_usd?: number;
  actual_value_usd?: number;
  declared_hs?: string;
  actual_hs?: string;
  late_months?: number;
  fx_rate?: number;
  shipment_ref?: string;
}

export interface PenaltyResult {
  violation_type: string;
  duty_shortfall_tzs: number;
  under_declaration_penalty: number;  // 3x shortfall (CEMA s.133)
  misclassification_fine: number;     // 50% surcharge on duty difference
  late_interest: number;              // 2% pm on outstanding duty
  no_pvoc_fine: number;               // Fixed: 3x duty equivalent
  no_di_fine: number;                 // Fixed: TZS 2,000,000 minimum
  total_penalty_tzs: number;
  breakdown: { label: string; amount: number; basis: string }[];
  legal_references: string[];
}

export async function calculatePenalty(input: PenaltyInput): Promise<PenaltyResult> {
  const fxRate = input.fx_rate ?? await getUsdToTzs();

  let dutyShortfall = 0;
  let underDeclarationPenalty = 0;
  let misclassificationFine = 0;
  let lateInterest = 0;
  let noPvocFine = 0;
  let noDiFine = 0;
  const breakdown: PenaltyResult['breakdown'] = [];
  const legalRefs: string[] = [];

  if (input.violation_type === 'under_declaration' && input.declared_value_usd && input.actual_value_usd) {
    const hs = await getHsCode(input.hs_code ?? '');
    const dutyRate = (hs ? Number(hs.import_duty_rate) : 25) / 100;
    const declared = input.declared_value_usd * fxRate * dutyRate;
    const actual   = input.actual_value_usd * fxRate * dutyRate;
    dutyShortfall = Math.max(0, actual - declared);
    underDeclarationPenalty = dutyShortfall * 3;
    breakdown.push(
      { label: 'Duty on declared value (TZS)', amount: declared, basis: `${(dutyRate * 100).toFixed(0)}% of CIF` },
      { label: 'Duty on actual value (TZS)', amount: actual, basis: `${(dutyRate * 100).toFixed(0)}% of CIF` },
      { label: 'Duty shortfall (TZS)', amount: dutyShortfall, basis: 'Actual − Declared' },
      { label: 'Penalty: 3× shortfall (CEMA s.133)', amount: underDeclarationPenalty, basis: '3× duty shortfall' },
    );
    legalRefs.push('CEMA CAP 403 s.133 — Under-declaration: 3× the duty shortfall');
  }

  if (input.violation_type === 'misclassification' && input.declared_hs && input.actual_hs) {
    const declared = await getHsCode(input.declared_hs);
    const actual   = await getHsCode(input.actual_hs);
    const declaredRate = declared ? Number(declared.import_duty_rate) / 100 : 0.10;
    const actualRate   = actual   ? Number(actual.import_duty_rate)   / 100 : 0.25;
    const valueTzs = (input.declared_value_usd ?? 0) * fxRate;
    dutyShortfall = Math.max(0, valueTzs * (actualRate - declaredRate));
    misclassificationFine = dutyShortfall * 1.5;
    breakdown.push(
      { label: `Duty rate (declared HS ${input.declared_hs})`, amount: valueTzs * declaredRate, basis: `${(declaredRate * 100).toFixed(0)}%` },
      { label: `Duty rate (correct HS ${input.actual_hs})`, amount: valueTzs * actualRate, basis: `${(actualRate * 100).toFixed(0)}%` },
      { label: 'Duty shortfall', amount: dutyShortfall, basis: 'Rate difference × value' },
      { label: 'Penalty: 50% surcharge + shortfall (CEMA s.128)', amount: misclassificationFine, basis: 'Shortfall + 50%' },
    );
    legalRefs.push('CEMA CAP 403 s.128 — Mis-classification: duty shortfall + 50% surcharge');
  }

  if (input.violation_type === 'late_payment') {
    const hs = await getHsCode(input.hs_code ?? '');
    const dutyRate = (hs ? Number(hs.import_duty_rate) : 25) / 100;
    const baseDuty = (input.declared_value_usd ?? 0) * fxRate * dutyRate;
    const months = input.late_months ?? 1;
    lateInterest = baseDuty * 0.02 * months;
    breakdown.push(
      { label: 'Base duty owed (TZS)', amount: baseDuty, basis: `${(dutyRate * 100).toFixed(0)}% CET` },
      { label: `Late interest (2%/month × ${months} month${months > 1 ? 's' : ''})`, amount: lateInterest, basis: '2% per month' },
    );
    legalRefs.push('CEMA CAP 403 s.77 — Late duty: 2% per month interest on outstanding amount');
  }

  if (input.violation_type === 'no_pvoc') {
    const hs = await getHsCode(input.hs_code ?? '');
    const dutyRate = (hs ? Number(hs.import_duty_rate) : 25) / 100;
    const baseDuty = (input.declared_value_usd ?? 0) * fxRate * dutyRate;
    noPvocFine = Math.max(baseDuty * 3, 1_500_000);
    breakdown.push({ label: 'No PVoC/CoC Fine (min TZS 1.5M)', amount: noPvocFine, basis: '3× duty or TZS 1,500,000 minimum' });
    legalRefs.push('TBS Act CAP 130 — Importing without Certificate of Conformity: fine of 3× duty value');
  }

  if (input.violation_type === 'no_di') {
    noDiFine = Math.max((input.declared_value_usd ?? 0) * fxRate * 0.1, 2_000_000);
    breakdown.push({ label: 'No Destination Inspection Fine (min TZS 2M)', amount: noDiFine, basis: 'TZS 2,000,000 minimum per consignment' });
    legalRefs.push('TRA Destination Inspection Guidelines — Penalty for skipping DI: TZS 2,000,000 or 10% of CIF');
  }

  const total = underDeclarationPenalty + misclassificationFine + lateInterest + noPvocFine + noDiFine;
  if (total > 0) {
    breakdown.push({ label: 'TOTAL PENALTIES (TZS)', amount: total, basis: 'Sum of all applicable penalties' });
  }

  return {
    violation_type: input.violation_type,
    duty_shortfall_tzs: dutyShortfall,
    under_declaration_penalty: underDeclarationPenalty,
    misclassification_fine: misclassificationFine,
    late_interest: lateInterest,
    no_pvoc_fine: noPvocFine,
    no_di_fine: noDiFine,
    total_penalty_tzs: total,
    breakdown,
    legal_references: legalRefs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Vessel Position (AISstream.io via WebSocket proxy)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lookup cached vessel position from our DB (populated by AIS WebSocket job)
 */
export async function getVesselPosition(identifier: string) {
  // Try MMSI first
  const byMmsi = await db.selectFrom('vessel_positions')
    .selectAll()
    .where('mmsi', '=', identifier)
    .executeTakeFirst();
  if (byMmsi) return byMmsi;

  // Try IMO
  const byImo = await db.selectFrom('vessel_positions')
    .selectAll()
    .where('imo', '=', identifier)
    .executeTakeFirst();
  if (byImo) return byImo;

  // Try vessel name (partial)
  const byName = await db.selectFrom('vessel_positions')
    .selectAll()
    .where('vessel_name', 'ilike', `%${identifier}%`)
    .executeTakeFirst();
  return byName ?? null;
}

/**
 * Update or insert a vessel position from AIS data
 */
export async function upsertVesselPosition(data: {
  mmsi: string;
  imo?: string;
  vessel_name?: string;
  vessel_type?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  heading?: number;
  nav_status?: string;
  destination?: string;
  eta_raw?: string;
  draught?: number;
}) {
  const { sql } = await import('kysely');
  await db.insertInto('vessel_positions')
    .values({
      mmsi: data.mmsi,
      imo: data.imo ?? null,
      vessel_name: data.vessel_name ?? null,
      vessel_type: data.vessel_type ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed ?? null,
      course: data.course ?? null,
      heading: data.heading ?? null,
      nav_status: data.nav_status ?? null,
      destination: data.destination ?? null,
      eta_raw: data.eta_raw ?? null,
      draught: data.draught ?? null,
      last_updated: new Date(),
    })
    .onConflict((oc) =>
      oc.column('mmsi').doUpdateSet({
        imo: data.imo ?? null,
        vessel_name: data.vessel_name ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
        speed: data.speed ?? null,
        course: data.course ?? null,
        heading: data.heading ?? null,
        nav_status: data.nav_status ?? null,
        destination: data.destination ?? null,
        eta_raw: data.eta_raw ?? null,
        last_updated: new Date(),
      })
    )
    .execute();
}

/**
 * AISstream.io WebSocket subscription for vessel tracking.
 * Call this from the background to keep vessel_positions up to date.
 * Requires AIS_API_KEY in environment or tenant settings.
 */
export async function startAisTracking(
  apiKey: string,
  mmsiList: string[],
  onMessage: (data: any) => void,
  boundingBoxes: number[][][] = [],
): Promise<() => void> {
  const { WebSocket } = await import('ws');
  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  ws.on('open', () => {
    ws.send(JSON.stringify({
      Apikey: apiKey,
      BoundingBoxes: boundingBoxes,
      FiltersShipMMSI: mmsiList,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    }));
    console.log(`[AIS] Connected. Tracking ${mmsiList.length} vessels and ${boundingBoxes.length} areas`);
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      onMessage(msg);
    } catch {}
  });

  ws.on('error', (err) => console.error('[AIS] Error:', err.message));
  ws.on('close', () => console.log('[AIS] Connection closed'));

  // Return cleanup function
  return () => ws.close();
}
