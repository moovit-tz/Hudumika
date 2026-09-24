import { withTenant } from '../db/client.js';
import { MinioIntegration } from '../integrations/minio.js';
import { bumpCloudFolderCount } from '../lib/cloud-folder-count.js';
import { retainUntilFor } from '../lib/cloud-retention.js';
import { wouldExceedStorageQuota } from '../lib/storage-quota.js';
import { tenantHasEntitlement } from '../middleware/entitlement.js';
import { emitDomainEvent } from './domain-events.service.js';
import { ensureDrive, ensureFolder } from './cloud-sync.service.js';

/**
 * The one cross-app entrypoint every app should call to file a generated
 * document into Cloud, replacing the current mix of "some apps call
 * CloudSync, some call POST /v1/files/upload directly, eSign writes
 * straight to storage." Every step the storage-product review called out as
 * missing from that mix lives here once: entitlement check, quota check,
 * resolving the system-owned Business Records drive, resolving a filing
 * rule into a real (idempotently-created) folder path, uploading the bytes,
 * creating the cloud_files row, linking it to the source record via the
 * existing entity_type/entity_id columns, an audit event, an idempotency
 * key so a retried caller never double-files, and a folder-count bump.
 *
 * First real caller: invoices.routes.ts, when an invoice is issued
 * (POST / and PATCH /:id, on the Draft → non-Draft transition). The same
 * call shape is what every other Finance document (credit notes,
 * quotations, purchase orders, bills, ...) and eventually every other app
 * area should move to — see the storage-product review's item 3/4.
 */
export interface SaveDocumentInput {
  tenantId: string;
  /** Entitlement key this document belongs to — checked before anything
   *  else, same key the app's own routes are gated on (e.g. 'finance'). */
  sourceApp: string;
  /** What this document is *of* — the same entity_type vocabulary
   *  cloud_files already uses elsewhere ('invoice', 'shipment', ...). */
  entityType: string;
  entityId: string;
  /** A customer this document should also be visible to (mirrors the
   *  existing 'customer' fan-out other entity types already get in
   *  files.routes.ts's CUSTOMER-role branch) — optional, most generated
   *  documents are staff-only. Reserved for a future pass; not yet wired
   *  into a visibility rule of its own here. */
  customerId?: string | null;
  /** Drives which folder this lands in — see FILING_RULES below. */
  documentType: string;
  filename: string;
  content: Buffer;
  mimeType?: string;
  /** Informational today (migration 499) — no retention-enforcement job
   *  reads it yet. */
  retentionClass?: string;
  actorId?: string | null;
  /** A caller-chosen key (e.g. `invoice:${id}:issued`) that makes a retried
   *  or duplicate call a safe no-op instead of a second copy. Strongly
   *  recommended for anything triggered by a status transition, since those
   *  can fire more than once (a PATCH that touches other fields too, a
   *  redelivered webhook, ...). */
  idempotencyKey?: string;
}

export interface SaveDocumentResult {
  fileId: string;
  /** true when idempotencyKey matched an already-filed document — the
   *  caller made no new write, this is the existing file. */
  alreadyExisted: boolean;
}

export class DocumentQuotaExceededError extends Error {
  constructor(public usedBytes: number, public limitBytes: number) {
    super(`Filing this document would exceed the tenant's storage quota (${limitBytes} bytes).`);
  }
}

/** sourceApp:documentType → folder path segments under Business Records.
 *  sourceApp here is the tenant's real entitlement key (checked against
 *  tenantHasEntitlement below) — Finance's is 'finops' (see
 *  invoices.routes.ts's own requireAnyEntitlement), not 'finance'; the
 *  folder display name stays "Finance" regardless, since that's what a
 *  human filing cabinet is called, not the internal app id.
 *  `{year}` resolves to the current calendar year at filing time — an
 *  intentionally simple default (not the document's own fiscal year, which
 *  would need a per-tenant fiscal-year-start setting this pass doesn't
 *  build). Unmapped combinations still file (see resolveFolderPath) rather
 *  than being rejected, so a new sourceApp/documentType is never a hard
 *  failure while its own filing rule is being added here. */
const FILING_RULES: Record<string, (year: number) => string[]> = {
  'finops:issued_invoice':    (y) => ['Finance', String(y), 'Sales', 'Invoices'],
  'finops:credit_note':       (y) => ['Finance', String(y), 'Sales', 'Credit Notes'],
  'finops:quotation':         (y) => ['Finance', String(y), 'Sales', 'Quotations'],
  'finops:delivery_document': (y) => ['Finance', String(y), 'Sales', 'Delivery Documents'],
  'finops:purchase_order':    (y) => ['Finance', String(y), 'Purchases', 'Purchase Orders'],
  'finops:bill':              (y) => ['Finance', String(y), 'Purchases', 'Bills'],
  'finops:vendor_document':   (y) => ['Finance', String(y), 'Purchases', 'Vendor Documents'],
  'finops:expense':           (y) => ['Finance', String(y), 'Expenses'],
  'finops:payment_incoming':  (y) => ['Finance', String(y), 'Payments', 'Incoming'],
  'finops:payment_outgoing':  (y) => ['Finance', String(y), 'Payments', 'Outgoing'],
  'finops:bank_statement':    (y) => ['Finance', String(y), 'Banking'],
  'finops:fixed_asset':       (y) => ['Finance', String(y), 'Fixed Assets'],
  'finops:tax_filing':        (y) => ['Finance', String(y), 'Taxes'],
  'finops:financial_report':  (y) => ['Finance', String(y), 'Reports'],
};

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function resolveFolderPath(sourceApp: string, documentType: string): string[] {
  const rule = FILING_RULES[`${sourceApp}:${documentType}`];
  if (rule) return rule(new Date().getFullYear());
  return [titleCase(sourceApp), titleCase(documentType)];
}

function extOf(filename: string): string {
  const m = filename.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : 'file';
}

export class DocumentService {
  static async saveDocument(input: SaveDocumentInput): Promise<SaveDocumentResult> {
    const entitled = await tenantHasEntitlement(input.tenantId, input.sourceApp);
    if (!entitled) throw new Error(`This workspace is not entitled to ${input.sourceApp} — document was not filed.`);

    const quota = await wouldExceedStorageQuota(input.tenantId, input.content.length);
    if (quota.exceeded) throw new DocumentQuotaExceededError(quota.used_bytes, quota.limit_bytes!);

    return withTenant(input.tenantId, async (trx) => {
      if (input.idempotencyKey) {
        const existing = await trx.selectFrom('cloud_files').select('id')
          .where('tenant_id', '=', input.tenantId).where('idempotency_key', '=', input.idempotencyKey)
          .executeTakeFirst();
        if (existing) return { fileId: existing.id, alreadyExisted: true };
      }

      const driveId = await ensureDrive(trx, input.tenantId);

      let parentId: string | null = null;
      for (const segment of resolveFolderPath(input.sourceApp, input.documentType)) {
        parentId = await ensureFolder(trx, input.tenantId, driveId, segment, parentId);
      }

      // Re-filing the same logical document (same entity) replaces the file
      // in place; a same-named file belonging to a DIFFERENT entity is never
      // overwritten — it gets an id suffix instead. (Without this, two
      // documents that render the same filename would replace each other,
      // and the loser's idempotency key would never be stored, so a sweep
      // would re-file it forever.)
      let filename = input.filename;
      let dupQuery = trx.selectFrom('cloud_files').select(['id', 'size', 'entity_type', 'entity_id'])
        .where('tenant_id', '=', input.tenantId).where('name', '=', filename).where('is_trash', '=', false);
      dupQuery = parentId ? dupQuery.where('parent_id', '=', parentId) : dupQuery.where('parent_id', 'is', null);
      let dup = await dupQuery.executeTakeFirst();
      if (dup && (dup.entity_type !== input.entityType || dup.entity_id !== input.entityId)) {
        const dot = filename.lastIndexOf('.');
        const suffix = ` (${input.entityId.slice(0, 8)})`;
        filename = dot > 0 ? `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}` : `${filename}${suffix}`;
        dup = undefined;
      }

      const retainUntil = await retainUntilFor(trx, input.tenantId, input.retentionClass);
      const fileId = dup?.id ?? (await trx.insertInto('cloud_files').values({
        tenant_id: input.tenantId, drive_id: driveId, name: filename, type: extOf(filename),
        size: input.content.length, parent_id: parentId, owner_name: 'System',
        mime_type: input.mimeType ?? 'application/pdf',
        entity_type: input.entityType, entity_id: input.entityId,
        idempotency_key: input.idempotencyKey ?? null,
        retention_class: input.retentionClass ?? null,
        retain_until: retainUntil,
        scan_status: 'clean', // system-generated content, never user-supplied bytes
      }).returning('id').executeTakeFirstOrThrow()).id;

      const { storageKey } = await MinioIntegration.uploadCloudFile(input.tenantId, fileId, filename, input.content);
      await trx.updateTable('cloud_files').set({
        storage_key: storageKey, size: input.content.length, updated_at: new Date(),
        ...(dup && input.idempotencyKey ? { idempotency_key: input.idempotencyKey } : {}),
        ...(dup && input.retentionClass ? { retention_class: input.retentionClass } : {}),
        // Re-filing may only extend a retention lock, never shorten it.
        ...(dup && retainUntil ? { retain_until: retainUntil } : {}),
      }).where('id', '=', fileId).execute();

      if (parentId) {
        await bumpCloudFolderCount(trx, parentId, input.tenantId, dup ? 0 : 1, input.content.length - Number(dup?.size ?? 0));
      }

      await emitDomainEvent(trx, input.tenantId, {
        type: 'document.saved', sourceApp: input.sourceApp, entityType: input.entityType, entityId: input.entityId,
        payload: { fileId, filename, documentType: input.documentType, replaced: !!dup },
        actorId: input.actorId ?? null,
      });

      return { fileId, alreadyExisted: false };
    });
  }
}
