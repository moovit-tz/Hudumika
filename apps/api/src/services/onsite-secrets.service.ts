/**
 * Onsite Secrets Service — AES-256-GCM encryption/decryption
 *
 * Secrets and provider credentials are never stored in plaintext.
 * The ciphertext format stored in DB is: "<iv_hex>:<authTag_hex>:<cipher_hex>"
 *
 * Key source: ONSITE_SECRETS_KEY env variable (must be 64 hex chars = 32 bytes).
 * If the key is missing the service throws rather than silently using a weak key.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV   = 'ONSITE_SECRETS_KEY';

function getKey(): Buffer {
  // Read through the validated config, not straight from process.env. Nothing
  // declared this variable, so process.env never held it and every call threw —
  // which surfaced as a 500 on saving any environment variable or connecting
  // any provider. config/env.ts now declares it, supplies a development
  // default, and refuses to boot production with that default still in place.
  const raw = env.ONSITE_SECRETS_KEY ?? process.env[KEY_ENV];
  if (!raw || raw.length !== 64) {
    throw new Error(
      `${KEY_ENV} must be set to a 64-character hex string (32 bytes). ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns "<iv_hex>:<authTag_hex>:<ciphertext_hex>".
 */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(12);  // 96-bit IV for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a ciphertext string produced by encryptSecret().
 * Throws if the key is wrong, the data is tampered, or the format is invalid.
 */
export function decryptSecret(cipher: string): string {
  const parts = cipher.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format — expected iv:authTag:ciphertext');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key       = getKey();
  const iv        = Buffer.from(ivHex, 'hex');
  const authTag   = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/** Encrypt a JS object as JSON. */
export function encryptJson(obj: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(obj));
}

/** Decrypt and JSON.parse a ciphertext produced by encryptJson(). */
export function decryptJson(cipher: string): Record<string, unknown> {
  return JSON.parse(decryptSecret(cipher));
}

/** Mask a secret value for safe display in API responses. */
export const MASKED_VALUE = '••••••••';
