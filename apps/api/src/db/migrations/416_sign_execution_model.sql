-- 416_sign_execution_model.sql
--
-- The "unified execution package" ask, applied the same additive way
-- migration 342 already proved out for certification: sign_envelopes IS
-- the execution package, sign_recipients ARE the participants, sign_events
-- IS the audit trail. This does not create a parallel document/signing
-- system — it adds two structured fields to the tables that already exist
-- so the UI and the PDF-baking logic can reason about *why* a recipient is
-- on the document, not just that they signed it.
--
-- execution_role formalizes what role_label already said in free text
-- (e.g. "Witness") into a real, behaviorally-meaningful value: a WITNESS's
-- completion now emits a distinct 'witnessed' audit event (see
-- sign.routes.ts's POST /public/:token/sign), not just 'signed' — the
-- "never collapse into status=signed" requirement. CERTIFIER absorbs the
-- existing is_certifier flag (kept, for backward compatibility with
-- drawCertificationStamp and every already-completed certified envelope)
-- rather than replacing it.
--
-- Four execution types are added, not the full aspirational list some
-- specs describe (OATH, COMMISSIONER_FOR_OATHS, STATUTORY_DECLARATION,
-- ...) — these four are the ones this migration gives real, distinct
-- behavior; the rest would be an enum value with no engine behind it,
-- which is worse than not having the value at all. AFFIDAVIT and
-- NOTARIAL_CERTIFICATION both route through the existing certifier
-- mechanism (a CERTIFIER participant with certifier_title already holding
-- real values like "Commissioner for Oaths" / "Notary Public" — see
-- migration 342) rather than inventing a second one.
CREATE TYPE sign_execution_type AS ENUM ('NORMAL_SIGN', 'WITNESSED_SIGNATURE', 'AFFIDAVIT', 'NOTARIAL_CERTIFICATION');
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS execution_type sign_execution_type NOT NULL DEFAULT 'NORMAL_SIGN';

CREATE TYPE sign_execution_role AS ENUM ('SIGNER', 'WITNESS', 'AFFIANT', 'CERTIFIER');
ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS execution_role sign_execution_role NOT NULL DEFAULT 'SIGNER';

-- Backfill: every existing certifier recipient becomes a real CERTIFIER
-- participant; every envelope that already has one becomes
-- NOTARIAL_CERTIFICATION — this is the exact transaction that was already
-- happening under the old is_certifier flag, just now expressed in the
-- new vocabulary. Nothing about an already-completed document changes.
UPDATE sign_recipients SET execution_role = 'CERTIFIER' WHERE is_certifier = true;
UPDATE sign_envelopes e SET execution_type = 'NOTARIAL_CERTIFICATION'
  WHERE EXISTS (SELECT 1 FROM sign_recipients r WHERE r.envelope_id = e.id AND r.is_certifier = true);

CREATE INDEX IF NOT EXISTS sign_recipients_execution_role_idx ON sign_recipients(execution_role);
CREATE INDEX IF NOT EXISTS sign_envelopes_execution_type_idx ON sign_envelopes(execution_type);

-- New, distinct audit events — §21's "never collapse into status=signed"
-- requirement. drawAuditTrail() (sign-pdf.service.ts) titlecases
-- event_type generically, so these render correctly in the baked
-- certificate/audit-trail pages with zero changes to that function.
ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'witnessed';
ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'certified';
ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'declared';
