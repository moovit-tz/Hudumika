-- "Performed by" on a maintenance record was free text with no picker ever
-- wired to it in the UI — the write path never sent it, so the column has
-- never held a real value (verified against live data: zero non-null rows).
-- Replacing it outright with a real FK to users rather than adding a second
-- column alongside a permanently-dead one.
ALTER TABLE seal_equipment_maintenance_records
  DROP COLUMN performed_by,
  ADD COLUMN performed_by_user_id UUID REFERENCES users(id);
