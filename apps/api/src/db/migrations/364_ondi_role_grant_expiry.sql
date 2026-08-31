-- Just-in-Time-lite access: a custom role can now be granted with an
-- optional expiry. NULL means what it already meant — permanent, unchanged
-- for every existing row. hasOrgPermission() (org-rbac.ts) filters expired
-- grants out at check time, so an expired grant simply stops working with
-- no cleanup job required — the row itself is left in place as a real
-- historical record of "this person held this permission until this date."
ALTER TABLE ondi_org_role_members ADD COLUMN expires_at TIMESTAMPTZ NULL;
