ALTER TABLE seal_appointments
  ADD COLUMN vehicle_plate VARCHAR(40),
  ADD COLUMN driver_name VARCHAR(200),
  ADD COLUMN notes TEXT;
ALTER TABLE seal_appointments DROP CONSTRAINT seal_appointments_status_check;
ALTER TABLE seal_appointments ADD CONSTRAINT seal_appointments_status_check
  CHECK (status IN ('SCHEDULED','CHECKED_IN','AT_DOCK','COMPLETED','CANCELLED','NO_SHOW'));
