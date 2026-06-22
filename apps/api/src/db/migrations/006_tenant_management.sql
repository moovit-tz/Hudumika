-- Migration 006: Tenant Management

CREATE TABLE IF NOT EXISTS tenant_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'starter',
  billing_address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  logo_url TEXT,
  primary_color VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on tenant_companies
ALTER TABLE tenant_companies ENABLE ROW LEVEL SECURITY;

-- Create RLS policy if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_companies'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_companies
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Policy already created above (idempotent)
