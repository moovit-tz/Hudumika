-- Additive-only: subscription_invoices already carries `amount` (plan cost).
-- Purchased add-ons (376_package_addons.sql) now fold into that number at
-- generation time, so a real add-on breaks out its own line here rather than
-- silently inflating `amount` with nothing to explain the difference —
-- Subscription.tsx's Billing tab reads this to show "Plan" + "Add-ons" as two
-- lines instead of one unexplained total.
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS addons_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
