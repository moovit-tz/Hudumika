-- Migration 017: Shipment Notes, Participant Customers, and Tags

-- ── Internal Notes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_notes (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id  UUID         NOT NULL,
  author_id    VARCHAR(255) NOT NULL,
  author_name  VARCHAR(255) NOT NULL,
  content      TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ship_notes_ship   ON shipment_notes(shipment_id);
CREATE INDEX IF NOT EXISTS idx_ship_notes_tenant ON shipment_notes(tenant_id);

-- ── Participant Customers ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shipment_participant_customers (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id  UUID         NOT NULL,
  customer_id  UUID         NOT NULL,
  added_by     VARCHAR(255),
  wa_enabled   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(shipment_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_spc_ship   ON shipment_participant_customers(shipment_id);
CREATE INDEX IF NOT EXISTS idx_spc_tenant ON shipment_participant_customers(tenant_id);

-- ── Tags (on shipment) ────────────────────────────────────────────────────────
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
