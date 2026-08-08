import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * Whether a workspace may charge VAT at all.
 *
 * This is the question everything else assumed away. `ensureTaxCodes` seeds a
 * standard-rated code for every tenant, the classify screen offers it and the
 * return computes output tax from it — none of which is valid if the business
 * is not registered. Charging VAT without registration is collecting tax you
 * have no authority to collect.
 *
 * Three states, deliberately, matching the rest of this codebase's refusal to
 * treat absence as a value:
 *
 *   registered      an authority issued them a number. VAT applies.
 *   not_registered  someone stated it. VAT must not be charged.
 *   unknown         nobody has said. Warn — never block, never assume.
 *
 * The third is the common case on existing data and the reason this is
 * advisory rather than an enforced gate: a tenant with real standard-rated
 * invoices and no recorded VRN is far more likely to be under-configured than
 * to be committing an offence, and blocking their invoicing on our missing
 * record would be the wrong way round.
 */

export type RegistrationState = 'registered' | 'not_registered' | 'pending' | 'deregistered' | 'unknown';

export interface RegistrationStatus {
  state: RegistrationState;
  jurisdiction: string;
  regime: string;
  registrationNumber: string | null;
  /** What this jurisdiction calls the number — VRN, KRA PIN, TIN. */
  registrationLabel: string | null;
  basis: string | null;
  /** Whatever was written against the registration — including, notably, a note
   *  saying it is test data. Surfaced so seeded test rows announce themselves. */
  notes: string | null;
  /** True only when VAT may legitimately be charged on the given date. */
  mayChargeVat: boolean;
  /** Present when the state is anything other than a clean 'registered'. */
  advisory: string | null;
}

/**
 * The registration covering a jurisdiction on a date.
 *
 * Dates matter: a business registered from 1 July may not charge VAT on a June
 * invoice, and a deregistered one may not charge after its end date.
 */
export async function registrationStatus(
  db: Db,
  tenantId: string,
  jurisdiction: string,
  onDate?: string | null,
): Promise<RegistrationStatus> {
  const juris = jurisdiction.toUpperCase();
  const date = onDate ? String(onDate).slice(0, 10) : new Date().toISOString().slice(0, 10);

  const [row, ref] = await Promise.all([
    db.selectFrom('tax_registrations').selectAll()
      .where('tenant_id', '=', tenantId).where('jurisdiction', '=', juris)
      .executeTakeFirst(),
    db.selectFrom('tax_jurisdictions').select(['registration_label', 'regime'])
      .where('code', '=', juris).executeTakeFirst(),
  ]);

  const label = ref?.registration_label ?? null;

  if (!row) {
    return {
      state: 'unknown', jurisdiction: juris, regime: ref?.regime ?? 'VAT',
      registrationNumber: null, registrationLabel: label, basis: null, notes: null,
      mayChargeVat: false,
      advisory:
        `No ${juris} VAT registration is recorded for this workspace. ` +
        `Until a ${label ?? 'registration number'} is entered — or the workspace is marked as not ` +
        `registered — it cannot be said whether VAT should be charged here.`,
    };
  }

  // A registration only covers dates inside its own window.
  const from = row.registered_from ? String(row.registered_from).slice(0, 10) : null;
  const to = row.registered_to ? String(row.registered_to).slice(0, 10) : null;
  const inWindow = (!from || date >= from) && (!to || date <= to);

  const registeredNow = row.status === 'registered' && inWindow;

  let advisory: string | null = null;
  if (row.status === 'not_registered') {
    advisory = `This workspace is recorded as not registered for ${juris} VAT, so no VAT should be charged.`;
  } else if (row.status === 'pending') {
    advisory = `${juris} VAT registration is pending. VAT should not be charged until the ` +
               `${label ?? 'registration number'} is issued.`;
  } else if (row.status === 'deregistered') {
    advisory = `This workspace was deregistered for ${juris} VAT${to ? ` on ${to}` : ''}.`;
  } else if (row.status === 'registered' && !inWindow) {
    advisory = `The ${juris} VAT registration does not cover ${date}` +
               `${from ? ` — it runs from ${from}` : ''}${to ? ` to ${to}` : ''}.`;
  }

  return {
    state: registeredNow ? 'registered' : (row.status as RegistrationState),
    jurisdiction: juris,
    regime: row.regime,
    registrationNumber: row.registration_number,
    registrationLabel: label,
    basis: row.basis,
    notes: row.notes,
    mayChargeVat: registeredNow,
    advisory,
  };
}

/**
 * Reference figures for a jurisdiction — rate, threshold, what the number is
 * called, which fiscalisation system applies.
 *
 * For prefilling an onboarding form and for sanity-checking a tenant's own
 * settings against the local norm. Never authoritative: every row carries the
 * date it was checked, because these change every budget.
 */
export async function jurisdictionReference(db: Db, jurisdiction: string) {
  return db.selectFrom('tax_jurisdictions').selectAll()
    .where('code', '=', jurisdiction.toUpperCase()).executeTakeFirst();
}

export async function listJurisdictions(db: Db) {
  return db.selectFrom('tax_jurisdictions').selectAll().orderBy('name', 'asc').execute();
}

/**
 * The currency a workspace reports in.
 *
 * Their own setting first, then whatever the jurisdiction uses, and only then a
 * fallback. Every one of these used to be a bare `|| 'TZS'`, which quietly made
 * a Ghanaian workspace report in Tanzanian shillings.
 */
export async function reportingCurrency(db: Db, tenantId: string): Promise<string> {
  const ts = await db.selectFrom('tenant_settings').select('settings')
    .where('tenant_id', '=', tenantId).executeTakeFirst();
  const configured = (ts?.settings as any)?.company?.currency;
  if (typeof configured === 'string' && /^[A-Za-z]{3}$/.test(configured)) {
    return configured.toUpperCase();
  }

  const code = await db.selectFrom('tax_codes').select('jurisdiction')
    .where('tenant_id', '=', tenantId).where('is_default', '=', true).executeTakeFirst();
  if (code?.jurisdiction) {
    const ref = await db.selectFrom('tax_jurisdictions').select('currency')
      .where('code', '=', code.jurisdiction).executeTakeFirst();
    if (ref?.currency) return ref.currency.toUpperCase();
  }
  return 'TZS';
}
