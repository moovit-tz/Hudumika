-- Migration 704: safe retries for trip dispatch (ClearOS → HuduFreight
-- shipment handoff boundary).
--
-- POST /v1/tracking/trips (fleetOps.routes.ts) is a plain INSERT with no
-- dedup check at all — calling it twice with the same shipment_id (a
-- client retry after a timeout, a double-click, or — once this workflow
-- is ever split across services — a queue/HTTP retry) creates two trips
-- for the same shipment. A natural-key constraint on shipment_id alone
-- would be wrong: one shipment can legitimately need multiple trips
-- (multi-leg transport), so this is a genuine idempotency key, the same
-- pattern billing_webhook_events already uses elsewhere in this codebase —
-- the caller states "this is retry/attempt N of the same dispatch
-- request," not "this shipment can only ever have one trip."

ALTER TABLE trips ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_tenant_idempotency_key
  ON trips (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
