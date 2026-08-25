import type { Transaction } from 'kysely';
import type { Database } from '../db/client.js';

export type DocType = 'invoice' | 'quotation' | 'purchase_order' | 'project' | 'contract';

const DEFAULTS: Record<DocType, { prefix: string; pad: number }> = {
  invoice: { prefix: 'INV-', pad: 4 },
  quotation: { prefix: 'QT-', pad: 4 },
  purchase_order: { prefix: 'PO-', pad: 4 },
  project: { prefix: 'PRJ-', pad: 4 },
  contract: { prefix: 'CTR-', pad: 4 },
};

/**
 * Atomically claims the next document number for this tenant+doc type,
 * replacing the `INV-${Date.now()}` / `PO-${Date.now()}` fallbacks that never
 * reflected the prefix/padding a tenant configured in Settings ▸ Invoices
 * (Workspace admin). `next_number` means "the next number to issue" — the
 * UPDATE's row lock is what actually serializes concurrent callers; the
 * RETURNING arithmetic (next_number - 1) reads back the value this call claimed.
 */
export async function getNextDocNumber(trx: Transaction<Database>, tenantId: string, docType: DocType): Promise<string> {
  const def = DEFAULTS[docType];
  await trx.insertInto('invoice_sequences')
    .values({ tenant_id: tenantId, doc_type: docType, prefix: def.prefix, pad_length: def.pad, next_number: 1 })
    .onConflict((oc) => oc.columns(['tenant_id', 'doc_type']).doNothing())
    .execute();

  const row = await trx.updateTable('invoice_sequences')
    .set((eb) => ({ next_number: eb('next_number', '+', 1) }))
    .where('tenant_id', '=', tenantId)
    .where('doc_type', '=', docType)
    .returning(['prefix', 'pad_length', 'next_number'])
    .executeTakeFirstOrThrow();

  const issued = row.next_number - 1;
  return `${row.prefix}${String(issued).padStart(row.pad_length, '0')}`;
}

/** Reads the current numbering config (for the Settings ▸ Invoices/Quotations/Purchase Orders "Numbering" cards). */
export async function getDocSequence(trx: Transaction<Database>, tenantId: string, docType: DocType) {
  const def = DEFAULTS[docType];
  const row = await trx.selectFrom('invoice_sequences').selectAll()
    .where('tenant_id', '=', tenantId).where('doc_type', '=', docType).executeTakeFirst();
  return row ?? { tenant_id: tenantId, doc_type: docType, prefix: def.prefix, pad_length: def.pad, next_number: 1 };
}

/** Admin override — resync the prefix/padding/next-number (e.g. after manually numbering old documents). */
export async function setDocSequence(trx: Transaction<Database>, tenantId: string, docType: DocType, patch: { prefix?: string; pad_length?: number; next_number?: number }) {
  const def = DEFAULTS[docType];
  await trx.insertInto('invoice_sequences')
    .values({ tenant_id: tenantId, doc_type: docType, prefix: patch.prefix ?? def.prefix, pad_length: patch.pad_length ?? def.pad, next_number: patch.next_number ?? 1 })
    .onConflict((oc) => oc.columns(['tenant_id', 'doc_type']).doUpdateSet({
      ...(patch.prefix !== undefined ? { prefix: patch.prefix } : {}),
      ...(patch.pad_length !== undefined ? { pad_length: patch.pad_length } : {}),
      ...(patch.next_number !== undefined ? { next_number: patch.next_number } : {}),
    }))
    .execute();
  return getDocSequence(trx, tenantId, docType);
}
