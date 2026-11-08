-- Resumable onboarding setup: after a person verifies identity through
-- Ondi and starts filling in company/package/domain/configuration, their
-- progress is saved here (keyed by the verified email, never by the
-- short-lived ondi_ticket itself — the ticket expires in 15 minutes but
-- the email it carries is stable) so closing the tab, switching devices,
-- or the ticket simply expiring doesn't lose their setup. Resuming just
-- means re-verifying with Ondi (to prove it's still the same person) and
-- the real draft row is fetched by that newly-verified email.
--
-- Deliberately excludes payment details (card number/CVC/mobile number)
-- and the ondi_ticket itself — neither should persist at rest a moment
-- longer than the request that needs them. No RLS: pre-tenant by
-- definition, same reasoning as pending_signups (migration 693).
CREATE TABLE IF NOT EXISTS onboarding_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_drafts_email ON onboarding_drafts(email);
