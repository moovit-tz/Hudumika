-- Migration 697: fold the advanced sub-features into the SEAL/HuduFreight
-- standalone add-ons (LENS-48, LENS-49).
--
-- Migrations 687/688 deliberately left this open as a flagged follow-on
-- question: does buying the add-on also include 'seal_advanced' /
-- tracking.{analytics,cargo-loading,reports,warehouse} (today Scale/
-- Enterprise-only sub-keys), or is that a further upsell?
--
-- Decision made explicitly by the user: included. A tenant who buys
-- seal-addon or hudufreight-addon gets the advanced sub-features
-- regardless of base plan tier — not only when the base tier is also
-- Scale/Enterprise. This is the simpler, more generous reading (no new
-- AND-combination check in entitlement code), chosen over a narrower
-- "only on top of Scale" interpretation. Revisit here if that turns out
-- to be the wrong call.

INSERT INTO package_features (package_code, feature_key)
VALUES ('seal-addon', 'seal_advanced')
ON CONFLICT DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES
  ('hudufreight-addon', 'tracking.analytics'),
  ('hudufreight-addon', 'tracking.cargo-loading'),
  ('hudufreight-addon', 'tracking.reports'),
  ('hudufreight-addon', 'tracking.warehouse')
ON CONFLICT DO NOTHING;
