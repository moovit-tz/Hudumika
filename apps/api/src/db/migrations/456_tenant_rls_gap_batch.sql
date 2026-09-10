-- 456_tenant_rls_gap_batch.sql
-- Production-readiness audit HUD-0001 (CRITICAL — tenant isolation).
--
-- 79 tables carry a tenant_id column but had NO row-level security,
-- so the restricted app role (hudumika_app) could read and write every tenant's
-- rows once app.tenant_id was set to ANY value. Verified live against the
-- running database: acting as tenant A, an unqualified "select count(*)"
-- returned every tenant's rows on email_outbox, email_messages, hr_login_history,
-- hr_devices, tenant_settings, tenant_usage_counters, api_usage_events,
-- data_quality_findings, org_permissions, landed_cost_records, comply_* and
-- shipment_* tables.
--
-- Fix: the platform's standard tenant_isolation_policy (same shape as migrations
-- 242 / 245 / 296 / 440 / 455). Fail-closed when app.tenant_id is unset
-- (NULLIF(...,'') -> NULL -> zero rows, writes rejected), and unaffected by the
-- BYPASSRLS dbPlatform connection used for every audited cross-tenant / platform
-- call site (CMS platform pages, usage metering rollups, auth-middleware device
-- checks, SuperAdmin consoles).
--
-- Access-path review before enabling: every table below is reached only via
-- withTenant() (app.tenant_id set, tenant_id in the row = that value) or via
-- dbPlatform (BYPASSRLS). Login/device/lockout writes to hr_login_history and
-- hr_devices run inside withTenant(tenantId, ...). CMS null-tenant platform
-- pages are read/written only through dbPlatform.
--
-- 12 comply_* / cms_* tables store tenant_id as text (uuid-format strings) rather
-- than uuid — a pre-existing schema inconsistency (logged HUD-0007); the policy
-- compares text-to-text for those so it still keys off app.tenant_id correctly.

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON announcements;
CREATE POLICY tenant_isolation_policy ON announcements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON api_keys;
CREATE POLICY tenant_isolation_policy ON api_keys
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE api_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON api_usage_events;
CREATE POLICY tenant_isolation_policy ON api_usage_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE carriers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON carriers;
CREATE POLICY tenant_isolation_policy ON carriers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE clearos_rate_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearos_rate_card_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON clearos_rate_card_items;
CREATE POLICY tenant_isolation_policy ON clearos_rate_card_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE cms_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_comments;
CREATE POLICY tenant_isolation_policy ON cms_comments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_pages;
CREATE POLICY tenant_isolation_policy ON cms_pages
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE cms_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_posts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_posts;
CREATE POLICY tenant_isolation_policy ON cms_posts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE compliance_check_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_check_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON compliance_check_log;
CREATE POLICY tenant_isolation_policy ON compliance_check_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE compliance_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_outcomes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON compliance_outcomes;
CREATE POLICY tenant_isolation_policy ON compliance_outcomes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE comply_agency_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_agency_syncs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_agency_syncs;
CREATE POLICY tenant_isolation_policy ON comply_agency_syncs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_applications;
CREATE POLICY tenant_isolation_policy ON comply_applications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_brela_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_brela_search_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_brela_search_history;
CREATE POLICY tenant_isolation_policy ON comply_brela_search_history
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_certificates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_certificates;
CREATE POLICY tenant_isolation_policy ON comply_certificates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_legal_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_legal_engagements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_legal_engagements;
CREATE POLICY tenant_isolation_policy ON comply_legal_engagements
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_obligations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_obligations;
CREATE POLICY tenant_isolation_policy ON comply_obligations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_profiles;
CREATE POLICY tenant_isolation_policy ON comply_profiles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_reminders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_reminders;
CREATE POLICY tenant_isolation_policy ON comply_reminders
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE comply_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE comply_renewals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON comply_renewals;
CREATE POLICY tenant_isolation_policy ON comply_renewals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));

ALTER TABLE complyos_marketplace_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE complyos_marketplace_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON complyos_marketplace_requests;
CREATE POLICY tenant_isolation_policy ON complyos_marketplace_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE customs_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE customs_penalties FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON customs_penalties;
CREATE POLICY tenant_isolation_policy ON customs_penalties
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE data_quality_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quality_findings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON data_quality_findings;
CREATE POLICY tenant_isolation_policy ON data_quality_findings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_messages;
CREATE POLICY tenant_isolation_policy ON email_messages
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_outbox;
CREATE POLICY tenant_isolation_policy ON email_outbox
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON email_templates;
CREATE POLICY tenant_isolation_policy ON email_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE freight_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON freight_bookings;
CREATE POLICY tenant_isolation_policy ON freight_bookings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE freight_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_rate_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON freight_rate_cards;
CREATE POLICY tenant_isolation_policy ON freight_rate_cards
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON geofences;
CREATE POLICY tenant_isolation_policy ON geofences
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_activity_log;
CREATE POLICY tenant_isolation_policy ON hr_activity_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_clock_breaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_clock_breaks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_clock_breaks;
CREATE POLICY tenant_isolation_policy ON hr_clock_breaks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_clock_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_clock_sessions;
CREATE POLICY tenant_isolation_policy ON hr_clock_sessions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_compensation_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_compensation_components FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_compensation_components;
CREATE POLICY tenant_isolation_policy ON hr_compensation_components
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_cost_centers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_cost_centers;
CREATE POLICY tenant_isolation_policy ON hr_cost_centers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_departments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_departments;
CREATE POLICY tenant_isolation_policy ON hr_departments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_devices;
CREATE POLICY tenant_isolation_policy ON hr_devices
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_document_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_document_templates;
CREATE POLICY tenant_isolation_policy ON hr_document_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_emergency_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_emergency_contacts;
CREATE POLICY tenant_isolation_policy ON hr_emergency_contacts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_feedback_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_feedback_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_feedback_notes;
CREATE POLICY tenant_isolation_policy ON hr_feedback_notes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_goal_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_goal_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_goal_checkins;
CREATE POLICY tenant_isolation_policy ON hr_goal_checkins
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_job_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_job_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_job_catalog;
CREATE POLICY tenant_isolation_policy ON hr_job_catalog
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_locations;
CREATE POLICY tenant_isolation_policy ON hr_locations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_login_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_login_history;
CREATE POLICY tenant_isolation_policy ON hr_login_history
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_review_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_review_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_review_templates;
CREATE POLICY tenant_isolation_policy ON hr_review_templates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_signature_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_signature_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_signature_events;
CREATE POLICY tenant_isolation_policy ON hr_signature_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_signature_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_signature_requests;
CREATE POLICY tenant_isolation_policy ON hr_signature_requests
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_time_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_time_entries;
CREATE POLICY tenant_isolation_policy ON hr_time_entries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_timesheet_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_timesheet_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_timesheet_approvals;
CREATE POLICY tenant_isolation_policy ON hr_timesheet_approvals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hr_wellness_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_wellness_programs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hr_wellness_programs;
CREATE POLICY tenant_isolation_policy ON hr_wellness_programs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE hs_classification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hs_classification_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON hs_classification_events;
CREATE POLICY tenant_isolation_policy ON hs_classification_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON invoice_sequences;
CREATE POLICY tenant_isolation_policy ON invoice_sequences
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE landed_cost_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE landed_cost_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON landed_cost_records;
CREATE POLICY tenant_isolation_policy ON landed_cost_records
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE landed_cost_share_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE landed_cost_share_leads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON landed_cost_share_leads;
CREATE POLICY tenant_isolation_policy ON landed_cost_share_leads
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE landed_cost_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE landed_cost_shares FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON landed_cost_shares;
CREATE POLICY tenant_isolation_policy ON landed_cost_shares
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE onsite_agency_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_agency_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON onsite_agency_profiles;
CREATE POLICY tenant_isolation_policy ON onsite_agency_profiles
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE org_chart_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_chart_nodes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON org_chart_nodes;
CREATE POLICY tenant_isolation_policy ON org_chart_nodes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON org_permissions;
CREATE POLICY tenant_isolation_policy ON org_permissions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON payment_methods;
CREATE POLICY tenant_isolation_policy ON payment_methods
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE petti_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON petti_counters;
CREATE POLICY tenant_isolation_policy ON petti_counters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE platform_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_activity_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON platform_activity_log;
CREATE POLICY tenant_isolation_policy ON platform_activity_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE platform_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_domains FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON platform_domains;
CREATE POLICY tenant_isolation_policy ON platform_domains
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE platform_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_transactions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON platform_transactions;
CREATE POLICY tenant_isolation_policy ON platform_transactions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_listeners ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_listeners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_listeners;
CREATE POLICY tenant_isolation_policy ON shipment_listeners
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_notes;
CREATE POLICY tenant_isolation_policy ON shipment_notes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_participant_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_participant_customers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_participant_customers;
CREATE POLICY tenant_isolation_policy ON shipment_participant_customers
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_report_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_report_shares FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_report_shares;
CREATE POLICY tenant_isolation_policy ON shipment_report_shares
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_tasks;
CREATE POLICY tenant_isolation_policy ON shipment_tasks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shipment_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_time_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON shipment_time_entries;
CREATE POLICY tenant_isolation_policy ON shipment_time_entries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON subscription_invoices;
CREATE POLICY tenant_isolation_policy ON subscription_invoices
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tax_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_registrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tax_registrations;
CREATE POLICY tenant_isolation_policy ON tax_registrations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_settings;
CREATE POLICY tenant_isolation_policy ON tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tenant_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tenant_usage_counters;
CREATE POLICY tenant_isolation_policy ON tenant_usage_counters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tra_vfd_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE tra_vfd_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tra_vfd_config;
CREATE POLICY tenant_isolation_policy ON tra_vfd_config
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE tracking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON tracking_snapshots;
CREATE POLICY tenant_isolation_policy ON tracking_snapshots
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE trade_wizard_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wizard_outcomes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trade_wizard_outcomes;
CREATE POLICY tenant_isolation_policy ON trade_wizard_outcomes
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE trade_wizard_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wizard_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trade_wizard_runs;
CREATE POLICY tenant_isolation_policy ON trade_wizard_runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE trade_wizard_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wizard_searches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trade_wizard_searches;
CREATE POLICY tenant_isolation_policy ON trade_wizard_searches
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE trade_wizard_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_wizard_usage_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON trade_wizard_usage_counters;
CREATE POLICY tenant_isolation_policy ON trade_wizard_usage_counters
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE transit_route_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE transit_route_rates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON transit_route_rates;
CREATE POLICY tenant_isolation_policy ON transit_route_rates
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE user_totp ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_totp FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON user_totp;
CREATE POLICY tenant_isolation_policy ON user_totp
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- shipment_cases is a PARTITIONED table: RLS was enabled on the parent but not
-- FORCEd, and its leaf partitions had RLS off entirely (a query addressing a
-- partition by name would bypass isolation). Force the parent and enable+force
-- each partition — PG13 applies the parent's policy to partitions.
ALTER TABLE shipment_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_cases_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_cases_2026 FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_cases_default ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_cases_default FORCE ROW LEVEL SECURITY;
