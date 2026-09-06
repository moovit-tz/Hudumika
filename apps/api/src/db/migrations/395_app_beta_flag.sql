-- Migration 395: platform-controlled "Beta" label for Modules & Extensions
--
-- The Beta pill on Settings > Modules & Extensions used to come from a
-- hardcoded `status: 'Beta' | 'Live'` field on MODULE_CATALOG in
-- Settings.tsx — a frontend constant only a developer could change, the
-- same for every tenant only because it was baked into the JS bundle, not
-- because any platform authority had actually decided it. Moving it onto
-- app_status (already the platform-wide, dbPlatform-only table backing the
-- SuperAdmin maintenance kill switch — see migration 060) gives it a real
-- single source of truth: a SuperAdmin sets it once, GET /v1/entitlements
-- reports it to every tenant identically, and Settings.tsx just renders
-- what the platform says instead of a compiled-in guess.
--
-- Independent of `status`: an app can be in maintenance, beta, both, or
-- neither — two separate booleans on the same row, same as the file's
-- original "two independent gates" framing.

ALTER TABLE app_status ADD COLUMN IF NOT EXISTS is_beta BOOLEAN NOT NULL DEFAULT false;

-- Backfill rows for apps that already exist in Settings.tsx's MODULE_CATALOG
-- (and in ALL_FEATURE_KEYS) but never got an app_status row at all — the
-- same "shipped with a real feature key but no app_status row" drift that
-- 067/102/122/261/265/268/290 each already had to fix once for a different
-- app. Without a row here, SuperAdmin's App Status page has nothing to
-- toggle for these 9 apps, for maintenance OR beta.
INSERT INTO app_status (app_id, status)
SELECT unnest(ARRAY['seal','studio','crm','bliss','calendar','tasks','projects','store','hudubi']), 'active'
ON CONFLICT (app_id) DO NOTHING;

-- Seed is_beta to exactly match today's hardcoded MODULE_CATALOG so this
-- migration is a pure refactor — zero visible change for any tenant the
-- moment it runs. A SuperAdmin can flip any of these afterward.
UPDATE app_status SET is_beta = true
WHERE app_id IN ('seal', 'inventory', 'petti', 'sign', 'sms', 'notes');
