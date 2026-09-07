-- Support.tsx's reply composer carried two dead toolbar buttons that were
-- really the same idea: "Canned responses / Macros" and "Insert snippet /
-- action" both amount to inserting a saved reply template, and no backend
-- concept of one existed anywhere in this codebase. Consolidated into one
-- real feature (Support.tsx keeps the single "Canned responses" button,
-- drops the redundant "Insert snippet/action" icon) backed by this table.
CREATE TABLE IF NOT EXISTS support_macros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_macros_tenant ON support_macros(tenant_id);

ALTER TABLE support_macros ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_macros FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'support_macros'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON support_macros
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
