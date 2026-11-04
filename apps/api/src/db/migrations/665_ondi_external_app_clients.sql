-- Ondi SSO rollout: register standalone-app OAuth clients.
--
-- Unlike the first-party clients seeded in migration 363 (ClearOS, SEAL, …),
-- these apps are separate server-side codebases running on their own
-- origins (Tuma on :3100), not SPA pages sharing Hudumika's own :5173
-- origin — so each needs its own registered redirect_uri, and, being a
-- confidential server-side client that can hold a secret safely (never
-- shipped to a browser), a client_secret_hash rather than PKCE-only public
-- registration. The raw secret is never stored here — only its PBKDF2 hash
-- (same scheme as apps/api/src/lib/password.ts), generated once and handed
-- to the app's own .env (gitignored) at registration time.
INSERT INTO ondi_oauth_clients (client_id, client_secret_hash, name, redirect_uris, first_party) VALUES
  ('hudumika-tuma', '210000:a9d5b9e3b63ceccadb6791864d317d6e:a467e20ecaf6ee8b160c043fbac758a71aadb44c71fee4aa39f07e2c8e03776c92cc31e1889271b5ad2297987457e47a4a171bf77a26ac1e7b7617d5f8e07a03', 'Tuma', '["http://localhost:3100/api/auth/callback"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
