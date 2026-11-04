-- Migration 659: Seed package features and app status for the four industry apps.
-- Tuma (parcel logistics), LexCore (legal), Ngao (privacy), Gereji (automotive).
--
-- Base keys are granted to professional/finance/scale/enterprise tiers;
-- sub-feature keys (tuma.dispatch, lexcore.trust, etc.) follow the same
-- pattern as tracking.* and ondi.governance — granted at higher tiers.

-- ── Base app keys — all professional+ tiers ──

INSERT INTO package_features (package_code, feature_key)
SELECT p, k
FROM unnest(ARRAY['professional','finance','scale','enterprise']) AS p,
     unnest(ARRAY['tuma','lexcore','ngao','gereji']) AS k
ON CONFLICT DO NOTHING;

-- ── Sub-feature keys — scale/enterprise only ──

INSERT INTO package_features (package_code, feature_key)
SELECT p, k
FROM unnest(ARRAY['scale','enterprise']) AS p,
     unnest(ARRAY[
       'tuma.dispatch','tuma.settlement',
       'lexcore.trust','lexcore.conflicts',
       'ngao.dpia','ngao.incidents',
       'gereji.warranty'
     ]) AS k
ON CONFLICT DO NOTHING;

-- ── App status rows ──

INSERT INTO app_status (app_id, status) VALUES ('tuma',    'active') ON CONFLICT (app_id) DO NOTHING;
INSERT INTO app_status (app_id, status) VALUES ('lexcore', 'active') ON CONFLICT (app_id) DO NOTHING;
INSERT INTO app_status (app_id, status) VALUES ('ngao',    'active') ON CONFLICT (app_id) DO NOTHING;
INSERT INTO app_status (app_id, status) VALUES ('gereji',  'active') ON CONFLICT (app_id) DO NOTHING;

-- ── Industry registry entries (if not already present from mig 642) ──

INSERT INTO industry_registry (key, name, description, status)
VALUES
  ('legal',   'Legal Services',   'Law firms, corporate counsel, notaries', 'accepted'),
  ('privacy', 'Privacy & Data Protection', 'PDPC/GDPR compliance, DPO services', 'accepted')
ON CONFLICT (key) DO NOTHING;
