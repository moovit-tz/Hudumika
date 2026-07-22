-- Migration 072: real per-shipment WhatsApp bot connection flag. The
-- "WhatsApp Bot Active" toggle on the Shipment Detail sidebar previously
-- flipped a component-local boolean after a fake setTimeout — nothing was
-- ever persisted or reflected the shipment's real notification state.
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS whatsapp_bot_active BOOLEAN NOT NULL DEFAULT true;
