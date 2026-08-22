-- Calendar v3 — the remaining Google Calendar gaps: per-event timezone,
-- public booking pages (Calendly-style), and external Google/Outlook sync
-- connections. Builds on 286_calendar_v2.sql.

-- Per-event timezone (IANA name, e.g. 'Africa/Dar_es_Salaam') — used at
-- save time to convert the given wall-clock start/end into the correct UTC
-- instant via the same Intl-based conversion ics.ts's importer already
-- uses for TZID, rather than assuming the browser's own timezone. NULL
-- keeps the existing behaviour (browser-local) unchanged.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS timezone TEXT;

-- Booking pages — a public scheduling link (title, duration, working
-- hours/days, how far ahead bookable). slug is globally unique (not just
-- per-tenant) so a public /book/:slug URL never needs a tenant hint in it;
-- the public routes resolve tenant_id from the slug first (a narrow,
-- audited dbPlatform lookup — CLAUDE.md's own carve-out for exactly this
-- shape of cross-tenant read), then do everything else inside withTenant().
CREATE TABLE IF NOT EXISTS booking_pages (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  working_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Sun..6=Sat
  working_start_time TEXT NOT NULL DEFAULT '09:00',
  working_end_time TEXT NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  booking_window_days INTEGER NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_pages_user ON booking_pages(tenant_id, user_id);

-- A booking is just a normal calendar_events row (title "<page title> with
-- <booker name>", the booker as a guest with userId NULL — the existing
-- shape for a non-platform guest) tagged back to the page it came through.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS booking_page_id UUID REFERENCES booking_pages(id) ON DELETE SET NULL;

-- External calendar sync (Google/Outlook), one-way import only (external
-- events mirrored in read-only, never written back) — per-USER connection,
-- since calendar_events is personal data. The OAuth app registration
-- itself (client_id/client_secret) stays tenant-level, on
-- tenant_settings.settings.calendarSync — same split mail-oauth.routes.ts
-- already established (one app registration per tenant, each staff member
-- individually authorizes it against their own account), not a new pattern.
CREATE TABLE IF NOT EXISTS calendar_sync_connections (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook')),
  access_token TEXT,  -- encrypted (encryptSecret), same as mail-oauth's tokens
  refresh_token TEXT, -- encrypted
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'authorized', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_user ON calendar_sync_connections(tenant_id, user_id);

-- A synced-in event is a read-only mirror — external_id is the provider's
-- own event id, upserted on every sync pass instead of duplicating.
-- NULL/NULL for every normal Hudumika-native event.
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_source TEXT CHECK (external_source IN ('google', 'outlook'));
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_external ON calendar_events(user_id, external_source, external_id) WHERE external_source IS NOT NULL;

ALTER TABLE booking_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_pages FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'booking_pages'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON booking_pages
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

ALTER TABLE calendar_sync_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_sync_connections FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'calendar_sync_connections'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON calendar_sync_connections
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
