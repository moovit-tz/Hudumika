-- General Ledger Foundation

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  code          VARCHAR(20) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  type          VARCHAR(20) NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  subtype       VARCHAR(50),
  parent_id     UUID REFERENCES chart_of_accounts(id),
  description   TEXT,
  is_system     BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  normal_balance VARCHAR(6) CHECK (normal_balance IN ('DEBIT','CREDIT')),
  currency      VARCHAR(5) DEFAULT 'TZS',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  entry_number  VARCHAR(50) NOT NULL,
  entry_date    DATE NOT NULL,
  reference     VARCHAR(200),
  description   TEXT NOT NULL,
  status        VARCHAR(20) DEFAULT 'POSTED' CHECK (status IN ('DRAFT','POSTED','VOIDED')),
  source_module VARCHAR(30) CHECK (source_module IN ('AR','AP','EXPENSE','MANUAL','PAYROLL')),
  source_id     UUID,
  created_by    UUID,
  posted_at     TIMESTAMPTZ DEFAULT NOW(),
  voided_at     TIMESTAMPTZ,
  voided_by     UUID,
  void_reason   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, entry_number)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit             NUMERIC(18,2) DEFAULT 0,
  credit            NUMERIC(18,2) DEFAULT 0,
  description       VARCHAR(500),
  currency          VARCHAR(5) DEFAULT 'TZS',
  exchange_rate     NUMERIC(12,4) DEFAULT 1,
  dimensions        JSONB DEFAULT '{}'::jsonb,
  sort_order        INT DEFAULT 0,
  CONSTRAINT chk_one_side CHECK (NOT (debit > 0 AND credit > 0))
);

-- Enforce balance at DB level
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_balance NUMERIC(18,2);
  v_je_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_je_id := OLD.journal_entry_id;
  ELSE
    v_je_id := NEW.journal_entry_id;
  END IF;

  SELECT ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0))
  INTO v_balance
  FROM journal_lines
  WHERE journal_entry_id = v_je_id;

  IF v_balance > 0.01 THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced by %', v_je_id, v_balance;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- We apply the trigger as a constraint trigger so it runs at the end of the transaction or statement
CREATE CONSTRAINT TRIGGER trigger_check_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_balance();

-- Seed standard Chart of Accounts for all existing tenants
DO $$
DECLARE
  t_id UUID;
  parent_asset_id UUID;
  parent_fa_id UUID;
  parent_liab_id UUID;
  parent_eq_id UUID;
  parent_rev_id UUID;
  parent_exp_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    -- 1. Assets
    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES (t_id, '1000', 'Cash and Cash Equivalents', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE)
    RETURNING id INTO parent_asset_id;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, parent_id, normal_balance, is_system)
    VALUES 
      (t_id, '1001', 'Cash on Hand', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1010', 'Bank Account (TZS)', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1011', 'Bank Account (USD)', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE);

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES 
      (t_id, '1100', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE),
      (t_id, '1200', 'Prepaid Expenses', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE),
      (t_id, '1300', 'Inventory', 'ASSET', 'CURRENT_ASSET', 'DEBIT', TRUE);

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES (t_id, '1500', 'Fixed Assets (net)', 'ASSET', 'FIXED_ASSET', 'DEBIT', TRUE)
    RETURNING id INTO parent_fa_id;

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, parent_id, normal_balance, is_system)
    VALUES 
      (t_id, '1501', 'Office Equipment', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'DEBIT', TRUE),
      (t_id, '1502', 'Motor Vehicles', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'DEBIT', TRUE),
      (t_id, '1503', 'Accumulated Depreciation', 'ASSET', 'FIXED_ASSET', parent_fa_id, 'CREDIT', TRUE);

    -- 2. Liabilities
    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES 
      (t_id, '2000', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2100', 'Accrued Liabilities', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2200', 'VAT Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2300', 'Withholding Tax Payable', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', TRUE),
      (t_id, '2500', 'Long-term Loans', 'LIABILITY', 'LONG_TERM_LIABILITY', 'CREDIT', TRUE);

    -- 3. Equity
    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES 
      (t_id, '3000', 'Share Capital', 'EQUITY', 'EQUITY', 'CREDIT', TRUE),
      (t_id, '3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', 'CREDIT', TRUE);

    -- 4. Revenue
    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
    VALUES 
      (t_id, '4000', 'Freight Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4100', 'Customs Clearance Fees', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4200', 'Port Handling Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4300', 'Transport Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', TRUE),
      (t_id, '4500', 'Other Revenue', 'REVENUE', 'OTHER_REVENUE', 'CREDIT', TRUE);

    -- 5. Expenses
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
      (t_id, '5201', 'Interest Expense', 'EXPENSE', 'FINANCE_COST', 'DEBIT', TRUE);
  END LOOP;
END $$;
