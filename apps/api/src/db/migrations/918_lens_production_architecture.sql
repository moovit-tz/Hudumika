-- 918_lens_production_architecture.sql
-- Lens Production Architecture: Projects, Repositories, Connection Instances (Encrypted Credentials),
-- Webhooks Inbox, Durable Outbox, Releases, Snapshots, All-App Defect Reporting Intake,
-- Comments, Relations, Saved Filters, and Extended Issue Tracking Fields.

-- 1. Projects
CREATE TABLE IF NOT EXISTS lens_projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             VARCHAR(16) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  lead_id         TEXT,
  default_area_id VARCHAR(32) REFERENCES lens_areas(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Repositories
CREATE TABLE IF NOT EXISTS lens_repositories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        VARCHAR(32) NOT NULL DEFAULT 'github',
  external_id     TEXT,
  full_name       VARCHAR(200) NOT NULL,
  default_branch  VARCHAR(100) NOT NULL DEFAULT 'master',
  webhook_id      TEXT,
  clone_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Connection Instances (Multi-instance per provider, encrypted credentials)
CREATE TABLE IF NOT EXISTS lens_connection_instances (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                 VARCHAR(32) NOT NULL,
  name                     VARCHAR(100) NOT NULL,
  site_or_org              VARCHAR(200),
  auth_type                VARCHAR(32) NOT NULL DEFAULT 'oauth',
  encrypted_credential     TEXT NOT NULL,
  encrypted_webhook_secret TEXT,
  key_version              VARCHAR(16) NOT NULL DEFAULT 'v1',
  granted_scopes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  config                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                   VARCHAR(24) NOT NULL DEFAULT 'connected',
  last_error               TEXT,
  last_sync_at             TIMESTAMPTZ,
  created_by               TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_conn_provider ON lens_connection_instances(provider);

-- 4. Project-Repository & Project-Connection Bindings
CREATE TABLE IF NOT EXISTS lens_project_repositories (
  project_id  UUID NOT NULL REFERENCES lens_projects(id) ON DELETE CASCADE,
  repo_id     UUID NOT NULL REFERENCES lens_repositories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (project_id, repo_id)
);

CREATE TABLE IF NOT EXISTS lens_project_connections (
  project_id    UUID NOT NULL REFERENCES lens_projects(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES lens_connection_instances(id) ON DELETE CASCADE,
  purpose       VARCHAR(32) NOT NULL DEFAULT 'general',
  PRIMARY KEY (project_id, connection_id)
);

-- 5. Releases
CREATE TABLE IF NOT EXISTS lens_releases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES lens_projects(id) ON DELETE SET NULL,
  version       VARCHAR(50) NOT NULL,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  status        VARCHAR(32) NOT NULL DEFAULT 'PLANNED',
  release_notes TEXT,
  git_tag       VARCHAR(100),
  commit_sha    VARCHAR(64),
  released_at   TIMESTAMPTZ,
  released_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Defect Reports Intake (All-app defect intake from workspace users/reporters)
CREATE TABLE IF NOT EXISTS lens_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app          VARCHAR(40) NOT NULL,
  source_route        TEXT,
  tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
  reporter_id         TEXT NOT NULL,
  reporter_email      TEXT,
  reporter_name       TEXT,
  reporter_role       TEXT,
  title               VARCHAR(255) NOT NULL,
  summary             TEXT NOT NULL,
  steps_to_reproduce  TEXT,
  expected_behavior   TEXT,
  actual_behavior     TEXT,
  severity            VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  client_context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              VARCHAR(24) NOT NULL DEFAULT 'NEW',
  item_id             UUID REFERENCES lens_items(id) ON DELETE SET NULL,
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_reports_app ON lens_reports(source_app);
CREATE INDEX IF NOT EXISTS idx_lens_reports_tenant ON lens_reports(tenant_id);

ALTER TABLE lens_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lens_reports FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'lens_reports'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON lens_reports
      USING (tenant_id IS NULL OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- 7. Snapshots (Source archives, patches, git bundles, selected files)
CREATE TABLE IF NOT EXISTS lens_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id              UUID REFERENCES lens_items(id) ON DELETE SET NULL,
  repo_id              UUID REFERENCES lens_repositories(id) ON DELETE SET NULL,
  snapshot_type        VARCHAR(32) NOT NULL DEFAULT 'working_tree_patch',
  commit_sha           VARCHAR(64),
  branch_label         VARCHAR(100),
  storage_path         TEXT NOT NULL,
  checksum_sha256      VARCHAR(64) NOT NULL,
  size_bytes           BIGINT NOT NULL DEFAULT 0,
  manifest             JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               VARCHAR(24) NOT NULL DEFAULT 'READY',
  reason               TEXT,
  capture_tool_version VARCHAR(16) NOT NULL DEFAULT '1.0',
  created_by           TEXT,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_snapshots_item ON lens_snapshots(item_id);

-- 8. Webhooks Inbox (Durable delivery persistence and deduplication)
CREATE TABLE IF NOT EXISTS lens_webhooks_inbox (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id      UUID REFERENCES lens_connection_instances(id) ON DELETE SET NULL,
  provider           VARCHAR(32) NOT NULL,
  event_type         VARCHAR(100) NOT NULL,
  delivery_id        VARCHAR(128) NOT NULL,
  signature          TEXT,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  payload            JSONB NOT NULL,
  status             VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts           INTEGER NOT NULL DEFAULT 0,
  error_message      TEXT,
  processed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lens_webhook_delivery UNIQUE (provider, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_lens_inbox_pending ON lens_webhooks_inbox(status, created_at);

-- 9. Durable Outbox Events
CREATE TABLE IF NOT EXISTS lens_outbox_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name     VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(40) NOT NULL DEFAULT 'lens_item',
  aggregate_id   TEXT NOT NULL,
  payload        JSONB NOT NULL,
  correlation_id TEXT,
  causation_id   TEXT,
  status         VARCHAR(24) NOT NULL DEFAULT 'pending',
  attempts       INTEGER NOT NULL DEFAULT 0,
  lease_id       TEXT,
  available_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_outbox_poll ON lens_outbox_events(status, available_at);

-- 10. Comments on Lens Items
CREATE TABLE IF NOT EXISTS lens_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES lens_items(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT,
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT true,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lens_comments_item ON lens_comments(item_id, created_at);

-- 11. Item Relations / Dependencies
CREATE TABLE IF NOT EXISTS lens_item_relations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES lens_items(id) ON DELETE CASCADE,
  target_item_id UUID NOT NULL REFERENCES lens_items(id) ON DELETE CASCADE,
  relation_type  VARCHAR(32) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lens_item_relation UNIQUE (item_id, target_item_id, relation_type)
);

-- 12. Saved Filters
CREATE TABLE IF NOT EXISTS lens_saved_filters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL,
  name         VARCHAR(100) NOT NULL,
  query_params JSONB NOT NULL,
  is_shared    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Extend lens_items with engineering workflow attributes
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES lens_projects(id) ON DELETE SET NULL;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS release_id UUID REFERENCES lens_releases(id) ON DELETE SET NULL;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS environment VARCHAR(32) DEFAULT 'production';
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS priority VARCHAR(16) DEFAULT 'MEDIUM';
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS assignee_id TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS assignee_name TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS reproduction_steps TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS fix_summary TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS verification_evidence TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS verification_status VARCHAR(24) DEFAULT 'UNVERIFIED';
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS verified_by TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS reopen_reason TEXT;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES lens_items(id) ON DELETE SET NULL;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS source_report_id UUID REFERENCES lens_reports(id) ON DELETE SET NULL;

-- 14. Seed default project, repository, release and link existing items
INSERT INTO lens_projects (id, key, name, description, is_active)
VALUES (
  '10000000-0000-4000-8000-000000000001'::uuid,
  'HUD',
  'Hudumika Platform',
  'Core multi-tenant trade, logistics, and compliance infrastructure',
  true
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO lens_repositories (id, provider, full_name, default_branch, is_active)
VALUES (
  '20000000-0000-4000-8000-000000000001'::uuid,
  'github',
  'hudumika/hudumika',
  'master',
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO lens_project_repositories (project_id, repo_id, is_primary)
VALUES (
  '10000000-0000-4000-8000-000000000001'::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  true
)
ON CONFLICT DO NOTHING;

INSERT INTO lens_releases (id, project_id, version, title, status)
VALUES (
  '30000000-0000-4000-8000-000000000001'::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'v1.0.0-lts',
  'Hudumika 1.0 Production LTS',
  'RELEASED'
)
ON CONFLICT DO NOTHING;

UPDATE lens_items
SET project_id = '10000000-0000-4000-8000-000000000001'::uuid
WHERE project_id IS NULL;
