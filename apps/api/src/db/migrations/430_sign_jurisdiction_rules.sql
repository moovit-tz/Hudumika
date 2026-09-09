-- Migration 430: Phase S5 — Jurisdiction engine.
--
-- Platform-level reference data, like metric_definitions (411) — no
-- tenant_id, no RLS. This is a shared legal-status catalog, not tenant
-- data, and every tenant in the same jurisdiction sees the same rows.
--
-- Real, reviewed sources for Tanzania (the only jurisdiction with rows
-- populated below) — quoted from the currently consolidated text, not
-- reconstructed from memory:
--
--   Electronic Transactions Act [CAP. 442 R.E. 2022] (source: mof.go.tz's
--   own published consolidated PDF, fetched and OCR'd directly for this
--   migration — not a secondary summary):
--     s.6  "Electronic signature" — where a law requires a signature, that
--          is met by a secure electronic signature (defined in s.7): one
--          that (a) identifies the person and (b) was reliable and
--          appropriate for the purpose. This is the general basis for
--          NORMAL_SIGN/WITNESSED_SIGNATURE.
--     s.7  "Secure electronic signature" — unique to the signer, used to
--          identify them, created/affixed by them, under their control,
--          and tamper-evident (changes to the document would be revealed).
--          This is a real, checkable description of what Hudumika Sign's
--          own signing flow already does (recipient-drawn signature +
--          anchor_hash tamper-evidence, migration 274) — not a coincidence
--          this maps cleanly; it's why NORMAL_SIGN is rated SUPPORTED, not
--          SUPPORTED_WITH_CONDITIONS.
--     s.10 "Notarisation, acknowledgement and certification" — where a law
--          requires a signature/statement/document to be notarised,
--          acknowledged, verified, OR MADE UNDER OATH, that requirement is
--          met if the electronic signature of "the person authorised to
--          perform those acts" is attached to/associated with the data
--          message. This is the explicit statutory basis for AFFIDAVIT
--          (a statement made under oath) and NOTARIAL_CERTIFICATION — the
--          condition both are seeded WITH is that "the person authorised"
--          must be real: Hudumika already enforces this via sign_certifiers
--          (417) with live expiry/revocation checking at the moment of
--          signing, not a stale snapshot — the condition is a fact about
--          this platform's own enforcement, not an assumption.
--     No general subject-matter exclusion list was found in the currently
--     consolidated Act — Part III (ss.13-17), which the Application
--     section (s.2) carves out, was itself repealed by Act No. 10 of 2019
--     s.65. This migration does not claim to know why, and does not infer
--     a broader exclusion from its absence — only that none was found.
--
--   Notaries Public and Commissioners for Oaths Act [CAP. 12 R.E. 2023]
--   (source: nps.go.tz's own published PDF): the extracted text of this
--   Act's own jurat/oath-administration provisions was too corrupted by
--   OCR to safely quote verbatim (checked, not skipped) — its fee schedule
--   implies an in-person practice model but the Act does not appear to
--   affirmatively prohibit electronic execution. Silence is not a
--   statutory basis either way, so this migration relies on the ETA's own
--   explicit s.10 (the later, more specific "electronic form" provision)
--   rather than asserting anything this second Act does not actually say.
--
-- KE/UG/RW get the table structure only — 'NOT_SUPPORTED' with an honest
-- "not yet reviewed" note, never a fabricated rule. Matches the original
-- spec's own wording: "architecturally supported", not "legally claimed",
-- for those three.
CREATE TABLE IF NOT EXISTS sign_jurisdiction_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code TEXT NOT NULL, -- ISO 3166-1 alpha-2, matches tenants.country
  execution_type    TEXT NOT NULL CHECK (execution_type IN ('NORMAL_SIGN', 'WITNESSED_SIGNATURE', 'AFFIDAVIT', 'NOTARIAL_CERTIFICATION')),
  status            TEXT NOT NULL CHECK (status IN ('SUPPORTED', 'SUPPORTED_WITH_CONDITIONS', 'REQUIRES_PROFESSIONAL_REVIEW', 'PHYSICAL_EXECUTION_REQUIRED', 'NOT_SUPPORTED')),
  legal_basis       TEXT,     -- short citation, e.g. "Electronic Transactions Act, CAP 442 R.E. 2022, s.10"
  conditions        TEXT,     -- what must be true for SUPPORTED_WITH_CONDITIONS/REQUIRES_PROFESSIONAL_REVIEW
  notes             TEXT,
  source_url        TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_code, execution_type)
);

INSERT INTO sign_jurisdiction_rules (jurisdiction_code, execution_type, status, legal_basis, conditions, notes, source_url, reviewed_at) VALUES
('TZ', 'NORMAL_SIGN', 'SUPPORTED',
 'Electronic Transactions Act, CAP 442 R.E. 2022, s.6-s.7',
 NULL,
 'A secure electronic signature satisfies any signature requirement. Hudumika Sign''s own signing flow (recipient-drawn signature, tamper-evident anchor_hash) matches s.7''s definition directly.',
 'https://www.mof.go.tz/uploads/documents/en-1676545044-THE%20ELECTRONIC%20TRANSACTIONS%20ACT,%20CAP%20442%20R.E.%202022.pdf', now()),
('TZ', 'WITNESSED_SIGNATURE', 'SUPPORTED',
 'Electronic Transactions Act, CAP 442 R.E. 2022, s.6-s.7',
 NULL,
 'Tanzanian law has no separate statutory category for a "witnessed" signature distinct from an ordinary secure electronic signature — a witness''s own signature is itself just another s.7 secure electronic signature. No additional condition found beyond NORMAL_SIGN''s.',
 'https://www.mof.go.tz/uploads/documents/en-1676545044-THE%20ELECTRONIC%20TRANSACTIONS%20ACT,%20CAP%20442%20R.E.%202022.pdf', now()),
('TZ', 'AFFIDAVIT', 'SUPPORTED_WITH_CONDITIONS',
 'Electronic Transactions Act, CAP 442 R.E. 2022, s.10(a)',
 'The commissioner for oaths (the AFFIANT''s counter-signer) must be a real, currently-verified sign_certifiers entry — not expired, not revoked — at the moment of signing, since s.10(a) requires the electronic signature of "the person authorised to perform those acts."',
 'A statement "made under oath" is explicitly covered by s.10(a): the requirement is met if the electronic signature of the person authorised to administer it is attached to the data message.',
 'https://www.mof.go.tz/uploads/documents/en-1676545044-THE%20ELECTRONIC%20TRANSACTIONS%20ACT,%20CAP%20442%20R.E.%202022.pdf', now()),
('TZ', 'NOTARIAL_CERTIFICATION', 'SUPPORTED_WITH_CONDITIONS',
 'Electronic Transactions Act, CAP 442 R.E. 2022, s.10(a)-(b)',
 'The notary must be a real, currently-verified sign_certifiers entry (not expired/revoked) at the moment of signing — same condition as AFFIDAVIT, s.10(a). A "certified copy" variant (s.10(b)) is satisfied by a certified printout of the electronic original if one is needed.',
 'The Notaries Public and Commissioners for Oaths Act, CAP 12 R.E. 2023, was checked for a conflicting physical-presence requirement; its own jurat/administration provisions could not be reliably extracted (OCR quality), and no explicit prohibition on electronic execution was found in what was readable. This rule relies on the ETA''s explicit s.10, the more specific "electronic form" provision.',
 'https://www.mof.go.tz/uploads/documents/en-1676545044-THE%20ELECTRONIC%20TRANSACTIONS%20ACT,%20CAP%20442%20R.E.%202022.pdf', now());

-- Kenya/Uganda/Rwanda — architecture only, no legal review performed.
INSERT INTO sign_jurisdiction_rules (jurisdiction_code, execution_type, status, notes)
SELECT c, e, 'NOT_SUPPORTED', 'Not yet reviewed. This platform has not researched this jurisdiction''s electronic-signature/notarisation law — this row exists so the table structure supports it, not because a legal conclusion has been reached.'
FROM unnest(ARRAY['KE','UG','RW']) AS c
CROSS JOIN unnest(ARRAY['NORMAL_SIGN','WITNESSED_SIGNATURE','AFFIDAVIT','NOTARIAL_CERTIFICATION']) AS e;
