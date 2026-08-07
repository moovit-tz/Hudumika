import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { SealService } from './seal.service.js';
import { computeDuty } from './seal-duty.service.js';
import { getCustomsAdapter } from './seal-customs-adapter.js';
import { legalNextSealDeclarationStatuses, type SealDeclarationStatus, type CustomsStatus } from '@hudumika/types';

export class IllegalDeclarationTransition extends Error {
  constructor(public from: SealDeclarationStatus, public to: SealDeclarationStatus) {
    super(`Illegal declaration transition: ${from} → ${to}`);
    this.name = 'IllegalDeclarationTransition';
  }
}

export class ExaminationPending extends Error {
  constructor(public examinationId: string, public channel: string) {
    super(`This declaration was selected for ${channel} channel examination — it cannot be assessed until that examination is completed or waived.`);
    this.name = 'ExaminationPending';
  }
}

// Simulates TANCIS's real selectivity assignment at submission (spec's own
// examination-management scope, Increment 4) — weighted toward GREEN like a
// real risk-based system, not a coin flip. GREEN never needs an officer to
// act, so its examination row is created already WAIVED/CLEARED — the row
// still exists (so the UI always has something to show for "what channel
// was this"), it's just not a blocker.
function assignSelectivityChannel(): 'GREEN' | 'YELLOW' | 'RED' {
  const r = Math.random();
  if (r < 0.7) return 'GREEN';
  if (r < 0.9) return 'YELLOW';
  return 'RED';
}

// Which customs_status an ex-warehouse declaration moves its lot to on
// release — mirrors the legal transitions already enforced in seal.ts's
// CUSTOMS_STATUS_TRANSITIONS, so SealService.recordMovement's own legality
// check is the real guard here, not a second copy of the rule.
const PROCEDURE_TARGET_STATUS: Record<string, CustomsStatus> = {
  EX_WAREHOUSE_HOME_USE: 'FOREIGN_DUTY_PAID',
  EX_WAREHOUSE_RE_EXPORT: 'EXPORT_DECLARED',
  EX_WAREHOUSE_TRANSFER: 'TRANSIT',
};

export class SealDeclarationService {
  /** Creates a DRAFT declaration and immediately computes duty against it —
   *  the computation panel is never empty (spec S6: "the duty computation
   *  panel is always visible... updates live"). */
  static async createDeclaration(trx: Transaction<Database>, tenantId: string, actorId: string | null, input: {
    lotId: string; procedureCode: string; declarationDate: string; hsCode: string;
    countryOfOrigin?: string | null; invoiceValue: number; freight?: number; insurance?: number;
    currency: string; fxRate: number;
  }) {
    const computation = await computeDuty({
      hsCode: input.hsCode, invoiceValue: input.invoiceValue, freight: input.freight,
      insurance: input.insurance, currency: input.currency, fxRate: input.fxRate,
    });

    return trx.insertInto('seal_customs_entries').values({
      tenant_id: tenantId,
      lot_id: input.lotId,
      procedure_code: input.procedureCode,
      declaration_date: new Date(input.declarationDate),
      hs_code: input.hsCode,
      hs_code_ref_id: computation.hsCodeId,
      country_of_origin: input.countryOfOrigin ?? null,
      invoice_value: String(input.invoiceValue),
      freight: String(input.freight ?? 0),
      insurance: String(input.insurance ?? 0),
      currency: input.currency,
      fx_rate: String(input.fxRate),
      computation: JSON.stringify(computation),
      created_by: actorId,
    }).returningAll().executeTakeFirstOrThrow();
  }

  /** Recomputes duty against the entry's own stored inputs — used by "Recompute"
   *  while still DRAFT, and by the reproducibility check (spec §5.7: re-running
   *  a stored declaration's inputs must give the identical number). Never
   *  called automatically past DRAFT — once submitted, `computation` is frozen. */
  static async recompute(trx: Transaction<Database>, tenantId: string, entryId: string) {
    const entry = await trx.selectFrom('seal_customs_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', entryId).executeTakeFirstOrThrow();
    const computation = await computeDuty({
      hsCode: entry.hs_code, invoiceValue: Number(entry.invoice_value), freight: Number(entry.freight),
      insurance: Number(entry.insurance), currency: entry.currency, fxRate: Number(entry.fx_rate),
    });
    // pg auto-deserializes jsonb columns to objects already — only parse if it somehow arrives as a raw string.
    const stored = entry.computation ? (typeof entry.computation === 'string' ? JSON.parse(entry.computation) : entry.computation) : null;
    return { stored, recomputed: computation };
  }

  /** `tenantId` is required on every one of these: `entryId` comes from the
   *  URL, and without it one workspace can submit, assess, pay and release
   *  another workspace's customs declaration — release in particular writes
   *  a real ledger movement and zeroes that lot's duty/tax at risk. */
  static async advanceStatus(trx: Transaction<Database>, tenantId: string, entryId: string, to: SealDeclarationStatus, reference?: string | null) {
    const entry = await trx.selectFrom('seal_customs_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', entryId).executeTakeFirstOrThrow();
    const from = entry.status as SealDeclarationStatus;
    if (!legalNextSealDeclarationStatuses(from).includes(to)) {
      throw new IllegalDeclarationTransition(from, to);
    }
    if (to === 'ASSESSED') {
      const openExam = await trx.selectFrom('seal_examinations').select(['id', 'selectivity_channel'])
        .where('tenant_id', '=', tenantId)
        .where('customs_entry_id', '=', entryId)
        .where('status', 'not in', ['COMPLETED', 'WAIVED'])
        .executeTakeFirst();
      if (openExam) throw new ExaminationPending(openExam.id, openExam.selectivity_channel);
    }
    return trx.updateTable('seal_customs_entries').set({
      status: to,
      ...(to === 'PAID' && reference ? { payment_reference: reference } : {}),
      updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', entryId).returningAll().executeTakeFirstOrThrow();
  }

  static async submit(trx: Transaction<Database>, tenantId: string, entryId: string, humanProvidedReference: string) {
    const entry = await trx.selectFrom('seal_customs_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', entryId).executeTakeFirstOrThrow();
    if (entry.status !== 'DRAFT') throw new Error(`Only a DRAFT declaration can be submitted (this one is ${entry.status}).`);

    const adapter = getCustomsAdapter(entry.jurisdiction);
    const receipt = await adapter.submitDeclaration({ entryId, humanProvidedReference });

    const channel = assignSelectivityChannel();
    await trx.insertInto('seal_examinations').values({
      tenant_id: entry.tenant_id,
      customs_entry_id: entryId,
      selectivity_channel: channel,
      examination_type: channel === 'RED' ? 'PHYSICAL' : 'DOCUMENT',
      status: channel === 'GREEN' ? 'WAIVED' : 'REQUESTED',
      outcome: channel === 'GREEN' ? 'CLEARED' : null,
      completed_at: channel === 'GREEN' ? new Date() : null,
    }).execute();

    return trx.updateTable('seal_customs_entries').set({
      status: 'SUBMITTED', submission_reference: receipt.reference, updated_at: new Date(),
    }).where('tenant_id', '=', tenantId).where('id', '=', entryId).returningAll().executeTakeFirstOrThrow();
  }

  /** The consequential step (spec Increment 3's exit criterion): releasing a
   *  PAID declaration changes the lot's actual fiscal status through the
   *  same append-only, hash-chained ledger every other movement uses — and
   *  settles its duty/tax-at-risk now that duty has actually been paid. */
  static async release(trx: Transaction<Database>, tenantId: string, actorId: string | null, entryId: string) {
    const entry = await trx.selectFrom('seal_customs_entries').selectAll().where('tenant_id', '=', tenantId).where('id', '=', entryId).executeTakeFirstOrThrow();
    if (entry.status !== 'PAID') throw new Error(`Only a PAID declaration can be released (this one is ${entry.status}).`);

    const targetStatus = PROCEDURE_TARGET_STATUS[entry.procedure_code];
    if (!targetStatus) throw new Error(`No target customs status mapped for procedure ${entry.procedure_code}.`);

    await SealService.recordMovement(trx, tenantId, {
      actorId, movementType: 'release', lotId: entry.lot_id,
      toCustomsStatus: targetStatus, entryReference: entry.submission_reference,
      reasonCode: 'DECLARATION_RELEASED', reference: entryId,
    });

    // Duty is settled (or the lot has left the suspended regime entirely) —
    // it no longer consumes bond headroom.
    await trx.updateTable('seal_lots').set({ duty_at_risk: '0', tax_at_risk: '0', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', entry.lot_id).execute();

    return trx.updateTable('seal_customs_entries').set({ status: 'RELEASED', updated_at: new Date() })
      .where('tenant_id', '=', tenantId).where('id', '=', entryId).returningAll().executeTakeFirstOrThrow();
  }
}
