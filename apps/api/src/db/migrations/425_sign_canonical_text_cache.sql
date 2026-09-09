-- Migration 425: caches the canonical stamped PDF's OCR/extracted text the
-- first time a scanned-copy verification actually needs it (hash mismatch,
-- so a real text comparison runs) — sign-seal-verify.service.ts's own
-- forensic-lite content check would otherwise re-run the same Gemini-vision
-- extraction against the *canonical* document on every single verification
-- attempt, even though that document never changes once completed.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS canonical_text_extract TEXT;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS canonical_text_extracted_at TIMESTAMPTZ;
