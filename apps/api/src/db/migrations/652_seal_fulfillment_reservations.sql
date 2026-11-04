-- Reservations belong to fulfillment lines so old unreserved orders cannot
-- consume stock promised to a newer order, and cancellation can release exactly its own allocation.
ALTER TABLE seal_fulfillment_lines ADD COLUMN reserved_qty NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0);
