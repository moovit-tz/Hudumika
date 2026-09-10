-- CRM audit: customer_claim_codes (231_customer_claim_codes.sql) had zero
-- RLS at the database layer — missed by every retrofit pass since (it
-- predates none of them; 231 simply never added it in the first place, and
-- no later audit had this table in scope). Confirmed live against the dev
-- DB's pg_class: relrowsecurity/relforcerowsecurity were false before this
-- migration, unlike every sibling CRM table (customers, leads, quotations,
-- customer_credits, customer_assets, customer_product_prices).
--
-- customers.routes.ts issues codes scoped to the acting tenant via the
-- normal withTenant() connection — that's the app-level correctness this
-- backstops, not a substitute for it. org.routes.ts's claim-redemption path
-- reads this table via dbPlatform (the documented cross-tenant carve-out,
-- same shape as password_reset_tokens) precisely because an Organization
-- redeeming a code doesn't yet know which tenant issued it — FORCE RLS
-- here has no effect on that platform connection and closes the gap only
-- for the restricted app role, exactly as intended.

ALTER TABLE customer_claim_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_claim_codes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'customer_claim_codes'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON customer_claim_codes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
