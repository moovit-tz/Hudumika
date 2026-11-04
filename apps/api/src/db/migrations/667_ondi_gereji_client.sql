-- Ondi SSO rollout: register Gereji's OAuth client.
--
-- Gereji (D:\Apps\Gereji\gereji-app) is a separate Next.js codebase on its
-- own origin (:3000), added as an Auth.js OIDC provider alongside its
-- existing Credentials (email/password) provider — Gereji is a self-serve
-- garage-management SaaS with its own public registration flow, which Ondi
-- does not replace; Ondi is additive, for Hudumika-affiliated sign-in.
-- Confidential server-side client (Next.js server, secret never shipped to
-- the browser), so client_secret_hash is set — same PBKDF2 scheme as
-- apps/api/src/lib/password.ts. The raw secret lives only in Gereji's own
-- .env (gitignored), never here.
INSERT INTO ondi_oauth_clients (client_id, client_secret_hash, name, redirect_uris, first_party) VALUES
  ('hudumika-gereji', '210000:f6e738de0e2c1876d22e3657a494a7af:37a31ff7f0c332d30022a349b59f8e1bae8a9be153d5965d7a8258aaf326cd39fa812dc6ca3b990e5b8640eb3c4501b9bc1c9023ec2f0210628e6586d92f38c4', 'Gereji', '["http://localhost:3000/api/auth/callback/ondi"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
