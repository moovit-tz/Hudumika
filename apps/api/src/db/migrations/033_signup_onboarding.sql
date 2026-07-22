-- Migration 033: Self-serve signup/onboarding — subdomains, packages, platform transactions

-- Tenants gain a subdomain (data only — no real DNS/routing in this dev app)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subdomain VARCHAR(63);
UPDATE tenants SET subdomain = slug WHERE subdomain IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_subdomain_unique') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_subdomain_unique UNIQUE (subdomain);
  END IF;
END $$;

-- Platform-wide package catalog (replaces the hardcoded price lists in Subscription.tsx / SuperAdmin.tsx)
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL,
  annual_price NUMERIC(10,2) NOT NULL,
  max_users INT NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  color VARCHAR(20),
  popular BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO packages (code, name, monthly_price, annual_price, max_users, features, color, popular, sort_order) VALUES
('starter',      'Starter',      49,  490,  10, '["Up to 10 users","5 GB storage","Basic shipment tracking","Email support","API access (limited)","Monthly reports"]'::jsonb, '#0891b2', false, 1),
('professional', 'Professional', 149, 1490, 50, '["Up to 50 users","50 GB storage","Advanced tracking & alerts","Priority support 24h","Full API access","Custom reports","Finance module","CRM & Leads"]'::jsonb, '#7c3aed', true, 2),
('enterprise',   'Enterprise',   399, 3990, 0,  '["Unlimited users","500 GB storage","Dedicated account manager","24/7 phone support","Custom integrations","White-label option","SLA guarantee","On-premise option"]'::jsonb, '#0d7a6b', false, 3)
ON CONFLICT (code) DO NOTHING;

-- Simulated platform subscription payments (distinct from tenant-scoped AR/invoice payments)
CREATE TABLE IF NOT EXISTS platform_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_code VARCHAR(50) NOT NULL,
  billing_cycle VARCHAR(10) NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  method VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  tx_ref VARCHAR(50) UNIQUE NOT NULL,
  payer_name VARCHAR(255),
  card_last4 VARCHAR(4),
  mobile_number VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
