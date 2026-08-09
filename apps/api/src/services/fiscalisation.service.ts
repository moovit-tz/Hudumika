import { db } from '../db/client.js';
import { TRAService } from './tra.service.js';
import { tenantJurisdiction } from './vat-period.service.js';

/**
 * Which authority an invoice gets filed to, and how.
 *
 * The tax model already travels: a tenant outside Tanzania can invoice, pick a
 * treatment, compute a VAT return and close a period correctly. The filing pipe
 * did not — TRA EFDMS was wired straight into the invoice routes, so a Kenyan
 * business pressing "submit" was told "TRA VFD not configured for this tenant".
 * A Tanzanian error message, for a Kenyan company, about an authority it will
 * never register with.
 *
 * This is the seam. One interface, one lookup by jurisdiction, and a refusal
 * that names the authority a tenant actually files to.
 *
 * What it deliberately does NOT do is implement KRA eTIMS, URA EFRIS, GRA E-VAT
 * or RRA EBM. Each is a real protocol with its own registration, signing and
 * envelope, and none of it can be written from a plausible guess — a fabricated
 * submission that looks like it worked is worse than an honest refusal, because
 * the business believes it has filed. Adding one means implementing this
 * interface against its published spec, and nothing else changes.
 */

export interface FiscalResult {
  success: boolean;
  error?: string;
  /** Set only when the authority itself returned one. Never synthesised. */
  receiptNumber?: string;
  verificationUrl?: string;
  ackCode?: number;
  ackMsg?: string;
  /**
   * Authority-specific extras, passed through untouched. TRA's callers already
   * read rctNum/rctvNum/qrUrl and the API shape they produce is consumed by the
   * frontend — breaking that to tidy a name would be a cost with no benefit.
   */
  [key: string]: unknown;
}

export interface FiscalAdapter {
  /** The authority's short name, as the business would say it. */
  authority: string;
  /** What the integration is called, for a message someone has to act on. */
  label: string;
  submitInvoice(tenantId: string, invoiceId: string): Promise<FiscalResult>;
}

const traAdapter: FiscalAdapter = {
  authority: 'TRA',
  label: 'TRA EFDMS',
  // TRA's own field names are mapped here rather than leaked through the
  // interface. rctvNum is the verifiable receipt number — the one that appears
  // on the printed invoice and resolves on TRA's verification site — so that is
  // what becomes receiptNumber; rctNum is the internal counter.
  async submitInvoice(tenantId, invoiceId) {
    const r = await TRAService.submitInvoice(tenantId, invoiceId);
    return {
      // TRA's own names first, so existing callers keep working unchanged; the
      // neutral ones are layered on top and must win, not be overwritten by the
      // spread.
      ...r,
      success: r.success,
      error: r.error,
      receiptNumber: r.rctvNum ?? (r.rctNum != null ? String(r.rctNum) : undefined),
      verificationUrl: r.qrUrl,
      ackCode: r.ackCode,
      ackMsg: r.ackMsg,
    };
  },
};

/** Jurisdictions with a working adapter. */
const ADAPTERS: Record<string, FiscalAdapter> = {
  TZ: traAdapter,
};

/**
 * Jurisdictions that mandate electronic fiscalisation and have no adapter yet.
 *
 * Named rather than lumped into "unsupported", because the two are different
 * problems: here the business is legally required to file electronically and
 * this system cannot yet, which is worth saying precisely. The names are the
 * authorities' own; nothing about their protocols is asserted.
 */
const KNOWN_UNIMPLEMENTED: Record<string, { authority: string; system: string }> = {
  KE: { authority: 'KRA', system: 'eTIMS' },
  UG: { authority: 'URA', system: 'EFRIS' },
  GH: { authority: 'GRA', system: 'E-VAT' },
  RW: { authority: 'RRA', system: 'EBM' },
};

export function adapterForJurisdiction(jurisdiction: string | null | undefined): FiscalAdapter | null {
  return ADAPTERS[String(jurisdiction ?? '').toUpperCase()] ?? null;
}

/** Every jurisdiction this can file to, for a settings screen to be honest with. */
export function fiscalisationSupport() {
  return {
    implemented: Object.entries(ADAPTERS).map(([jurisdiction, a]) => ({
      jurisdiction, authority: a.authority, system: a.label,
    })),
    known: Object.entries(KNOWN_UNIMPLEMENTED).map(([jurisdiction, a]) => ({
      jurisdiction, authority: a.authority, system: a.system,
    })),
  };
}

/**
 * Files one invoice with whichever authority this tenant answers to.
 *
 * Resolving the jurisdiction from the tenant rather than a parameter is
 * deliberate: which authority you file to is a fact about the business, not a
 * choice the caller gets to make per request.
 */
export async function fiscaliseInvoice(tenantId: string, invoiceId: string): Promise<FiscalResult> {
  /**
   * Resolved from the workspace's default tax code, then its company country.
   *
   * Note that this never returns nothing: `tenantJurisdiction` falls back to
   * 'TZ' when it cannot tell. That fallback is load-bearing elsewhere (VAT
   * periods) and is not changed here, but it does mean a workspace that has
   * never been configured will be routed to TRA rather than asked which country
   * it is in — the same shape of assumption as the `mode DEFAULT 'SEA'` that
   * migration 183 removed. Worth revisiting; deliberately not in this change,
   * because it would alter period behaviour for every existing tenant.
   */
  const jurisdiction = (await tenantJurisdiction(db, tenantId)).toUpperCase();

  const adapter = adapterForJurisdiction(jurisdiction);
  if (adapter) return adapter.submitInvoice(tenantId, invoiceId);

  const known = KNOWN_UNIMPLEMENTED[jurisdiction];
  if (known) {
    return {
      success: false,
      error: `Invoices in ${jurisdiction} are filed to ${known.authority} ${known.system}, ` +
             `which this system cannot submit to yet. The invoice and its VAT return are correct and ` +
             `complete — only the electronic submission is missing, so it has to be filed by your usual ` +
             `means until the ${known.system} integration is built.`,
    };
  }

  return {
    success: false,
    error: `No electronic fiscalisation is configured for ${jurisdiction}. ` +
           `If your authority requires it, the integration needs to be built before invoices can be submitted from here.`,
  };
}
