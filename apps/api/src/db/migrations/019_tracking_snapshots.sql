-- AWB / BL Tracking Snapshots
CREATE TABLE IF NOT EXISTS tracking_snapshots (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id      UUID,
  tracking_type    VARCHAR(3)   NOT NULL,       -- 'AWB' | 'BL'
  tracking_number  VARCHAR(100) NOT NULL,
  carrier          VARCHAR(150),
  origin_name      VARCHAR(300),
  origin_code      VARCHAR(20),
  dest_name        VARCHAR(300),
  dest_code        VARCHAR(20),
  current_location VARCHAR(300),
  status           VARCHAR(100),
  status_code      VARCHAR(50),
  eta              TIMESTAMPTZ,
  progress_pct     INTEGER DEFAULT 0,
  events           JSONB   DEFAULT '[]',
  share_token      VARCHAR(64) UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_by       UUID    REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_tenant   ON tracking_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ts_shipment ON tracking_snapshots(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ts_number   ON tracking_snapshots(tracking_type, tracking_number);
CREATE INDEX IF NOT EXISTS idx_ts_share    ON tracking_snapshots(share_token);
