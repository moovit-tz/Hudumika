import crypto from 'crypto';
import { MFA_SECRET_KEY } from './env.js';

/**
 * MFA_APP credentials (Ondi acting as a built-in authenticator, "like
 * Google Authenticator") stored the TOTP seed as plaintext inside
 * Credential.identifier's JSON — a DB dump/backup leak or read-replica
 * compromise handed over every live, still-valid 2FA seed a user had ever
 * enrolled, for every third-party service. AES-256-GCM at rest closes that
 * without changing anything the mobile/web clients see: GET /mfa/apps and
 * POST /mfa/enroll still return the plaintext secret (needed there so the
 * client can generate codes locally, same as any real authenticator app) —
 * only the value sitting in Postgres changes.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encryptMfaSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, MFA_SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptMfaSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, MFA_SECRET_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/// A pre-existing enrollment's secret is still plaintext base32 (this is
/// the exact alphabet POST /enroll already validates incoming secrets
/// against, so it can't collide with a base64-encoded encrypted blob,
/// which routinely contains lowercase/+//= outside that alphabet).
const BASE32_SECRET = /^[A-Z2-7]{16,}=*$/;

export function isLegacyPlaintextSecret(value: string): boolean {
  return BASE32_SECRET.test(value);
}
