-- Escalations.tsx (Bliss) was a real, polished-looking page that stored
-- every escalation entirely in the current browser's localStorage — no
-- table, no route, ever existed for it. A junior officer escalating a case
-- on their machine was invisible to a senior on a different machine, which
-- defeats the entire point of the page: getting a case in front of someone
-- else. shipment_cases can't be an FK target (it's date-partitioned — no
-- other table in this codebase FKs to it either; support_tickets stores
-- related shipments as a plain text[] for the same reason), so case_id is
-- a plain UUID with a denormalized case_ref/goods_desc, matching that
-- existing convention.
CREATE TABLE IF NOT EXISTS case_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID,
  case_ref VARCHAR(100) NOT NULL,
  goods_desc TEXT,
  reason VARCHAR(200) NOT NULL,
  note TEXT,
  escalated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  escalated_by_name VARCHAR(255) NOT NULL,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_escalations_tenant ON case_escalations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_case_escalations_escalated_by ON case_escalations(escalated_by);

ALTER TABLE case_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_escalations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'case_escalations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON case_escalations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
