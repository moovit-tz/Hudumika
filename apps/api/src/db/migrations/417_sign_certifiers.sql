-- 417_sign_certifiers.sql
--
-- Milestone 2 of the Sign execution-model program (see 416): a reusable
-- credential directory for the certifiers (advocate / commissioner for
-- oaths / notary public) migration 342 already lets a preparer type in,
-- freeform, on every single envelope. Two real gaps that created:
--   1. No memory — the same commissioner's roll number gets retyped on
--      every document, with every retyping a chance to get it wrong.
--   2. No expiry enforcement — §16's "a credential that has lapsed must
--      stop being eligible" was impossible to check because nothing
--      recorded when a credential expires in the first place.
--
-- This does not replace sign_recipients.certifier_title/roll_number/firm —
-- those stay as the real, snapshotted-at-signing facts baked into the
-- certificate (a credential renewed or corrected later must never change
-- what an already-signed document says). sign_certifiers is the reusable
-- source those fields can now be filled FROM; certifier_id records which
-- directory entry (if any) a given recipient came from, purely so
-- eligibility can be re-checked against the CURRENT credential state at
-- the moment they actually act (POST /public/:token/sign), not just at
-- assignment time — a credential can lapse between the two.
CREATE TABLE sign_certifiers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  title             TEXT NOT NULL,  -- "Advocate", "Commissioner for Oaths", "Notary Public"
  roll_number       TEXT,           -- practising-certificate / roll / commission number
  firm              TEXT,
  jurisdiction      TEXT,           -- ISO country code — TZ, KE, UG, RW, ...
  email             TEXT,
  phone             TEXT,
  -- Set when this credential belongs to a real platform user (an internal
  -- staff member who happens to be a licensed advocate) — optional, most
  -- certifiers are external professionals with no Hudumika login at all.
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  issue_date        DATE,
  expiry_date       DATE,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'verified', 'revoked')),
  notes             TEXT,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_certifiers_tenant_idx ON sign_certifiers(tenant_id);
CREATE INDEX sign_certifiers_expiry_idx ON sign_certifiers(expiry_date);

ALTER TABLE sign_certifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_certifiers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON sign_certifiers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE sign_recipients ADD COLUMN IF NOT EXISTS certifier_id UUID REFERENCES sign_certifiers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sign_recipients_certifier_idx ON sign_recipients(certifier_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sign_certifiers_updated_at') THEN
    CREATE TRIGGER sign_certifiers_updated_at
      BEFORE UPDATE ON sign_certifiers
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;
