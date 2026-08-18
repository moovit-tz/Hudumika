-- RLS hardening, phase 1 (security checklist #4). The app currently
-- connects as a superuser/BYPASSRLS role, so every policy below is inert
-- today — this migration fixes two real, independently-existing bugs that
-- become load-bearing once a restricted role is introduced in a later
-- migration:
--
--   1. 12 tables have RLS ENABLEd with zero policies defined. Under real
--      Postgres RLS semantics that's deny-all for any non-owner,
--      non-bypass role — currently invisible only because the app bypasses
--      RLS entirely.
--   2. 79 existing policies compare tenant_id to a bare
--      current_setting('app.tenant_id', true)::uuid with no NULLIF guard.
--      withTenant(null, ...) (platform-level queries) sets that session var
--      to '' — and ''::uuid raises a Postgres error, not a clean empty
--      result. 28 other policies already guard this correctly; this makes
--      every policy in the database consistent with that safe form.
--
-- Neither change alters app behavior today (still running as a bypass
-- role) — this is pure correctness, done ahead of the connection-role
-- change so that change isn't the moment these bugs are discovered.

-- ── Part 1: add real policies to the 12 tables that have none ──────────────

-- Direct tenant_id column (9 tables) — the standard pattern.
CREATE POLICY tenant_isolation_payroll_tax_bands ON payroll_tax_bands
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payroll_contribution_schemes ON payroll_contribution_schemes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payroll_component_types ON payroll_component_types
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payroll_employee_components ON payroll_employee_components
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payroll_runs ON payroll_runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payroll_payslips ON payroll_payslips
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_hr_leave_types ON hr_leave_types
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_hr_leave_balances ON hr_leave_balances
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_hr_overtime_requests ON hr_overtime_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- No tenant_id column of their own (3 tables) — scoped via their parent.
-- quotation_lines -> quotations (has tenant_id); consignment_trips and
-- border_crossings -> road_consignments (has tenant_id) directly.
CREATE POLICY tenant_isolation_quotation_lines ON quotation_lines
  USING (quotation_id IN (
    SELECT id FROM quotations
    WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
CREATE POLICY tenant_isolation_consignment_trips ON consignment_trips
  USING (consignment_id IN (
    SELECT id FROM road_consignments
    WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
CREATE POLICY tenant_isolation_border_crossings ON border_crossings
  USING (consignment_id IN (
    SELECT id FROM road_consignments
    WHERE tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));

-- ── Part 2: add the NULLIF guard to the 79 policies missing it ─────────────
-- Generated from a direct parse of every CREATE POLICY in migrations/*.sql
-- (apps/api/_tmp_rls_audit.mjs, run read-only, not checked in) — every row
-- below is an ALTER POLICY, so it only changes the USING clause; policy
-- name, table, and grants are untouched.

ALTER POLICY tenant_isolation_support_tickets ON support_tickets USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_support_messages ON support_messages USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_customer_assets ON customer_assets USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_knowledge_base ON knowledge_base USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_support_groups ON support_groups USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_support_views ON support_views USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_support_rules ON support_rules USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_invoice_notes ON invoice_notes USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_invoice_tasks ON invoice_tasks USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_invoice_reminders ON invoice_reminders USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_invoice_activity_log ON invoice_activity_log USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_products ON products USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_sso_providers ON sso_providers USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicles ON vehicles USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_positions ON vehicle_positions USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_geofence_events ON vehicle_geofence_events USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_drivers ON drivers USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_vendors ON vehicle_vendors USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_trips ON trips USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_maintenance_records ON maintenance_records USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_parts_stock ON parts_stock USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_fuel_logs ON fuel_logs USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_documents ON vehicle_documents USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_fleet_reminders ON fleet_reminders USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_driver_messages ON driver_messages USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_fleet_alerts ON fleet_alerts USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_warehouse_locations ON warehouse_locations USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_warehouse_dock_appointments ON warehouse_dock_appointments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_cargo_manifests ON cargo_manifests USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_cargo_items ON cargo_items USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_issues ON vehicle_issues USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_expenses ON vehicle_expenses USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_meter_readings ON vehicle_meter_readings USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_assignments ON vehicle_assignments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_issue_events ON vehicle_issue_events USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_vehicle_sensor_snapshots ON vehicle_sensor_snapshots USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_compartments ON seal_compartments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_zones ON seal_zones USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_locations ON seal_locations USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_lots ON seal_lots USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_movements ON seal_movements USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_guarantees ON seal_guarantees USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_bond_overrides ON seal_bond_overrides USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_consignments ON seal_consignments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_containers ON seal_containers USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_appointments ON seal_appointments USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_discrepancies ON seal_discrepancies USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_customs_entries ON seal_customs_entries USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_documents ON seal_documents USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_examinations ON seal_examinations USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_stock_account_periods ON seal_stock_account_periods USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_stock_account_lines ON seal_stock_account_lines USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_reefer_readings ON seal_reefer_readings USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_yard_slots ON seal_yard_slots USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_tasks ON seal_tasks USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_equipment ON seal_equipment USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_equip_maint ON seal_equipment_maintenance_records USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_sensor_devices ON seal_sensor_devices USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_sensor_readings ON seal_sensor_readings USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_automation_rules ON seal_automation_rules USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_automation_runs ON seal_automation_runs USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_fulfillment_orders ON seal_fulfillment_orders USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_fulfillment_lines ON seal_fulfillment_lines USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_warehouses ON inventory_warehouses USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_locations ON inventory_locations USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_items ON inventory_items USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_item_uoms ON inventory_item_uoms USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_movements ON inventory_movements USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_stock_levels ON inventory_stock_levels USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_count_sessions ON inventory_count_sessions USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_count_lines ON inventory_count_lines USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_inventory_tasks ON inventory_tasks USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_ledger_anchors ON seal_ledger_anchors USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_leads ON leads USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_domain_events ON domain_events USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_declaration_events ON declaration_events USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_declaration_ledger_anchors ON declaration_ledger_anchors USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_customer_product_prices ON customer_product_prices USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER POLICY tenant_isolation_seal_dispatch_requests ON seal_dispatch_requests USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
