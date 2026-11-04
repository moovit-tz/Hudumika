-- Migration 662: Grant new app feature keys to TZS tiers.
-- Migration 659 covers named tiers (professional/finance/scale/enterprise).
-- This adds the keys to the TZS-denominated tiers from mig 635.

-- Business-TZS: base keys (tuma/lexcore/ngao/gereji)
INSERT INTO package_features (package_code, feature_key)
SELECT 'business-tzs', k
FROM unnest(ARRAY['tuma','lexcore','ngao','gereji']) AS k
ON CONFLICT DO NOTHING;

-- Scale-TZS already mirrors enterprise via a SELECT copy in 635,
-- but if that ran before 659 seeded the keys, those rows won't exist yet.
INSERT INTO package_features (package_code, feature_key)
SELECT 'scale-tzs', k
FROM unnest(ARRAY[
  'tuma','tuma.dispatch','tuma.settlement',
  'lexcore','lexcore.trust','lexcore.conflicts',
  'ngao','ngao.dpia','ngao.incidents',
  'gereji','gereji.warranty'
]) AS k
ON CONFLICT DO NOTHING;
