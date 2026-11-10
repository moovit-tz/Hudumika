-- Cross-system identity linkage (Phase 3 follow-through): a Tuma parcel can
-- optionally be the last-mile leg of a ClearOS-cleared shipment. Nullable —
-- most Tuma parcels are standalone courier traffic with no ClearOS shipment
-- behind them at all. The platform's own commercial packaging
-- (677_industry_solution_catalogue.sql's 'logistics-tzs' bundle) already
-- sells Tuma + ClearOS + SEAL + tracking together as one package, so this is
-- a real, intended flow, not a speculative feature.
--
-- No FK here: shipment_cases is RANGE-partitioned on created_at with a
-- composite PRIMARY KEY (id, created_at) (002_core_tables.sql), so there is
-- no unique constraint on `id` alone for a plain FK to target — the same
-- reason every other cross-reference to it in this codebase (e.g.
-- container_tracking.shipment_id, road_consignments.shipment_id in
-- 005_demurrage_quotations_consignments.sql) is a bare UUID column, app-
-- validated against tenant_id at the call site instead of DB-enforced.
ALTER TABLE tuma_parcels
  ADD COLUMN IF NOT EXISTS shipment_case_id UUID;

CREATE INDEX IF NOT EXISTS idx_tuma_parcels_shipment_case ON tuma_parcels(shipment_case_id) WHERE shipment_case_id IS NOT NULL;
