CREATE TABLE freight_pilot_invoice_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES freight_usage_pilot(tenant_id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL CHECK (period_end > period_start),
  snapshot JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start, period_end)
);

ALTER TABLE freight_pilot_invoice_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_pilot_invoice_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY freight_pilot_invoice_drafts_tenant ON freight_pilot_invoice_drafts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE UPDATE, DELETE ON freight_pilot_invoice_drafts FROM hudumika_app;
GRANT SELECT, INSERT ON freight_pilot_invoice_drafts TO hudumika_app;
