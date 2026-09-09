-- Migration 424: Hudumika Digital Execution Seal.
--
-- The platform ALREADY has two real, separate cryptographic mechanisms for
-- Sign, neither of which helps a printed-then-scanned document:
--   1. pdf-signing-identity.service.ts — an RSA/X.509 cert that CMS/PKCS#7
--      signs the PDF *file*, so Adobe/PDFium shows "digitally signed." Dies
--      the moment the file is printed — a piece of paper has no PDF
--      structure to check.
--   2. anchor_hash + OpenTimestamps (274_sign_anchor.sql) — SHA-256 of the
--      stamped PDF, anchored to Bitcoin for a public, decentralized
--      proof-of-existence-at-time. Real and reused here as the canonical
--      hash, but it's not something a phone camera can read off a page,
--      and confirmation can take hours.
--
-- This migration adds the piece that actually survives paper: a compact,
-- Ed25519-signed payload small enough to fit in a scannable QR + a short
-- human-readable serial (the *existing* verification_code — not a new
-- format), so a photographed/scanned copy still carries an independently
-- verifiable link back to its canonical digital execution record.
--
-- Deliberately NOT named anything with a bare "seal" prefix at the table
-- level beyond sign_* — seal_ledger_anchors/SealService already means
-- something else entirely in this codebase (ClearOS bonded-compartment
-- ledger checkpoints). Every new identifier here is sign_execution_seal /
-- sign_signing_key, never bare "seal", to keep the two domains from ever
-- being confused in a query or a grep.

CREATE TABLE IF NOT EXISTS sign_signing_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short, printable label a human/log can reference without the UUID —
  -- e.g. "hdk-2026-01". Embedded in the QR payload as `kid` instead of the
  -- raw UUID, purely to keep the payload (and so the QR) smaller.
  key_label TEXT NOT NULL UNIQUE,
  algorithm TEXT NOT NULL DEFAULT 'Ed25519',
  public_key_pem TEXT NOT NULL,
  -- AES-256-GCM via onsite-secrets.service.ts's encryptSecret/decryptSecret
  -- (ONSITE_SECRETS_KEY) — the platform's own existing secret-at-rest
  -- mechanism, not a new one. Never selected by any route that serves the
  -- frontend; only sign-seal-crypto.service.ts ever reads this column.
  encrypted_private_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'previous', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- At most one active signing key platform-wide at a time — new seals always
-- sign with it. A 'previous'/'revoked' key is kept forever (never deleted):
-- verification looks the key up by the key_label embedded in that specific
-- seal's own payload, not by "whichever key is active today", so a
-- document sealed under an old key stays verifiable after rotation.
CREATE UNIQUE INDEX IF NOT EXISTS sign_signing_keys_one_active
  ON sign_signing_keys ((true)) WHERE status = 'active';

-- Seal issuance data lives directly on sign_envelopes, the same place
-- anchor_hash/anchor_status already live for the OTS mechanism above —
-- one seal per envelope (version), not a separate join table, matching
-- that existing precedent rather than inventing a new shape for a 1:1
-- relationship. verification_id is just the envelope's own id: each
-- amended version is already its own envelope row (previous_version_id
-- chain, migration 342), so it already uniquely identifies "this specific
-- executed version" without a redundant column.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_id UUID;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_type TEXT
  CHECK (seal_type IS NULL OR seal_type IN (
    'STANDARD_SIGN_SEAL', 'ADVANCED_EXECUTION_SEAL', 'WITNESS_SEAL',
    'NOTARY_SEAL', 'AFFIDAVIT_SEAL', 'CERTIFICATE_SEAL'
  ));
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_key_label TEXT REFERENCES sign_signing_keys(key_label);
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_signature TEXT;
-- The exact canonical string that was signed — kept verbatim so a
-- verifier (or a future re-check) reconstructs nothing; it just re-hashes
-- and re-verifies this stored string against seal_signature.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_payload TEXT;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_issued_at TIMESTAMPTZ;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS seal_policy_version TEXT;

-- sign_verifications (267_sign_app.sql) already logs every code lookup —
-- widened rather than duplicated into a parallel verification-attempts
-- table, same reasoning as reusing anchor_hash/verification_code above.
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'code'
  CHECK (method IN ('code', 'qr', 'ocr', 'upload'));
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN;
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS uploaded_hash TEXT;
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS hash_match BOOLEAN;
-- EXACT_MATCH | SEAL_VERIFIED_CONTENT_MATCH | SEAL_VERIFIED_CONTENT_DIFFERENCE
-- | SEAL_INVALID | SEAL_DATA_CONFLICT | DOCUMENT_MISMATCH | INCONCLUSIVE
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS content_verdict TEXT;
-- Real findings (OCR text differences found, confidence, etc.) — JSONB so
-- the comparison engine can evolve its own shape without another
-- migration; never overwritten once written (a fresh verification attempt
-- is always a new row, not an update to a prior one).
ALTER TABLE sign_verifications ADD COLUMN IF NOT EXISTS findings JSONB;

CREATE INDEX IF NOT EXISTS sign_envelopes_seal_id_idx ON sign_envelopes(seal_id) WHERE seal_id IS NOT NULL;
