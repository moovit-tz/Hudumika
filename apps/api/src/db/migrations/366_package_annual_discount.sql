-- Annual pricing on the 4 live packages didn't actually save anything —
-- HuduStarter's annual_price ($40/yr = $3.33/seat/mo) was *more* than its
-- own monthly_price ($3), HuduPlus's ($120/yr = $10/seat/mo) matched its
-- monthly price exactly, and Onsite's ($90/yr = $7.50/mo) was an ~17%
-- discount — none matching the "Save 30%" the pricing step's own billing
-- toggle advertises. Repricing every annual_price to exactly
-- monthly_price * 12 * 0.7 makes that claim true and keeps the /seat/mo
-- annual-equivalent (StepPackage.tsx's own Math.round(annual_price / 12))
-- landing on a clean whole dollar for every seat-priced tier.
UPDATE packages SET annual_price = 25.20, updated_at = NOW() WHERE code = 'starter';     -- $2.10/mo annual-equivalent
UPDATE packages SET annual_price = 84.00, updated_at = NOW() WHERE code = 'growth';      -- $7.00/mo annual-equivalent
UPDATE packages SET annual_price = 420.00, updated_at = NOW() WHERE code = 'enterprise'; -- displayed as "Custom", kept consistent for billing.routes.ts
UPDATE packages SET annual_price = 75.60, updated_at = NOW() WHERE code = 'onsite-standalone'; -- $6.30/mo annual-equivalent
