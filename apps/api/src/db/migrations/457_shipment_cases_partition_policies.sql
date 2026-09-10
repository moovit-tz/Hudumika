-- 457_shipment_cases_partition_policies.sql
-- Production-readiness audit HUD-0002 (follow-up to 456).
--
-- 456 enabled+forced RLS on the shipment_cases leaf partitions but a policy on
-- the partitioned parent is NOT applied when a partition is addressed directly
-- (only through the parent). That left the partitions in default-deny on direct
-- access — safe, but flagged by the "RLS enabled, zero policies" check. The app
-- only ever queries the parent (Kysely table name "shipment_cases"), so this is
-- purely to make each partition self-consistent and pass the audit scan.

DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_cases_2026;
CREATE POLICY tenant_isolation_policy ON shipment_cases_2026
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_cases_default;
CREATE POLICY tenant_isolation_policy ON shipment_cases_default
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
