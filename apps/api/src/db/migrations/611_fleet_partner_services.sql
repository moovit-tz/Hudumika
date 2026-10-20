ALTER TABLE vehicle_vendors ADD COLUMN service_capabilities text[] NOT NULL DEFAULT '{}';
ALTER TABLE vehicle_vendors ADD CONSTRAINT vehicle_vendors_services_limit CHECK (cardinality(service_capabilities) <= 18);
