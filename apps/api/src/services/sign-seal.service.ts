// ─── Hudumika Digital Execution Seal — issuance ────────────────────────────────
// Turns a completed envelope's existing anchor_hash (SHA-256 of the stamped
// PDF, migration 274) into a signed Digital Execution Seal record: a compact
// payload the platform's Ed25519 key signs (sign-seal-crypto.service.ts).
// Reuses the *existing* verification_code + QR (sign-pdf.service.ts's
// drawAuditTrail, sign-notify.service.ts's buildStampPayload) as the scan/
// human-readable entry point rather than a second, parallel one — see this
// file's sibling migration (424_sign_execution_seal.sql) for the full
// reasoning, including why the QR embedded in the printed PDF can't also
// carry a hash of that same PDF (the hash doesn't exist until the QR has
// already been drawn into it — a real circularity, not an oversight). The
// signature is checked server-side, against the stored payload and key,
// every time that QR's link is opened (sign.routes.ts's public verify
// route) — a real Ed25519 check, not a database boolean masquerading as one.

import { createHash } from 'crypto';
import type { Db } from './sign-notify.service.js';
import { signPayload, verifySignature } from './sign-seal-crypto.service.js';

export const SEAL_POLICY_VERSION = '1';

export type SealType = 'STANDARD_SIGN_SEAL' | 'ADVANCED_EXECUTION_SEAL' | 'WITNESS_SEAL' | 'NOTARY_SEAL' | 'AFFIDAVIT_SEAL' | 'CERTIFICATE_SEAL';

/** Seal type comes from the execution package the envelope was actually
 *  sent under (migration 416/417) — never invented at seal time. A QR
 *  existing on a page must never itself imply notarial authority; that
 *  authority is what execution_type/is_certifier already recorded through
 *  the real certification flow, and the seal only reports it. */
export function deriveSealType(execution_type: string, hasCertifier: boolean): SealType {
  if (execution_type === 'NOTARIAL_CERTIFICATION') return 'NOTARY_SEAL';
  if (execution_type === 'AFFIDAVIT') return 'AFFIDAVIT_SEAL';
  if (execution_type === 'WITNESSED_SIGNATURE') return 'WITNESS_SEAL';
  if (hasCertifier) return 'CERTIFICATE_SEAL';
  return 'STANDARD_SIGN_SEAL';
}

/** Short, human/OCR-usable fingerprint — grouped hex, e.g.
 *  "A7C9-2F81-91B4-7D23". NOT cryptographically equivalent to the full
 *  hash (the spec's own distinction) — a 64-bit slice of the real SHA-256
 *  for at-a-glance/manual/OCR cross-checking. Shown on the live verify page
 *  (computed fresh from anchor_hash, which only exists after the PDF — and
 *  so any QR baked into it — is already built), never the sole basis for a
 *  MATCH verdict; sign-seal-verify.service.ts's real OCR/hash comparison is. */
export function shortFingerprint(fullHashHex: string): string {
  const slice = fullHashHex.slice(0, 16).toUpperCase();
  return slice.match(/.{1,4}/g)!.join('-');
}

export interface IssuedSeal {
  sealId: string;
  sealType: SealType;
  keyLabel: string;
  signature: string;
  payload: string;
  issuedAt: Date;
  fingerprint: string;
}

/** Issues a Digital Execution Seal for a completed, already-stamped
 *  envelope (anchor_hash must already be set — sign.routes.ts computes it
 *  right after building the stamped PDF, same completion request this
 *  slots into). Persists the seal fields onto sign_envelopes. Idempotent is
 *  not attempted here on purpose: a re-seal (e.g. a later certification
 *  step) is a new, independently-signed issuance with its own seal_id —
 *  callers decide whether that's appropriate, this just issues one. */
export async function issueDigitalExecutionSeal(
  db: Db,
  envelope: { id: string; tenant_id: string; anchor_hash: string; execution_type: string; verification_code: string | null },
  hasCertifier: boolean,
): Promise<IssuedSeal> {
  const sealType = deriveSealType(envelope.execution_type, hasCertifier);
  const issuedAt = new Date();
  const fingerprint = shortFingerprint(envelope.anchor_hash);

  // Compact by design (short field names, a short fingerprint slice rather
  // than the full 64-hex-char hash) — this is what a *future* offline
  // verifier tool would carry alongside the QR, so it stays small on
  // purpose even though today's flow checks it server-side. Security does
  // not depend on `fp` being the full hash: every real comparison
  // (sign-seal-verify.service.ts) always re-fetches the actual, full
  // anchor_hash from sign_envelopes by `vid`, never trusts this payload's
  // own copy of it as the final word.
  const payloadObj = {
    v: SEAL_POLICY_VERSION,
    iss: 'hudumika',
    vid: envelope.id,
    fp: fingerprint.replace(/-/g, ''),
    iat: Math.floor(issuedAt.getTime() / 1000),
  };

  const { keyLabel, payload, signature } = await signPayload(payloadObj);
  const sealId = createHash('sha256').update(`${envelope.id}:${payload}:${signature}`).digest('hex').slice(0, 32);

  await db.updateTable('sign_envelopes').set({
    seal_id: sealId,
    seal_type: sealType,
    seal_key_label: keyLabel,
    seal_signature: signature,
    seal_payload: payload,
    seal_issued_at: issuedAt,
    seal_policy_version: SEAL_POLICY_VERSION,
  }).where('id', '=', envelope.id).execute();

  return { sealId, sealType, keyLabel, signature, payload, issuedAt, fingerprint };
}

export interface SealVerdict {
  sealPresent: boolean;
  signatureValid: boolean;
  keyStatus: string;
  sealType: SealType | null;
  fingerprint: string | null;
  payloadFingerprintMatchesCanonical: boolean | null;
  reason?: string;
}

/** Cryptographic-layer check only — does NOT decide whether the document a
 *  verifier is holding is genuine. See sign-seal-verify.service.ts's own
 *  header comment for why a valid signature here is deliberately never
 *  sufficient on its own (seal-cloning: a legitimate QR photographed onto a
 *  different document still signs/verifies "valid" at this layer — the
 *  content comparison layer is what catches that). */
export async function verifySealCryptography(envelope: {
  id: string; anchor_hash: string | null; seal_signature: string | null; seal_payload: string | null;
  seal_key_label: string | null; seal_type: string | null;
}): Promise<SealVerdict> {
  if (!envelope.seal_signature || !envelope.seal_payload || !envelope.seal_key_label) {
    return { sealPresent: false, signatureValid: false, keyStatus: 'n/a', sealType: null, fingerprint: null, payloadFingerprintMatchesCanonical: null, reason: 'This envelope has no Digital Execution Seal issued.' };
  }

  const result = await verifySignature(envelope.seal_payload, envelope.seal_signature, envelope.seal_key_label);

  let parsedFp: string | null = null;
  let fpMatches: boolean | null = null;
  try {
    const parsed = JSON.parse(envelope.seal_payload) as { fp?: string };
    parsedFp = parsed.fp ?? null;
    if (parsedFp && envelope.anchor_hash) {
      fpMatches = envelope.anchor_hash.slice(0, 16).toLowerCase() === parsedFp.toLowerCase();
    }
  } catch { /* malformed payload — signature check above already failed this */ }

  return {
    sealPresent: true,
    signatureValid: result.valid,
    keyStatus: result.keyStatus,
    sealType: (envelope.seal_type as SealType) ?? null,
    fingerprint: parsedFp ? parsedFp.match(/.{1,4}/g)!.join('-').toUpperCase() : null,
    payloadFingerprintMatchesCanonical: fpMatches,
    reason: result.reason,
  };
}
