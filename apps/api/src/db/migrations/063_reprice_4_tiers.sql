-- Migration 063: Reprice packages into 4 real tiers by employee band.
--
-- packages/types/src/user.ts's TenantPlan/PLAN_LEVELS and apps/web's
-- Subscription.tsx (/workspace/billing) and SuperAdmin.tsx (/admin/packages)
-- already assume exactly 4 tiers: starter(1) < growth(2) < scale(3) < enterprise(4).
-- The packages catalog seeded by 033_signup_onboarding.sql never caught up —
-- it still seeds starter/professional/enterprise, so 'professional' rows were
-- silently dropped by the frontend's code-keyed merge and growth/scale never
-- got real pricing. This migration replaces the seed with the 4 real codes.

-- Any tenant still on the legacy 'professional' alias moves to its real,
-- same-tier equivalent code (PLAN_LEVELS['professional'] === PLAN_LEVELS['scale'] === 3).
UPDATE tenants SET plan = 'scale' WHERE plan = 'professional';

DELETE FROM packages;

INSERT INTO packages (code, name, monthly_price, annual_price, max_users, features, color, popular, sort_order) VALUES
('starter', 'Starter', 29, 290, 5,
  '["0-5 employees — built for East African startups & entrepreneurs","Up to 5 users","10 GB storage","50 shipments / month","Basic shipment tracking","TANCIS integration","Email support","Local mobile money (M-Pesa, Tigo Pesa, Airtel Money)"]'::jsonb,
  '#0891b2', false, 1),
('growth', 'Growth', 99, 990, 20,
  '["6-20 employees — for growing logistics & trading teams","Up to 20 users","50 GB storage","250 shipments / month","Advanced tracking & alerts","Finance module (invoices, bills)","CRM & Leads","WhatsApp Bot","Priority 24h support"]'::jsonb,
  '#0d7a6b', true, 2),
('scale', 'Scale', 299, 2990, 99,
  '["21-99 employees — for established multi-branch operators","Up to 99 users","250 GB storage","1,000 shipments / month","Full API access","HR / People module","TANESW integration","Demurrage tracking","Custom reports","Multi-branch support"]'::jsonb,
  '#2563eb', false, 3),
('enterprise', 'Enterprise', 0, 0, 0,
  '["100+ employees — for large enterprises & financial institutions","Unlimited users","Unlimited storage","Unlimited shipments","Dedicated account manager","24/7 phone & WhatsApp support","Custom integrations (core banking APIs)","White-label option","99.99% SLA guarantee","On-premise / private cloud option"]'::jsonb,
  '#6e40c9', false, 4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  annual_price = EXCLUDED.annual_price,
  max_users = EXCLUDED.max_users,
  features = EXCLUDED.features,
  color = EXCLUDED.color,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = NOW();
