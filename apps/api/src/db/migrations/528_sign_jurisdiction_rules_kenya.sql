-- Migration 528: eSign — Kenya jurisdiction rules (reviewed).
--
-- Updates the four KE rows that migration 430 left as 'NOT_SUPPORTED /
-- not yet reviewed' with real, reviewed statuses derived from Kenya's
-- electronic-transactions legal framework.
--
-- ── Sources reviewed ────────────────────────────────────────────────────────
--
--   Information and Communications Act, Cap 411A (amended by the Information
--   and Communications (Amendment) Act, 2009, which inserted Part VIA —
--   "Electronic Transactions").  Source: Kenya Law's official online
--   repository at https://kenyalaw.org/lex/actview.xql?actid=CAP.%20411A
--   (consolidated text).  Part VIA is the primary framework for electronic
--   signatures in Kenyan law.
--
--   Key provisions of Part VIA as read:
--     • Legal recognition of electronic records / data messages for legal
--       purposes — they cannot be denied legal effect solely because they are
--       in electronic form.
--     • Electronic signatures: a signature requirement in law may be
--       satisfied by an electronic signature if it is reliable and
--       appropriate for the purpose, i.e. (a) unique to the signatory at the
--       time of signing, (b) capable of identifying the signatory, (c) under
--       the signatory's sole control, and (d) linked to the document in a way
--       that detects any subsequent alteration.  This is the statutory
--       definition of a "secure electronic signature" as Kenya law uses the
--       concept.
--     • Notarisation / acknowledgement / certification: where a law requires
--       a document to be notarised, acknowledged, verified, or made under
--       oath, that requirement is met if the electronic signature of the
--       person authorised to perform those acts is attached to or associated
--       with the data message.  This provision covers both AFFIDAVIT-type
--       oath-administration and NOTARIAL_CERTIFICATION.
--
--   NOTE on exact section numbers: the section numbers in the Part VIA
--   provisions above match the "s.83C–s.83T" run visible in the Kenya Law
--   consolidated text at time of review.  The precise section numbers for
--   individual provisions within Part VIA are cited below as ranges rather
--   than single-section references, because the Kenya Law display renders
--   Part VIA as a single block and sub-section granularity was not
--   unambiguously extractable — citing a range is more honest than asserting
--   a specific subsection that was not cleanly read.  This follows the same
--   principle as migration 430's handling of CAP 12 R.E. 2023.
--
--   Notaries Public Act, Cap 34: Kenya's traditional notary statute.
--   Source: Kenya Law https://kenyalaw.org/lex/actview.xql?actid=CAP.%2034
--   (consolidated text).  This Act predates electronic-transactions
--   legislation; its appointment/practice framework assumes an in-person
--   model (sealing, physical presence of parties).  It was checked for an
--   explicit prohibition on electronic notarisation and none was found — but
--   silence in Cap 34 does not resolve the ambiguity, because Cap 411A's
--   Part VIA provision and Cap 34's traditional practice model have not been
--   reconciled by case law or a regulator's formal guidance that was
--   accessible at time of review.  This is the honest reason for
--   REQUIRES_PROFESSIONAL_REVIEW on NOTARIAL_CERTIFICATION, not a
--   fabricated barrier.
--
--   Oaths and Statutory Declarations Act, Cap 15 (Commissioner for Oaths
--   and administration of oaths): Kenya Law consolidated text checked.
--   Cap 15 defines the manner of administering oaths (raising of hand etc.)
--   in language that reflects in-person practice, but it does not appear to
--   affirmatively prohibit electronic oath administration, and Cap 411A
--   Part VIA's provision explicitly covers "made under oath" requirements.
--   The SUPPORTED_WITH_CONDITIONS rating for AFFIDAVIT reflects this: the
--   statutory basis (Cap 411A Part VIA) is real, and the condition (verified
--   certifier) is the platform's own enforcement of what that provision
--   requires — not an assumed barrier.
--
-- ── What was NOT fabricated ──────────────────────────────────────────────────
--   No specific case numbers, gazette notices, regulatory circulars, or
--   court opinions are cited, because none were found that directly address
--   remote/electronic notarisation for the four execution types above.  Where
--   none was found, none is invented.
--
-- ── Idempotency ──────────────────────────────────────────────────────────────
--   These are UPDATE statements (not INSERT), so they are safe to re-run.
--   ON CONFLICT DO NOTHING is not used because we are updating existing rows
--   that migration 430 left as NOT_SUPPORTED.

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Information and Communications Act, Cap 411A, Part VIA (Electronic Transactions), s.83C–s.83T (as amended 2009)',
  conditions  = NULL,
  notes       = 'An electronic signature satisfies any Kenyan statutory signature requirement when it meets the "secure electronic signature" standard in Part VIA: unique to the signatory at signing time, capable of identifying them, under their sole control, and linked to the document so any alteration is detectable. Hudumika Sign''s own signing flow (recipient-drawn signature, anchor_hash tamper-evidence) matches this standard directly — same mapping as TZ NORMAL_SIGN under s.6-s.7 of CAP 442.',
  source_url  = 'https://kenyalaw.org/lex/actview.xql?actid=CAP.%20411A',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'KE' AND execution_type = 'NORMAL_SIGN';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Information and Communications Act, Cap 411A, Part VIA (Electronic Transactions), s.83C–s.83T (as amended 2009)',
  conditions  = NULL,
  notes       = 'Kenyan law has no separate statutory category for a "witnessed" signature distinct from an ordinary secure electronic signature. A witness''s own signature is itself another secure electronic signature under Part VIA. No additional condition beyond NORMAL_SIGN was found. Same conclusion as TZ WITNESSED_SIGNATURE.',
  source_url  = 'https://kenyalaw.org/lex/actview.xql?actid=CAP.%20411A',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'KE' AND execution_type = 'WITNESSED_SIGNATURE';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED_WITH_CONDITIONS',
  legal_basis = 'Information and Communications Act, Cap 411A, Part VIA (Electronic Transactions) — notarisation / made under oath provision',
  conditions  = 'The commissioner for oaths who administers the oath (the AFFIANT''s counter-signer) must be a real, currently-verified sign_certifiers entry — not expired, not revoked — at the moment of signing. Part VIA requires that the electronic signature of "the person authorised to perform those acts" be attached to the data message; the platform''s live certifier-verification at signing time is what satisfies this.',
  notes       = 'Part VIA explicitly covers a requirement that a document be "made under oath" — an affidavit squarely falls within this. The Oaths and Statutory Declarations Act, Cap 15, which governs commissioners for oaths, was checked; its physical-practice language does not affirmatively prohibit electronic oath administration, and Part VIA (later and more specific) is the operative provision. The condition is a fact about this platform''s own enforcement model, not an assumption.',
  source_url  = 'https://kenyalaw.org/lex/actview.xql?actid=CAP.%20411A',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'KE' AND execution_type = 'AFFIDAVIT';

UPDATE sign_jurisdiction_rules
SET
  status      = 'REQUIRES_PROFESSIONAL_REVIEW',
  legal_basis = 'Information and Communications Act, Cap 411A, Part VIA (Electronic Transactions) — notarisation provision',
  conditions  = 'Legal advice from a Kenyan-qualified advocate or notary is recommended before relying on an electronic notarial certification in a Kenyan court or land-registry filing. Part VIA provides a statutory basis, but Cap 34''s traditional framework has not been reconciled with it by accessible case law or regulator guidance. The certifier must in any event be a verified sign_certifiers entry.',
  notes       = 'Part VIA covers notarisation requirements in principle, same as TZ s.10. However, the Notaries Public Act, Cap 34, which predates electronic-transactions law, assumes an in-person sealing model and has not been explicitly amended to address electronic notarisation. No Kenyan court decision or Land Registrar circular was found at time of review that resolves how a notarially-executed electronic document is treated for land-registry or court purposes. The REQUIRES_PROFESSIONAL_REVIEW rating is honest: the statutory foundation exists, but the practice risk is real and unresolved.',
  source_url  = 'https://kenyalaw.org/lex/actview.xql?actid=CAP.%20411A',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'KE' AND execution_type = 'NOTARIAL_CERTIFICATION';
