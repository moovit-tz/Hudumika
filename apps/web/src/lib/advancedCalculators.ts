// Shared types + helpers for the three Aleka-rate-card calculators (LCL, Air
// Freight, Transit) — mirrors apps/api/src/services/advanced-calculators.service.ts's
// AdvancedCalcResult exactly, so the frontend never has to guess the shape.

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
  fx_rate: number;
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
  landed_multiplier: number;
  breakdown: AdvBreakdownLine[];
  warnings: string[];
  assumptions: string[];
  overridden_fields: string[];
}

export interface TransitRoute {
  id: string;
  destination: string;
  border_post: string | null;
  distance_km: number | string;
  transport_20ft_usd: number | string;
  transport_40ft_usd: number | string;
  weighbridge_count: number | string;
}

/** Groups a flat breakdown array into ordered [section, lines[]] pairs,
 *  preserving first-seen section order (the backend already emits them in a
 *  sensible reading order — CIF, Tax Summary, Port Charges, ... , Grand Total). */
export function groupBreakdown(breakdown: AdvBreakdownLine[]): { section: string; lines: AdvBreakdownLine[] }[] {
  const order: string[] = [];
  const bySection = new Map<string, AdvBreakdownLine[]>();
  for (const line of breakdown) {
    if (!bySection.has(line.section)) { bySection.set(line.section, []); order.push(line.section); }
    bySection.get(line.section)!.push(line);
  }
  return order.map(section => ({ section, lines: bySection.get(section)! }));
}

export function fmt(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
