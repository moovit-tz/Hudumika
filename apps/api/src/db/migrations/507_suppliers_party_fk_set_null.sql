-- suppliers.tenant_id has no FK to tenants (historical), so deleting a tenant leaves its
-- supplier rows behind; a RESTRICT party FK would then block deleting the tenant's parties
-- and therefore the tenant itself. SET NULL lets tenant deletion proceed; the supplier
-- trigger re-creates the party on the next insert, and deleting a party through the app
-- (which never hard-deletes parties — it archives/merges) is unaffected.
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_party_id_fkey;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_party_id_fkey FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE SET NULL;
