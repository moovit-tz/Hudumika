-- Migration 002: Users, Customers, and Shipment Cases

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_tenant_unique UNIQUE (email, tenant_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  phone_wa VARCHAR(50),
  phone_wechat VARCHAR(50),
  category VARCHAR(50) NOT NULL DEFAULT 'sme',
  preferred_channel VARCHAR(50) NOT NULL DEFAULT 'WHATSAPP',
  tax_id VARCHAR(100),
  avatar_color VARCHAR(50),
  avatar_initials VARCHAR(10),
  assigned_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Core Shipment Cases (partitioned by created_at)
CREATE TABLE IF NOT EXISTS shipment_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ref_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  goods_desc TEXT NOT NULL,
  hs_code VARCHAR(50),
  containers JSONB NOT NULL DEFAULT '[]'::jsonb,
  bl_number VARCHAR(100),
  awb_number VARCHAR(100),
  vessel VARCHAR(255) NOT NULL,
  origin_port VARCHAR(100) NOT NULL,
  dest_port VARCHAR(100) NOT NULL,
  eta TIMESTAMPTZ,
  stage VARCHAR(50) NOT NULL DEFAULT 'DOCS_RECEIVED',
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  sla_deadline TIMESTAMPTZ,
  free_time_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipments_tenant ON shipment_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipments_customer ON shipment_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_shipments_stage ON shipment_cases(stage);
CREATE INDEX IF NOT EXISTS idx_shipments_assigned ON shipment_cases(assigned_to);

-- Partition definitions
CREATE TABLE IF NOT EXISTS shipment_cases_2026 PARTITION OF shipment_cases
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

CREATE TABLE IF NOT EXISTS shipment_cases_default PARTITION OF shipment_cases
  DEFAULT;

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_cases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Idempotent tenant isolation policies for core tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'users'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON users
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'customers'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON customers
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'shipment_cases'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON shipment_cases
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
