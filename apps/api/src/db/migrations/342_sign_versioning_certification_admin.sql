-- Migration 342: eSign document versioning + certified-copy legal
-- certification. (The third ask from this same request — centralizing
-- admin visibility across every user's documents — needs no schema change:
-- GET /v1/sign/envelopes already scopes by tenant_id only, so an admin-only
-- list view is purely a new query + a role gate on the existing table.)

-- ── Versioning ──────────────────────────────────────────────────────────────
-- A completed envelope's signed PDF is final and must never be mutated in
-- place — but real documents get amended (a wrong clause, a price
-- correction). "Edit" on a completed envelope now creates a new envelope
-- (a fresh draft, pre-filled from the original) rather than either quietly
-- rewriting a signed record or offering no path forward — the original
-- stays exactly as signed, audit trail and all; previous_version_id is what
-- chains the two together.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES sign_envelopes(id) ON DELETE SET NULL;
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS sign_envelopes_previous_version_idx ON sign_envelopes(previous_version_id);

-- sign_event_type (267) is a closed enum — 'amended' is a real new lifecycle
-- event, not a cosmetic label change (unlike a title rename, which reuses
-- 'updated' — see sign.routes.ts's own PATCH /:id/title), so it earns a
-- dedicated value the same way 269/271 each added one real status.
ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'amended';

-- ── Certified True Copy ─────────────────────────────────────────────────────
-- Tanzania-specific: a licensed advocate (or commissioner for oaths /
-- notary) certifies a signed document as a true copy of the original,
-- stamping it with their name, practising-certificate/roll number and firm.
-- This is a real legal attestation by a specific licensed professional —
-- distinct from sign_stamps' tenant/personal stamps, which only mark a
-- document as verified by the sending company itself, not by an outside
-- licensed certifier. Modeled as facts about one recipient (same shape as
-- the existing name/email/role_label columns already capture "who is
-- this person"), not a separate table — a certifier is still just a
-- recipient who also certifies.
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS is_certifier BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS certifier_title TEXT;        -- e.g. "Advocate", "Commissioner for Oaths", "Notary Public"
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS certifier_roll_number TEXT;  -- Tanganyika Law Society practising-certificate / roll number
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS certifier_firm TEXT;

-- A dedicated field type so the baked PDF draws a "CERTIFIED TRUE COPY"
-- legal block (real text: name, title, roll number, firm, date) instead of
-- just an image — same ALTER TYPE ADD VALUE pattern 269_add_stamp_field_type.sql
-- already used for the tenant's own 'stamp' field type.
ALTER TYPE sign_field_type ADD VALUE IF NOT EXISTS 'certification_stamp';
