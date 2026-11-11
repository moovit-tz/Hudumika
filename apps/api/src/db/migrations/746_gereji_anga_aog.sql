-- Gereji port, Milestone 4: ANGA AOG (Aircraft On Ground) case & SLA engine.
-- Ported from the standalone app's anga_aog_case/anga_aog_milestone_event/
-- anga_aog_pause_event tables and its pure lib/anga/aog-milestones.ts +
-- lib/anga/aog-sla.ts (ported verbatim in apps/api/src/lib/, including the
-- source app's own 17 + 10 unit tests). Real RLS + FORCE RLS from the start.

CREATE TABLE gereji_anga_aog_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_id UUID REFERENCES gereji_anga_rfqs(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES gereji_anga_customers(id) ON DELETE SET NULL,
  aircraft_reg TEXT,
  aircraft_type TEXT,
  operator TEXT,
  station TEXT,
  pn_required TEXT,
  criticality TEXT NOT NULL DEFAULT 'high' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  assigned_officer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  current_milestone TEXT NOT NULL DEFAULT 'REQUEST_RECEIVED' CHECK (current_milestone IN (
    'REQUEST_RECEIVED', 'PART_LOCATED', 'QUOTE_ISSUED', 'CUSTOMER_APPROVED', 'PO_PLACED',
    'COLLECTED', 'IN_FLIGHT', 'LANDED', 'CUSTOMS_CLEARED', 'DELIVERED'
  )),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_resolution_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_aog_cases_milestone ON gereji_anga_aog_cases(tenant_id, current_milestone);

CREATE TABLE gereji_anga_aog_milestone_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES gereji_anga_aog_cases(id) ON DELETE CASCADE,
  milestone TEXT NOT NULL,
  reached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_aog_milestone_events_case ON gereji_anga_aog_milestone_events(tenant_id, case_id);

CREATE TABLE gereji_anga_aog_pause_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES gereji_anga_aog_cases(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('AWAITING_CUSTOMER', 'PUBLIC_HOLIDAY', 'CARRIER_DELAY', 'CUSTOMS_QUERY')),
  paused_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gereji_anga_aog_pause_events_case ON gereji_anga_aog_pause_events(tenant_id, case_id);
-- At most one OPEN pause (resumed_at IS NULL) per case at a time.
CREATE UNIQUE INDEX idx_gereji_anga_aog_pause_events_one_open ON gereji_anga_aog_pause_events(case_id) WHERE resumed_at IS NULL;

ALTER TABLE gereji_anga_aog_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_aog_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_aog_cases;
CREATE POLICY tenant_isolation_policy ON gereji_anga_aog_cases
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_aog_milestone_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_aog_milestone_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_aog_milestone_events;
CREATE POLICY tenant_isolation_policy ON gereji_anga_aog_milestone_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE gereji_anga_aog_pause_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gereji_anga_aog_pause_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON gereji_anga_aog_pause_events;
CREATE POLICY tenant_isolation_policy ON gereji_anga_aog_pause_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
