-- 065_cargo_truck_images.sql

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100);

-- Seed realistic cargo trucks for the default tenant
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
  
  IF v_tenant_id IS NOT NULL THEN
    -- Delete existing mock vehicles to replace them with high-quality seeded ones
    DELETE FROM vehicles WHERE tenant_id = v_tenant_id;

    INSERT INTO vehicles (tenant_id, name, plate_number, type, fuel_type, group_name, make, model, color, ownership, photo_url, current_load_pct, dimensions, status, device_id) VALUES
    (v_tenant_id, 'Volvo FH16 Globetrotter', 'T 452 ABD', 'TRUCK', 'DIESEL', 'Long Haul', 'Volvo', 'FH16', 'White', 'OWNED', 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?q=80&w=800&auto=format&fit=crop', 85, '13.6m x 2.4m x 2.7m', 'ON_ROUTE', 'DEV-VOLVO-01'),
    
    (v_tenant_id, 'Scania R500 V8', 'T 812 BCF', 'TRUCK', 'DIESEL', 'Regional', 'Scania', 'R500', 'Red', 'OWNED', 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?q=80&w=800&auto=format&fit=crop', 45, '12.5m x 2.5m x 3.0m', 'AVAILABLE', 'DEV-SCAN-01'),
    
    (v_tenant_id, 'MAN TGX 18.470', 'T 391 CVZ', 'TRUCK', 'DIESEL', 'International', 'MAN', 'TGX', 'Blue', 'LEASED', 'https://images.unsplash.com/photo-1586191552066-d52cdcbdb8cb?q=80&w=800&auto=format&fit=crop', 92, '13.6m x 2.5m x 2.8m', 'ON_ROUTE', 'DEV-MAN-01'),
    
    (v_tenant_id, 'Mercedes-Benz Actros', 'T 555 XYZ', 'TRUCK', 'DIESEL', 'Long Haul', 'Mercedes-Benz', 'Actros', 'Silver', 'OWNED', 'https://images.unsplash.com/photo-1616423640778-28d1b53229bd?q=80&w=800&auto=format&fit=crop', 100, '13.6m x 2.4m x 2.7m', 'ON_ROUTE', 'DEV-MB-01'),
    
    (v_tenant_id, 'Isuzu Giga 380', 'T 909 LMN', 'TRUCK', 'DIESEL', 'Regional', 'Isuzu', 'Giga', 'White', 'OWNED', 'https://images.unsplash.com/photo-1620603700010-47b8fb98dc67?q=80&w=800&auto=format&fit=crop', 0, '10.5m x 2.3m x 2.5m', 'OFF_DUTY', 'DEV-ISU-01'),
    
    (v_tenant_id, 'Freightliner Cascadia', 'T 111 QWE', 'TRUCK', 'DIESEL', 'Heavy Haul', 'Freightliner', 'Cascadia', 'Black', 'LEASED', 'https://images.unsplash.com/photo-1596700721200-a43063fcbc9e?q=80&w=800&auto=format&fit=crop', 60, '14.0m x 2.5m x 3.2m', 'AVAILABLE', 'DEV-FL-01');

  END IF;
END $$;
