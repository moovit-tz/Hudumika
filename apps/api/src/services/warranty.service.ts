import crypto from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';
import { GLService } from './gl.service.js';
import { InventoryService } from './inventory.service.js';

// Same clearing-account convention pos.routes.ts/gift-cards.routes.ts
// already use for a real cash/card/mobile-money refund.
const tenderAccounts = { CASH: '1001', CARD: '1020', MOBILE_MONEY: '1021', BANK: '1010', OTHER: '1022' } as const;
export type RefundMethod = keyof typeof tenderAccounts;

function generateClaimNumber(): string {
  return `WC-${new Date().toISOString().replace(/\D/g, '').slice(2, 14)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

export async function issueWarranty(
  trx: Transaction<Database>, tenantId: string,
  input: {
    customerId: string; productId?: string | null; sourceType?: 'pos_sale' | 'invoice' | 'manual';
    sourceId?: string | null; serialNumber?: string | null; warrantyStart: string; warrantyEnd: string;
    terms?: string | null; actorId: string;
  },
) {
  if (input.warrantyEnd < input.warrantyStart) {
    throw Object.assign(new Error('Warranty end date cannot be before its start date.'), { statusCode: 422 });
  }
  const customer = await trx.selectFrom('customers').select('id').where('tenant_id', '=', tenantId).where('id', '=', input.customerId).executeTakeFirst();
  if (!customer) throw Object.assign(new Error('Customer not found.'), { statusCode: 404 });

  return trx.insertInto('warranties').values({
    tenant_id: tenantId, customer_id: input.customerId, product_id: input.productId ?? null,
    source_type: input.sourceType ?? 'manual', source_id: input.sourceId ?? null, serial_number: input.serialNumber ?? null,
    warranty_start: input.warrantyStart, warranty_end: input.warrantyEnd, terms: input.terms ?? null, created_by: input.actorId,
  }).returningAll().executeTakeFirstOrThrow();
}

export async function voidWarranty(trx: Transaction<Database>, tenantId: string, warrantyId: string) {
  const warranty = await trx.selectFrom('warranties').select('id').where('tenant_id', '=', tenantId).where('id', '=', warrantyId).executeTakeFirst();
  if (!warranty) throw Object.assign(new Error('Warranty not found.'), { statusCode: 404 });
  await trx.updateTable('warranties').set({ status: 'voided' }).where('tenant_id', '=', tenantId).where('id', '=', warrantyId).execute();
}

/** Files a new claim against a warranty — refuses outright against a
 *  voided warranty or one whose coverage window has already passed
 *  (checked live against today's date, never a scheduled job that could
 *  leave a lapsed warranty looking active in between runs). */
export async function fileWarrantyClaim(
  trx: Transaction<Database>, tenantId: string,
  input: { warrantyId: string; description: string; actorId: string },
) {
  const warranty = await trx.selectFrom('warranties').selectAll().where('tenant_id', '=', tenantId).where('id', '=', input.warrantyId).forUpdate().executeTakeFirst();
  if (!warranty) throw Object.assign(new Error('Warranty not found.'), { statusCode: 404 });
  if (warranty.status === 'voided') throw Object.assign(new Error('This warranty has been voided.'), { statusCode: 422 });
  const today = new Date().toISOString().slice(0, 10);
  if (warranty.warranty_end < today) {
    throw Object.assign(new Error(`This warranty expired on ${warranty.warranty_end}.`), { statusCode: 422 });
  }

  return trx.insertInto('warranty_claims').values({
    tenant_id: tenantId, warranty_id: input.warrantyId, claim_number: generateClaimNumber(),
    description: input.description, created_by: input.actorId,
  }).returningAll().executeTakeFirstOrThrow();
}

export async function reviewWarrantyClaim(
  trx: Transaction<Database>, tenantId: string,
  input: { claimId: string; decision: 'approve' | 'reject'; note?: string | null; actorId: string },
) {
  const claim = await trx.selectFrom('warranty_claims').selectAll().where('tenant_id', '=', tenantId).where('id', '=', input.claimId).forUpdate().executeTakeFirst();
  if (!claim) throw Object.assign(new Error('Claim not found.'), { statusCode: 404 });
  if (claim.status !== 'submitted' && claim.status !== 'under_review') {
    throw Object.assign(new Error(`A claim already ${claim.status} cannot be reviewed again.`), { statusCode: 409 });
  }
  return trx.updateTable('warranty_claims').set({
    status: input.decision === 'approve' ? 'approved' : 'rejected',
    review_note: input.note ?? null, reviewed_by: input.actorId, reviewed_at: new Date(),
  }).where('tenant_id', '=', tenantId).where('id', '=', input.claimId).returningAll().executeTakeFirstOrThrow();
}

export type ResolveClaimInput =
  | { resolutionType: 'repair'; locationId: string; itemId: string; qty: number; uom: string; note?: string | null }
  | { resolutionType: 'replace'; locationId: string; itemId: string; qty: number; uom: string; note?: string | null }
  | { resolutionType: 'refund'; amount: number; method: RefundMethod; note?: string | null };

/**
 * Resolves an approved claim — only ever reachable from `approved`, and
 * only once. 'repair'/'replace' reuse InventoryService.recordMovement's
 * own 'issue' GL posting (real COGS, no invented treatment: the business
 * incurred a real cost with no matching revenue, which IS the point of a
 * warranty). 'refund' posts its own small reversing entry, the same
 * Dr-revenue/Cr-cash shape every other refund in this codebase uses.
 */
export async function resolveWarrantyClaim(
  trx: Transaction<Database>, tenantId: string, claimId: string, actorId: string, input: ResolveClaimInput,
) {
  const claim = await trx.selectFrom('warranty_claims').selectAll().where('tenant_id', '=', tenantId).where('id', '=', claimId).forUpdate().executeTakeFirst();
  if (!claim) throw Object.assign(new Error('Claim not found.'), { statusCode: 404 });
  if (claim.status !== 'approved') throw Object.assign(new Error('Only an approved claim can be resolved.'), { statusCode: 409 });

  let journalEntryId: string | null = null;
  let movementId: string | null = null;

  if (input.resolutionType === 'repair' || input.resolutionType === 'replace') {
    const movement = await InventoryService.recordMovement(trx, tenantId, {
      actorId, movementType: 'issue', itemId: input.itemId, fromLocationId: input.locationId,
      enteredQty: input.qty, enteredUom: input.uom, reasonCode: `WARRANTY_${input.resolutionType.toUpperCase()}`, reference: claim.claim_number,
    });
    movementId = movement.id;
  } else {
    journalEntryId = await GLService.post(tenantId, {
      entryDate: new Date().toISOString().slice(0, 10), description: `Warranty refund: ${claim.claim_number}`,
      reference: claim.claim_number, sourceModule: 'MANUAL', sourceId: claim.warranty_id, createdBy: actorId,
      lines: [
        { accountCode: '4500', debit: input.amount, credit: 0, description: 'Revenue reversed (warranty refund)' },
        { accountCode: tenderAccounts[input.method], debit: 0, credit: input.amount, description: `${input.method.toLowerCase().replace('_', ' ')} refunded` },
      ],
    }, trx);
  }

  return trx.updateTable('warranty_claims').set({
    status: 'resolved', resolution_type: input.resolutionType, resolution_note: input.note ?? null,
    refund_amount: input.resolutionType === 'refund' ? String(input.amount) : null,
    refund_method: input.resolutionType === 'refund' ? input.method : null,
    journal_entry_id: journalEntryId, movement_id: movementId, resolved_at: new Date(),
  }).where('tenant_id', '=', tenantId).where('id', '=', claimId).returningAll().executeTakeFirstOrThrow();
}
