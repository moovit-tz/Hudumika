// Three additional landed-cost calculators — LCL, Air Freight and Transit —
// built from Aleka Logistics' own real rate-card spreadsheets (three CSVs
// supplied 2026-08-20: a single-tab LCL model, an Air Freight model, and a
// Transit (duty/VAT-exempt) model with an editable Dar es Salaam →
// landlocked-neighbour route reference table).
//
// Deliberately a NEW, separate file rather than an edit to customs.service.ts
// — per an explicit user decision when this was scoped: "add alongside,
// don't touch existing". Several of these three sheets' own commercial
// figures conflict with what customs.service.ts's shared sea_fcl/sea_lcl/air
// engine already uses for nominally the same charge (its Delivery Order fee
// is USD 38.14 vs this rate card's USD 15.00; its TBS charge is a flat
// TZS 180,000 vs this card's separate, distinct line items) — reconciling
// those would have meant either corrupting the existing, carefully-cited
// engine with unverified figures or silently overriding real numbers this
// business actually operates on. Every constant below is this rate card's
// own commercial figure, not a TRA/TPA-published rate, and is labelled as
// such in each result's `assumptions`, exactly like customs.service.ts's own
// "clearing agent's own rate sheet" disclaimers for its TBS/shipping-line
// constants.
//
// The real government tax engine (duty/excise/RDL/CPF/VAT — HS-code lookup,
// rate application, the CIF+duty excise base, the duty+excise+RDL+CPF VAT
// base) IS reused from customs.service.ts, unmodified: those formulas were
// independently verified against primary Tanzanian statute earlier this same
// session and are correct regardless of which rate card is layered on top of
// them. Only the CPF rate itself: this rate card's own worked examples use
// the pre-Finance-Act-2026 0.6% CPF rate (both the LCL and Air CSVs' worked
// examples reproduce with 0.6%, not the now-correct 1%) — that is out of
// date, not a deliberate business choice, so these calculators use the
// platform's already-corrected 1% default like everything else, and flag the
// discrepancy in `assumptions` rather than silently regressing to 0.6%.
import { getHsCode, getUsdToTzs, getUsdRates, pickRate, type RateOverrides } from './customs.service.js';
import { withTenant } from '../db/client.js';

// ─── Shared line-item rate card (Aleka's own figures) ──────────────────────

// Shipping Line Charges — shared by LCL and Transit (identical figures in
// both source sheets).
const SHIPPING_LINE_CHARGE_USD = 100;  // per Bill of Lading
const SHIPPING_DO_FEE_USD = 15;        // per Bill of Lading

// ICD Charges (LCL-specific) — USD per CBM, shared by LCL and Transit.
const ICD_CORRIDOR_LEVY_USD_PER_CBM = 0.30;
const ICD_HANDLING_USD_PER_CBM = 7.00;
const ICD_REMOVAL_USD_PER_CBM = 2.00;
const ICD_STORAGE_USD_PER_CBM = 2.00;
const ICD_STRIPPING_USD_PER_CBM = 28.00;

// Clearance Charges — shared by LCL and Transit.
const CLEARANCE_DOCUMENTATION_USD = 100; // per Bill
const CLEARANCE_AGENCY_FEE_USD = 5;      // per Bill
const CLEARANCE_TRANSPORT_DEFAULT_USD = 150; // per shipment, editable

// Port Charges — this rate card's own basis. Wharfage and Green Port match
// the platform's existing TPA-sourced figures exactly (1.6% of CIF; USD
// 0.25/MT); Port Infrastructure Development does NOT — this rate card bases
// it on import duty alone, while the existing engine (deliberately, per its
// own comment) bases it on total statutory charges. Kept as this rate card's
// own basis rather than reconciled, per the same "don't touch existing"
// decision.
const PORT_WHARFAGE_RATE_PCT = 1.6;
const PORT_GREEN_PORT_USD_PER_MT = 0.25;
const PORT_INFRA_DEV_RATE_PCT = 4.5; // % of import duty alone

// Transit-specific.
const TRANSIT_BOND_PREMIUM_RATE_PCT = 0.5; // % of CIF
const TRANSIT_TANCIS_ENTRY_USD = 50;       // flat
const TRANSIT_ROAD_USER_USD_PER_100KM = 10;
const TRANSIT_WEIGHBRIDGE_USD_PER_CHECKPOINT = 5;

// Air — its own separate rate card (TZS-denominated airport tariffs).
const AIR_DOCUMENTATION_TZS = 55_000;      // per AWB
const AIR_TAA_TZS_PER_KG = 110;
const AIR_NOTIFICATION_TZS = 2_750;        // per AWB
const AIR_HANDLING_TZS_PER_KG = 233.75;
const AIR_EQUIPMENT_TZS = 192.72;          // per AWB
const AIR_SECURITY_TZS_PER_KG = 68.75;
const AIR_DATA_DISCHARGE_TANCIS_TZS = 5_500; // per AWB
const AIR_AGENCY_FEE_TZS = 650_000;        // per AWB

/** Real corridor rate card (Aleka's own), seeded lazily per-tenant on first
 *  read — see 259_transit_route_rates.sql's header for why lazy over a
 *  migration-time loop. */
const DEFAULT_TRANSIT_ROUTES: { destination: string; border_post: string; distance_km: number; transport_20ft_usd: number; transport_40ft_usd: number; weighbridge_count: number }[] = [
  { destination: 'Zambia', border_post: 'Tunduma / Nakonde', distance_km: 900, transport_20ft_usd: 2800, transport_40ft_usd: 4200, weighbridge_count: 4 },
  { destination: 'Malawi', border_post: 'Kasumulu / Songwe', distance_km: 850, transport_20ft_usd: 2600, transport_40ft_usd: 4000, weighbridge_count: 3 },
  { destination: 'Rwanda', border_post: 'Rusumo Falls', distance_km: 1500, transport_20ft_usd: 4500, transport_40ft_usd: 6500, weighbridge_count: 5 },
  { destination: 'Burundi', border_post: 'Kobero', distance_km: 1200, transport_20ft_usd: 3800, transport_40ft_usd: 5500, weighbridge_count: 4 },
  { destination: 'Uganda', border_post: 'Mutukula', distance_km: 1100, transport_20ft_usd: 4000, transport_40ft_usd: 5800, weighbridge_count: 5 },
  { destination: 'DRC-Goma', border_post: 'Rusumo → Goma', distance_km: 1700, transport_20ft_usd: 5500, transport_40ft_usd: 8000, weighbridge_count: 6 },
  { destination: 'DRC-Lubumbashi', border_post: 'Tunduma → Kasumbalesa', distance_km: 1400, transport_20ft_usd: 5000, transport_40ft_usd: 7500, weighbridge_count: 5 },
  { destination: 'DRC-Bukavu', border_post: 'Kobero → Bukavu', distance_km: 1500, transport_20ft_usd: 5200, transport_40ft_usd: 7800, weighbridge_count: 5 },
];

export async function listTransitRoutes(tenantId: string) {
  return withTenant(tenantId, async (trx) => {
    const existing = await trx.selectFrom('transit_route_rates').selectAll()
      .where('tenant_id', '=', tenantId).orderBy('destination', 'asc').execute();
    if (existing.length > 0) return existing;
    await trx.insertInto('transit_route_rates')
      .values(DEFAULT_TRANSIT_ROUTES.map(r => ({ tenant_id: tenantId, ...r })))
      .execute();
    return trx.selectFrom('transit_route_rates').selectAll()
      .where('tenant_id', '=', tenantId).orderBy('destination', 'asc').execute();
  });
}

export interface UpsertTransitRouteInput {
  id?: string;
  destination: string;
  border_post?: string;
  distance_km: number;
  transport_20ft_usd: number;
  transport_40ft_usd: number;
  weighbridge_count: number;
}

export async function upsertTransitRoute(tenantId: string, input: UpsertTransitRouteInput) {
  return withTenant(tenantId, async (trx) => {
    if (input.id) {
      return trx.updateTable('transit_route_rates').set({
        destination: input.destination, border_post: input.border_post ?? null,
        distance_km: input.distance_km, transport_20ft_usd: input.transport_20ft_usd,
        transport_40ft_usd: input.transport_40ft_usd, weighbridge_count: input.weighbridge_count,
        updated_at: new Date(),
      }).where('id', '=', input.id).where('tenant_id', '=', tenantId)
        .returningAll().executeTakeFirstOrThrow();
    }
    return trx.insertInto('transit_route_rates').values({
      tenant_id: tenantId, destination: input.destination, border_post: input.border_post ?? null,
      distance_km: input.distance_km, transport_20ft_usd: input.transport_20ft_usd,
      transport_40ft_usd: input.transport_40ft_usd, weighbridge_count: input.weighbridge_count,
    }).returningAll().executeTakeFirstOrThrow();
  });
}

export async function deleteTransitRoute(tenantId: string, id: string) {
  await withTenant(tenantId, trx =>
    trx.deleteFrom('transit_route_rates').where('id', '=', id).where('tenant_id', '=', tenantId).execute()
  );
}

/** TZS per one unit of `currency`, via the same USD-based rates feed the
 *  rest of the platform already uses — TZS-per-USD ÷ FCY-per-USD. */
async function getFxRateTzsPer(currency: string): Promise<number> {
  const code = (currency || 'USD').toUpperCase();
  if (code === 'USD') return getUsdToTzs();
  const rates = await getUsdRates();
  const tzsPerUsd = rates.TZS;
  const fcyPerUsd = rates[code];
  if (!tzsPerUsd || !fcyPerUsd) return getUsdToTzs(); // fall back to USD if the currency isn't in the feed
  return tzsPerUsd / fcyPerUsd;
}

// ─── Shared result shape ────────────────────────────────────────────────────

export interface AdvBreakdownLine {
  section: string;
  label: string;
  amount_fcy: number;
  amount_tzs: number;
  rate?: string;
}

export interface AdvancedCalcResult {
  mode: 'sea_lcl_advanced' | 'air_advanced' | 'transit';
  hs_code: string;
  description: string;
  currency: string;
  fx_rate: number; // TZS per 1 unit of `currency`
  fob: number;
  freight: number;
  insurance: number;
  cif: number;
  cif_tzs: number;
  duty_rate: number;
  excise_rate: number;
  rdl_rate: number;
  cpf_rate: number;
  vat_rate: number;
  statutory_total: number;
  statutory_total_tzs: number;
  charges_total: number;
  charges_total_tzs: number;
  grand_total: number;
  grand_total_tzs: number;
  vat_recoverable: number;
  grand_total_net_vat: number;
  grand_total_net_vat_tzs: number;
  per_unit: { qty: number; unit_label: string; cost_incl_vat: number; cost_net_vat: number } | null;
  landed_multiplier: number; // grand_total_net_vat / fob (this rate card's own "Landed ÷ EXW multiple")
  breakdown: AdvBreakdownLine[];
  warnings: string[];
  assumptions: string[];
  overridden_fields: string[];
}

/** Real HS-code-driven duty/excise/RDL/CPF/VAT rates — same lookup and same
 *  fallback defaults customs.service.ts's own calculateLandedCost uses, so a
 *  code found (or not found) in our tariff table behaves identically here. */
async function lookupTaxRates(hsCode: string, overrides: RateOverrides | undefined, overriddenFields: string[]) {
  const hsEntry = hsCode ? await getHsCode(hsCode) : null;
  const ov = overrides ?? {};
  return {
    dutyRate: pickRate(hsEntry ? Number(hsEntry.import_duty_rate) : 25, ov.duty_rate, 'duty_rate', overriddenFields),
    vatRate: pickRate(hsEntry ? Number(hsEntry.vat_rate) : 18, ov.vat_rate, 'vat_rate', overriddenFields),
    exciseRate: hsEntry ? Number(hsEntry.excise_rate) : 0,
    rdlRate: pickRate(hsEntry ? Number(hsEntry.rdl_rate) : 2, ov.rdl_rate, 'rdl_rate', overriddenFields),
    cpfRate: pickRate(hsEntry ? Number(hsEntry.cpf_rate) : 1, ov.cpf_rate, 'cpf_rate', overriddenFields),
    description: hsEntry?.description ?? 'General goods',
    found: !!hsEntry,
  };
}

const CPF_STALE_RATE_ASSUMPTION = 'CPF is calculated at 1% (Finance Act 2026, effective 1 Jul 2026) — if you are matching an older Aleka worksheet that still shows 0.6% CPF, that sheet predates the increase; this figure is the current correct rate.';

// ─── LCL ─────────────────────────────────────────────────────────────────

export interface LclAdvancedInput {
  hs_code: string;
  description?: string;
  fob_usd: number;
  freight_usd: number;
  insurance_usd?: number; // defaults to 1% of CFR
  cbm: number;
  weight_mt?: number;     // drives Green Port Initiatives; 0 if omitted
  num_bills?: number;     // default 1 — drives per-BL lines
  num_units?: number;     // for the per-unit summary, optional
  transportation_usd?: number; // clearance "port → warehouse" transport, editable
  tbs_inspection_usd?: number; // editable, defaults to 0 (matches the rate card's own default)
  fx_rate_override?: number;
  rate_overrides?: RateOverrides;
}

export async function calculateLclAdvanced(input: LclAdvancedInput): Promise<AdvancedCalcResult> {
  const overriddenFields: string[] = [];
  const rates = await lookupTaxRates(input.hs_code, input.rate_overrides, overriddenFields);
  const fxRate = input.fx_rate_override ?? await getUsdToTzs();

  const fob = input.fob_usd;
  const freight = input.freight_usd;
  const insurance = input.insurance_usd ?? (fob + freight) * 0.01;
  const cif = fob + freight + insurance;
  const cifTzs = cif * fxRate;

  const duty = cif * rates.dutyRate / 100;
  const excise = (cif + duty) * rates.exciseRate / 100;
  const rdl = cif * rates.rdlRate / 100;
  const cpf = fob * rates.cpfRate / 100;
  const vat = (cif + duty + excise + rdl + cpf) * rates.vatRate / 100;
  const statutoryTotal = duty + excise + rdl + cpf + vat;

  const numBills = Math.max(1, input.num_bills ?? 1);
  const cbm = input.cbm;
  const weightMt = input.weight_mt ?? 0;

  const wharfage = cif * PORT_WHARFAGE_RATE_PCT / 100;
  const greenPort = weightMt * PORT_GREEN_PORT_USD_PER_MT;
  const portInfraDev = duty * PORT_INFRA_DEV_RATE_PCT / 100;
  const portSubtotal = wharfage + greenPort + portInfraDev;

  const shippingLine = SHIPPING_LINE_CHARGE_USD * numBills;
  const doFee = SHIPPING_DO_FEE_USD * numBills;
  const tbsInspection = input.tbs_inspection_usd ?? 0;
  const shippingSubtotal = shippingLine + doFee + tbsInspection;

  const corridorLevy = cbm * ICD_CORRIDOR_LEVY_USD_PER_CBM;
  const icdHandling = cbm * ICD_HANDLING_USD_PER_CBM;
  const removal = cbm * ICD_REMOVAL_USD_PER_CBM;
  const storage = cbm * ICD_STORAGE_USD_PER_CBM;
  const stripping = cbm * ICD_STRIPPING_USD_PER_CBM;
  const icdSubtotal = corridorLevy + icdHandling + removal + storage + stripping;

  const documentation = CLEARANCE_DOCUMENTATION_USD * numBills;
  const agencyFee = CLEARANCE_AGENCY_FEE_USD * numBills;
  const transportation = input.transportation_usd ?? CLEARANCE_TRANSPORT_DEFAULT_USD;
  const clearanceSubtotal = documentation + agencyFee + transportation;

  const chargesTotal = portSubtotal + shippingSubtotal + icdSubtotal + clearanceSubtotal;
  const grandTotal = cif + statutoryTotal + chargesTotal;
  const grandTotalNetVat = grandTotal - vat;

  const t = (fcy: number) => fcy * fxRate;
  const breakdown: AdvBreakdownLine[] = [
    { section: 'CIF Calculation', label: 'FOB Value', amount_fcy: fob, amount_tzs: t(fob) },
    { section: 'CIF Calculation', label: 'Freight', amount_fcy: freight, amount_tzs: t(freight) },
    { section: 'CIF Calculation', label: 'Insurance', amount_fcy: insurance, amount_tzs: t(insurance) },
    { section: 'CIF Calculation', label: 'Total CIF Value', amount_fcy: cif, amount_tzs: cifTzs },
    { section: 'Tax Summary', label: 'Import Duty', amount_fcy: duty, amount_tzs: t(duty), rate: `${rates.dutyRate}%` },
    { section: 'Tax Summary', label: 'Excise Duty', amount_fcy: excise, amount_tzs: t(excise), rate: `${rates.exciseRate}%` },
    { section: 'Tax Summary', label: 'Railway Development Levy', amount_fcy: rdl, amount_tzs: t(rdl), rate: `${rates.rdlRate}%` },
    { section: 'Tax Summary', label: 'Customs Processing Fee', amount_fcy: cpf, amount_tzs: t(cpf), rate: `${rates.cpfRate}%` },
    { section: 'Tax Summary', label: 'VAT', amount_fcy: vat, amount_tzs: t(vat), rate: `${rates.vatRate}%` },
    { section: 'Tax Summary', label: 'Total Duties & Taxes', amount_fcy: statutoryTotal, amount_tzs: t(statutoryTotal) },
    { section: 'Port Charges', label: `Wharfage Charge (${PORT_WHARFAGE_RATE_PCT}% of CIF)`, amount_fcy: wharfage, amount_tzs: t(wharfage) },
    { section: 'Port Charges', label: `Green Port Initiatives (${weightMt.toFixed(3)} MT)`, amount_fcy: greenPort, amount_tzs: t(greenPort) },
    { section: 'Port Charges', label: `Port Infrastructure Dev (${PORT_INFRA_DEV_RATE_PCT}% of duty)`, amount_fcy: portInfraDev, amount_tzs: t(portInfraDev) },
    { section: 'Port Charges', label: 'Port Charges Subtotal', amount_fcy: portSubtotal, amount_tzs: t(portSubtotal) },
    { section: 'Shipping Line Charges', label: `Shipping Line Charges (${numBills} bill)`, amount_fcy: shippingLine, amount_tzs: t(shippingLine) },
    { section: 'Shipping Line Charges', label: `Delivery Order (DO) (${numBills} bill)`, amount_fcy: doFee, amount_tzs: t(doFee) },
    { section: 'Shipping Line Charges', label: 'TBS Inspection', amount_fcy: tbsInspection, amount_tzs: t(tbsInspection) },
    { section: 'Shipping Line Charges', label: 'Shipping Line Subtotal', amount_fcy: shippingSubtotal, amount_tzs: t(shippingSubtotal) },
    { section: 'ICD Charges (LCL)', label: `LCL Corridor Levy (${cbm} CBM)`, amount_fcy: corridorLevy, amount_tzs: t(corridorLevy) },
    { section: 'ICD Charges (LCL)', label: `LCL Handling Charges (${cbm} CBM)`, amount_fcy: icdHandling, amount_tzs: t(icdHandling) },
    { section: 'ICD Charges (LCL)', label: `LCL Removal Charges (${cbm} CBM)`, amount_fcy: removal, amount_tzs: t(removal) },
    { section: 'ICD Charges (LCL)', label: `LCL Storage Charges (${cbm} CBM)`, amount_fcy: storage, amount_tzs: t(storage) },
    { section: 'ICD Charges (LCL)', label: `LCL Stripping Charges (${cbm} CBM)`, amount_fcy: stripping, amount_tzs: t(stripping) },
    { section: 'ICD Charges (LCL)', label: 'ICD Charges Subtotal', amount_fcy: icdSubtotal, amount_tzs: t(icdSubtotal) },
    { section: 'Clearance Charges', label: `Documentation (${numBills} bill)`, amount_fcy: documentation, amount_tzs: t(documentation) },
    { section: 'Clearance Charges', label: `Agency Fees (${numBills} bill)`, amount_fcy: agencyFee, amount_tzs: t(agencyFee) },
    { section: 'Clearance Charges', label: 'Transportation (port → warehouse)', amount_fcy: transportation, amount_tzs: t(transportation) },
    { section: 'Clearance Charges', label: 'Clearance Charges Subtotal', amount_fcy: clearanceSubtotal, amount_tzs: t(clearanceSubtotal) },
    { section: 'Grand Total', label: 'Total Charges (Port+Ship+ICD+Clear)', amount_fcy: chargesTotal, amount_tzs: t(chargesTotal) },
    { section: 'Grand Total', label: 'Grand Total (CIF + Duties + All Charges)', amount_fcy: grandTotal, amount_tzs: t(grandTotal) },
    { section: 'Grand Total', label: 'Less: Recoverable VAT', amount_fcy: -vat, amount_tzs: -t(vat) },
    { section: 'Grand Total', label: 'Grand Total (net of recoverable VAT)', amount_fcy: grandTotalNetVat, amount_tzs: t(grandTotalNetVat) },
  ];

  const numUnits = input.num_units;
  const perUnit = numUnits && numUnits > 0
    ? { qty: numUnits, unit_label: 'unit', cost_incl_vat: grandTotal / numUnits, cost_net_vat: grandTotalNetVat / numUnits }
    : null;

  const warnings: string[] = [];
  if (!rates.found) warnings.push(`HS code ${input.hs_code} was not found in our tariff database — rates shown use generic fallback values.`);
  if (overriddenFields.length > 0) warnings.push(`Manually overridden rate(s): ${overriddenFields.join(', ')} — figures you entered, not sourced from our tariff database.`);

  return {
    mode: 'sea_lcl_advanced', hs_code: input.hs_code, description: input.description || rates.description,
    currency: 'USD', fx_rate: fxRate,
    fob, freight, insurance, cif, cif_tzs: cifTzs,
    duty_rate: rates.dutyRate, excise_rate: rates.exciseRate, rdl_rate: rates.rdlRate, cpf_rate: rates.cpfRate, vat_rate: rates.vatRate,
    statutory_total: statutoryTotal, statutory_total_tzs: t(statutoryTotal),
    charges_total: chargesTotal, charges_total_tzs: t(chargesTotal),
    grand_total: grandTotal, grand_total_tzs: t(grandTotal),
    vat_recoverable: vat,
    grand_total_net_vat: grandTotalNetVat, grand_total_net_vat_tzs: t(grandTotalNetVat),
    per_unit: perUnit,
    landed_multiplier: fob > 0 ? grandTotalNetVat / fob : 0,
    breakdown, warnings,
    assumptions: [
      'ICD, Shipping Line, Clearance and Port Infrastructure Development figures are Aleka Logistics’ own commercial rate card, not TRA/TPA-published rates — verify against your actual invoices.',
      CPF_STALE_RATE_ASSUMPTION,
    ],
    overridden_fields: overriddenFields,
  };
}

// ─── Air Freight ─────────────────────────────────────────────────────────

export interface AirAdvancedInput {
  hs_code: string;
  description?: string;
  currency?: string; // default 'USD'
  fob: number;
  freight?: number;  // 0 if prepaid/included in FOB
  insurance?: number; // defaults to 1% of CFR
  weight_kg: number;
  num_awbs?: number;  // default 1
  num_units?: number;
  transportation_tzs?: number; // airport → warehouse, editable, default 0
  storage_applicable?: boolean; // Storage Charges line, default off (0)
  fx_rate_override?: number;   // TZS per `currency` unit
  rate_overrides?: RateOverrides;
}

export async function calculateAirAdvanced(input: AirAdvancedInput): Promise<AdvancedCalcResult> {
  const overriddenFields: string[] = [];
  const rates = await lookupTaxRates(input.hs_code, input.rate_overrides, overriddenFields);
  const currency = (input.currency || 'USD').toUpperCase();
  const fxRate = input.fx_rate_override ?? await getFxRateTzsPer(currency);

  const fob = input.fob;
  const freight = input.freight ?? 0;
  const insurance = input.insurance ?? (fob + freight) * 0.01;
  const cif = fob + freight + insurance;
  const cifTzs = cif * fxRate;

  const duty = cif * rates.dutyRate / 100;
  const excise = (cif + duty) * rates.exciseRate / 100;
  const rdl = cif * rates.rdlRate / 100;
  const cpf = fob * rates.cpfRate / 100;
  const vat = (cif + duty + excise + rdl + cpf) * rates.vatRate / 100;
  const statutoryTotal = duty + excise + rdl + cpf + vat;

  const numAwbs = Math.max(1, input.num_awbs ?? 1);
  const kg = input.weight_kg;

  const documentationTzs = AIR_DOCUMENTATION_TZS * numAwbs;
  const taaTzs = AIR_TAA_TZS_PER_KG * kg;
  const notificationTzs = AIR_NOTIFICATION_TZS * numAwbs;
  const handlingTzs = AIR_HANDLING_TZS_PER_KG * kg;
  const equipmentTzs = AIR_EQUIPMENT_TZS * numAwbs;
  const securityTzs = AIR_SECURITY_TZS_PER_KG * kg;
  const dataDischargeTzs = AIR_DATA_DISCHARGE_TANCIS_TZS * numAwbs;
  const storageTzs = input.storage_applicable ? 0 : 0; // rate card's own line defaults to 0/kg; kept as an explicit line for parity with the source sheet
  const cargoSubtotalTzs = documentationTzs + taaTzs + notificationTzs + handlingTzs + equipmentTzs + securityTzs + dataDischargeTzs + storageTzs;

  const agencyFeeTzs = AIR_AGENCY_FEE_TZS * numAwbs;
  const transportationTzs = input.transportation_tzs ?? 0;
  const agencyTransportSubtotalTzs = agencyFeeTzs + transportationTzs;

  const chargesTotalTzs = cargoSubtotalTzs + agencyTransportSubtotalTzs;
  const chargesTotal = chargesTotalTzs / fxRate;
  const grandTotal = cif + statutoryTotal + chargesTotal;
  const grandTotalTzs = grandTotal * fxRate;
  const grandTotalNetVat = grandTotal - vat;

  const t = (fcy: number) => fcy * fxRate;
  const breakdown: AdvBreakdownLine[] = [
    { section: 'CIF Calculation', label: 'FOB Value', amount_fcy: fob, amount_tzs: t(fob) },
    { section: 'CIF Calculation', label: 'Air Freight', amount_fcy: freight, amount_tzs: t(freight) },
    { section: 'CIF Calculation', label: 'Insurance', amount_fcy: insurance, amount_tzs: t(insurance) },
    { section: 'CIF Calculation', label: 'Total CIF Value', amount_fcy: cif, amount_tzs: cifTzs },
    { section: 'Tax Summary', label: 'Import Duty', amount_fcy: duty, amount_tzs: t(duty), rate: `${rates.dutyRate}%` },
    { section: 'Tax Summary', label: 'Excise Duty', amount_fcy: excise, amount_tzs: t(excise), rate: `${rates.exciseRate}%` },
    { section: 'Tax Summary', label: 'Railway Development Levy', amount_fcy: rdl, amount_tzs: t(rdl), rate: `${rates.rdlRate}%` },
    { section: 'Tax Summary', label: 'Customs Processing Fee', amount_fcy: cpf, amount_tzs: t(cpf), rate: `${rates.cpfRate}%` },
    { section: 'Tax Summary', label: 'VAT', amount_fcy: vat, amount_tzs: t(vat), rate: `${rates.vatRate}%` },
    { section: 'Tax Summary', label: 'Total Duties & Taxes', amount_fcy: statutoryTotal, amount_tzs: t(statutoryTotal) },
    { section: 'Cargo Charges', label: `Documentation (${numAwbs} AWB)`, amount_fcy: documentationTzs / fxRate, amount_tzs: documentationTzs },
    { section: 'Cargo Charges', label: `Airport Authority (TAA) Charges (${kg} kg)`, amount_fcy: taaTzs / fxRate, amount_tzs: taaTzs },
    { section: 'Cargo Charges', label: `Notification Charges (${numAwbs} AWB)`, amount_fcy: notificationTzs / fxRate, amount_tzs: notificationTzs },
    { section: 'Cargo Charges', label: `Handling Charges (${kg} kg)`, amount_fcy: handlingTzs / fxRate, amount_tzs: handlingTzs },
    { section: 'Cargo Charges', label: `Equipment Charges (${numAwbs} AWB)`, amount_fcy: equipmentTzs / fxRate, amount_tzs: equipmentTzs },
    { section: 'Cargo Charges', label: `Security Surcharge (${kg} kg)`, amount_fcy: securityTzs / fxRate, amount_tzs: securityTzs },
    { section: 'Cargo Charges', label: `Data Discharge TANCIS (${numAwbs} AWB)`, amount_fcy: dataDischargeTzs / fxRate, amount_tzs: dataDischargeTzs },
    { section: 'Cargo Charges', label: 'Storage Charges (if applicable)', amount_fcy: storageTzs / fxRate, amount_tzs: storageTzs },
    { section: 'Cargo Charges', label: 'Cargo Charges Subtotal', amount_fcy: cargoSubtotalTzs / fxRate, amount_tzs: cargoSubtotalTzs },
    { section: 'Agency & Transport', label: `Agency Fees (${numAwbs} AWB)`, amount_fcy: agencyFeeTzs / fxRate, amount_tzs: agencyFeeTzs },
    { section: 'Agency & Transport', label: 'Transportation (Airport → Warehouse)', amount_fcy: transportationTzs / fxRate, amount_tzs: transportationTzs },
    { section: 'Agency & Transport', label: 'Agency & Transport Subtotal', amount_fcy: agencyTransportSubtotalTzs / fxRate, amount_tzs: agencyTransportSubtotalTzs },
    { section: 'Grand Total', label: 'Total Charges (Cargo + Agency + Transport)', amount_fcy: chargesTotal, amount_tzs: chargesTotalTzs },
    { section: 'Grand Total', label: 'Grand Total (CIF + Duties + All Charges)', amount_fcy: grandTotal, amount_tzs: grandTotalTzs },
    { section: 'Grand Total', label: 'Less: Recoverable VAT', amount_fcy: -vat, amount_tzs: -t(vat) },
    { section: 'Grand Total', label: 'Grand Total (net of recoverable VAT)', amount_fcy: grandTotalNetVat, amount_tzs: t(grandTotalNetVat) },
  ];

  const numUnits = input.num_units;
  const perUnit = numUnits && numUnits > 0
    ? { qty: numUnits, unit_label: 'unit', cost_incl_vat: grandTotal / numUnits, cost_net_vat: grandTotalNetVat / numUnits }
    : null;

  const warnings: string[] = [];
  if (!rates.found) warnings.push(`HS code ${input.hs_code} was not found in our tariff database — rates shown use generic fallback values.`);
  if (overriddenFields.length > 0) warnings.push(`Manually overridden rate(s): ${overriddenFields.join(', ')} — figures you entered, not sourced from our tariff database.`);

  return {
    mode: 'air_advanced', hs_code: input.hs_code, description: input.description || rates.description,
    currency, fx_rate: fxRate,
    fob, freight, insurance, cif, cif_tzs: cifTzs,
    duty_rate: rates.dutyRate, excise_rate: rates.exciseRate, rdl_rate: rates.rdlRate, cpf_rate: rates.cpfRate, vat_rate: rates.vatRate,
    statutory_total: statutoryTotal, statutory_total_tzs: t(statutoryTotal),
    charges_total: chargesTotal, charges_total_tzs: chargesTotalTzs,
    grand_total: grandTotal, grand_total_tzs: grandTotalTzs,
    vat_recoverable: vat,
    grand_total_net_vat: grandTotalNetVat, grand_total_net_vat_tzs: t(grandTotalNetVat),
    per_unit: perUnit,
    landed_multiplier: fob > 0 ? grandTotalNetVat / fob : 0,
    breakdown, warnings,
    assumptions: [
      'Cargo Charges and Agency Fees are Aleka Logistics’ own airport tariff/commercial rate card, quoted in TZS regardless of the shipment currency — verify against your actual airline/agent invoice.',
      CPF_STALE_RATE_ASSUMPTION,
    ],
    overridden_fields: overriddenFields,
  };
}

// ─── Transit ─────────────────────────────────────────────────────────────

export interface TransitInput {
  hs_code?: string;
  description?: string;
  fob_usd?: number;
  freight_usd?: number;
  insurance_usd?: number;
  destination: string; // matches a transit_route_rates.destination row
  distance_km_override?: number;
  weighbridge_count_override?: number;
  container_size: '20ft' | '40ft';
  num_containers?: number; // default 1
  cbm?: number;             // 0 unless this transit consignment is also LCL-handled through the ICD
  num_bills?: number;
  escort_fee_usd?: number; // manual, default 0 — restricted/hazardous goods only
  fx_rate_override?: number;
}

export async function calculateTransit(tenantId: string, input: TransitInput): Promise<AdvancedCalcResult> {
  const fxRate = input.fx_rate_override ?? await getUsdToTzs();

  const routes = await listTransitRoutes(tenantId);
  const route = routes.find(r => r.destination === input.destination);
  const distanceKm = input.distance_km_override ?? route?.distance_km ?? 0;
  const checkpoints = input.weighbridge_count_override ?? route?.weighbridge_count ?? 0;
  const containerRateUsd = route
    ? (input.container_size === '40ft' ? Number(route.transport_40ft_usd) : Number(route.transport_20ft_usd))
    : 0;
  const numContainers = Math.max(1, input.num_containers ?? 1);

  const fob = input.fob_usd ?? 0;
  const freight = input.freight_usd ?? 0;
  const insurance = input.insurance_usd ?? 0;
  const cif = fob + freight + insurance;
  const cifTzs = cif * fxRate;

  // All duty/excise/RDL/CPF/VAT are exempted for transit cargo — it is not
  // entering Tanzania for consumption. Port charges are modelled as zero too,
  // matching this rate card's own transit worksheet (every Port Charges row
  // there is 0.00) — flagged in assumptions rather than assumed silently.
  const statutoryTotal = 0;

  const numBills = Math.max(1, input.num_bills ?? 1);
  const cbm = input.cbm ?? 0;

  const shippingLine = SHIPPING_LINE_CHARGE_USD * numBills;
  const doFee = SHIPPING_DO_FEE_USD * numBills;
  const shippingSubtotal = shippingLine + doFee;

  const corridorLevy = cbm * ICD_CORRIDOR_LEVY_USD_PER_CBM;
  const icdHandling = cbm * ICD_HANDLING_USD_PER_CBM;
  const removal = cbm * ICD_REMOVAL_USD_PER_CBM;
  const storage = cbm * ICD_STORAGE_USD_PER_CBM;
  const stripping = cbm * ICD_STRIPPING_USD_PER_CBM;
  const icdSubtotal = corridorLevy + icdHandling + removal + storage + stripping;

  const bondPremium = cif * TRANSIT_BOND_PREMIUM_RATE_PCT / 100;
  const tancisEntry = TRANSIT_TANCIS_ENTRY_USD;
  const roadUser = (distanceKm / 100) * TRANSIT_ROAD_USER_USD_PER_100KM;
  const weighbridge = checkpoints * TRANSIT_WEIGHBRIDGE_USD_PER_CHECKPOINT;
  const escortFee = input.escort_fee_usd ?? 0;
  const transitSubtotal = bondPremium + tancisEntry + roadUser + weighbridge + escortFee;

  const documentation = CLEARANCE_DOCUMENTATION_USD * numBills;
  const agencyFee = CLEARANCE_AGENCY_FEE_USD * numBills;
  const inlandTransport = containerRateUsd * numContainers;
  const clearanceSubtotal = documentation + agencyFee + inlandTransport;

  const chargesTotal = shippingSubtotal + icdSubtotal + transitSubtotal + clearanceSubtotal;
  const grandTotal = cif + chargesTotal; // statutoryTotal is 0
  const grandTotalNetVat = grandTotal; // no VAT to recover — none was charged

  const t = (fcy: number) => fcy * fxRate;
  const breakdown: AdvBreakdownLine[] = [
    { section: 'CIF Calculation', label: 'FOB Value', amount_fcy: fob, amount_tzs: t(fob) },
    { section: 'CIF Calculation', label: 'Freight', amount_fcy: freight, amount_tzs: t(freight) },
    { section: 'CIF Calculation', label: 'Insurance', amount_fcy: insurance, amount_tzs: t(insurance) },
    { section: 'CIF Calculation', label: 'Total CIF Value', amount_fcy: cif, amount_tzs: cifTzs },
    { section: 'Tax Summary', label: 'Import Duty, Excise, RDL, CPF, VAT — all exempted (transit)', amount_fcy: 0, amount_tzs: 0 },
    { section: 'Shipping Line Charges', label: `Shipping Line Charges (${numBills} bill)`, amount_fcy: shippingLine, amount_tzs: t(shippingLine) },
    { section: 'Shipping Line Charges', label: `Delivery Order (DO) (${numBills} bill)`, amount_fcy: doFee, amount_tzs: t(doFee) },
    { section: 'Shipping Line Charges', label: 'Shipping Line Subtotal', amount_fcy: shippingSubtotal, amount_tzs: t(shippingSubtotal) },
    { section: 'ICD Charges', label: `LCL Corridor Levy (${cbm} CBM)`, amount_fcy: corridorLevy, amount_tzs: t(corridorLevy) },
    { section: 'ICD Charges', label: `LCL Handling Charges (${cbm} CBM)`, amount_fcy: icdHandling, amount_tzs: t(icdHandling) },
    { section: 'ICD Charges', label: `LCL Removal Charges (${cbm} CBM)`, amount_fcy: removal, amount_tzs: t(removal) },
    { section: 'ICD Charges', label: `LCL Storage Charges (${cbm} CBM)`, amount_fcy: storage, amount_tzs: t(storage) },
    { section: 'ICD Charges', label: `LCL Stripping Charges (${cbm} CBM)`, amount_fcy: stripping, amount_tzs: t(stripping) },
    { section: 'ICD Charges', label: 'ICD Charges Subtotal', amount_fcy: icdSubtotal, amount_tzs: t(icdSubtotal) },
    { section: 'Transit-Specific Charges', label: 'Transit Bond Premium (0.5% of CIF)', amount_fcy: bondPremium, amount_tzs: t(bondPremium) },
    { section: 'Transit-Specific Charges', label: 'TANCIS Processing / Transit Entry', amount_fcy: tancisEntry, amount_tzs: t(tancisEntry) },
    { section: 'Transit-Specific Charges', label: `Road User Charges (${distanceKm} km @ USD 10/100km)`, amount_fcy: roadUser, amount_tzs: t(roadUser) },
    { section: 'Transit-Specific Charges', label: `Weighbridge Fees (${checkpoints} checkpoint${checkpoints === 1 ? '' : 's'})`, amount_fcy: weighbridge, amount_tzs: t(weighbridge) },
    { section: 'Transit-Specific Charges', label: 'Escort Fees (if required)', amount_fcy: escortFee, amount_tzs: t(escortFee) },
    { section: 'Transit-Specific Charges', label: 'Transit-Specific Subtotal', amount_fcy: transitSubtotal, amount_tzs: t(transitSubtotal) },
    { section: 'Clearance & Inland Transport', label: `Documentation (${numBills} bill)`, amount_fcy: documentation, amount_tzs: t(documentation) },
    { section: 'Clearance & Inland Transport', label: `Agency Fees — Transit (${numBills} bill)`, amount_fcy: agencyFee, amount_tzs: t(agencyFee) },
    { section: 'Clearance & Inland Transport', label: `Inland Transport (Dar → ${input.destination}, ${numContainers}× ${input.container_size})`, amount_fcy: inlandTransport, amount_tzs: t(inlandTransport) },
    { section: 'Clearance & Inland Transport', label: 'Clearance & Transport Subtotal', amount_fcy: clearanceSubtotal, amount_tzs: t(clearanceSubtotal) },
    { section: 'Grand Total', label: 'Total Charges (all non-CIF)', amount_fcy: chargesTotal, amount_tzs: t(chargesTotal) },
    { section: 'Grand Total', label: 'Grand Total (CIF + All Charges)', amount_fcy: grandTotal, amount_tzs: t(grandTotal) },
  ];

  const warnings: string[] = [];
  if (!route) warnings.push(`No route reference data on file for "${input.destination}" — distance/weighbridge/transport figures default to 0 unless you supplied overrides. Add this route under the Transit Calculator's route table.`);

  return {
    mode: 'transit', hs_code: input.hs_code || '', description: input.description || '',
    currency: 'USD', fx_rate: fxRate,
    fob, freight, insurance, cif, cif_tzs: cifTzs,
    duty_rate: 0, excise_rate: 0, rdl_rate: 0, cpf_rate: 0, vat_rate: 0,
    statutory_total: statutoryTotal, statutory_total_tzs: 0,
    charges_total: chargesTotal, charges_total_tzs: t(chargesTotal),
    grand_total: grandTotal, grand_total_tzs: t(grandTotal),
    vat_recoverable: 0,
    grand_total_net_vat: grandTotalNetVat, grand_total_net_vat_tzs: t(grandTotalNetVat),
    per_unit: null,
    landed_multiplier: fob > 0 ? grandTotalNetVat / fob : 0,
    breakdown, warnings,
    assumptions: [
      'Transit cargo is exempted from Import Duty, Excise, RDL, CPF and VAT — it is not entering Tanzania for consumption.',
      'Port Charges (Wharfage, Green Port Initiatives, Port Infrastructure Development) are modelled as zero for transit, matching Aleka Logistics’ own transit rate card — confirm this against your actual TPA invoice if your cargo is assessed port charges before onward transit.',
      'Road User Charges, Weighbridge Fees and Inland Transport are sourced from this workspace’s own editable route reference table — verify current market rates before quoting.',
    ],
    overridden_fields: [],
  };
}
