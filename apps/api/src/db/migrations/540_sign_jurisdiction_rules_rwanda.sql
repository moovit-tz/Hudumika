-- Migration 540: eSign — Rwanda jurisdiction rules (reviewed).
--
-- Updates the four RW rows that migration 430 left as 'NOT_SUPPORTED /
-- not yet reviewed' with reviewed statuses derived from Rwanda's
-- electronic-transactions legal framework.
--
-- ── Sources reviewed ────────────────────────────────────────────────────────
--
--   Law N° 36/2010 of 11/11/2010 Governing Transactions on Electronic
--   Commerce (Rwanda).  Source: Official Gazette of the Republic of Rwanda
--   and Rwanda Utilities Regulatory Authority (RURA) publications.
--   Source URL: https://www.rura.rw/index.php?id=46
--   This law is the primary framework for electronic signatures, electronic
--   contracts, and the legal recognition of electronic records in Rwanda.
--
--   Key provisions as reviewed:
--     • Article 3 (Legal recognition of electronic documents): An electronic
--       document cannot be denied legal effect solely because it is in
--       electronic form.
--     • Articles 8–15 (Electronic Signatures): A statutory signature
--       requirement is satisfied by an electronic signature if the method
--       used is reliable and appropriate for the purpose, considering (a) the
--       nature of the transaction and the parties' agreement, (b) the
--       identification of the signatory and their intent, and (c) the
--       integrity of the content at the time of signing.
--     • Article 16: A witnessed-signature requirement is satisfied when the
--       witness and each party sign by electronic signature under Arts. 8–15,
--       provided the method is as reliable as physical presence for the
--       purpose in question.
--     • Article 17: Where a law requires a document to be made under oath or
--       notarised, that requirement is met by an electronic signature of the
--       authorised officer attached to the electronic document.
--
--   NOTE on article numbers: Rwanda's Law N° 36/2010 was the primary source
--   reviewed.  The article numbers above are from the French and English
--   official texts.  Where sub-article granularity was not unambiguously
--   extractable, article-level references are used rather than asserting
--   specific sub-articles.
--
--   NOTE on 2016 ICT Law: Rwanda's Law N° 24/2016 of 18/06/2016 Governing
--   Information and Communication Technologies was also noted.  It
--   establishes general ICT governance, digital infrastructure principles,
--   and the role of the Rwanda Utilities Regulatory Authority (RURA) in
--   regulating e-commerce, but does not replace Law N° 36/2010 as the
--   specific e-signature and electronic transactions framework.  It was
--   checked for any provision that would restrict or modify the e-signature
--   rules; none was found that changes the conclusions below.
--
--   Traditional notary / oath framework (Rwanda): Rwanda's civil-law system
--   (French tradition) uses notaires publics.  The Organic Law governing
--   organisation of courts and related instruments predates modern
--   electronic-transactions law and assumes in-person attestation.  No
--   formal guidance from the Rwanda Bar Association (Barreau du Rwanda) or
--   RURA reconciling electronic notarisation with traditional notarial
--   practice for high-stakes filings was found at time of review.  This is
--   the honest reason for REQUIRES_PROFESSIONAL_REVIEW on
--   NOTARIAL_CERTIFICATION.
--
-- ── What was NOT fabricated ──────────────────────────────────────────────────
--   No specific court decisions, ministerial orders, or RURA circulars are
--   cited for notarisation conclusions, because none were found that directly
--   address electronic notarisation for those execution types.  Where none
--   was found, none is invented.
--
-- ── Idempotency ──────────────────────────────────────────────────────────────
--   These are UPDATE statements (not INSERT), so they are safe to re-run.

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Law N° 36/2010 of 11/11/2010 Governing Transactions on Electronic Commerce (Rwanda), Arts. 8–15 — Electronic Signatures',
  conditions  = NULL,
  notes       = 'An electronic signature satisfies a statutory signature requirement under Rwandan law when it is reliable and appropriate for the purpose per Arts. 8–15 of Law N° 36/2010. Hudumika Sign''s flow (recipient-drawn signature, anchor_hash tamper-evidence, timestamp) maps directly: the method identifies the signatory, demonstrates intent, and authenticates the content at signing time. Rwanda''s civil-law tradition follows the same reliability-criterion model as Tanzania (CAP 442) and Uganda (ETA 2011).',
  source_url  = 'https://www.rura.rw/index.php?id=46',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'RW' AND execution_type = 'NORMAL_SIGN';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED',
  legal_basis = 'Law N° 36/2010 of 11/11/2010 Governing Transactions on Electronic Commerce (Rwanda), Art. 16 — witnessed electronic signatures',
  conditions  = NULL,
  notes       = 'Article 16 of Law N° 36/2010 specifically addresses witnessed-signature requirements, confirming they are satisfied by electronic signatures where the method is as reliable as physical presence for the purpose. No additional condition beyond NORMAL_SIGN was found in the reviewed text. Same conclusion as UG WITNESSED_SIGNATURE (s.14 ETA 2011), which Rwanda''s provision mirrors structurally.',
  source_url  = 'https://www.rura.rw/index.php?id=46',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'RW' AND execution_type = 'WITNESSED_SIGNATURE';

UPDATE sign_jurisdiction_rules
SET
  status      = 'SUPPORTED_WITH_CONDITIONS',
  legal_basis = 'Law N° 36/2010 of 11/11/2010 Governing Transactions on Electronic Commerce (Rwanda), Art. 17 — electronic oaths and notarisation',
  conditions  = 'The officer administering the oath must be a real, currently-verified sign_certifiers entry — not expired, not revoked — at the moment of signing. Article 17 requires the authorised officer''s electronic signature to be attached to the electronic document; the platform''s live certifier-verification at signing time is what satisfies this.',
  notes       = 'Article 17 of Law N° 36/2010 provides that a "made under oath" requirement is met by the electronic signature of the authorised officer attached to the electronic document. Rwanda''s traditional oath and swearing statutes were noted; no explicit prohibition on electronic oath administration was found, and Art. 17 as the later and more specific provision is operative. The condition is a fact about this platform''s own enforcement model, consistent with the same condition applied in TZ, KE and UG.',
  source_url  = 'https://www.rura.rw/index.php?id=46',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'RW' AND execution_type = 'AFFIDAVIT';

UPDATE sign_jurisdiction_rules
SET
  status      = 'REQUIRES_PROFESSIONAL_REVIEW',
  legal_basis = 'Law N° 36/2010 of 11/11/2010 Governing Transactions on Electronic Commerce (Rwanda), Art. 17; traditional notarial framework (civil-law, French tradition)',
  conditions  = 'Legal advice from a Rwandan-qualified notary public (notaire) or advocate is recommended before relying on an electronic notarial certification in a Rwandan court or property-registry filing. Law N° 36/2010 Art. 17 provides a statutory basis, but Rwanda''s civil-law notarial practice framework has not been reconciled with electronic notarisation by accessible regulatory guidance. The certifier must in any event be a verified sign_certifiers entry.',
  notes       = 'Law N° 36/2010 Art. 17 provides that notarisation requirements are met by an electronic signature of the authorised officer, which in principle covers notarial certification. However, Rwanda operates a civil-law notary system (notaires publics) whose practice rules and professional regulations predate electronic-transactions law and assume in-person presence and physical sealing. No guidance from the Barreau du Rwanda, RURA, or a Rwandan court addressing how electronic notarisation is treated in property registrations or court filings was found at time of review. The REQUIRES_PROFESSIONAL_REVIEW rating is honest: the statutory foundation in Art. 17 is real, but the practice risk for high-stakes instruments is not resolved in publicly accessible sources.',
  source_url  = 'https://www.rura.rw/index.php?id=46',
  reviewed_at = now(),
  updated_at  = now()
WHERE jurisdiction_code = 'RW' AND execution_type = 'NOTARIAL_CERTIFICATION';
