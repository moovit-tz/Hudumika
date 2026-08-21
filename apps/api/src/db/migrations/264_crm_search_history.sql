-- ============================================================
-- 264 — CRM customer/lead search history, same shape and reasoning
--        as 099_comply_brela_search_history.sql: every real search
--        logged (who searched what, how many results), so a tenant
--        can see its own search activity rather than it vanishing
--        once the picker closes. Backs CustomerLeadPicker.tsx
--        (Landed Cost / LCL / Air / Transit calculators' "Company /
--        Customer Name" field).
-- ============================================================

CREATE TABLE crm_search_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  searched_by   UUID        NOT NULL,
  query         TEXT        NOT NULL,
  result_count  INT         NOT NULL DEFAULT 0,
  -- Where the search happened — CustomerLeadPicker's own `source` prop
  -- ("LCL Calculator", "Air Freight Calculator", etc.), same value it
  -- already records on a lead created from that search.
  source        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_search_history_tenant ON crm_search_history(tenant_id, created_at DESC);

ALTER TABLE crm_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_search_history FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_crm_search_history ON crm_search_history
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
