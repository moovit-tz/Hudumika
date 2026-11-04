-- onboarding.service.ts's tenant insert never wrote billing_cycle at all
-- (fixed in the same session as this migration), so every tenant ever
-- signed up got the column's 'monthly' default regardless of what they
-- picked on the Package step. platform_transactions.billing_cycle (recorded
-- at signup payment time, unaffected by this bug) is the real evidence of
-- what each tenant actually paid for — use it to correct the ones that
-- disagree with their own signup record.
--
-- Found one real-looking tenant this way: "Wanjiku Freight Solutions"
-- (created 2026-07-03), paid for annual at signup, billed monthly ($50 USD,
-- enterprise plan) every month since. Both of its generated invoices so far
-- (Oct, Nov 2026) are still unpaid (overdue/due) — no money was actually
-- collected at the wrong amount, so no refund is needed, but those two
-- invoices are still wrong and are deliberately NOT touched here (voiding
-- or regenerating a specific named tenant's invoice history is a judgment
-- call for a human, not a migration to make unilaterally).
UPDATE tenants t
SET billing_cycle = 'annual', updated_at = now()
FROM (
  SELECT DISTINCT tenant_id
  FROM platform_transactions
  WHERE billing_cycle = 'annual'
) paid_annual
WHERE t.id = paid_annual.tenant_id
  AND t.billing_cycle = 'monthly';
