-- Lot corrections have their own history; physical movements remain immutable.
CREATE TABLE seal_lot_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lot_id UUID NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX seal_lot_revisions_lot ON seal_lot_revisions(tenant_id, lot_id, created_at DESC);
ALTER TABLE seal_lot_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_lot_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY seal_lot_revisions_tenant ON seal_lot_revisions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
