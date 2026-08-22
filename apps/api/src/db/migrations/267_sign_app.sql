-- Migration 267: Hudumika eSign — signature envelopes, recipients, fields, and audit trail
-- Creates the four core tables for the signature app. No RLS on these tables —
-- tenant isolation is enforced explicitly via tenant_id WHERE clauses on every query.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Envelope statuses: draft → sent → completed | voided | declined
CREATE TYPE sign_envelope_status AS ENUM ('draft', 'sent', 'completed', 'voided', 'declined');

-- Recipient statuses per envelope
CREATE TYPE sign_recipient_status AS ENUM ('pending', 'viewed', 'signed', 'declined');

-- Field types that can be placed on a document page
CREATE TYPE sign_field_type AS ENUM ('signature', 'initials', 'date', 'text', 'checkbox');

-- Signing order mode
CREATE TYPE sign_order_mode AS ENUM ('sequential', 'parallel');

-- ── 1. Envelopes ─────────────────────────────────────────────────────────────
CREATE TABLE sign_envelopes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES users(id),
  title         TEXT NOT NULL,
  message       TEXT,
  -- Reference to a file stored in Cloud Drive (optional — may be an uploaded PDF)
  file_id       UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  -- Raw file name when uploaded directly (not from Cloud Drive)
  file_name     TEXT,
  -- Base64 or URL to original document (stored for public signing experience)
  document_data TEXT,
  status        sign_envelope_status NOT NULL DEFAULT 'draft',
  order_mode    sign_order_mode NOT NULL DEFAULT 'sequential',
  -- Template this envelope was created from (nullable)
  template_id   UUID,
  expires_at    TIMESTAMPTZ,
  sent_at       TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT,
  -- DocuSign-style verification code: HSGN-XXXXXX-XXXXXX, shown on stamp
  verification_code TEXT UNIQUE DEFAULT upper('HSGN-' || substring(encode(gen_random_bytes(3),'hex'),1,6) || '-' || substring(encode(gen_random_bytes(3),'hex'),1,6)),
  -- Whether the completed PDF has had the visual stamp applied to all pages
  stamp_applied BOOLEAN NOT NULL DEFAULT false,
  stamped_at    TIMESTAMPTZ,
  -- URL/path of the stamped PDF stored in object storage
  stamped_file_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_envelopes_tenant_idx    ON sign_envelopes(tenant_id);
CREATE INDEX sign_envelopes_created_by_idx ON sign_envelopes(created_by);
CREATE INDEX sign_envelopes_status_idx    ON sign_envelopes(status);

-- ── 2. Recipients ─────────────────────────────────────────────────────────────
CREATE TABLE sign_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id   UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Display name and email of the signer (may be external, so no users FK)
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role_label    TEXT,                  -- e.g. "Customer", "Director", "Witness"
  sign_order    INTEGER NOT NULL DEFAULT 1,
  status        sign_recipient_status NOT NULL DEFAULT 'pending',
  -- Opaque token embedded in the signing link (sign/public/:token)
  token         TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Signature data: base64 PNG drawn/typed by the signer
  signature_data TEXT,
  signed_at     TIMESTAMPTZ,
  declined_at   TIMESTAMPTZ,
  decline_reason TEXT,
  viewed_at     TIMESTAMPTZ,
  -- Geolocation/IP captured at signing time
  signed_ip     TEXT,
  signed_user_agent TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_recipients_envelope_idx ON sign_recipients(envelope_id);
CREATE INDEX sign_recipients_token_idx    ON sign_recipients(token);
CREATE INDEX sign_recipients_email_idx    ON sign_recipients(email);

-- ── 3. Fields ─────────────────────────────────────────────────────────────────
-- Placement data for each field dragged onto a document page in the editor.
-- Coordinates are fractional (0–1) so they survive page-size differences.
CREATE TABLE sign_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id   UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  recipient_id  UUID NOT NULL REFERENCES sign_recipients(id) ON DELETE CASCADE,
  field_type    sign_field_type NOT NULL,
  page          INTEGER NOT NULL DEFAULT 1,  -- 1-indexed
  x             DOUBLE PRECISION NOT NULL,   -- fraction of page width  (0–1)
  y             DOUBLE PRECISION NOT NULL,   -- fraction of page height (0–1)
  width         DOUBLE PRECISION NOT NULL,   -- fraction of page width
  height        DOUBLE PRECISION NOT NULL,   -- fraction of page height
  required      BOOLEAN NOT NULL DEFAULT true,
  placeholder   TEXT,                        -- hint text shown inside the field
  -- Value filled in by the signer
  value         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_fields_envelope_idx   ON sign_fields(envelope_id);
CREATE INDEX sign_fields_recipient_idx  ON sign_fields(recipient_id);

-- ── 4. Audit Events ───────────────────────────────────────────────────────────
CREATE TYPE sign_event_type AS ENUM (
  'created', 'updated', 'sent', 'reminded', 'viewed', 'signed',
  'declined', 'completed', 'voided', 'expired', 'stamped', 'verified'
);

CREATE TABLE sign_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id   UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  recipient_id  UUID REFERENCES sign_recipients(id) ON DELETE SET NULL,
  event_type    sign_event_type NOT NULL,
  actor_name    TEXT,      -- display name of who triggered this event
  actor_email   TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_events_envelope_idx ON sign_events(envelope_id);
CREATE INDEX sign_events_type_idx     ON sign_events(event_type);

-- ── 5. Templates ─────────────────────────────────────────────────────────────
-- A saved envelope layout (fields + recipients) without the actual document data.
CREATE TABLE sign_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES users(id),
  name          TEXT NOT NULL,
  description   TEXT,
  -- Serialised field definitions (JSON array matching sign_fields columns)
  fields        JSONB NOT NULL DEFAULT '[]',
  -- Default recipient roles (JSON array with name/email/role_label/sign_order)
  recipients    JSONB NOT NULL DEFAULT '[]',
  -- Attached file reference
  file_id       UUID REFERENCES cloud_files(id) ON DELETE SET NULL,
  file_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sign_templates_tenant_idx ON sign_templates(tenant_id);

-- ── 6. Verification log ─────────────────────────────────────────────────────
-- Every time someone looks up a verification code, we log it (for audit).
-- The code itself is on sign_envelopes.verification_code.
CREATE TABLE sign_verifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id      UUID NOT NULL REFERENCES sign_envelopes(id) ON DELETE CASCADE,
  verification_code TEXT NOT NULL,
  looked_up_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address       TEXT,
  user_agent       TEXT,
  result           TEXT NOT NULL  -- 'valid' | 'not_found'
);

CREATE INDEX sign_verifications_code_idx ON sign_verifications(verification_code);
CREATE INDEX sign_verifications_envelope_idx ON sign_verifications(envelope_id);

-- ── 6. Updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Only create if not already there from a previous migration
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sign_envelopes_updated_at'
  ) THEN
    CREATE TRIGGER sign_envelopes_updated_at
      BEFORE UPDATE ON sign_envelopes
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'sign_templates_updated_at'
  ) THEN
    CREATE TRIGGER sign_templates_updated_at
      BEFORE UPDATE ON sign_templates
      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;
