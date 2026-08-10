-- 216_coa_other_operating_expenses.sql
-- Backfill account 5900 "Other Operating Expenses" into every tenant's chart
-- of accounts.
--
-- Directly-recorded expenses (the Expenses page) now post to the GL so they
-- show in P&L / Trial Balance / Balance Sheet like invoice and bill payments
-- already do. A category with no more specific account (e.g. "Miscellaneous")
-- posts to 5900. New tenants get it from the seeded standard COA; existing
-- tenants — whose COA was seeded before 5900 existed — get it here.
--
-- Idempotent: (tenant_id, code) is unique, so the ON CONFLICT skips any tenant
-- that already has it.

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5900', 'Other Operating Expenses', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
