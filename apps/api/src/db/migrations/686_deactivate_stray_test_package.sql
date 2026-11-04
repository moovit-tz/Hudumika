-- 'seal-pilot-test' ("SEAL Pilot", 15,000 TZS/mo) was left is_active = true in
-- the dev DB by an earlier ad-hoc verification script (predates this
-- migration), which made it publicly purchasable through GET /v1/packages
-- and the onboarding signup flow — a real test fixture, not a real product,
-- sitting live in the public catalog. No real tenant ever signed up on it
-- (only the verification script's own throwaway tenant did, already
-- cancelled); deactivating it, not deleting, to preserve that row's history.
UPDATE packages
SET is_active = false, updated_at = now()
WHERE code = 'seal-pilot-test' AND is_active = true;
