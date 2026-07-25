-- 112_seal_vehicle_link.sql
-- Cross-app link to HuduFreight (the Tracking app's GPS/vehicle fleet) —
-- a container gated in usually arrived on a haulier's truck, and once
-- released needs one to leave; this is one soft reference for "the vehicle
-- currently associated with this container's movement leg", not two
-- separate inbound/outbound legs (kept simple deliberately). Nullable,
-- ON DELETE SET NULL — a vehicle being deleted in Tracking must never
-- cascade into deleting SEAL container history.
ALTER TABLE seal_containers ADD COLUMN vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;
