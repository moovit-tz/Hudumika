-- 294_payroll_gl_accounts.sql
-- Backfill the COA lines a real payroll->GL posting needs: PAYE Payable and
-- a statutory-contributions liability (NSSF/NHIF/WCF/etc — payroll.service.ts
-- aggregates all employee-side scheme deductions into one figure, so one
-- liability account matches that shape), plus the employer-side contribution
-- expense (kept separate from 5100 Salaries & Wages, which stays the gross-
-- pay debit only, same "spelled out, not blended" principle payroll.routes.ts
-- already applies to its own totals breakdown).
--
-- Same idempotent backfill-existing-tenants pattern as 216_coa_other_
-- operating_expenses.sql. New tenants get these from STANDARD_COA (gl.service.ts).

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2110', 'PAYE Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2120', 'Statutory Contributions Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '5110', 'Employer Payroll Contributions', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', true
FROM tenants t
WHERE EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
ON CONFLICT (tenant_id, code) DO NOTHING;
