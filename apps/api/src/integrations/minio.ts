/**
 * Per-purpose storage-key layout for every stored file in the platform.
 *
 * The actual bytes go through `objectStore` (integrations/object-storage.ts),
 * which is a local-disk backend by default and an S3-compatible object store
 * when S3_* env is configured. This class only owns *where* a given kind of
 * file is filed (`tenants/<id>/cloud/<fileId>/<name>`, `.../hr/<userId>/...`,
 * etc.) so those trees never cross — an employee's contract must never land
 * where code walking the customer tree would sweep it up, and so on.
 *
 * Historical name: it predates the storage backend being pluggable and every
 * call site imports `MinioIntegration`; kept rather than churn ~40 files.
 */
import fs from 'fs';
import path from 'path';
import { objectStore } from './object-storage.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/** Disk-only: create the local folder + a small marker file so the tree is
 *  navigable in a file explorer. A no-op when the backend is S3 (no folders). */
function diskFolder(relDir: string, markerName: string, markerJson: string): void {
  if (objectStore.kind !== 'disk') return;
  const localDir = path.join(UPLOADS_DIR, relDir);
  fs.mkdirSync(localDir, { recursive: true });
  const metaPath = path.join(localDir, markerName);
  if (!fs.existsSync(metaPath)) fs.writeFileSync(metaPath, markerJson);
}

const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');

export class MinioIntegration {
  /** Top-level customer folder — `tenants/{t}/customers/{c}/`. */
  static ensureCustomerFolder(tenantId: string, customerId: string, customerName: string): string {
    diskFolder(
      path.join('tenants', tenantId, 'customers', customerId),
      '.customer',
      JSON.stringify({ customerId, customerName, createdAt: new Date().toISOString() }),
    );
    const prefix = `tenants/${tenantId}/customers/${customerId}`;
    console.log(`📁 Storage: Customer folder — ${prefix} (${customerName})`);
    return prefix;
  }

  /** BL/AWB subfolder inside a customer folder. */
  static ensureFolder(tenantId: string, customerId: string, folderName: string): string {
    const c = clean(folderName);
    diskFolder(
      path.join('tenants', tenantId, 'customers', customerId, c),
      '.shipment',
      JSON.stringify({ folderName, createdAt: new Date().toISOString() }),
    );
    const prefix = `tenants/${tenantId}/customers/${customerId}/${c}`;
    console.log(`📁 Storage: Shipment folder — ${prefix}`);
    return prefix;
  }

  static async uploadDocument(
    tenantId: string, customerId: string, folderName: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const prefix = this.ensureFolder(tenantId, customerId, folderName);
    const storageKey = `${prefix}/${clean(filename)}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: File saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  /** Cloud / Drive file manager — `tenants/{t}/cloud/{fileId}/{filename}`. */
  static async uploadCloudFile(
    tenantId: string, fileId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/cloud/${fileId}/${clean(filename)}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: Cloud file saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadSupportAttachment(
    tenantId: string, attachmentId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/support/${attachmentId}/${clean(filename) || 'attachment'}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: Support attachment saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadHrDocument(
    tenantId: string, userId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    // Timestamp-prefixed so two "contract.pdf" uploads for one person don't overwrite.
    const unique = `${Date.now()}-${clean(filename) || 'document'}`;
    const storageKey = `tenants/${tenantId}/hr/${userId}/${unique}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: HR document saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadKycDocument(
    tenantId: string, userId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const unique = `${Date.now()}-${clean(filename) || 'document'}`;
    const storageKey = `tenants/${tenantId}/kyc/${userId}/${unique}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: KYC document saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadOrgKybDocument(
    tenantId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const unique = `${Date.now()}-${clean(filename) || 'document'}`;
    const storageKey = `tenants/${tenantId}/kyb/${unique}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: Org KYB document saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadShipmentReport(
    tenantId: string, shipmentId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const unique = `${Date.now()}-${clean(filename) || 'report.pdf'}`;
    const storageKey = `tenants/${tenantId}/shipment-reports/${shipmentId}/${unique}`;
    await objectStore.put(storageKey, fileBuffer, 'application/pdf');
    console.log(`🗄️ Storage: Shipment report saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadSignedDocument(
    tenantId: string, envelopeId: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/sign-documents/${envelopeId}/signed.pdf`;
    await objectStore.put(storageKey, fileBuffer, 'application/pdf');
    console.log(`🗄️ Storage: Signed document saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadStampedInvoice(
    tenantId: string, invoiceId: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/invoice-documents/${invoiceId}/stamped.pdf`;
    await objectStore.put(storageKey, fileBuffer, 'application/pdf');
    console.log(`🗄️ Storage: Stamped invoice saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadForensicJobFile(
    tenantId: string, jobId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/sign-forensic-jobs/${jobId}/${clean(filename)}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: Forensic verification upload saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  static async uploadForensicEvidence(
    tenantId: string, caseId: string, filename: string, fileBuffer: Buffer,
  ): Promise<{ storageKey: string; size: number }> {
    const storageKey = `tenants/${tenantId}/sign-forensic-evidence/${caseId}/${clean(filename)}`;
    await objectStore.put(storageKey, fileBuffer);
    console.log(`🗄️ Storage: Forensic evidence saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  /** A time-limited URL a browser can GET directly (S3 presigned GET, or an
   *  HMAC-signed link to the public passthrough route on the disk backend). */
  static async getSignedUrl(_tenantId: string, storageKey: string, expiresInSeconds = 3600): Promise<string> {
    const filename = storageKey.split('/').pop() || 'file';
    return objectStore.presignGet(storageKey, expiresInSeconds, filename);
  }

  static async deleteDocument(_tenantId: string, storageKey: string): Promise<boolean> {
    const removed = await objectStore.del(storageKey);
    if (removed) console.log(`🗄️ Storage: File deleted — ${storageKey}`);
    return removed;
  }

  /** Read a stored file's bytes by storage key. Now async — the S3 backend
   *  can't be synchronous. Returns null if the key doesn't exist. */
  static async readFile(storageKey: string): Promise<Buffer | null> {
    return objectStore.get(storageKey);
  }
}
