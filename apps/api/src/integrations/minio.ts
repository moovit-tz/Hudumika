import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure local uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class MinioIntegration {
  /**
   * Uploads a document to the storage service (using a local storage fallback for ease of execution)
   */
  static async uploadDocument(
    tenantId: string,
    shipmentId: string,
    filename: string,
    fileBuffer: Buffer
  ): Promise<{ storageKey: string; size: number }> {
    const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storageKey = `tenants/${tenantId}/cases/${shipmentId}/${cleanFilename}`;
    
    // Save to local filesystem to simulate object storage
    const localPath = path.join(UPLOADS_DIR, cleanFilename);
    fs.writeFileSync(localPath, fileBuffer);
    
    console.log(`🗄️ Storage: File saved to ${localPath} (Mocked MinIO key: ${storageKey})`);
    
    return {
      storageKey,
      size: fileBuffer.length,
    };
  }

  /**
   * Generates a signed URL for reading/downloading a document
   */
  static async getSignedUrl(
    tenantId: string,
    storageKey: string,
    expiresInSeconds = 3600
  ): Promise<string> {
    const filename = storageKey.split('/').pop() || 'file';
    // Return a local download endpoint
    return `http://localhost:${env.APP_PORT}/v1/documents/download?key=${encodeURIComponent(storageKey)}&filename=${encodeURIComponent(filename)}`;
  }

  /**
   * Deletes a document from storage
   */
  static async deleteDocument(tenantId: string, storageKey: string): Promise<boolean> {
    const filename = storageKey.split('/').pop();
    if (filename) {
      const localPath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log(`🗄️ Storage: File deleted from ${localPath}`);
        return true;
      }
    }
    return false;
  }
}
