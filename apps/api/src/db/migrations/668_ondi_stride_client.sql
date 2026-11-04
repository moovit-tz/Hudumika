-- Ondi SSO rollout: register Stride (Movara Horizon)'s OAuth client.
--
-- Same shape as migration 665's Tuma registration — see that file's header
-- for why these are confidential/secret-bearing rather than PKCE-only public
-- clients. Stride's callback is its Express backend (movara-backend, :4000),
-- not its Vite SPA (movara-web, :3101/:5173 depending how it's launched) —
-- the client secret must stay server-side, and the backend is what holds it.
INSERT INTO ondi_oauth_clients (client_id, client_secret_hash, name, redirect_uris, first_party) VALUES
  ('hudumika-stride', '210000:7e4eebcbfe21ccef53e1be8e75ecc41d:976d23bb0d7dd693ec53bf9168b913f01268a1fbed5726153910bd2508b1ab4cff58145a7d26370a1e457287ba2b5f0c539cb16a5f30696a74bf5fc5ba869a74', 'Stride', '["http://localhost:4000/api/auth/ondi/callback"]'::jsonb, true)
ON CONFLICT (client_id) DO NOTHING;
