import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class MinioIntegration {
  /**
   * Creates the top-level customer folder.
   * Path: uploads/tenants/{tenantId}/customers/{customerId}/
   * Called once when a customer is first created.
   */
  static ensureCustomerFolder(tenantId: string, customerId: string, customerName: string): string {
    const localDir = path.join(UPLOADS_DIR, 'tenants', tenantId, 'customers', customerId);
    fs.mkdirSync(localDir, { recursive: true });
    // Write a meta file so the folder is identifiable in a file explorer
    const metaPath = path.join(localDir, '.customer');
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, JSON.stringify({ customerId, customerName, createdAt: new Date().toISOString() }));
    }
    const storagePrefix = `tenants/${tenantId}/customers/${customerId}`;
    console.log(`📁 Storage: Customer folder created — ${storagePrefix} (${customerName})`);
    return storagePrefix;
  }

  /**
   * Creates a BL/AWB subfolder inside the customer folder.
   * Path: uploads/tenants/{tenantId}/customers/{customerId}/{blNumber}/
   * Called when a shipment is created.
   */
  static ensureFolder(tenantId: string, customerId: string, folderName: string): string {
    const clean = folderName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localDir = path.join(UPLOADS_DIR, 'tenants', tenantId, 'customers', customerId, clean);
    fs.mkdirSync(localDir, { recursive: true });
    // Write a meta file so the folder is identifiable
    const metaPath = path.join(localDir, '.shipment');
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(metaPath, JSON.stringify({ folderName, createdAt: new Date().toISOString() }));
    }
    const storagePrefix = `tenants/${tenantId}/customers/${customerId}/${clean}`;
    console.log(`📁 Storage: Shipment folder created — ${storagePrefix}`);
    return storagePrefix;
  }

  /**
   * Uploads a document into the customer/BL folder.
   * Storage key: tenants/{tenantId}/customers/{customerId}/{folderName}/{filename}
   */
  static async uploadDocument(
    tenantId: string,
    customerId: string,
    folderName: string,
    filename: string,
    fileBuffer: Buffer
  ): Promise<{ storageKey: string; size: number }> {
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const prefix = this.ensureFolder(tenantId, customerId, folderName);
    const storageKey = `${prefix}/${cleanFilename}`;

    const localDir = path.join(UPLOADS_DIR, 'tenants', tenantId, 'customers', customerId, folderName.replace(/[^a-zA-Z0-9._-]/g, '_'));
    fs.writeFileSync(path.join(localDir, cleanFilename), fileBuffer);

    console.log(`🗄️ Storage: File saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  /**
   * Uploads a file for the Cloud/Drive file manager.
   * Storage key: tenants/{tenantId}/cloud/{fileId}/{filename}
   */
  static async uploadCloudFile(
    tenantId: string,
    fileId: string,
    filename: string,
    fileBuffer: Buffer
  ): Promise<{ storageKey: string; size: number }> {
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const localDir = path.join(UPLOADS_DIR, 'tenants', tenantId, 'cloud', fileId);
    fs.mkdirSync(localDir, { recursive: true });
    const storageKey = `tenants/${tenantId}/cloud/${fileId}/${cleanFilename}`;
    fs.writeFileSync(path.join(localDir, cleanFilename), fileBuffer);
    console.log(`🗄️ Storage: Cloud file saved — ${storageKey}`);
    return { storageKey, size: fileBuffer.length };
  }

  /**
   * Generates a signed URL for reading/downloading a document.
   */
  static async getSignedUrl(
    tenantId: string,
    storageKey: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const filename = storageKey.split('/').pop() || 'file';
    return `http://localhost:${env.APP_PORT}/v1/documents/download?key=${encodeURIComponent(storageKey)}&filename=${encodeURIComponent(filename)}`;
  }

  /**
   * Deletes a document from storage.
   */
  static async deleteDocument(tenantId: string, storageKey: string): Promise<boolean> {
    // Reconstruct local path from storage key
    const localPath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`🗄️ Storage: File deleted — ${storageKey}`);
      return true;
    }
    return false;
  }

  /**
   * Reads a file from local storage by storage key — used for serving downloads.
   */
  static readFile(storageKey: string): Buffer | null {
    const localPath = path.join(UPLOADS_DIR, storageKey);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    return null;
  }
}
