import type { Kysely, Transaction } from 'kysely';
import type { Database, TaxCodeKind } from '../db/client.js';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * A VAT return, computed from the documents rather than from the ledger.
 *
 * The page this replaces read one GL account (2200), kept only its credits, and
 * recovered a taxable base by dividing the tax by a hardcoded 18% — which is
 * wrong the moment a tenant is on another rate and meaningless on a mixed-rate
 * invoice. It also had no purchase side at all, so it could not state the one
 * figure a return exists to produce: what you actually owe, or are owed.
 *
 * Reading the documents instead means every figure has a source you can click
 * through to, and the net position is derived rather than asserted.
 */

export interface VatBucket {
  kind: TaxCodeKind | 'UNCLASSIFIED';
  code: string | null;
  name: string;
  net: number;
  tax: number;
  lines: number;
}

export interface VatReturn {
  from: string;
  to: string;
  currency: string;
  /** null when the return merges every jurisdiction (single-country tenant). */
  jurisdiction: string | null;

  /** Sales. `net` is the taxable base; `tax` is output tax charged. */
  outputs: VatBucket[];
  outputTax: number;

  /** Purchases. */
  inputs: VatBucket[];
  inputTax: number;
  /** Input tax on treatments that permit recovery, before apportionment. */
  inputTaxClaimable: number;
  /** Input tax on blocked treatments, and on purchases with no treatment recorded. */
  inputTaxBlocked: number;

  /**
   * Partial exemption. Making exempt supplies restricts how much input tax you
   * may recover; the standard method apportions by turnover.
   */
  taxableSupplies: number;
  exemptSupplies: number;
  recoveryRatePct: number;
  /** inputTaxClaimable × recoveryRate — what is actually claimable. */
  inputTaxRecoverable: number;
  /** The part disallowed purely by apportionment. */
  inputTaxRestricted: number;

  /** Positive = payable to the authority. Negative = repayable to you. */
  netPayable: number;

  /**
   * Rows the return could not classify. These are not zero — they are unknown,
   * and they are excluded from every figure above rather than quietly bucketed.
   */
  unclassified: {
    salesLines: number; salesNet: number; salesTax: number;
    purchaseLines: number; purchaseNet: number; purchaseTax: number;
  };

  /** Documents that could not be converted to the reporting currency. */
  fxSkipped: { invoices: number; bills: number };

  /**
   * What the ledger says, next to what the return says.
   *
   * These should agree, and where they do not the difference is meaningful
   * rather than an error. The usual gap is the partial-exemption restriction:
   * a bill posts its whole recoverable tax to the input-VAT asset when it is
   * entered, but the return may only allow part of it. Closing that gap is a
   * period-end adjustment (debit expense, credit input VAT) which nothing here
   * posts automatically — so it is shown, not silently reconciled away.
   */
  ledger: {
    outputTax: number;
    inputTax: number;
    netPerLedger: number;
    /** netPayable − netPerLedger. Non-zero means an adjustment is outstanding. */
    difference: number;
  };
}

/** Zero-rated supplies are taxable at 0% — they count toward the recovery rate. */
const TAXABLE_KINDS: TaxCodeKind[] = ['STANDARD', 'REDUCED', 'ZERO_RATED', 'REVERSE_CHARGE'];

const KIND_LABEL: Record<TaxCodeKind | 'UNCLASSIFIED', string> = {
  STANDARD: 'Standard-rated',
  REDUCED: 'Reduced-rated',
  ZERO_RATED: 'Zero-rated',
  EXEMPT: 'Exempt',
  REVERSE_CHARGE: 'Reverse charge',
  OUT_OF_SCOPE: 'Out of scope',
  UNCLASSIFIED: 'No treatment recorded',
};

function bucketKey(kind: string, code: string | null) { return `${kind}::${code ?? ''}`; }

function addTo(map: Map<string, VatBucket>, kind: TaxCodeKind | 'UNCLASSIFIED', code: string | null, net: number, tax: number) {
  const k = bucketKey(kind, code);
  const b = map.get(k) ?? { kind, code, name: code ? `${code} — ${KIND_LABEL[kind]}` : KIND_LABEL[kind], net: 0, tax: 0, lines: 0 };
  b.net += net; b.tax += tax; b.lines += 1;
  map.set(k, b);
}

export async function computeVatReturn(
  db: Db, tenantId: string, from: string, to: string, reportingCurrency = 'TZS',
  jurisdiction?: string,
): Promise<VatReturn> {
  const base = reportingCurrency.toUpperCase();
  // A tenant operating in two countries files two returns. `tax_codes` has
  // carried a jurisdiction since migration 180; this is what finally reads it.
  // Omitting it merges every jurisdiction into one return, which is only
  // correct for a single-country tenant.
  const juris = jurisdiction ? jurisdiction.toUpperCase() : null;

  // ── Outputs: sales invoice lines ────────────────────────────────────────
  // Draft invoices are excluded: a draft has not been issued, so nothing has
  // been charged and nothing is due on it.
  const salesLines = await db
    .selectFrom('sales_invoice_lines as l')
    .innerJoin('sales_invoices as si', 'si.id', 'l.invoice_id')
    .leftJoin('tax_codes as tc', 'tc.id', 'l.tax_code_id')
    .select([
      'l.qty', 'l.rate', 'l.tax_pct', 'l.currency as line_currency', 'l.tax_code_id',
      'si.currency as inv_currency', 'si.exchange_rate',
      'tc.code as tc_code', 'tc.kind as tc_kind', 'tc.jurisdiction as tc_jurisdiction',
    ])
    .where('si.tenant_id', '=', tenantId)
    // Draft: never issued, so nothing is due. Void: reversed in the ledger, so
    // it must stop contributing here too or the return and the books diverge.
    .where('si.status', 'not in', ['Draft', 'Void'])
    .where('si.bill_date', '>=', from as any)
    .where('si.bill_date', '<=', to as any)
    .execute();

  const outputs = new Map<string, VatBucket>();
  let taxableSupplies = 0, exemptSupplies = 0;
  const unclassified = {
    salesLines: 0, salesNet: 0, salesTax: 0,
    purchaseLines: 0, purchaseNet: 0, purchaseTax: 0,
  };
  const fxSkipped = { invoices: 0, bills: 0 };

  for (const l of salesLines) {
    const invCur = (l.inv_currency || base).toUpperCase();
    const lineCur = (l.line_currency || invCur).toUpperCase();
    const rate = Number(l.exchange_rate) || 1;

    // `exchange_rate` means units of the *invoice's* currency per one unit of a
    // foreign line currency (migration 179). It converts a line into its
    // invoice — it says nothing about converting that invoice into the
    // reporting currency, and reusing it for that would be arithmetic on two
    // unrelated pairs.
    //
    // So a line converts to its invoice, and an invoice already in the
    // reporting currency needs nothing more. An invoice in some other currency
    // has no rate to the reporting currency anywhere in the schema, and a
    // return must not silently treat 1,000 USD as 1,000 TZS: it is counted as
    // skipped and reported as such.
    // A line classified under another country's code belongs to that
    // country's return, not this one. An unclassified line has no
    // jurisdiction to place it in, so it stays here and is reported as a gap.
    if (juris && l.tc_jurisdiction && l.tc_jurisdiction.toUpperCase() !== juris) continue;
    if (invCur !== base) { fxSkipped.invoices += 1; continue; }
    let net = (Number(l.qty) || 0) * (Number(l.rate) || 0);
    if (lineCur !== invCur) net *= rate;
    const tax = net * ((Number(l.tax_pct) || 0) / 100);

    if (!l.tc_kind) {
      unclassified.salesLines += 1;
      unclassified.salesNet += net;
      unclassified.salesTax += tax;
      addTo(outputs, 'UNCLASSIFIED', null, net, tax);
      continue;
    }
    const kind = l.tc_kind as TaxCodeKind;
    addTo(outputs, kind, l.tc_code, net, tax);

    // Out-of-scope supplies sit outside the return entirely, so they take no
    // part in the recovery fraction either.
    if (TAXABLE_KINDS.includes(kind)) taxableSupplies += net;
    else if (kind === 'EXEMPT') exemptSupplies += net;
  }

  // ── Inputs: supplier bill lines ─────────────────────────────────────────
  const billLines = await db
    .selectFrom('supplier_bill_lines as l')
    .innerJoin('supplier_bills as b', 'b.id', 'l.bill_id')
    .leftJoin('tax_codes as tc', 'tc.id', 'l.tax_code_id')
    .select([
      'l.qty', 'l.unit_price', 'l.tax_rate', 'l.tax_code_id',
      'b.currency as bill_currency', 'b.exchange_rate',
      'tc.code as tc_code', 'tc.kind as tc_kind', 'tc.input_tax_recoverable',
      'tc.jurisdiction as tc_jurisdiction',
    ])
    .where('b.tenant_id', '=', tenantId)
    .where('b.status', 'not in', ['DRAFT', 'VOID'])
    .where('b.bill_date', '>=', from as any)
    .where('b.bill_date', '<=', to as any)
    .execute();

  const inputs = new Map<string, VatBucket>();
  let inputTaxClaimable = 0, inputTaxBlocked = 0;

  for (const l of billLines) {
    if (juris && l.tc_jurisdiction && l.tc_jurisdiction.toUpperCase() !== juris) continue;
    const cur = (l.bill_currency || base).toUpperCase();
    const fx = Number(l.exchange_rate) || 1;
    let net = (Number(l.qty) || 0) * (Number(l.unit_price) || 0);
    if (cur !== base) {
      if (fx === 1) { fxSkipped.bills += 1; continue; }
      net *= fx;
    }
    const tax = net * ((Number(l.tax_rate) || 0) / 100);

    if (!l.tc_kind) {
      unclassified.purchaseLines += 1;
      unclassified.purchaseNet += net;
      unclassified.purchaseTax += tax;
      addTo(inputs, 'UNCLASSIFIED', null, net, tax);
      // Unrecorded treatment is not a claim. It is blocked until someone says
      // otherwise — the conservative direction on purpose.
      inputTaxBlocked += tax;
      continue;
    }
    addTo(inputs, l.tc_kind as TaxCodeKind, l.tc_code, net, tax);
    if (l.input_tax_recoverable) inputTaxClaimable += tax;
    else inputTaxBlocked += tax;
  }

  // ── Partial exemption ───────────────────────────────────────────────────
  // Standard (turnover) method: recoverable proportion = taxable / total
  // supplies. Direct attribution would be more accurate, but nothing in this
  // schema links a purchase to the supply it was made for, so attributing would
  // mean inventing the link. The method used is stated in the response rather
  // than assumed by the reader.
  const totalSupplies = taxableSupplies + exemptSupplies;
  const recoveryRate = totalSupplies > 0 ? taxableSupplies / totalSupplies : 1;
  const inputTaxRecoverable = inputTaxClaimable * recoveryRate;

  const outputTax = [...outputs.values()].reduce((s, b) => s + b.tax, 0);
  const inputTax = [...inputs.values()].reduce((s, b) => s + b.tax, 0);

  // What the books actually hold for the same period, read straight off the two
  // VAT accounts. 2200 is a liability (output tax, normally credit); 1150 is an
  // asset (recoverable input tax, normally debit).
  const glRows = await db
    .selectFrom('journal_lines as jl')
    .innerJoin('journal_entries as je', 'je.id', 'jl.journal_entry_id')
    .innerJoin('chart_of_accounts as a', 'a.id', 'jl.account_id')
    .select(['a.code', 'jl.debit', 'jl.credit'])
    .where('je.tenant_id', '=', tenantId)
    .where('a.code', 'in', ['2200', '1150'])
    .where('je.entry_date', '>=', from as any)
    .where('je.entry_date', '<=', to as any)
    .execute();

  let ledgerOutput = 0, ledgerInput = 0;
  for (const g of glRows) {
    const d = Number(g.debit) || 0, c = Number(g.credit) || 0;
    if (g.code === '2200') ledgerOutput += c - d;
    else ledgerInput += d - c;
  }
  const netPerLedger = ledgerOutput - ledgerInput;

  const order = (b: VatBucket) =>
    ['STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE', 'UNCLASSIFIED'].indexOf(b.kind);

  return {
    from, to, currency: base, jurisdiction: juris,
    outputs: [...outputs.values()].sort((a, b) => order(a) - order(b)),
    outputTax,
    inputs: [...inputs.values()].sort((a, b) => order(a) - order(b)),
    inputTax,
    inputTaxClaimable,
    inputTaxBlocked,
    taxableSupplies,
    exemptSupplies,
    recoveryRatePct: recoveryRate * 100,
    inputTaxRecoverable,
    inputTaxRestricted: inputTaxClaimable - inputTaxRecoverable,
    netPayable: outputTax - inputTaxRecoverable,
    unclassified,
    fxSkipped,
    ledger: {
      outputTax: ledgerOutput,
      inputTax: ledgerInput,
      netPerLedger,
      difference: (outputTax - inputTaxRecoverable) - netPerLedger,
    },
  };
}
