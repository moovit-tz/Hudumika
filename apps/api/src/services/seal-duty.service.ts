import { getHsCode } from './customs.service.js';

// SEAL's duty/tax engine (spec §5.7). Reuses the platform's real EAC CET
// jurisdiction pack (hs_codes, 5,977 rows, migration 036) via the same
// getHsCode() lookup ClearOS's own landed-cost engine already uses — same
// rates, same computation order (CIF → duty → excise → RDL → CPF → VAT on
// CIF+duty+excise), for consistency across both apps. Deliberately excludes
// ClearOS's "destination charge" and "wharfage" additions: those are port/
// handling fees for goods still moving through a terminal, not applicable
// to a bonded lot already sitting in the warehouse being ex-warehoused.
//
// Non-negotiable per spec §5.7: reproducible (every number traces to a
// stored input + the hs_codes row snapshot) and explainable (every step
// shown, never just a total).

export class HsCodeNotFound extends Error {
  constructor(public hsCode: string) {
    super(`No tariff line found for HS code "${hsCode}" — cannot compute duty without one.`);
    this.name = 'HsCodeNotFound';
  }
}

export interface DutyLineItem {
  code: 'IMPORT_DUTY' | 'EXCISE' | 'RDL' | 'CPF' | 'VAT';
  label: string;
  base: number;
  ratePct: number;
  amount: number;
}

export interface DutyComputationResult {
  hsCode: string;
  hsCodeId: string;
  hsCodeDescription: string;
  invoiceValue: number;
  freight: number;
  insurance: number;
  currency: string;
  fxRate: number;
  cifValue: number;         // in declared currency
  cifValueLocal: number;    // × fxRate, the base every levy computes from
  lineItems: DutyLineItem[];
  totalDuty: number;        // import duty only
  totalTax: number;         // excise + RDL + CPF + VAT
  totalPayableLocal: number;
  computedAt: string;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export async function computeDuty(input: {
  hsCode: string;
  invoiceValue: number;
  freight?: number;
  insurance?: number;
  currency: string;
  fxRate: number;
}): Promise<DutyComputationResult> {
  const hs = await getHsCode(input.hsCode);
  if (!hs) throw new HsCodeNotFound(input.hsCode);

  const freight = input.freight ?? 0;
  const insurance = input.insurance ?? 0;
  const cifValue = input.invoiceValue + freight + insurance;
  const cifValueLocal = round2(cifValue * input.fxRate);

  const lineItems: DutyLineItem[] = [];

  const duty = round2(cifValueLocal * (hs.import_duty_rate / 100));
  lineItems.push({ code: 'IMPORT_DUTY', label: 'Import Duty', base: cifValueLocal, ratePct: hs.import_duty_rate, amount: duty });

  const excise = round2(cifValueLocal * (hs.excise_rate / 100));
  lineItems.push({ code: 'EXCISE', label: 'Excise Duty', base: cifValueLocal, ratePct: hs.excise_rate, amount: excise });

  const rdl = round2(cifValueLocal * (hs.rdl_rate / 100));
  lineItems.push({ code: 'RDL', label: 'Railway Development Levy', base: cifValueLocal, ratePct: hs.rdl_rate, amount: rdl });

  const cpf = round2(cifValueLocal * (hs.cpf_rate / 100));
  lineItems.push({ code: 'CPF', label: 'Customs Processing Fee', base: cifValueLocal, ratePct: hs.cpf_rate, amount: cpf });

  const vatBase = round2(cifValueLocal + duty + excise);
  const vat = round2(vatBase * (hs.vat_rate / 100));
  lineItems.push({ code: 'VAT', label: 'Value Added Tax', base: vatBase, ratePct: hs.vat_rate, amount: vat });

  const totalTax = round2(excise + rdl + cpf + vat);
  const totalPayableLocal = round2(duty + totalTax);

  return {
    hsCode: hs.code, hsCodeId: hs.id, hsCodeDescription: hs.description,
    invoiceValue: input.invoiceValue, freight, insurance, currency: input.currency, fxRate: input.fxRate,
    cifValue, cifValueLocal, lineItems, totalDuty: duty, totalTax, totalPayableLocal,
    computedAt: new Date().toISOString(),
  };
}
