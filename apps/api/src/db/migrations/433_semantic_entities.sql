-- Migration 433: Phase M5 — semantic layer, the thin version.
--
-- Not a graph-relationship engine — a small, honest registry of which
-- table/column in which app backs a given real-world entity, seeded with
-- exactly enough rows to back the one real cross-app join this phase
-- builds (a customer resolved across CRM and Sign), matching the plan's
-- own instruction: "let the semantic layer's shape emerge from [the first
-- real join], not the reverse." Platform-level reference data — no
-- tenant_id, no RLS — same shape as metric_definitions (411) and
-- sign_jurisdiction_rules (430): a definitions catalog, not tenant data.
--
-- The registry is real metadata read by hudubi-entity.service.ts's
-- resolveCustomerAcrossApps (it queries this table to know which apps
-- register a 'customer' resolver before running any of them) — not a
-- decorative table sitting beside separately-hardcoded logic with no
-- relationship to it.
CREATE TABLE IF NOT EXISTS semantic_entities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key   TEXT NOT NULL,           -- e.g. 'customer'
  app          TEXT NOT NULL,           -- e.g. 'crm', 'sign'
  table_name   TEXT NOT NULL,
  id_column    TEXT NOT NULL,
  match_columns JSONB NOT NULL,         -- e.g. ["email"], ["email","user_id"]
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_key, app, table_name)
);

INSERT INTO semantic_entities (entity_key, app, table_name, id_column, match_columns, description) VALUES
('customer', 'crm', 'customers', 'id', '["email"]',
 'The canonical customer record — every other app resolves against this one''s email.'),
('customer', 'sign', 'sign_envelopes', 'id', '["client_id"]',
 'A document sent to this customer via the structured client_id FK (migration 426) — the direct, unambiguous link.'),
('customer', 'sign', 'sign_recipients', 'id', '["email","user_id"]',
 'A document recipient whose typed email matches this customer''s own — the fuzzy link, for a document sent before client_id was ever set, or set by someone who typed an email instead of picking the customer.');
