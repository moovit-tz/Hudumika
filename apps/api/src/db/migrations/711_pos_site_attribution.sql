-- Phase 3 of the Commerce scope ("multiple outlets and business points
-- operate under central policy") starts here: POS had no attribution to
-- the platform's own real multi-outlet hierarchy at all (tenant_entities/
-- tenant_sites, migration 641 — already consumed by CMS, Onsite, permit
-- engine, launch planner, renewal finance, enterprise metrics, org-model;
-- POS was simply never wired to it). Nullable/optional throughout — every
-- existing single-outlet tenant keeps working exactly as before; a tenant
-- that HAS set up tenant_sites can now attribute a register/sale to one.

ALTER TABLE pos_shifts ADD COLUMN site_id UUID REFERENCES tenant_sites(id) ON DELETE SET NULL;
ALTER TABLE pos_sales ADD COLUMN site_id UUID REFERENCES tenant_sites(id) ON DELETE SET NULL;

CREATE INDEX idx_pos_shifts_site ON pos_shifts (tenant_id, site_id) WHERE site_id IS NOT NULL;
CREATE INDEX idx_pos_sales_site ON pos_sales (tenant_id, site_id) WHERE site_id IS NOT NULL;
