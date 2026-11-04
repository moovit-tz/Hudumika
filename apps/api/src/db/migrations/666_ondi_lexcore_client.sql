-- Ondi SSO rollout: register LexCore's OAuth client (migration 665's
-- comment explains the pattern — confidential server-side client, secret
-- hash only, raw secret lives in LexCore's own .env, never committed here).
-- Callback is LexCore's API origin (port 3002), not its web origin (5175),
-- since the authorization-code exchange needs the client_secret and must
-- happen server-side.
INSERT INTO ondi_oauth_clients (client_id, client_secret_hash, name, redirect_uris, first_party) VALUES
  ('hudumika-lexcore', '210000:0d3d87b71b4e2663b1bcda446fb6f8c3:de62cc73f4f5f94f850cbdf4f7e404731e3a13a9bd621a5f425b399e2d015a6c8a35ae5220204eede670d9f129687f26ce12b5aecd7dad981504f3e3e2ca193b', 'LexCore', '["http://localhost:3002/auth/ondi/callback"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
