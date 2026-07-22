-- CargoTracker + Demurrage merge: the one real schema gap needed to bridge
-- the two features is a persisted "original ETA" on tracking_snapshots.
-- Tracker.tsx already computes a delay badge from eta vs eta_initial, but
-- eta_initial only ever existed on the live/mock provider response — it was
-- never written to the row, so no historical ETA-deviation analytics were
-- possible. Captured once on snapshot creation and never overwritten on
-- retrack (see tracker.routes.ts), this becomes the basis for carrier/lane
-- reliability analytics on the merged dashboard.
ALTER TABLE tracking_snapshots ADD COLUMN IF NOT EXISTS eta_initial TIMESTAMPTZ;

-- Backfill: for existing rows, eta_initial is unknown (never captured), so
-- leave NULL rather than guessing — analytics queries treat NULL eta_initial
-- as "no deviation data available" and exclude the row rather than skew it.
