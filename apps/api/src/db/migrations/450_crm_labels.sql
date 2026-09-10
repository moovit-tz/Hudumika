-- Migration 450: tags/labels for the CRM — Gap #10 of the CRM-vs-top-10
-- analysis. Contacts already has this (438_contacts_gap_closure.sql +
-- 441's hierarchy); the CRM's own Leads/Deals/Customers never did, despite
-- being a separate app with its own tables. Deliberately its own table
-- rather than reaching into contact_labels — 'contacts' and 'crm' are
-- distinct apps in ALL_APP_IDS with no shared ownership of each other's
-- data, and Contacts' hierarchy (parent_id) isn't something a CRM label
-- like "Hot lead" or "Enterprise" needs.
--
-- Same polymorphic subject_type/subject_id shape as crm_activities
-- (migration 449) rather than three separate mapping tables — a label like
-- "VIP" is exactly as meaningful on a lead, a deal or a customer, and one
-- mapping table means one query to render "everything tagged VIP" across
-- all three instead of a UNION across three.

CREATE TABLE crm_labels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT 'teal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE crm_label_mappings (
  label_id     UUID NOT NULL REFERENCES crm_labels(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('lead', 'deal', 'customer')),
  subject_id   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (label_id, subject_type, subject_id)
);
CREATE INDEX idx_crm_label_mappings_subject ON crm_label_mappings(subject_type, subject_id);

ALTER TABLE crm_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_labels FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_labels
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- crm_label_mappings carries no tenant_id of its own — same shape as
-- contact_label_mappings' policy in 440_contacts_rls_gap.sql, scoped
-- through the label it points at.
ALTER TABLE crm_label_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_label_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON crm_label_mappings
  USING (EXISTS (
    SELECT 1 FROM crm_labels cl
    WHERE cl.id = crm_label_mappings.label_id
      AND cl.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  ));
