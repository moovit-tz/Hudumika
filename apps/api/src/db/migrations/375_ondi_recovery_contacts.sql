-- Ondi feature-gap pass (M4): mutual-consent recovery contacts. The fork's
-- own feature-map doc lists "recovery contacts with mutual-consent approval
-- and a cooldown, instead of a single security question" as real — the
-- integrated system had none of this at all: only password-reset-by-email-
-- token (auth.routes.ts /forgot-password) and OTP/TOTP login. A UI for this
-- exists, but only in the dead standalone apps/web/ondi app, with no
-- backing table/route in apps/api anywhere — this is that missing backend
-- (+ a real, if compact, frontend), not a port of that dead app's code.

-- Who has agreed to vouch for whom. Mutual consent: adding a contact starts
-- 'pending'; the contact themselves must accept before it's usable for a
-- real recovery. Either party can remove it at any time.
CREATE TABLE IF NOT EXISTS ondi_recovery_contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at     TIMESTAMPTZ,
  CHECK (user_id <> contact_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ondi_recovery_contacts_pair ON ondi_recovery_contacts(user_id, contact_user_id);
CREATE INDEX IF NOT EXISTS idx_ondi_recovery_contacts_contact ON ondi_recovery_contacts(contact_user_id);

-- One "please vouch for me, I'm locked out" request per accepted contact,
-- created when the (unauthenticated) account owner starts recovery.
-- cooldown_ends_at is only set once the contact approves — the anti-abuse
-- window: if the real owner logs in normally before it elapses, the login
-- success path (auth.routes.ts) cancels every pending/approved request for
-- that user outright.
CREATE TABLE IF NOT EXISTS ondi_recovery_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id        UUID NOT NULL REFERENCES ondi_recovery_contacts(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'completed')),
  token             TEXT NOT NULL UNIQUE,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at      TIMESTAMPTZ,
  cooldown_ends_at  TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ondi_recovery_requests_user ON ondi_recovery_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ondi_recovery_requests_contact ON ondi_recovery_requests(contact_id);
-- Looked up by token from the unauthenticated /recovery/status and
-- /recovery/complete routes — dbPlatform, same pre-tenant boundary as
-- password_reset_tokens.
CREATE INDEX IF NOT EXISTS idx_ondi_recovery_requests_token ON ondi_recovery_requests(token);

ALTER TABLE ondi_recovery_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_recovery_contacts FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_recovery_contacts'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_recovery_contacts
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE ondi_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_recovery_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_recovery_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_recovery_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
