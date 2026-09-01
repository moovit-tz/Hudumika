-- Found live while testing Ondi M7's leaver automation: hard-deleting a
-- test user (something no real UI flow in this platform ever does — every
-- deactivation path sets users.active = false, never DELETE FROM users)
-- triggered ondi_auth_events.user_id's ON DELETE SET NULL, which nulled
-- out a column that was already baked into that row's event_hash
-- (audit-chain.ts computes the hash over id|tenant_id|event_type|user_id|
-- metadata|prev_hash at write time) — so the tamper-evident chain
-- correctly reported a break, because the row's stored user_id no longer
-- matched what it was hashed with.
--
-- The chain doing its job here is not the bug; a foreign key silently
-- mutating a hashed column is. Since this platform never actually
-- hard-deletes a user (soft-delete via active=false is the real,
-- universal convention), restricting the delete instead of nulling the
-- column costs nothing in practice and closes the gap: a user cannot be
-- hard-deleted while they still have audit history, so this specific
-- column can never again change out from under an already-computed hash.
ALTER TABLE ondi_auth_events DROP CONSTRAINT IF EXISTS ondi_auth_events_user_id_fkey;
ALTER TABLE ondi_auth_events
  ADD CONSTRAINT ondi_auth_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
