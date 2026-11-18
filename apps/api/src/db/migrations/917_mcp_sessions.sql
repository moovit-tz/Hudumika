-- MCP Streamable HTTP sessions (follows 914/915).
--
-- `initialize` creates a row and returns its id as the Mcp-Session-Id header.
-- A request carrying an ended or unknown session id gets 404, which tells the
-- client to initialize again (MCP 2025-06-18 "Session Management"). The id is
-- bound to one connection: it never authorizes anything by itself — every
-- request still needs that connection's bearer token.

CREATE TABLE IF NOT EXISTS mcp_sessions (
  id               TEXT PRIMARY KEY,
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id    UUID NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  protocol_version TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_connection ON mcp_sessions(connection_id);

ALTER TABLE mcp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_sessions FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'mcp_sessions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON mcp_sessions USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
