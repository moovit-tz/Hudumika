-- 137_backfill_chart_of_accounts.sql
-- Migration 021_finance_gl.sql seeded a standard chart of accounts for every
-- tenant that existed at the time, but nothing seeded it for a tenant
-- created afterward — onboarding.service.ts and superadmin.routes.ts's
-- tenant-creation paths never called any COA-seeding logic (now fixed in
-- application code, GLService.seedChartOfAccounts). Every tenant onboarded
-- since 021 ran has had zero chart_of_accounts rows, which breaks GL
-- posting outright: GLService.post() resolves account codes to account_id
-- via this table, and a code with no matching row silently resolves to
-- undefined, so any invoice/bill payment (or anything else posting to the
-- GL) throws "null value in column account_id violates not-null
-- constraint" the first time it's attempted for that tenant.
--
-- Backfill every tenant that still has zero rows. Uses the same account
-- set as 021 and is safe to re-run (UNIQUE(tenant_id, code) + ON CONFLICT).
DO $$
DECLARE
  t_id UUID;
  parent_asset_id UUID;
  parent_fa_id UUID;
BEGIN
  FOR t_id IN
    SELECT t.id FROM tenants t
    WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id)
  LOOP
    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES (t_id, '1000', 'Cash and Cash Equivalents', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO parent_asset_id;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, parent_id, normal_balance, is_system)
    VALUES
      (t_id, '1001', 'Cash on Hand', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1010', 'Bank Account (TZS)', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1011', 'Bank Account (USD)', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES
      (t_id, '1100', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE),
      (t_id, '1200', 'Prepaid Expenses', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE),
      (t_id, '1300', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES (t_id, '1500', 'Fixed Assets (net)', 'ASSET', 'FIXED_ASSET', 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING
    RETURNING id INTO parent_fa_id;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, parent_id, normal_balance, is_system)
    VALUES
      (t_id, '1501', 'Office Equipment', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'DEBIT', TRUE),
      (t_id, '1502', 'Motor Vehicles', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'DEBIT', TRUE),
      (t_id, '1503', 'Accumulated Depreciation', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'CREDIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES
      (t_id, '2000', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2100', 'Accrued Liabilities', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2200', 'VAT Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2300', 'Withholding Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2500', 'Long-term Loans', 'LIABILITY', 'LONG_TERM_LIABILITY', 'CREDIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES
      (t_id, '3000', 'Share Capital', 'EQUITY', 'EQUITY', 'CREDIT', TRUE),
      (t_id, '3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', 'CREDIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES
      (t_id, '4000', 'Freight Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4100', 'Customs Clearance Fees', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4200', 'Port Handling Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4300', 'Transport Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4500', 'Other Revenue', 'REVENUE', 'OTHER_REVENUE', 'CREDIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES
      (t_id, '5000', 'Port & Customs Charges', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', TRUE),
      (t_id, '5001', 'Freight Costs', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', TRUE),
      (t_id, '5002', 'Transport Costs', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', TRUE),
      (t_id, '5003', 'Storage & Demurrage', 'EXPENSE', 'COST_OF_SERVICES', 'DEBIT', TRUE),
      (t_id, '5100', 'Salaries & Wages', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE),
      (t_id, '5101', 'Office Rent', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE),
      (t_id, '5102', 'Utilities', 'EXPENSE', 'OPERATING_EXPENSE', 'DEBIT', TRUE),
      (t_id, '5200', 'Bank Charges', 'EXPENSE', 'FINANCE_COST', 'DEBIT', TRUE),
      (t_id, '5201', 'Interest Expense', 'EXPENSE', 'FINANCE_COST', 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;
  END LOOP;
END $$;
