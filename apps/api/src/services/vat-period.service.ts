import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { computeVatReturn } from './vat-return.service.js';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * Filing periods, and the document freeze that makes a return mean something.
 *
 * Two levels, deliberately distinct:
 *
 *   posted            cannot be *deleted*. A posted document has hit the
 *                     ledger; removing it leaves the journal pointing at
 *                     nothing (there is one such orphan in this database
 *                     already). It can be voided, which reverses the journal
 *                     and leaves both halves visible.
 *
 *   in a closed period  cannot be changed at all — not edited, not voided.
 *                     The return has been filed on it.
 *
 * The gap between the two is on purpose. Classifying a posted document's tax
 * treatment is allowed right up until its period closes, which is the only
 * reason the existing unclassified backlog can ever be fixed: freezing on
 * "posted" alone would make those rows permanently unclassifiable.
 */

export class PeriodClosed extends Error {
  constructor(public readonly periodStart: string, public readonly periodEnd: string) {
    super(
      `The VAT period ${periodStart} to ${periodEnd} is closed and its return has been ` +
      `filed. Reopen the period if this genuinely needs to change.`,
    );
    this.name = 'PeriodClosed';
  }
}

export class DocumentPosted extends Error {
  constructor(kind: string, number: string) {
    super(
      `${kind} ${number} has been posted to the ledger and cannot be deleted. ` +
      `Void it instead — that reverses the journal entry and keeps both halves on record.`,
    );
    this.name = 'DocumentPosted';
  }
}

/** The closed period covering a date, if there is one. */
export async function closedPeriodFor(
  db: Db, tenantId: string, date: string | null | undefined, jurisdiction: string,
) {
  if (!date) return undefined;
  const d = String(date).slice(0, 10);
  return db
    .selectFrom('vat_periods')
    .select(['id', 'period_start', 'period_end'])
    .where('tenant_id', '=', tenantId)
    .where('jurisdiction', '=', jurisdiction.toUpperCase())
    .where('status', '=', 'closed')
    .where('period_start', '<=', d as any)
    .where('period_end', '>=', d as any)
    .executeTakeFirst();
}

/** Throws if the document's date falls inside a closed period. */
export async function assertPeriodOpen(
  db: Db, tenantId: string, date: string | null | undefined, jurisdiction: string,
) {
  const p = await closedPeriodFor(db, tenantId, date, jurisdiction);
  if (p) throw new PeriodClosed(String(p.period_start).slice(0, 10), String(p.period_end).slice(0, 10));
}

/** The tenant's own jurisdiction, from their default tax code, then settings, then TZ. */
export async function tenantJurisdiction(db: Db, tenantId: string): Promise<string> {
  const code = await db
    .selectFrom('tax_codes').select('jurisdiction')
    .where('tenant_id', '=', tenantId).where('is_default', '=', true)
    .executeTakeFirst();
  if (code?.jurisdiction) return code.jurisdiction.toUpperCase();

  const ts = await db
    .selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
  const country = (ts?.settings as any)?.company?.country;
  if (typeof country === 'string' && /^[A-Za-z]{2}$/.test(country)) return country.toUpperCase();
  if (typeof country === 'string' && country.toLowerCase() === 'tanzania') return 'TZ';
  return 'TZ';
}

export function isPeriodError(e: unknown): e is Error {
  return e instanceof PeriodClosed || e instanceof DocumentPosted;
}

/**
 * Void a posted document's journal entries by posting their mirror image.
 *
 * A reversal rather than an edit or a delete: the original stays, the reversal
 * stays, and the net is zero. That is what makes the ledger auditable — someone
 * reading it later can see that something was undone and when, which a deletion
 * destroys.
 */
export async function reverseDocumentJournals(
  trx: Transaction<Database>,
  tenantId: string,
  sourceModule: 'AR' | 'AP',
  sourceId: string,
  actorId: string | null,
  reason: string,
): Promise<number> {
  const entries = await trx
    .selectFrom('journal_entries')
    .select(['id', 'entry_number', 'entry_date', 'reference', 'description'])
    .where('tenant_id', '=', tenantId)
    .where('source_module', '=', sourceModule)
    .where('source_id', '=', sourceId)
    .where('voided_at', 'is', null)
    .execute();

  for (const e of entries) {
    const lines = await trx
      .selectFrom('journal_lines as jl')
      .innerJoin('chart_of_accounts as a', 'a.id', 'jl.account_id')
      .select(['a.code', 'jl.debit', 'jl.credit', 'jl.description'])
      .where('jl.journal_entry_id', '=', e.id)
      .execute();

    await GLService.post(tenantId, {
      entryDate: new Date().toISOString(),
      description: `Reversal of ${e.description ?? e.entry_number}`,
      reference: e.reference ?? e.entry_number,
      sourceModule,
      sourceId,
      createdBy: actorId ?? undefined,
      // Debits and credits swapped — the mirror image, not a negative amount.
      lines: lines.map(l => ({
        accountCode: l.code,
        debit: Number(l.credit) || 0,
        credit: Number(l.debit) || 0,
        description: `Reversal: ${l.description ?? ''}`.trim(),
      })),
    } as any);

    await trx.updateTable('journal_entries')
      .set({ voided_at: new Date(), voided_by: actorId, void_reason: reason, status: 'VOIDED', updated_at: new Date() })
      .where('id', '=', e.id)
      .execute();
  }
  return entries.length;
}

/**
 * Close a period: compute the return, store it as filed, and post the
 * partial-exemption adjustment if there is one.
 *
 * The adjustment is the piece that was previously only *described*. Every bill
 * debits its whole recoverable input tax to 1150 when it is entered, but the
 * period may only allow a proportion of it. The restricted remainder is not
 * recoverable and never will be, so it moves out of the asset and into cost.
 */
export async function closeVatPeriod(
  trx: Transaction<Database>,
  tenantId: string,
  periodId: string,
  actorId: string | null,
  reportingCurrency: string,
) {
  const period = await trx.selectFrom('vat_periods').selectAll()
    .where('id', '=', periodId).where('tenant_id', '=', tenantId).executeTakeFirst();
  if (!period) return { error: 'Period not found' as const };
  if (period.status === 'closed') return { error: 'That period is already closed' as const };

  const from = String(period.period_start).slice(0, 10);
  const to = String(period.period_end).slice(0, 10);

  const ret = await computeVatReturn(trx, tenantId, from, to, reportingCurrency, period.jurisdiction);

  let adjustmentEntryId: string | null = null;
  const restricted = Math.round(ret.inputTaxRestricted * 100) / 100;

  // GLService.post opens its own transaction, so the adjustment commits
  // independently of this one — the same pattern every other posting site in
  // this codebase uses. The guard below is what keeps that safe: a close that
  // fails after posting can be retried without double-posting the adjustment.
  const existingAdj = restricted > 0
    ? await trx.selectFrom('journal_entries').select('id')
        .where('tenant_id', '=', tenantId).where('source_module', '=', 'MANUAL')
        .where('source_id', '=', period.id).where('voided_at', 'is', null)
        .executeTakeFirst()
    : undefined;

  if (restricted > 0 && existingAdj) {
    adjustmentEntryId = existingAdj.id;
  } else if (restricted > 0) {
    adjustmentEntryId = await GLService.post(tenantId, {
      entryDate: to,
      description: `VAT partial-exemption restriction, ${from} to ${to}`,
      reference: `VAT-${from}`,
      // 'MANUAL' rather than 'GL' — journal_entries.source_module is
      // constrained to AR/AP/EXPENSE/MANUAL/PAYROLL, and a period-end
      // adjustment is exactly the manual-journal case.
      sourceModule: 'MANUAL',
      sourceId: period.id,
      createdBy: actorId ?? undefined,
      lines: [
        // Out of the asset, into cost: this portion is not coming back.
        { accountCode: '5000', debit: restricted, credit: 0, description: 'Irrecoverable VAT (partial exemption)' },
        { accountCode: '1150', debit: 0, credit: restricted, description: 'VAT input tax restricted' },
      ],
    } as any);
  }

  await trx.updateTable('vat_periods').set({
    status: 'closed',
    return_snapshot: JSON.stringify(ret) as any,
    adjustment_entry_id: adjustmentEntryId,
    adjustment_amount: restricted,
    closed_at: new Date(),
    closed_by: actorId,
    updated_at: new Date(),
  }).where('id', '=', periodId).where('tenant_id', '=', tenantId).execute();

  return { period: await trx.selectFrom('vat_periods').selectAll().where('id', '=', periodId).executeTakeFirst(), ret };
}
