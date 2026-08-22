-- Migration 268: Seed package features and app status for eSign (sign) app
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'sign'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status) VALUES ('sign', 'active')
ON CONFLICT (app_id) DO NOTHING;
