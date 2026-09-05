-- Migration 393: a real free tier, and cheaper seats past a threshold.
--
-- Both come out of the pricing-strategy review against Supabase/Zoho/
-- Freshservice/Google Workspace for the East African market: a genuinely
-- usable free tier lowers the trust barrier for a first-time, cash-conscious
-- buyer (Supabase's own free tier is the thing that drives its adoption),
-- and growth shouldn't re-price a whole account the moment a 6th staff
-- member joins (Zoho charges far less for incremental seats than the base
-- seat itself).
--
-- Both land dormant, matching this table's own existing convention (see
-- 244_onsite_standalone_package.sql, 376_package_addons.sql's
-- onsite-standalone deactivation): a new package ships is_active = false
-- until a SuperAdmin deliberately turns it on, and the seat-tiering columns
-- are added NULL on every existing package, so `price_per_seat * seats`
-- (billing.routes.ts /invoices/generate, Subscription.tsx's client-side
-- estimate) computes exactly as it did before this migration for every
-- tenant on every currently-active plan — nothing here changes what anyone
-- is actually billed until someone sets these fields on purpose.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS extra_seat_price     NUMERIC(10,2), -- USD/user/month charged for each seat past extra_seat_threshold; NULL = no discount tier
  ADD COLUMN IF NOT EXISTS extra_seat_threshold  INTEGER;       -- seat count the discounted extra_seat_price kicks in after; NULL = no discount tier

INSERT INTO packages (
  code, name, monthly_price, annual_price, max_users, price_per_seat,
  monthly_item_limit, storage_limit_bytes, features, color, is_active, sort_order
) VALUES (
  'free', 'HuduFree', 0, 0, 1, 0,
  25, 1073741824, -- 1 GB
  '["Every module included","25 items / month","1 GB storage","1 user","Community support","Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)"]'::jsonb,
  '#6b7280', false, 0
)
ON CONFLICT (code) DO NOTHING;
