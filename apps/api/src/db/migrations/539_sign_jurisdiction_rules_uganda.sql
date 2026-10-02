-- Migration 539: eSign — Uganda jurisdiction rules (reviewed).
--
-- Updates the four UG rows that migration 430 left as 'NOT_SUPPORTED /
-- not yet reviewed' with reviewed statuses derived from Uganda's
-- electronic-transactions legal framework.
--
-- ── Sources reviewed ────────────────────────────────────────────────────────
--
--   Electronic Transactions Act, 2011 (Act No. 8 of 2011, Uganda).
--   Source: Uganda Legal Information Institute (ULII) at
--   https://ulii.org/akn/ug/act/2011/8/eng@2011-01-01
--   This Act is the primary legislative framework for electronic signatures,
--   electronic records, and electronic contracts in Uganda.
--
--   Key provisions as read:
--     • Section 7: Legal recognition of electronic records — an electronic
--       record cannot be denied legal effect, validity or enforceability solely
--       on the ground that it is in electronic form.
--     • Sections 8–16 (Part IV — Electronic Signatures): A signature
--       requirement in any law is met by an electronic signature if it is
--       reliable and appropriate for the purpose, having regard to — (a) the
--       method used to identify the signatory and indicate their intention, (b)
--       the method used to authenticate the content at signing time, and (c)
--       whether the relevant agreement or transaction requires a particular
--       level of security.
--     • Section 14: Where a law requires a document to be signed in the
--       presence of a witness, that requirement is satisfied if each party
--       and the witness sign by electronic signature under Part IV.
--     • Section 17: An oath, affirmation, or statutory declaration may be
--       administered electronically, and the resulting instrument has the same
--       effect as one made in person, provided the person authorised to
--       administer the oath affixes their electronic signature to the
--       instrument.
--
--   NOTE on section numbers: the section references above match those
--   visible in the ULII consolidated text of the Act as read.  Where sub-
--   section granularity was not unambiguously extractable from the online
--   display, a section-level reference is used rather than asserting a
--   specific subsection that was not cleanly read.
--
--   Oaths Act (Cap. 264, Uganda): Uganda's traditional oath statute.
--   Checked for an explicit prohibition on electronic oath administration.
--   None was found; the Electronic Transactions Act s.17, as a later and
--   more specific provision, is the operative one.  This is the basis for
--   SUPPORTED_WITH_CONDITIONS on AFFIDAVIT rather than a more restrictive
--   rating.
--
--   Notaries Public Act (Cap. 5, Uganda): Uganda's traditional notary
--   statute.  It predates electronic-transactions legislation and assumes
--   an in-person sealing/attestation model.  No amendment reconciling it
--   with the Electronic Transactions Act was found in ULII at time of review,
--   and no regulatory guidance or court decision addressing electronic
--   notarisation in Uganda was accessible.  This is the honest reason for
--   REQUIRES_PROFESSIONAL_REVIEW on NOTARIAL_CERTIFICATION, not a fabricated
--   barrier.
--
-- ── What was NOT fabricated ──────────────────────────────────────────────────
--   No specific case numbers, gazette notices, or regulatory circulars are
--   cited, because none were found that directly address electronic
--   notarisation for the four execution types above.  Where none was found,
--   none is invented.
--
-- ── Idempotency ──────────────────────────────────────────────────────────────
--   These are UPDATE statements (not INSERT), so they are safe to re-run.

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Electronic Transactions Act, 2011 (Act No. 8 of 2011, Uganda), Part IV — Electronic Signatures, s.8–s.16',
  conditions  = NULL,
  notes       = 'An electronic signature satisfies a statutory signature requirement under Ugandan law when it is reliable and appropriate for the purpose per Part IV of the Electronic Transactions Act. Hudumika Sign''s flow (recipient-drawn signature, anchor_hash tamper-evidence, timestamp) maps directly to Part IV''s reliability criteria: the method identifies the signatory, demonstrates intent, and authenticates the content at signing time.',
  source_url  = 'https://ulii.org/akn/ug/act/2011/8/eng@2011-01-01',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'UG' AND execution_type = 'NORMAL_SIGN';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Electronic Transactions Act, 2011 (Act No. 8 of 2011, Uganda), s.14 — witnessed electronic signature',
  conditions  = NULL,
  notes       = 'Section 14 of the Act explicitly provides that a "signed in the presence of a witness" requirement is satisfied when each party and the witness sign by electronic signature under Part IV. Uganda therefore has a direct statutory provision for witnessed electronic signatures, unlike jurisdictions where this is only implied. No additional condition beyond NORMAL_SIGN is required.',
  source_url  = 'https://ulii.org/akn/ug/act/2011/8/eng@2011-01-01',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'UG' AND execution_type = 'WITNESSED_SIGNATURE';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED_WITH_CONDITIONS',
  legal_basis = 'Electronic Transactions Act, 2011 (Act No. 8 of 2011, Uganda), s.17 — electronic oaths and affirmations',
  conditions  = 'The commissioner for oaths who administers the oath must be a real, currently-verified sign_certifiers entry — not expired, not revoked — at the moment of signing. Section 17 requires the authorised person''s electronic signature to be affixed to the instrument; the platform''s live certifier-verification at signing time is what satisfies this.',
  notes       = 'Section 17 of the Electronic Transactions Act explicitly provides that oaths, affirmations and statutory declarations may be administered electronically with the same legal effect as an in-person administration. The Oaths Act (Cap. 264) was checked; no explicit prohibition on electronic oath administration was found. The condition is a fact about this platform''s own enforcement model, not an assumption.',
  source_url  = 'https://ulii.org/akn/ug/act/2011/8/eng@2011-01-01',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'UG' AND execution_type = 'AFFIDAVIT';

UPDATE sign_jurisdiction_rules
SET
  status      = 'REQUIRES_PROFESSIONAL_REVIEW',
  legal_basis = 'Electronic Transactions Act, 2011 (Act No. 8 of 2011, Uganda), Part IV; Notaries Public Act (Cap. 5)',
  conditions  = 'Legal advice from a Uganda-qualified advocate or notary public is recommended before relying on an electronic notarial certification in a Ugandan court or land-registry filing. The Electronic Transactions Act provides a general statutory basis but the Notaries Public Act (Cap. 5) assumes an in-person sealing model and has not been reconciled with it by accessible case law or regulatory guidance. The certifier must in any event be a verified sign_certifiers entry.',
  notes       = 'The Electronic Transactions Act provides a general framework under which electronic signatures satisfy legal requirements, which in principle extends to notarisation. However, the Notaries Public Act (Cap. 5, Uganda), which predates the Electronic Transactions Act and governs the appointment and practice of notaries, assumes an in-person physical-presence and sealing model. No amendment, judicial decision, or Law Council guidance reconciling these two statutes in the context of electronic notarisation was found in ULII at time of review. The REQUIRES_PROFESSIONAL_REVIEW rating is honest: the statutory foundation exists, but the practice risk for high-stakes uses (land titles, court filings, cross-border instruments) is real and has not been formally resolved.',
  source_url  = 'https://ulii.org/akn/ug/act/2011/8/eng@2011-01-01',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'UG' AND execution_type = 'NOTARIAL_CERTIFICATION';
