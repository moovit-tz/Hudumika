-- Migration 034: Update packages to the 4-tier model (Starter, Growth, Scale, Enterprise)

-- Delete old packages (Professional) and re-insert the new ones to handle constraints easily.
DELETE FROM packages;

INSERT INTO packages (code, name, monthly_price, annual_price, max_users, features, color, popular, sort_order) VALUES
('starter',      'Starter',      29,  290,  5, '["Up to 5 users","10 GB storage","Basic shipment tracking","Email support","Local mobile money integration"]'::jsonb, '#2563eb', false, 1),
('growth',       'Growth',       99,  990,  20, '["Up to 20 users","50 GB storage","Advanced tracking & alerts","Priority 24h support","Finance module","Basic CRM"]'::jsonb, '#0d9488', true, 2),
('scale',        'Scale',        299, 2990, 99, '["Up to 99 users","250 GB storage","Full API access","Custom reports","HRM module","Demurrage tracking"]'::jsonb, '#4f46e5', false, 3),
('enterprise',   'Enterprise',   999, 9990, 0,  '["Unlimited users","Unlimited storage","Dedicated account manager","SLA guarantee","White-label option","Core banking APIs"]'::jsonb, '#6e40c9', false, 4)
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  max_users = EXCLUDED.max_users,
  features = EXCLUDED.features,
  color = EXCLUDED.color,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order;
