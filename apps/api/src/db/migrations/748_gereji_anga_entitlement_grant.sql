-- Migration 748: Grant the 'gereji.anga' sub-feature key.
--
-- Found live while checking why the Gereji app "isn't opening": every
-- gereji-anga-*.routes.ts route (parts/customers/suppliers/locations,
-- RFQs/quotes, AOG cases, goods receipts/stock units/rate cards/hire
-- reservations — migrations 744-747) is gated behind requireEntitlement
-- ('gereji.anga'), but no migration ever granted that key to any package.
-- Every tenant on every plan has always gotten a 403 on all of it — the
-- base 'gereji' app (migration 672/676) opens fine, but the entire ANGA
-- PartsOS section (10 of the 15 pages this port shipped) has been
-- unreachable since Milestone 2, regardless of plan tier.
--
-- Follows the exact same pattern already established for 'gereji.warranty'
-- (migration 672 for the named tiers, 676 for the TZS-denominated ones) —
-- a sub-feature key granted at scale/enterprise and their TZS equivalents,
-- not at every tier the base 'gereji' key reaches.

INSERT INTO package_features (package_code, feature_key)
SELECT p, 'gereji.anga'
FROM unnest(ARRAY['scale', 'enterprise', 'scale-tzs', 'automotive-tzs']) AS p
ON CONFLICT DO NOTHING;
