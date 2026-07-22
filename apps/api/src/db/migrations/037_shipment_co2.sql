-- Migration 037: Add CO2 Emissions and Carbon Credits to Shipment Cases

ALTER TABLE shipment_cases
ADD COLUMN IF NOT EXISTS co2_emissions_kg NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS carbon_credits_saved NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS co2_calc_details JSONB;
