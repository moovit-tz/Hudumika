// ─── Digital Execution Seal — signing key management & Ed25519 signing ────────
//
// A THIRD, distinct cryptographic mechanism for Sign, alongside two that
// already exist:
//   1. pdf-signing-identity.service.ts — RSA/X.509, CMS/PKCS#7-signs the PDF
//      *file* (what Adobe/PDFium's signature panel checks). Dies on paper.
//   2. opentimestamps.service.ts + sign_envelopes.anchor_hash — SHA-256 of
//      the stamped PDF, anchored to Bitcoin for a public, decentralized
//      proof-of-existence. Real, but not QR-sized and not fast (Bitcoin
//      confirmation is hours away).
// This one exists because neither of the above helps a *printed* document:
// a compact Ed25519 signature over a small JSON payload is what actually
// fits in a scannable QR and verifies in milliseconds, offline, using only
// Hudumika's public key — no PDF structure, no waiting on a block.
//
// Node's built-in `crypto` (OpenSSL under the hood) does the actual Ed25519
// math — no homemade cryptography, no third-party crypto library either.
// The private key is encrypted at rest with the platform's own existing
// AES-256-GCM secret store (onsite-secrets.service.ts, keyed by
// ONSITE_SECRETS_KEY) — the same "use existing infra, don't build a
// parallel insecure one" reasoning as the P12 password on the PDF cert.
// The private key is decrypted only inside this file, only in-process on
// the API server, and is never returned from any exported function here —
// every export below takes a payload and returns a signature/verdict, never
// the key material itself.

import crypto from 'crypto';
import { dbPlatform } from '../db/client.js';
import { encryptSecret, decryptSecret } from './onsite-secrets.service.js';

export type SealSigningStatus = 'active' | 'previous' | 'revoked';

interface ActiveKey {
  key_label: string;
  private_key: crypto.KeyObject;
}

let cachedActive: ActiveKey | null = null;

/** Short, printable label — e.g. "hdk-2026-03" — used inside the signed
 *  payload/QR instead of the key's UUID, purely to keep the payload small. */
function newKeyLabel(): string {
  const now = new Date();
  const suffix = crypto.randomBytes(2).toString('hex');
  return `hdk-${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${suffix}`;
}

async function generateAndStoreKey(trx = dbPlatform): Promise<ActiveKey> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const keyLabel = newKeyLabel();

  await trx.insertInto('sign_signing_keys').values({
    key_label: keyLabel,
    algorithm: 'Ed25519',
    public_key_pem: publicPem,
    encrypted_private_key: encryptSecret(privatePem),
    status: 'active',
  }).execute();

  console.log(`🔑 Generated a new Digital Execution Seal signing key — ${keyLabel}`);
  return { key_label: keyLabel, private_key: privateKey };
}

/** SigningKeyProvider — the active key, generated lazily on first real use
 *  (same pattern pdf-signing-identity.service.ts already uses for its own
 *  cert) and cached in-process afterward. Never exposes the KeyObject to a
 *  caller outside this file. */
async function getActiveSigningKey(): Promise<ActiveKey> {
  if (cachedActive) return cachedActive;

  const row = await dbPlatform.selectFrom('sign_signing_keys')
    .select(['key_label', 'encrypted_private_key'])
    .where('status', '=', 'active')
    .executeTakeFirst();

  if (row) {
    const privatePem = decryptSecret(row.encrypted_private_key);
    const privateKey = crypto.createPrivateKey(privatePem);
    cachedActive = { key_label: row.key_label, private_key: privateKey };
    return cachedActive;
  }

  cachedActive = await generateAndStoreKey();
  return cachedActive;
}

/** VerificationKeyProvider — the public key for a given label, regardless
 *  of whether it's the current active key, a rotated-out 'previous' one, or
 *  (unless explicitly revoked) still valid for historical documents. A
 *  document sealed under an old key must remain verifiable after rotation —
 *  this is the whole reason lookup is by key_label embedded in that
 *  document's own payload, never by "whichever key happens to be active
 *  right now." */
async function getPublicKey(keyLabel: string): Promise<{ publicKey: crypto.KeyObject; status: SealSigningStatus } | null> {
  const row = await dbPlatform.selectFrom('sign_signing_keys')
    .select(['public_key_pem', 'status'])
    .where('key_label', '=', keyLabel)
    .executeTakeFirst();
  if (!row) return null;
  return { publicKey: crypto.createPublicKey(row.public_key_pem), status: row.status as SealSigningStatus };
}

/** Canonicalizes a payload object to a stable string before signing/
 *  verifying — sorted keys, no whitespace, so the exact same payload always
 *  produces the exact same bytes regardless of how it was constructed. */
export function canonicalize(payload: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(payload).sort()) sorted[key] = payload[key];
  return JSON.stringify(sorted);
}

export interface SignedSeal {
  keyLabel: string;
  payload: string; // the exact canonical string that was signed
  signature: string; // base64url
}

/** Signs a canonical payload with the current active key. Returns the
 *  signature and the key label used — both get embedded in the QR/seal so a
 *  verifier (now or years from now, after several rotations) knows exactly
 *  which public key to check it against. */
export async function signPayload(payload: Record<string, unknown>): Promise<SignedSeal> {
  const { key_label, private_key } = await getActiveSigningKey();
  const canonical = canonicalize(payload);
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), private_key).toString('base64url');
  return { keyLabel: key_label, payload: canonical, signature };
}

export interface VerifyResult {
  valid: boolean;
  keyStatus: SealSigningStatus | 'unknown_key';
  reason?: string;
}

/** Verifies a signature against the *stored* public key for keyLabel — not
 *  against whichever key is active today. A 'revoked' key's signature is
 *  reported as valid=false with keyStatus='revoked' (cryptographically the
 *  math still checks out; revocation is a policy decision, not a math one,
 *  and the caller needs to see the distinction — a revoked key means
 *  "no longer trust this," not "was never issued by us"). */
export async function verifySignature(payload: string, signature: string, keyLabel: string): Promise<VerifyResult> {
  const key = await getPublicKey(keyLabel);
  if (!key) return { valid: false, keyStatus: 'unknown_key', reason: 'Signing key not recognized' };

  let mathValid: boolean;
  try {
    mathValid = crypto.verify(null, Buffer.from(payload, 'utf8'), key.publicKey, Buffer.from(signature, 'base64url'));
  } catch {
    mathValid = false;
  }
  if (!mathValid) return { valid: false, keyStatus: key.status, reason: 'Signature does not match payload' };
  if (key.status === 'revoked') return { valid: false, keyStatus: 'revoked', reason: 'Signing key has been revoked' };
  return { valid: true, keyStatus: key.status };
}

/** KeyRotationService — retires the current active key to 'previous' and
 *  generates a fresh active one. Every seal already issued keeps verifying
 *  fine: verifySignature looks its key_label up by name, not by "is this
 *  the active key." SuperAdmin-triggered only (see sign-seal.routes.ts). */
export async function rotateSigningKey(): Promise<{ newKeyLabel: string; retiredKeyLabel: string | null }> {
  return dbPlatform.transaction().execute(async (trx) => {
    const current = await trx.selectFrom('sign_signing_keys').select('key_label')
      .where('status', '=', 'active').executeTakeFirst();
    if (current) {
      await trx.updateTable('sign_signing_keys')
        .set({ status: 'previous', rotated_at: new Date() })
        .where('key_label', '=', current.key_label).execute();
    }
    const fresh = await generateAndStoreKey(trx);
    cachedActive = fresh;
    return { newKeyLabel: fresh.key_label, retiredKeyLabel: current?.key_label ?? null };
  });
}

/** Revokes a specific key — e.g. suspected compromise. Distinct from
 *  rotation: a 'previous' key is still trusted for historical documents; a
 *  'revoked' one is not, and every seal signed under it will now report
 *  invalid on re-verification (see verifySignature above). This does not
 *  retroactively change what those documents *were* — the audit trail
 *  (sign_verifications) records exactly when a given attempt saw a
 *  revoked-key result, not "was always invalid." */
export async function revokeSigningKey(keyLabel: string): Promise<void> {
  await dbPlatform.updateTable('sign_signing_keys')
    .set({ status: 'revoked', revoked_at: new Date() })
    .where('key_label', '=', keyLabel).where('status', '!=', 'active').execute();
  if (cachedActive?.key_label === keyLabel) cachedActive = null;
}

export async function listSigningKeys() {
  return dbPlatform.selectFrom('sign_signing_keys')
    .select(['key_label', 'algorithm', 'status', 'created_at', 'rotated_at', 'revoked_at'])
    .orderBy('created_at', 'desc').execute();
}
