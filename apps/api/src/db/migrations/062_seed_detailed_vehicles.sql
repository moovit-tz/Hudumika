-- Migration 062: Seed Detailed Vehicles (Tanzanian Fleet)

DO $$
DECLARE
    v_tenant_id UUID;
    v_vendor_id UUID;
    v_scania_id UUID;
    v_howo_id UUID;
    v_toyota_id UUID;
    v_driver_juma UUID;
    v_driver_ally UUID;
BEGIN
    -- Assume we are seeding for the first active tenant (Msomi Freight)
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    IF v_tenant_id IS NULL THEN RETURN; END IF;

    -- Create a Vendor for Maintenance/Fuel
    INSERT INTO vehicle_vendors (tenant_id, name, vendor_type, phone) 
    VALUES (v_tenant_id, 'Puma Energy DSM', 'FUEL_STATION', '+255700000001')
    RETURNING id INTO v_vendor_id;

    -- Insert Drivers
    INSERT INTO drivers (tenant_id, name, phone, license_number, status)
    VALUES (v_tenant_id, 'Juma Kassim', '+255711111111', 'TZ-DL-908123', 'ACTIVE')
    RETURNING id INTO v_driver_juma;

    INSERT INTO drivers (tenant_id, name, phone, license_number, status)
    VALUES (v_tenant_id, 'Ally Salim', '+255722222222', 'TZ-DL-456789', 'ACTIVE')
    RETURNING id INTO v_driver_ally;

    -- Insert Vehicles
    INSERT INTO vehicles (tenant_id, name, plate_number, type, device_id, vin, year, make, model, trim, color, mileage_km)
    VALUES (v_tenant_id, 'Truck 01 (Dar-Moshi)', 'T 845 ABC', 'TRUCK', 'DEV-T845', 'SCN983471092348', 2020, 'Scania', 'R450', 'Highline', 'White', 125000.5)
    RETURNING id INTO v_scania_id;

    INSERT INTO vehicles (tenant_id, name, plate_number, type, device_id, vin, year, make, model, trim, color, mileage_km)
    VALUES (v_tenant_id, 'Truck 02 (Dar-Mwanza)', 'T 120 CDE', 'TRUCK', 'DEV-T120', 'HOWO837482374', 2021, 'Howo', 'Sinotruk 371', 'Standard', 'Red', 85000.0)
    RETURNING id INTO v_howo_id;

    INSERT INTO vehicles (tenant_id, name, plate_number, type, device_id, vin, year, make, model, trim, color, mileage_km)
    VALUES (v_tenant_id, 'Van 01 (City Delivery)', 'T 999 ZZZ', 'VAN', 'DEV-T999', 'TOY23487293847', 2019, 'Toyota', 'Hiace', 'GL', 'Silver', 210000.0)
    RETURNING id INTO v_toyota_id;

    -- Assign Drivers
    UPDATE drivers SET assigned_vehicle_id = v_scania_id WHERE id = v_driver_juma;
    UPDATE drivers SET assigned_vehicle_id = v_howo_id WHERE id = v_driver_ally;

    -- Insert Positions (Last Known Locations)
    INSERT INTO vehicle_positions (vehicle_id, tenant_id, latitude, longitude, speed, heading)
    VALUES (v_scania_id, v_tenant_id, -6.8235, 39.2695, 45.2, 180); -- Dar
    INSERT INTO vehicle_positions (vehicle_id, tenant_id, latitude, longitude, speed, heading)
    VALUES (v_howo_id, v_tenant_id, -2.5165, 32.9000, 60.5, 90); -- Mwanza

    -- Insert Trips
    INSERT INTO trips (tenant_id, vehicle_id, driver_id, origin, destination, status, distance_km)
    VALUES (v_tenant_id, v_scania_id, v_driver_juma, 'Dar es Salaam Port', 'Moshi', 'IN_PROGRESS', 550.0);

    -- Insert Fuel Logs
    INSERT INTO fuel_logs (tenant_id, vehicle_id, driver_id, liters, cost, odometer_km, station, vendor_id)
    VALUES (v_tenant_id, v_scania_id, v_driver_juma, 300, 850000, 124500, 'Puma Energy DSM', v_vendor_id);
    INSERT INTO fuel_logs (tenant_id, vehicle_id, driver_id, liters, cost, odometer_km, station, vendor_id)
    VALUES (v_tenant_id, v_scania_id, v_driver_juma, 250, 710000, 122000, 'Puma Energy Morogoro', NULL);

    -- Insert Maintenance Records
    INSERT INTO maintenance_records (tenant_id, vehicle_id, vendor_id, service_type, description, cost, odometer_km, service_date, next_due_date)
    VALUES (v_tenant_id, v_scania_id, v_vendor_id, 'Full Service', 'Oil change, filter replacement, brake check', 1200000, 115000, CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE + INTERVAL '60 days');

    -- Insert Expenses (For Cost of Ownership)
    INSERT INTO vehicle_expenses (tenant_id, vehicle_id, category, description, amount, expense_date)
    VALUES (v_tenant_id, v_scania_id, 'TOLL', 'Morogoro Toll Plaza', 15000, CURRENT_DATE - INTERVAL '2 days');
    INSERT INTO vehicle_expenses (tenant_id, vehicle_id, category, description, amount, expense_date)
    VALUES (v_tenant_id, v_scania_id, 'WASH', 'Truck Wash DSM', 30000, CURRENT_DATE - INTERVAL '5 days');

    -- Insert Issues
    INSERT INTO vehicle_issues (tenant_id, vehicle_id, title, description, severity, status)
    VALUES (v_tenant_id, v_scania_id, 'Brake light out', 'Rear left brake light needs replacement', 'LOW', 'OPEN');
    INSERT INTO vehicle_issues (tenant_id, vehicle_id, title, description, severity, status)
    VALUES (v_tenant_id, v_scania_id, 'Engine warning light', 'Check engine light came on during last trip', 'HIGH', 'OPEN');

    -- Insert Reminders
    INSERT INTO fleet_reminders (tenant_id, vehicle_id, title, reminder_type, due_date, status)
    VALUES (v_tenant_id, v_scania_id, 'Insurance Renewal', 'DOCUMENT', CURRENT_DATE + INTERVAL '15 days', 'PENDING');
    INSERT INTO fleet_reminders (tenant_id, vehicle_id, title, reminder_type, due_date, status)
    VALUES (v_tenant_id, v_scania_id, 'Tire Rotation', 'MAINTENANCE', CURRENT_DATE + INTERVAL '5 days', 'PENDING');

END $$;
