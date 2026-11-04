-- Phase 1 continuation: activate the three public Hudumika Business TZS
-- packages (starter-tzs/business-tzs/scale-tzs) for real signups.
--
-- Pre-activation audit (see docs/commercial-plan-phase0-matrix.md's "Release
-- blockers" list) confirmed every blocker except pricing is already closed:
--   - Feature differentiation is real (10/34/73 package_features keys across
--     starter-tzs/business-tzs/scale-tzs — migrations 659-663).
--   - Annual billing is implemented (periodBounds/computePlanAmount in
--     subscription-billing.service.ts, migration 635).
--   - Seat limits are enforced and wired into signup/invite routes
--     (lib/plan-limits.ts: checkSeatLimit, called from hr.routes.ts and
--     ondi.routes.ts).
--   - Location limits (checkLocationLimit) exist but are currently
--     unreachable in either direction: there is no API route that lets a
--     tenant create a second `locations` row at all today (only onboarding's
--     one-time Head Office insert does). Not a blocker — nothing can violate
--     the advertised limit yet — but flagged as a known gap, not silently
--     "fixed" by inventing a feature that wasn't asked for.
--   - Overage pricing (extra_seat_price) stays NULL: the documented default
--     ("block at limit, no overage billing until a price is decided") is
--     already what checkSeatLimit enforces.
--   - Tax treatment: TZS prices are tax-inclusive, matching the "Tax:
--     Included" label already shipped in Subscription.tsx.
--
-- Scale price correction: the Oct-28 draft priced Scale at 299,000/mo;
-- the newer master commercial-architecture prompt specifies 199,000/mo.
-- The user picked the master prompt's figure. Annual follows the existing
-- 10x-monthly convention used for the other two tiers.
UPDATE packages
SET price_flat_monthly = 199000,
    price_flat_annual = 1990000,
    monthly_price = 199000,
    annual_price = 1990000,
    updated_at = now()
WHERE code = 'scale-tzs' AND is_active = false;

-- Activate the three public tiers. Legacy USD packages (starter/growth/
-- enterprise) are left untouched and stay visible to new signups alongside
-- these — per the user's explicit choice, not hidden.
UPDATE packages
SET is_active = true,
    updated_at = now()
WHERE code IN ('starter-tzs', 'business-tzs', 'scale-tzs');
