/**
 * Object storage backend for the platform's stored files (Drive / cloud
 * files, HR docs, KYC/KYB, Sign artifacts, support attachments, ...).
 *
 * Two backends, chosen once at boot from env (config/env.ts):
 *
 *   - DiskBackend  — bytes under apps/api/uploads/<key>. The historical
 *     behaviour. Default. Fine for a single-node box; not for multi-node or
 *     an ephemeral container filesystem (a restart loses every upload).
 *
 *   - S3Backend    — any S3-compatible object store (AWS S3, MinIO,
 *     Cloudflare R2, Backblaze B2, ...). Active when S3_ENDPOINT + S3_BUCKET
 *     + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY are all set. Signs its own
 *     requests with AWS Signature V4 using Node's built-in crypto + fetch —
 *     no SDK dependency.
 *
 * `MinioIntegration` (integrations/minio.ts) keeps its per-purpose
 * storage-key layout and is the only caller of this module; nothing else
 * should import it directly.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env.js';

export interface StorageBackend {
  readonly kind: 'disk' | 's3';
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  /** A URL a browser can GET directly for `expiresInSeconds`, then it stops working. */
  presignGet(key: string, expiresInSeconds: number, downloadName?: string): Promise<string>;
  /** Disk-only marker file so a folder is identifiable in a file explorer; no-op on S3. */
  writeMarker(dirKey: string, markerName: string, json: string): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────
// Disk
// ─────────────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

class DiskBackend implements StorageBackend {
  readonly kind = 'disk' as const;

  constructor() {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  private abs(key: string): string {
    // Storage keys are app-constructed ("tenants/<id>/cloud/<fileId>/<name>")
    // — never raw user input — but normalize + fence to UPLOADS_DIR anyway so
    // a stray "../" in a key can never escape the tree.
    const p = path.resolve(UPLOADS_DIR, key);
    if (p !== UPLOADS_DIR && !p.startsWith(UPLOADS_DIR + path.sep)) {
      throw new Error(`Refusing storage key outside uploads dir: ${key}`);
    }
    return p;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const p = this.abs(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }

  async get(key: string): Promise<Buffer | null> {
    const p = this.abs(key);
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  }

  async del(key: string): Promise<boolean> {
    const p = this.abs(key);
    if (fs.existsSync(p)) { fs.unlinkSync(p); return true; }
    return false;
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.abs(key));
  }

  async presignGet(key: string, expiresInSeconds: number, downloadName?: string): Promise<string> {
    // No object store to presign against — hand out a short-lived,
    // HMAC-signed URL to the public passthrough route (filesPublicRoutes,
    // GET /v1/files/blob). Tamper-proof (key+exp are in the MAC) and expiring.
    const exp = Math.floor(Date.now() / 1000) + Math.max(1, expiresInSeconds);
    const secret = env.FILE_SIGNING_SECRET || env.JWT_SECRET;
    const sig = crypto.createHmac('sha256', secret).update(`${key}\n${exp}`).digest('hex');
    const qs = new URLSearchParams({ key, exp: String(exp), sig });
    if (downloadName) qs.set('name', downloadName);
    // filesPublicRoutes (files.routes.ts) is mounted at /v1/files-public —
    // the same unauthenticated prefix the share-link "Copy link" URL uses.
    return `${env.API_BASE_URL.replace(/\/$/, '')}/v1/files-public/blob?${qs.toString()}`;
  }

  async writeMarker(dirKey: string, markerName: string, json: string): Promise<void> {
    const dir = this.abs(dirKey);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, markerName);
    if (!fs.existsSync(p)) fs.writeFileSync(p, json);
  }
}

/** Verifies a DiskBackend.presignGet() URL's params. Used by the public route. */
export function verifyDiskSignedUrl(key: string, exp: string, sig: string): boolean {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  const secret = env.FILE_SIGNING_SECRET || env.JWT_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(`${key}\n${expNum}`).digest('hex');
  // timingSafeEqual throws on length mismatch — guard first.
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────────────────────────────────
// S3 (Signature V4, no SDK)
// ─────────────────────────────────────────────────────────────────────────

const sha256Hex = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => crypto.createHmac('sha256', key).update(data).digest();
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function uriEncode(str: string, encodeSlash = true): string {
  // AWS's exact rule: unreserved chars pass, everything else %XX uppercase;
  // '/' optionally preserved (path) or encoded (query/canonical key).
  return str.replace(/[^A-Za-z0-9_.~\-]/g, (c) => {
    if (c === '/' && !encodeSlash) return c;
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  });
}

class S3Backend implements StorageBackend {
  readonly kind = 's3' as const;
  private endpoint: URL;
  private region: string;
  private bucket: string;
  private accessKey: string;
  private secretKey: string;
  private pathStyle: boolean;
  private publicBase?: string;

  constructor() {
    this.endpoint = new URL(env.S3_ENDPOINT!);
    this.region = env.S3_REGION;
    this.bucket = env.S3_BUCKET!;
    this.accessKey = env.S3_ACCESS_KEY_ID!;
    this.secretKey = env.S3_SECRET_ACCESS_KEY!;
    this.pathStyle = env.S3_FORCE_PATH_STYLE;
    this.publicBase = env.S3_PUBLIC_URL;
  }

  /** { host, path } for an object key, honouring path-style vs virtual-hosted. */
  private target(key: string): { host: string; canonicalPath: string; href: string } {
    const encodedKey = uriEncode(key, false); // preserve '/' segments
    if (this.pathStyle) {
      const host = this.endpoint.host;
      const base = this.endpoint.pathname.replace(/\/$/, '');
      const canonicalPath = `${base}/${this.bucket}/${encodedKey}`;
      return { host, canonicalPath, href: `${this.endpoint.protocol}//${host}${canonicalPath}` };
    }
    const host = `${this.bucket}.${this.endpoint.host}`;
    const canonicalPath = `/${encodedKey}`;
    return { host, canonicalPath, href: `${this.endpoint.protocol}//${host}${canonicalPath}` };
  }

  private amzDate(d = new Date()): { amz: string; date: string } {
    const amz = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return { amz, date: amz.slice(0, 8) };
  }

  private signingKey(date: string): Buffer {
    const kDate = hmac('AWS4' + this.secretKey, date);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    return hmac(kService, 'aws4_request');
  }

  /** SigV4 with the signature in the Authorization header (for PUT/GET/DELETE). */
  private async signedFetch(
    method: 'GET' | 'PUT' | 'DELETE',
    key: string,
    body?: Buffer,
    contentType?: string,
  ): Promise<Response> {
    const { host, canonicalPath, href } = this.target(key);
    const { amz, date } = this.amzDate();
    const payloadHash = body ? sha256Hex(body) : EMPTY_SHA256;

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join('');
    const canonicalRequest = [method, canonicalPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

    const scope = `${date}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(date)).update(stringToSign).digest('hex');

    headers['authorization'] =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(href, { method, headers, body: body as any });
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<void> {
    const res = await this.signedFetch('PUT', key, body, contentType || 'application/octet-stream');
    if (!res.ok) throw new Error(`S3 PUT ${key} → ${res.status} ${await res.text().catch(() => '')}`.trim());
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.signedFetch('GET', key);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} → ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async del(key: string): Promise<boolean> {
    const res = await this.signedFetch('DELETE', key);
    // S3 returns 204 for a delete whether or not the key existed.
    if (res.status === 204 || res.status === 200 || res.status === 404) return true;
    throw new Error(`S3 DELETE ${key} → ${res.status}`);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.signedFetch('GET', key);
    return res.ok;
  }

  /** SigV4 with the signature in the query string — a presigned GET URL. */
  async presignGet(key: string, expiresInSeconds: number, downloadName?: string): Promise<string> {
    const { host, canonicalPath, href } = this.target(key);
    const { amz, date } = this.amzDate();
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const expires = Math.min(Math.max(1, expiresInSeconds), 604800); // S3 hard cap 7d

    const q: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKey}/${scope}`,
      'X-Amz-Date': amz,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    };
    if (downloadName) {
      q['response-content-disposition'] = `attachment; filename="${downloadName.replace(/["\r\n]/g, '')}"`;
    }
    const canonicalQuery = Object.keys(q).sort()
      .map((k) => `${uriEncode(k)}=${uriEncode(q[k])}`).join('&');

    const canonicalRequest = ['GET', canonicalPath, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(date)).update(stringToSign).digest('hex');

    const base = this.publicBase
      ? `${this.publicBase.replace(/\/$/, '')}${this.pathStyle ? `/${this.bucket}` : ''}/${uriEncode(key, false)}`
      : href;
    return `${base}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  async writeMarker(): Promise<void> { /* no directory concept on S3 */ }
}

// ─────────────────────────────────────────────────────────────────────────

function selectBackend(): StorageBackend {
  const s3Ready = env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY;
  if (s3Ready) {
    console.log(`🗄️  Object storage: S3 backend → ${env.S3_ENDPOINT} / ${env.S3_BUCKET}`);
    return new S3Backend();
  }
  return new DiskBackend();
}

export const objectStore: StorageBackend = selectBackend();
