-- Stock transfers: move lots between compartments / zones / slots.
-- Each transfer has a header (seal_stock_transfers) and one or more line items
-- (seal_transfer_lines). Executing a transfer calls SealService.recordMovement
-- for every line, so the movement is durable and in the hash chain.

CREATE TABLE seal_stock_transfers (
  id                  VARCHAR(64)     PRIMARY KEY,
  tenant_id           VARCHAR(64)     NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_ref        VARCHAR(64)     NOT NULL,
  from_compartment_id VARCHAR(64)     REFERENCES seal_compartments(id) ON DELETE SET NULL,
  to_compartment_id   VARCHAR(64)     REFERENCES seal_compartments(id) ON DELETE SET NULL,
  from_zone           VARCHAR(64),
  to_zone             VARCHAR(64),
  from_slot           VARCHAR(64),
  to_slot             VARCHAR(64),
  status              VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  requested_by        VARCHAR(64)     REFERENCES users(id) ON DELETE SET NULL,
  approved_by         VARCHAR(64)     REFERENCES users(id) ON DELETE SET NULL,
  executed_by         VARCHAR(64)     REFERENCES users(id) ON DELETE SET NULL,
  requested_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  expected_at         TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT seal_stock_transfers_status_check CHECK (
    status IN ('DRAFT','PENDING_APPROVAL','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED')
  )
);

CREATE TABLE seal_transfer_lines (
  id            VARCHAR(64)   PRIMARY KEY,
  transfer_id   VARCHAR(64)   NOT NULL REFERENCES seal_stock_transfers(id) ON DELETE CASCADE,
  lot_id        VARCHAR(64)   NOT NULL REFERENCES seal_lots(id) ON DELETE RESTRICT,
  qty_requested NUMERIC(18,4) NOT NULL CHECK (qty_requested > 0),
  qty_actual    NUMERIC(18,4),
  notes         TEXT
);

-- Indexes for common query patterns
CREATE INDEX idx_seal_stock_transfers_tenant  ON seal_stock_transfers(tenant_id, created_at DESC);
CREATE INDEX idx_seal_stock_transfers_status  ON seal_stock_transfers(tenant_id, status);
CREATE INDEX idx_seal_transfer_lines_transfer ON seal_transfer_lines(transfer_id);
CREATE INDEX idx_seal_transfer_lines_lot      ON seal_transfer_lines(lot_id);

-- RLS
ALTER TABLE seal_stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_stock_transfers FORCE ROW LEVEL SECURITY;

CREATE POLICY seal_stock_transfers_tenant_isolation ON seal_stock_transfers
  USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE seal_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE seal_transfer_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY seal_transfer_lines_tenant_isolation ON seal_transfer_lines
  USING (
    transfer_id IN (
      SELECT id FROM seal_stock_transfers
      WHERE tenant_id = current_setting('app.tenant_id', true)
    )
  );
