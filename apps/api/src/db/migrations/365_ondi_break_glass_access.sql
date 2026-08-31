-- Dual-control / break-glass access requests (Ondi M8-lite) — the scoped,
-- real slice of the OneID vision docs' "6-tier access pyramid / dual-
-- control break-glass" concept. Extends the existing single-approval
-- access-request flow (ondi_org_access_requests) with an approval quorum:
-- required_approvals=1 (the new default) behaves exactly like every
-- existing row and every existing request, unchanged. A break-glass
-- request sets required_approvals=2 so no single admin can grant
-- themselves or a colleague emergency access alone, and always carries an
-- expires_in_hours so the grant it produces (via migration 364's
-- expires_at) is never permanent.
ALTER TABLE ondi_org_access_requests ADD COLUMN break_glass BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ondi_org_access_requests ADD COLUMN required_approvals SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE ondi_org_access_requests ADD COLUMN expires_in_hours INTEGER NULL;

-- One row per distinct approver's decision on a request. UNIQUE(request_id,
-- approver_id) is the actual dual-control enforcement — the same admin
-- cannot supply both of the two approvals a break-glass request needs.
CREATE TABLE IF NOT EXISTS ondi_org_access_request_approvals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id   UUID NOT NULL REFERENCES ondi_org_access_requests(id) ON DELETE CASCADE,
  approver_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision     VARCHAR(10) NOT NULL, -- 'approve' | 'deny'
  reason       TEXT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, approver_id)
);
CREATE INDEX IF NOT EXISTS idx_ondi_access_approvals_request ON ondi_org_access_request_approvals(request_id);

ALTER TABLE ondi_org_access_request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ondi_org_access_request_approvals FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ondi_org_access_request_approvals'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ondi_org_access_request_approvals
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
