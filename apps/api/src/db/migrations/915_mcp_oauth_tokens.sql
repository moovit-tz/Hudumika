-- MCP gateway OAuth codes and refresh tokens (follows 914_mcp_gateway.sql).
--
-- Kept in Postgres rather than Redis so account linking works without Redis
-- and survives restarts. Both tables are platform-global like
-- ondi_oauth_clients: the token endpoint looks a code up before any tenant is
-- known, so they are read and written only through dbPlatform. Only SHA-256
-- hashes of the secrets are stored; a row is consumed with DELETE … RETURNING,
-- which makes every code and refresh token single-use.

CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
  code_hash      TEXT PRIMARY KEY,
  connection_id  UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES ondi_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  scope          TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
  token_hash     TEXT PRIMARY KEY,
  connection_id  UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES ondi_oauth_clients(client_id) ON DELETE CASCADE,
  scope          TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_connection ON mcp_refresh_tokens(connection_id);
