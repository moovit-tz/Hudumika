import type { Kysely, Transaction } from 'kysely';
import type { Database, TaxCodeKind, TaxCodeScope } from '../db/client.js';
import { COMPONENT_TEMPLATES } from './tax-component.service.js';

type Db = Kysely<Database> | Transaction<Database>;

export class TaxCodeNotFound extends Error {
  constructor(id: string) {
    super(`Tax code ${id} not found in this workspace`);
    this.name = 'TaxCodeNotFound';
  }
}

export class TaxCodeWrongScope extends Error {
  constructor(public readonly code: string, public readonly scope: TaxCodeScope, wanted: TaxCodeScope) {
    super(
      `Tax code "${code}" is a ${scope.toLowerCase()} code and cannot be used on a ` +
      `${wanted.toLowerCase()} document.`,
    );
    this.name = 'TaxCodeWrongScope';
  }
}

export class TaxCodeNotFilable extends Error {
  constructor(public readonly code: string, public readonly kind: TaxCodeKind) {
    super(
      `Tax code "${code}" (${kind}) has no TRA equivalent, so this invoice cannot be ` +
      `fiscalised. Set a TRA tax code on it, or use a treatment TRA recognises.`,
    );
    this.name = 'TaxCodeNotFilable';
  }
}

/** Both are bad requests from a caller, never a server fault. */
export function isTaxCodeUserError(e: unknown): e is Error {
  return e instanceof TaxCodeNotFound || e instanceof TaxCodeWrongScope;
}

export const TAX_CODE_KINDS: TaxCodeKind[] = [
  'STANDARD', 'REDUCED', 'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE',
];

/** Kinds that must carry a rate of 0 — the DB enforces this too (migration 180). */
export const ZERO_RATE_KINDS: TaxCodeKind[] = [
  'ZERO_RATED', 'EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE',
];

/**
 * Load a tax code, refusing one that belongs to another tenant.
 *
 * The FK on `tax_code_id` guarantees the row exists; it cannot guarantee the row
 * is *yours*. Everything that accepts a tax_code_id from a request body goes
 * through here so a caller cannot attach another workspace's treatment to their
 * own invoice line.
 *
 * `scope` additionally refuses a code meant for the other side of the ledger.
 * A blocked-input-tax code ("standard rate, not recoverable") is a coherent
 * purchase treatment and nonsense on a sale — without this check it could be
 * attached to an invoice, where `input_tax_recoverable` means something else
 * entirely and would silently mis-drive the return.
 */
export async function resolveTaxCode(
  db: Db, tenantId: string, taxCodeId: string, scope?: Exclude<TaxCodeScope, 'BOTH'>,
) {
  const row = await db
    .selectFrom('tax_codes')
    .selectAll()
    .where('id', '=', taxCodeId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!row) throw new TaxCodeNotFound(taxCodeId);
  if (scope && row.applies_to !== 'BOTH' && row.applies_to !== scope) {
    throw new TaxCodeWrongScope(row.code, row.applies_to, scope);
  }
  return row;
}

/**
 * How a purchase line's tax splits for the ledger.
 *
 * Recoverable input tax is an asset — money the revenue authority owes you, so
 * it goes to its own account. Non-recoverable input tax is not an asset and
 * never becomes one, so it belongs in the cost of whatever was bought. Posting
 * both to the VAT account (which is what happened before this existed) claims
 * back tax that cannot be claimed.
 *
 * A line with no tax code is treated as NOT recoverable. That is the
 * conservative direction on purpose: an unrecorded treatment must not produce a
 * claim nobody authorised.
 */
export function splitInputTax(
  taxAmount: number,
  code: { input_tax_recoverable: boolean } | null | undefined,
): { recoverable: number; nonRecoverable: number } {
  if (!Number.isFinite(taxAmount) || taxAmount <= 0) return { recoverable: 0, nonRecoverable: 0 };
  return code?.input_tax_recoverable
    ? { recoverable: taxAmount, nonRecoverable: 0 }
    : { recoverable: 0, nonRecoverable: taxAmount };
}

/**
 * Resolve the pair a document line stores: the treatment and the rate it
 * implies.
 *
 * The rate is snapshotted onto the line rather than read through the code at
 * display time, deliberately — editing a code must never reprice a document
 * that has already been issued. When a code is given it wins over any rate the
 * caller also sent, so the two can never disagree on the same row.
 */
export async function resolveLineTax(
  db: Db,
  tenantId: string,
  input: { tax_code_id?: string | null; tax_pct?: unknown },
  fallbackRate = 0,
  scope?: Exclude<TaxCodeScope, 'BOTH'>,
): Promise<{ tax_code_id: string | null; rate: number }> {
  if (input.tax_code_id) {
    const code = await resolveTaxCode(db, tenantId, input.tax_code_id, scope);
    return { tax_code_id: code.id, rate: Number(code.rate) };
  }
  const rate = input.tax_pct === undefined || input.tax_pct === null
    ? fallbackRate
    : Number(input.tax_pct) || 0;
  return { tax_code_id: null, rate };
}

/** The tenant's default treatment for one side of the ledger, if they have one. */
export async function defaultTaxCode(db: Db, tenantId: string, scope: TaxCodeScope = 'BOTH') {
  let q = db
    .selectFrom('tax_codes')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .where('is_default', '=', true)
    .where('status', '=', 'active');
  if (scope !== 'BOTH') q = q.where(eb => eb.or([eb('applies_to', '=', 'BOTH'), eb('applies_to', '=', scope)]));
  return q.executeTakeFirst();
}

/**
 * Ensure a tenant has a usable set of treatments.
 *
 * Migration 180 seeds every tenant that existed when it ran; a workspace
 * created afterwards would otherwise have none, and its first invoice would be
 * unclassifiable for the same reason the old data is. Called on the first read
 * of the list, which is the earliest point anyone can notice.
 */
export async function ensureTaxCodes(db: Db, tenantId: string, jurisdiction?: string, standardRate?: number) {
  const existing = await db
    .selectFrom('tax_codes').select('id').where('tenant_id', '=', tenantId).executeTakeFirst();
  if (existing) return false;

  // Where is this business? Asked of the tenant, not assumed. This used to
  // default to TZ and 18% for every workspace on earth, so a Ghanaian or Kenyan
  // signup silently received Tanzanian tax codes — at the wrong rate, under the
  // wrong jurisdiction, carrying TRA EFDMS fields that mean nothing there.
  let juris: string | null =
    jurisdiction && /^[A-Za-z]{2}$/.test(jurisdiction) ? jurisdiction.toUpperCase() : null;
  if (!juris) {
    const ts = await db.selectFrom('tenant_settings').select('settings')
      .where('tenant_id', '=', tenantId).executeTakeFirst();
    const country = (ts?.settings as any)?.company?.country;
    if (typeof country === 'string' && country.trim()) {
      if (/^[A-Za-z]{2}$/.test(country.trim())) juris = country.trim().toUpperCase();
      else {
        // Free text: match it against the jurisdictions we know by name.
        const byName = await db.selectFrom('tax_jurisdictions').select(['code', 'name']).execute();
        juris = byName.find(j => j.name.toLowerCase() === country.trim().toLowerCase())?.code ?? null;
      }
    }
  }
  const code2 = juris ?? 'TZ';

  const ref = await db.selectFrom('tax_jurisdictions').selectAll()
    .where('code', '=', code2).executeTakeFirst();

  // The local standard rate, from the jurisdiction reference. Falling back to
  // 18 is a last resort for a country we have no confirmed rate for — and it is
  // recorded in the code's own guidance so nobody mistakes it for a checked
  // figure.
  const std = Number(
    standardRate ?? (ref?.standard_rate != null ? Number(ref.standard_rate) : null) ?? 18,
  );
  const rateKnown = standardRate != null || ref?.standard_rate != null;
  const regime = ref?.regime ?? 'VAT';

  // EFDMS fields belong to Tanzania. Attaching them elsewhere asserted a
  // fiscalisation regime the business is not in.
  const usesTra = !!ref?.uses_tra_codes;
  const traCode = (n: number) => (usesTra ? n : null);
  const traRate = (n: number | null) =>
    n === null ? null : (({ 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' } as Record<number, string>)[n] ?? null);

  const unknownRateNote = rateKnown ? null
    : `No standard ${regime} rate is on record for ${code2}, so this was seeded at ${std}% as a `
      + `placeholder. Confirm it against the local authority before invoicing.`;

  await db.insertInto('tax_codes').values([
    { tenant_id: tenantId, code: 'STD', name: `Standard rate (${std}%)`, kind: 'STANDARD',
      rate: std, jurisdiction: code2, input_tax_recoverable: true,
      tra_tax_code: traCode(1), tra_vat_rate: traRate(traCode(1)), is_default: true,
      guidance: unknownRateNote },
    { tenant_id: tenantId, code: 'ZERO', name: 'Zero-rated', kind: 'ZERO_RATED',
      rate: 0, jurisdiction: code2, input_tax_recoverable: true,
      tra_tax_code: traCode(3), tra_vat_rate: traRate(traCode(3)), is_default: false },
    { tenant_id: tenantId, code: 'EXEMPT', name: 'Exempt', kind: 'EXEMPT',
      rate: 0, jurisdiction: code2, input_tax_recoverable: false,
      tra_tax_code: traCode(5), tra_vat_rate: traRate(traCode(5)), is_default: false },
    { tenant_id: tenantId, code: 'RC', name: 'Reverse charge', kind: 'REVERSE_CHARGE',
      rate: 0, jurisdiction: code2, input_tax_recoverable: true,
      tra_tax_code: null, tra_vat_rate: null, is_default: false },
    { tenant_id: tenantId, code: 'OOS', name: 'Out of scope', kind: 'OUT_OF_SCOPE',
      rate: 0, jurisdiction: code2, input_tax_recoverable: false,
      tra_tax_code: null, tra_vat_rate: null, is_default: false },
    // Purchase-only: tax genuinely charged and paid, but blocked from recovery.
    { tenant_id: tenantId, code: 'STD-NR', name: `Standard rate, not recoverable (${std}%)`,
      kind: 'STANDARD', rate: std, jurisdiction: code2, input_tax_recoverable: false,
      tra_tax_code: null, tra_vat_rate: null, applies_to: 'PURCHASE', is_default: false },
  ]).onConflict(oc => oc.columns(['tenant_id', 'code']).doNothing()).execute();

  // Jurisdictions whose standard rate is really several taxes get the breakdown
  // seeded too, so the effective rate is derived rather than typed. Ghana is the
  // only one today; the template list is the extension point.
  const template = COMPONENT_TEMPLATES[code2]?.[0];
  if (template) {
    const stdCode = await db.selectFrom('tax_codes').select('id')
      .where('tenant_id', '=', tenantId).where('code', '=', 'STD').executeTakeFirst();
    if (stdCode) {
      await db.insertInto('tax_code_components').values(
        template.components.map((c, i) => ({
          tax_code_id: stdCode.id, sequence: i,
          code: c.code, name: c.name, rate: c.rate,
          basis: c.basis, recoverable: c.recoverable,
        })),
      ).onConflict(oc => oc.columns(['tax_code_id', 'sequence']).doNothing()).execute();
    }
  }

  return true;
}
