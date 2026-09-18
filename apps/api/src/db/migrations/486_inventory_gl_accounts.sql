-- 486_inventory_gl_accounts.sql
-- Backfill the two GL accounts Inventory's own GL wiring needs (HUD-0054)
-- into every existing tenant's chart of accounts, the same way migration 216
-- backfilled 5900. New tenants get both from the seeded standard COA
-- (gl.service.ts's STANDARD_COA); existing tenants — whose COA was seeded
-- before either existed — get them here.
--
-- '2050' Goods Received Not Invoiced (GRNI) — a receipt physically arrives
-- before the supplier's bill does, so it cannot yet be an Accounts Payable
-- line (there is no bill to pay); it is a distinct clearing liability until
-- bills.routes.ts's own bill-matching flips it. Recording nothing at all
-- (the previous behavior) understated both assets and liabilities by the
-- same amount for every unbilled receipt sitting on the shelf.
--
-- '5011' Inventory Shrinkage/Write-off — a negative count correction (stock
-- physically missing) debits this and credits 1300; a positive one (stock
-- physically found) does the reverse. One account for both directions, the
-- same convention 5202 Foreign Exchange Gain/(Loss) already uses for a
-- single net line covering either sign.
--
-- Idempotent: (tenant_id, code) is unique, so the ON CONFLICT skips any
-- tenant that already has either account.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2050', 'Goods Received Not Invoiced', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5011', 'Inventory Shrinkage/Write-off', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
