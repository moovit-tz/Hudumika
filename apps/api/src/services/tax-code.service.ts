import type { Kysely, Transaction } from 'kysely';
import type { Database, TaxCodeKind, TaxCodeScope } from '../db/client.js';

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
export async function ensureTaxCodes(db: Db, tenantId: string, jurisdiction = 'TZ', standardRate = 18) {
  const existing = await db
    .selectFrom('tax_codes').select('id').where('tenant_id', '=', tenantId).executeTakeFirst();
  if (existing) return false;

  const juris = /^[A-Za-z]{2}$/.test(jurisdiction) ? jurisdiction.toUpperCase() : 'TZ';
  const std = Number(standardRate) > 0 ? Number(standardRate) : 18;

  await db.insertInto('tax_codes').values([
    { tenant_id: tenantId, code: 'STD', name: `Standard rate (${std}%)`, kind: 'STANDARD',
      rate: std, jurisdiction: juris, input_tax_recoverable: true, tra_tax_code: 1, is_default: true },
    { tenant_id: tenantId, code: 'ZERO', name: 'Zero-rated', kind: 'ZERO_RATED',
      rate: 0, jurisdiction: juris, input_tax_recoverable: true, tra_tax_code: 3, is_default: false },
    { tenant_id: tenantId, code: 'EXEMPT', name: 'Exempt', kind: 'EXEMPT',
      rate: 0, jurisdiction: juris, input_tax_recoverable: false, tra_tax_code: 5, is_default: false },
    { tenant_id: tenantId, code: 'RC', name: 'Reverse charge', kind: 'REVERSE_CHARGE',
      rate: 0, jurisdiction: juris, input_tax_recoverable: true, tra_tax_code: null, is_default: false },
    { tenant_id: tenantId, code: 'OOS', name: 'Out of scope', kind: 'OUT_OF_SCOPE',
      rate: 0, jurisdiction: juris, input_tax_recoverable: false, tra_tax_code: null, is_default: false },
    // Purchase-only: tax genuinely charged and paid, but blocked from recovery.
    // Without it a blocked purchase can only be recorded as fully claimable.
    { tenant_id: tenantId, code: 'STD-NR', name: `Standard rate, not recoverable (${std}%)`,
      kind: 'STANDARD', rate: std, jurisdiction: juris, input_tax_recoverable: false,
      tra_tax_code: null, applies_to: 'PURCHASE', is_default: false },
  ]).onConflict(oc => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  return true;
}
