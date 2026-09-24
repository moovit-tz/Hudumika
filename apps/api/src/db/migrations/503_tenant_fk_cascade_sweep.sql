-- 503_tenant_fk_cascade_sweep.sql
-- Migrations 500-502 fixed the tenant_id foreign keys that blocked deleting a
-- tenant one at a time as tests hit them. A sweep of information_schema found
-- the remaining ones on tenant-scoped tables (accounting_entities, carriers,
-- freight_bookings, payment_methods, platform_support_*, subscription_invoices,
-- user_totp, ...) still defaulting to NO ACTION, so DELETE FROM tenants failed
-- for any tenant with a row in any of them. Every other tenant-scoped table
-- cascades; these now do too.
--
-- Deliberately NOT touched: platform_activity_log, whose ON DELETE SET NULL
-- keeps the audit row when its tenant is removed.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'tenant_id'
      AND ccu.table_name = 'tenants'
      AND rc.delete_rule = 'NO ACTION'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE', r.table_name, r.constraint_name);
  END LOOP;
END $$;
