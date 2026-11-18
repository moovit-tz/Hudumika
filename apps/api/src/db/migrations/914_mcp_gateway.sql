-- Hudumika MCP gateway (Developer ▸ MCP): connections from AI clients such as
-- ChatGPT, bound to one verified user, one OAuth client and one workspace.
--
-- Tenant tables get RLS + FORCE like every other tenant table. The OAuth
-- client registry (ondi_oauth_clients) stays platform-global; MCP clients
-- registered through Dynamic Client Registration (RFC 7591) are flagged so the
-- general Ondi OAuth endpoints refuse them: an open registration endpoint must
-- never become a way to request the REST API scopes those endpoints grant.

ALTER TABLE ondi_oauth_clients ADD COLUMN IF NOT EXISTS registered_via TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE ondi_oauth_clients DROP CONSTRAINT IF EXISTS ondi_oauth_clients_registered_via_check;
ALTER TABLE ondi_oauth_clients ADD CONSTRAINT ondi_oauth_clients_registered_via_check
  CHECK (registered_via IN ('admin', 'seed', 'mcp_dcr'));
ALTER TABLE ondi_oauth_clients ADD COLUMN IF NOT EXISTS client_uri TEXT;
ALTER TABLE ondi_oauth_clients ADD COLUMN IF NOT EXISTS software_id TEXT;

-- One row per workspace. Missing row = defaults: staff may connect, external
-- customers may not until an admin turns it on.
CREATE TABLE IF NOT EXISTS mcp_workspace_policy (
  tenant_id          UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  staff_enabled      BOOLEAN NOT NULL DEFAULT true,
  customers_enabled  BOOLEAN NOT NULL DEFAULT false,
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-tool overrides. Missing row = the tool's default (read tools on, write
-- tools off).
CREATE TABLE IF NOT EXISTS mcp_tool_settings (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_id     TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, tool_id)
);

CREATE TABLE IF NOT EXISTS mcp_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('staff', 'customer')),
  -- The customers row a customer-portal login acts for, resolved and stored
  -- at grant time; re-resolved on every call so an unlinked login loses access.
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  client_id       TEXT NOT NULL REFERENCES ondi_oauth_clients(client_id) ON DELETE CASCADE,
  scopes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_tenant ON mcp_connections(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_connections_user ON mcp_connections(tenant_id, user_id);
-- At most one live connection per person per client; re-authorising updates it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcp_connections_active
  ON mcp_connections(tenant_id, user_id, client_id) WHERE status = 'active';

-- Audit of every tool call. No arguments or results are stored: only which
-- argument names were supplied, so the log never retains customer data.
CREATE TABLE IF NOT EXISTS mcp_call_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES mcp_connections(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_type      TEXT NOT NULL,
  client_id       TEXT NOT NULL,
  tool_id         TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('ok', 'denied', 'invalid', 'error', 'confirmation_required', 'replayed')),
  error_code      TEXT,
  http_status     INTEGER,
  duration_ms     INTEGER,
  arg_names       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_call_log_tenant ON mcp_call_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_call_log_connection ON mcp_call_log(connection_id, created_at DESC);

-- Write tools: a pending confirmation (step 1 returns a preview and a token;
-- step 2 executes only with that token) and the idempotency record that makes
-- a retried step 2 return the first result instead of writing twice.
CREATE TABLE IF NOT EXISTS mcp_write_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id     UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tool_id           TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL,
  args_hash         TEXT NOT NULL,
  confirmation_hash TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'done', 'failed')),
  result            JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  completed_at      TIMESTAMPTZ,
  UNIQUE (connection_id, tool_id, idempotency_key)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mcp_workspace_policy', 'mcp_tool_settings', 'mcp_connections', 'mcp_call_log', 'mcp_write_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    END IF;
  END LOOP;
END $$;
