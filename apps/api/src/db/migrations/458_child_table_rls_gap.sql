-- 458_child_table_rls_gap.sql
-- Production-readiness audit HUD-0003 (CRITICAL — tenant isolation, child tables).
--
-- Line-item / child tables that have no tenant_id of their own and had no RLS,
-- so hudumika_app could read every tenant's rows regardless of app.tenant_id.
-- Each belongs structurally to a tenant-scoped parent by a real FK; scope them
-- with an EXISTS check through that parent (same pattern as 296 / 440 / 455).
--
--   declaration_items        -> declarations (declaration_id)
--   declaration_attachments  -> declarations (declaration_id)
--   declaration_item_models  -> declaration_items -> declarations (item_id)
--   delivery_document_lines  -> delivery_documents (document_id)
--   tax_lines                -> declaration_notices (notice_id)
--   geofence_events          -> geofences (geofence_id)
--   hr_team_members          -> hr_teams (team_id)
--   comply_legal_messages    -> comply_legal_engagements (engagement_id, text tenant_id)
--   comply_legal_milestones  -> comply_legal_engagements (engagement_id, text tenant_id)
--
-- The reference / lookup tables in list D (hs_codes, sanctions_*, fx_rates,
-- port_tariff_items, trade_procedures*, reference_countries, tax_jurisdictions,
-- package*, comply_*_catalog/rules/directory, dangerous_goods_reference, …) are
-- deliberately global and are NOT touched — forcing RLS on them would blank
-- every tenant's reads. The platform / developer-portal tables (api_*, dev_*,
-- developer_*, marketplace_apps, lens_*, tenants, organizations, ondi_*_keys,
-- report_runs, query_builder_runs, workflow_templates) are tracked as HUD-0008
-- for a dedicated pass once the Developer app is past 15% scaffolding.

-- ── declarations children ──────────────────────────────────────────────────
ALTER TABLE declaration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON declaration_items;
CREATE POLICY tenant_isolation_policy ON declaration_items
  USING (EXISTS (SELECT 1 FROM declarations d WHERE d.id = declaration_items.declaration_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM declarations d WHERE d.id = declaration_items.declaration_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE declaration_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON declaration_attachments;
CREATE POLICY tenant_isolation_policy ON declaration_attachments
  USING (EXISTS (SELECT 1 FROM declarations d WHERE d.id = declaration_attachments.declaration_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM declarations d WHERE d.id = declaration_attachments.declaration_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

ALTER TABLE declaration_item_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaration_item_models FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON declaration_item_models;
CREATE POLICY tenant_isolation_policy ON declaration_item_models
  USING (EXISTS (SELECT 1 FROM declaration_items di JOIN declarations d ON d.id = di.declaration_id
                 WHERE di.id = declaration_item_models.item_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM declaration_items di JOIN declarations d ON d.id = di.declaration_id
                 WHERE di.id = declaration_item_models.item_id
                 AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- ── delivery_documents child ───────────────────────────────────────────────
ALTER TABLE delivery_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_document_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON delivery_document_lines;
CREATE POLICY tenant_isolation_policy ON delivery_document_lines
  USING (EXISTS (SELECT 1 FROM delivery_documents dd WHERE dd.id = delivery_document_lines.document_id
                 AND dd.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM delivery_documents dd WHERE dd.id = delivery_document_lines.document_id
                 AND dd.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- ── declaration_notices child ──────────────────────────────────────────────
ALTER TABLE tax_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tax_lines;
CREATE POLICY tenant_isolation_policy ON tax_lines
  USING (EXISTS (SELECT 1 FROM declaration_notices dn WHERE dn.id = tax_lines.notice_id
                 AND dn.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM declaration_notices dn WHERE dn.id = tax_lines.notice_id
                 AND dn.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- ── geofences child ────────────────────────────────────────────────────────
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON geofence_events;
CREATE POLICY tenant_isolation_policy ON geofence_events
  USING (EXISTS (SELECT 1 FROM geofences g WHERE g.id = geofence_events.geofence_id
                 AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM geofences g WHERE g.id = geofence_events.geofence_id
                 AND g.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- ── hr_teams child ─────────────────────────────────────────────────────────
ALTER TABLE hr_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_team_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_team_members;
CREATE POLICY tenant_isolation_policy ON hr_team_members
  USING (EXISTS (SELECT 1 FROM hr_teams t WHERE t.id = hr_team_members.team_id
                 AND t.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM hr_teams t WHERE t.id = hr_team_members.team_id
                 AND t.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid));

-- ── comply_legal_engagements children (parent tenant_id is text) ────────────
ALTER TABLE comply_legal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_legal_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_legal_messages;
CREATE POLICY tenant_isolation_policy ON comply_legal_messages
  USING (EXISTS (SELECT 1 FROM comply_legal_engagements e WHERE e.id = comply_legal_messages.engagement_id
                 AND e.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')))
  WITH CHECK (EXISTS (SELECT 1 FROM comply_legal_engagements e WHERE e.id = comply_legal_messages.engagement_id
                 AND e.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')));

ALTER TABLE comply_legal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_legal_milestones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_legal_milestones;
CREATE POLICY tenant_isolation_policy ON comply_legal_milestones
  USING (EXISTS (SELECT 1 FROM comply_legal_engagements e WHERE e.id = comply_legal_milestones.engagement_id
                 AND e.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')))
  WITH CHECK (EXISTS (SELECT 1 FROM comply_legal_engagements e WHERE e.id = comply_legal_milestones.engagement_id
                 AND e.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')));
