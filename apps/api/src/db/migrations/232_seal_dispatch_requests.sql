-- 232_seal_dispatch_requests.sql
-- Cross-tenant SEAL dispatch requests (Organization portal, Phase B). An
-- org-authenticated session never writes to seal_lots/seal_fulfillment_orders
-- directly — no RLS backstop protects a hand-written cross-tenant query
-- mistake in this codebase (no FORCE ROW LEVEL SECURITY anywhere), so the
-- org can only ever create a same-tenant-owned *request* row here, in the
-- warehouse tenant's own data. Approval (seal-fulfillment.routes.ts) turns a
-- PENDING row into a real seal_fulfillment_orders draft through the exact
-- same insert POST /fulfillment-orders already performs — this table never
-- becomes the thing that moves stock. Status/decided_by/decided_at shape
-- copied from hr_delete_requests (040_hr_teams_invites_audit.sql), this
-- codebase's existing request->approve/reject precedent.
CREATE TABLE seal_dispatch_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id                UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  requested_by_org_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  qty_requested         NUMERIC(18,4) NOT NULL,
  note                  TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at            TIMESTAMPTZ,
  fulfillment_order_id  UUID REFERENCES seal_fulfillment_orders(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_seal_dispatch_requests_tenant ON seal_dispatch_requests(tenant_id, status);
CREATE INDEX idx_seal_dispatch_requests_lot ON seal_dispatch_requests(lot_id);
CREATE INDEX idx_seal_dispatch_requests_org ON seal_dispatch_requests(requested_by_org_id);

ALTER TABLE seal_dispatch_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_seal_dispatch_requests ON seal_dispatch_requests
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
