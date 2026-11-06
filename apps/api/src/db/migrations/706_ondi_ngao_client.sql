-- Ondi SSO rollout: register Ngao's OAuth client.
--
-- Ngao (D:\Apps\Ngao) is Hudumika's PDPC/GDPR data-protection compliance
-- product — a separate Fastify+React codebase on its own origin, forked
-- from LexCore's scaffold and rebranded 2026-11-06 (see apps/web/src/
-- contexts/BrandingContext.tsx there). Its API port was moved to 3003
-- (from the inherited LexCore default of 3002) so the two can run on one
-- machine at the same time without colliding — see Ngao's own config.ts.
-- Confidential server-side client (Fastify API, secret never shipped to the
-- browser), so client_secret_hash is set — same PBKDF2 scheme as
-- apps/api/src/lib/password.ts. The raw secret lives only in Ngao's own
-- .env (gitignored), never here. Same shape as migration 665's Tuma
-- registration — see that file's header for the full pattern.
INSERT INTO ondi_oauth_clients (client_id, client_secret_hash, name, redirect_uris, first_party) VALUES
  ('hudumika-ngao', '210000:2303f929edcb0bd990c21d93e99bed5d:f20e1ff6834144c911429fb21ee7422549ca8cfeb1d6916d72548328ce27385fa291cf2979fd08ef56453fe7c706cdc1311382fb5616fbd9b44ebc20c66ed9c4', 'Ngao', '["http://localhost:3003/auth/ondi/callback"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
