-- An API key that never expires and can always write is not least privilege.
--
-- api_keys already does the hard parts well: the raw key is shown once and
-- stored only as a hash, revocation is a soft delete that keeps usage history,
-- and scopes are capped by the tenant's plan. Two things it has never had:
--
--   * an expiry. Every key issued is valid until somebody remembers to revoke
--     it, which is the credential equivalent of a door that only locks if you
--     think to lock it. ONSITE.md section 34 lists Expiration as a field of a
--     developer token for exactly this reason.
--
--   * a read-only mode. Scopes are entitlement feature keys, so a key scoped to
--     'onsite' can read a server and also delete it. A token wired into a
--     dashboard or a status page wants the first and never the second.
--
-- Both default to the current behaviour — null expiry, writes allowed — so no
-- existing key changes meaning when this runs.

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS read_only BOOLEAN NOT NULL DEFAULT false;

-- The authentication path looks a key up by hash on every request and now also
-- has to judge its expiry; keeping expires_at in the same index avoids a second
-- visit to the heap for a column read on literally every API-key call.
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_live
  ON api_keys (key_hash) INCLUDE (expires_at, read_only)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN api_keys.expires_at IS
  'When the key stops working. NULL means it never expires — allowed, but the UI asks for a date first.';
COMMENT ON COLUMN api_keys.read_only IS
  'When true the key may only make safe requests (GET/HEAD/OPTIONS); enforced in middleware/auth.ts.';
