-- The free "Hudumika Workspace" substrate: lets a tenant exist with no paid
-- base tier at all, so a SEAL-only (or ClearOS/HuduFreight/CargoTracker-only)
-- customer can onboard without ever being charged for Hudumika Business.
--
-- is_active = true (unlike the grandfather/addon carrier packages from
-- migrations 685/687/688/689) — this one genuinely needs to be selectable
-- through the normal is_active-filtered packages lookup onboarding.service.ts
-- already uses, so no special-casing is needed there.
--
-- included_seats/max_locations are deliberately BELOW starter-tzs's own 2
-- seats / 1 location, and the feature grant is a small, explicit shared-infra
-- set (contacts/calendar/tasks) rather than nothing or everything — the free
-- tier must never look like a better deal on raw numbers than the cheapest
-- paid one, only cheaper on price with a narrower feature set.
INSERT INTO packages (code, name, currency, price_flat_monthly, price_flat_annual, monthly_price, annual_price, included_seats, max_locations, is_active, sort_order)
VALUES ('workspace-free', 'Hudumika Workspace', 'TZS', 0, 0, 0, 0, 1, 1, true, 0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO package_features (package_code, feature_key)
VALUES ('workspace-free', 'contacts'), ('workspace-free', 'calendar'), ('workspace-free', 'tasks')
ON CONFLICT DO NOTHING;
