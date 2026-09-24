-- Communication Event Registry
-- Central catalog of every communication event the platform can fire,
-- with per-tenant configuration (enabled, template override, channel).

CREATE TABLE IF NOT EXISTS comm_events (
  event_key          TEXT        PRIMARY KEY,  -- e.g. finance.invoice.issued
  application        TEXT        NOT NULL,
  name               TEXT        NOT NULL,
  description        TEXT        NOT NULL,
  category           TEXT        NOT NULL,     -- transactional | security | crm | hr | ops | marketing
  trigger_type       TEXT        NOT NULL,     -- domain_event | scheduled | workflow | manual | security
  available_channels TEXT[]      NOT NULL DEFAULT ARRAY['EMAIL','IN_APP'],
  default_channel    TEXT        NOT NULL DEFAULT 'EMAIL',
  available_variables JSONB      NOT NULL DEFAULT '{}',  -- { "group": { "var": "description" } }
  sample_context     JSONB       NOT NULL DEFAULT '{}',  -- safe sample data for preview/test
  recipient_resolvers TEXT[]     NOT NULL DEFAULT ARRAY[]::TEXT[],
  default_template   TEXT,                              -- template_key of the system default
  priority           TEXT        NOT NULL DEFAULT 'normal',  -- low | normal | high | critical
  is_required        BOOLEAN     NOT NULL DEFAULT FALSE,     -- cannot be disabled by tenant
  is_system          BOOLEAN     NOT NULL DEFAULT TRUE,      -- FALSE = third-party dev registered
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-tenant event configuration overrides
CREATE TABLE IF NOT EXISTS tenant_event_configs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_key    TEXT        NOT NULL REFERENCES comm_events(event_key) ON DELETE CASCADE,
  is_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
  channel      TEXT,                   -- override default_channel (NULL = use default)
  template_key TEXT,                   -- override default_template (NULL = use default)
  updated_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, event_key)
);

ALTER TABLE tenant_event_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_event_configs_rls ON tenant_event_configs
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

-- Communication delivery log
CREATE TABLE IF NOT EXISTS comm_delivery_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_key      TEXT        NOT NULL,
  recipient_email TEXT       NOT NULL,
  recipient_name  TEXT,
  template_key   TEXT,
  channel        TEXT        NOT NULL DEFAULT 'EMAIL',
  subject        TEXT,
  status         TEXT        NOT NULL DEFAULT 'queued',  -- queued|sent|delivered|failed|bounced
  provider       TEXT,
  provider_id    TEXT,
  error_message  TEXT,
  retry_count    SMALLINT    NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  context_ref    TEXT,        -- business record ref, e.g. "invoice:inv-00128"
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE comm_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY comm_delivery_log_rls ON comm_delivery_log
  USING (tenant_id = current_setting('app.tenant_id', TRUE)::UUID);

CREATE INDEX IF NOT EXISTS comm_delivery_log_tenant_event ON comm_delivery_log (tenant_id, event_key);
CREATE INDEX IF NOT EXISTS comm_delivery_log_tenant_created ON comm_delivery_log (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS comm_delivery_log_idempotency ON comm_delivery_log (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
