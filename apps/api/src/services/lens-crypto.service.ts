import { createHmac, timingSafeEqual } from 'node:crypto';
import { encryptSecret, decryptSecret } from './onsite-secrets.service.js';

/**
 * Lens Crypto Service — Encrypted credential storage and webhook signature validation.
 *
 * AES-256-GCM encryption ensures integration tokens and webhook secrets are never
 * stored in plaintext in the database or leaked through API responses.
 */

export function encryptLensCredential(plaintext: string): string {
  if (!plaintext || !plaintext.trim()) return '';
  return encryptSecret(plaintext.trim());
}

export function decryptLensCredential(ciphertext: string): string {
  if (!ciphertext || !ciphertext.trim()) return '';
  return decryptSecret(ciphertext.trim());
}

/**
 * Mask credential for display (e.g. "ghp_...7a9f" or "xoxb-...d12e").
 * Endpoints should only report whether a credential is set and a safe hint.
 */
export function maskCredential(str: string): string {
  if (!str) return '';
  if (str.length <= 8) return '••••••••';
  const head = str.slice(0, 4);
  const tail = str.slice(-4);
  return `${head}••••${tail}`;
}

/**
 * Constant-time HMAC-SHA256 verification for GitHub, Linear, etc.
 */
export function verifyHmacSha256(
  payload: string | Buffer,
  secret: string,
  providedSignature: string,
  prefix = 'sha256=',
): boolean {
  if (!secret || !providedSignature) return false;
  try {
    const cleanSig = providedSignature.startsWith(prefix)
      ? providedSignature.slice(prefix.length)
      : providedSignature;

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(cleanSig, 'hex');

    if (expectedBuf.length !== providedBuf.length) return false;
    return timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * Slack v0 signature verification:
 * sig_basestring = 'v0:' + timestamp + ':' + rawBody
 * signature = 'v0=' + HMAC-SHA256(secret, sig_basestring)
 */
export function verifySlackSignature(
  rawBody: string,
  signingSecret: string,
  timestamp: string,
  providedSignature: string,
): boolean {
  if (!signingSecret || !providedSignature || !timestamp) return false;
  // Reject requests older than 5 minutes to prevent replay attacks
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - (60 * 5);
  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum) || tsNum < fiveMinutesAgo) return false;

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const mySig = 'v0=' + createHmac('sha256', signingSecret).update(sigBase, 'utf8').digest('hex');

  try {
    const a = Buffer.from(mySig, 'utf8');
    const b = Buffer.from(providedSignature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
