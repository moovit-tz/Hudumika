-- 068_expand_cargo_manifests.sql

ALTER TABLE cargo_manifests
ADD COLUMN shipment_id UUID,
ADD COLUMN origin VARCHAR(300),
ADD COLUMN destination VARCHAR(300);
