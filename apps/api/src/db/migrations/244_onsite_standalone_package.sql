-- Migration 244: AgencyHost M4 — standalone Onsite-only package
--
-- The landing spot for a client tenant once its agency_managed_tenants
-- relationship ends (M3): while attached, 'onsite' entitlement is inherited
-- from the agency (see migration 243 and middleware/entitlement.ts's
-- agencyManagedOnsiteGrant); the 'agency-managed' plan itself grants nothing
-- via package_features, so the moment a relationship is marked 'detached'
-- there is nothing left to fall back to. This is also the direct answer to
-- the platform's own "customers not interested in other products" goal for
-- someone who signs up wanting hosting alone, not the full platform bundle.
--
-- Unlike 'agency-managed', this package is real and selectable
-- (is_active = true) — a tenant activates it themselves via
-- POST /v1/onsite/plan/activate-standalone. $9/mo is a placeholder figure,
-- not a business decision made here.
INSERT INTO packages (code, name, monthly_price, annual_price, max_users, features, is_active, sort_order)
VALUES ('onsite-standalone', 'Onsite', 9.00, 90.00, 5, '[]'::jsonb, true, 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('onsite-standalone', 'onsite')
ON CONFLICT DO NOTHING;
