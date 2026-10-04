-- Cycle counts: periodic physical inventory verification.
-- A count header lists which lots to count; count_lines hold the actual vs expected qty.
-- Executing a reconciliation posts ADJUST movements for every discrepancy.

CREATE TABLE seal_cycle_counts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  count_ref       VARCHAR(64)   NOT NULL,
  compartment_id  UUID          REFERENCES seal_compartments(id) ON DELETE SET NULL,
  status          VARCHAR(32)   NOT NULL DEFAULT 'OPEN',
  initiated_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  closed_by       UUID          REFERENCES users(id) ON DELETE SET NULL,
  initiated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT seal_cycle_counts_status_check CHECK (
    status IN ('OPEN','IN_PROGRESS','RECONCILING','CLOSED','CANCELLED')
  )
);

CREATE TABLE seal_count_lines (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id      UUID          NOT NULL REFERENCES seal_cycle_counts(id) ON DELETE CASCADE,
  lot_id        UUID          NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  system_qty    NUMERIC(18,4) NOT NULL,
  counted_qty   NUMERIC(18,4),
  variance_qty  NUMERIC(18,4) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
  counted_by    UUID          REFERENCES users(id) ON DELETE SET NULL,
  counted_at    TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX idx_seal_cycle_counts_tenant    ON seal_cycle_counts(tenant_id, initiated_at DESC);
CREATE INDEX idx_seal_count_lines_count      ON seal_count_lines(count_id);
CREATE INDEX idx_seal_count_lines_lot        ON seal_count_lines(lot_id);

ALTER TABLE seal_cycle_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_cycle_counts FORCE ROW LEVEL SECURITY;
CREATE POLICY seal_cycle_counts_tenant ON seal_cycle_counts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE seal_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_count_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY seal_count_lines_tenant ON seal_count_lines
  USING (
    count_id IN (
      SELECT id FROM seal_cycle_counts
      WHERE tenant_id = current_setting('app.tenant_id', true)::uuid
    )
  );
