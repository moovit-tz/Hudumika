-- Migration 071: shipment_listeners — staff/customer contacts tagged to a
-- shipment for notifications ("Tag Staff" / "Add Customer" on the Shipment
-- Detail sidebar). Previously this only mutated a client-side mock store and
-- never persisted for real shipments, so tagging someone did nothing.
-- shipment_id has no FK constraint (matches stage_history/case_documents/etc.)
-- since shipment_cases is a partitioned table and Postgres can't enforce a
-- plain FK against it without a matching unique constraint on the partition key.
CREATE TABLE IF NOT EXISTS shipment_listeners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  shipment_id UUID NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('internal', 'customer')),
  user_id UUID,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(150),
  channels JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_shipment_listeners_shipment ON shipment_listeners(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_listeners_tenant ON shipment_listeners(tenant_id);
