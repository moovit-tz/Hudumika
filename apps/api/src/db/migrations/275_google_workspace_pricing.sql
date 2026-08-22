-- Migration 275: Google Workspace-style per-seat pricing and consolidated plans (HuduStarter, HuduPlus, Hudu Advanced).

-- Deactivate the retired 'scale' plan
UPDATE packages SET is_active = false, updated_at = NOW() WHERE code = 'scale';

-- Move any tenants currently on 'scale' to 'growth' (HuduPlus)
UPDATE tenants SET plan = 'growth', updated_at = NOW() WHERE plan = 'scale';

-- Update/Upsert the three consolidated packages with the new per-seat prices and features
INSERT INTO packages (code, name, monthly_price, annual_price, max_users, price_per_seat, monthly_item_limit, features, color, popular, sort_order, is_active) VALUES
(
  'starter',
  'HuduStarter',
  6.00,   -- Single seat price (monthly)
  60.00,  -- Single seat price (annual, $5/mo equivalent)
  300,    -- Max users cap matching standard limits
  6.00,   -- price_per_seat
  100,    -- monthly_item_limit
  '["Every module included", "100 items / month", "10 GB storage", "Basic shipment tracking", "TANCIS integration", "Email support", "Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)"]'::jsonb,
  '#e8461a',
  false,
  1,
  true
),
(
  'growth',
  'HuduPlus',
  18.00,  -- Single seat price (monthly)
  180.00, -- Single seat price (annual, $15/mo equivalent)
  300,    -- Max users cap matching standard limits
  18.00,  -- price_per_seat
  500,    -- monthly_item_limit
  '["Every module included", "500 items / month", "50 GB storage", "Advanced tracking & alerts", "WhatsApp Bot", "Priority 24h support"]'::jsonb,
  '#e8461a',
  true,
  2,
  true
),
(
  'enterprise',
  'Hudu Advanced',
  0.00,
  0.00,
  0,
  NULL,
  NULL,
  '["Every module included", "Unlimited items / month", "Unlimited storage", "Dedicated account manager", "24/7 phone & WhatsApp support", "Custom integrations (core banking APIs)", "White-label option", "99.99% SLA guarantee", "Metered option shared per quotation"]'::jsonb,
  '#e8461a',
  false,
  3,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  max_users = EXCLUDED.max_users,
  price_per_seat = EXCLUDED.price_per_seat,
  monthly_item_limit = EXCLUDED.monthly_item_limit,
  features = EXCLUDED.features,
  color = EXCLUDED.color,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
