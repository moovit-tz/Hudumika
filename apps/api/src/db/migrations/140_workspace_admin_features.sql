-- 140_workspace_admin_features.sql
-- Backs the tenant Workspace admin console (/workspace/*: Settings, Utilities,
-- Reports, Subscription) whose Security/Payments/Billing/Support tabs and
-- several Settings.tsx sections previously rendered hardcoded fixture data
-- with no database behind them at all. Adds:
--   1. user_totp            — real per-user TOTP 2FA secrets
--   2. device_id on hr_devices' session — see ALTER below, for real "sign out
--      this session" support (hr_devices already exists from auth.routes.ts
--      recordLogin(), we're extending it rather than duplicating it)
--   3. payment_methods      — real stored payment method descriptors (never
--      raw PAN/CVC — those are validated then discarded, same convention as
--      integrations/payments.ts's simulateCharge)
--   4. subscription_invoices — real per-tenant platform subscription billing
--   5. invoice_sequences    — real atomic document-numbering counters,
--      replacing the `INV-${Date.now()}` / `PO-${Date.now()}` fallbacks
--   6. platform_support_tickets / platform_support_messages — tenant-admin
--      support tickets raised WITH Hudumika (the platform operator), distinct
--      from support_tickets which is the tenant's OWN customer-facing helpdesk

CREATE TABLE IF NOT EXISTS user_totp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  secret VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  backup_codes JSONB NOT NULL DEFAULT '[]',
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_totp_tenant ON user_totp(tenant_id);

-- Real per-session revocation: the JWT now carries the hr_devices row id that
-- was current at sign-in time (device_id claim); "Sign Out" this session sets
-- revoked_at, and apps/api/src/middleware/auth.ts checks it on every request.
ALTER TABLE hr_devices ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  created_by UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL DEFAULT 'card' CHECK (type IN ('card', 'mobile_money', 'bank')),
  label VARCHAR(120) NOT NULL,
  brand VARCHAR(30),
  last4 VARCHAR(4),
  exp_month SMALLINT,
  exp_year SMALLINT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant ON payment_methods(tenant_id);

CREATE TABLE IF NOT EXISTS subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  invoice_number VARCHAR(40) NOT NULL,
  plan_code VARCHAR(40) NOT NULL,
  seats INTEGER NOT NULL DEFAULT 1,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  amount NUMERIC(14,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  payment_method_id UUID REFERENCES payment_methods(id),
  tx_ref VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_tenant ON subscription_invoices(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_number ON subscription_invoices(tenant_id, invoice_number);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('invoice', 'quotation', 'purchase_order')),
  prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
  pad_length SMALLINT NOT NULL DEFAULT 4,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, doc_type)
);

CREATE TABLE IF NOT EXISTS platform_support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  ref_number VARCHAR(20) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_support_tickets_tenant ON platform_support_tickets(tenant_id);

CREATE TABLE IF NOT EXISTS platform_support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES platform_support_tickets(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  author_id UUID NOT NULL REFERENCES users(id),
  author_name VARCHAR(120) NOT NULL,
  is_platform_staff BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_support_messages_ticket ON platform_support_messages(ticket_id);
