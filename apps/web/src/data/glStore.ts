// Client-side GL store — mock data matching the API contract in packages/types/src/finance.ts
// Swap hooks to apiFetch calls once backend routes (A5) are deployed.

import type {
  ChartOfAccount, JournalEntry, TrialBalanceReport, BalanceSheetReport,
  ProfitLossReport, LedgerReport, AgedReport, CashFlowReport,
} from '@hudumika/types';

// ── Chart of Accounts ─────────────────────────────────────────
export const MOCK_COA: ChartOfAccount[] = [
  {
    id: 'a1000', code: '1000', name: 'Cash & Cash Equivalents', type: 'ASSET',
    subtype: 'CURRENT_ASSET', parent_id: null, description: null, is_system: true,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
    children: [
      { id: 'a1001', code: '1001', name: 'Cash on Hand', type: 'ASSET', subtype: 'CURRENT_ASSET', parent_id: 'a1000', description: null, is_system: true, is_active: true, normal_balance: 'DEBIT', currency: 'TZS' },
      { id: 'a1010', code: '1010', name: 'Bank Account (TZS)', type: 'ASSET', subtype: 'CURRENT_ASSET', parent_id: 'a1000', description: null, is_system: true, is_active: true, normal_balance: 'DEBIT', currency: 'TZS' },
      { id: 'a1011', code: '1011', name: 'Bank Account (USD)', type: 'ASSET', subtype: 'CURRENT_ASSET', parent_id: 'a1000', description: null, is_system: true, is_active: true, normal_balance: 'DEBIT', currency: 'USD' },
    ],
  },
  {
    id: 'a1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET',
    subtype: 'CURRENT_ASSET', parent_id: null, description: 'Amounts owed by customers', is_system: true,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a1200', code: '1200', name: 'Prepaid Expenses', type: 'ASSET',
    subtype: 'CURRENT_ASSET', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a1500', code: '1500', name: 'Fixed Assets', type: 'ASSET',
    subtype: 'FIXED_ASSET', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
    children: [
      { id: 'a1501', code: '1501', name: 'Office Equipment', type: 'ASSET', subtype: 'FIXED_ASSET', parent_id: 'a1500', description: null, is_system: false, is_active: true, normal_balance: 'DEBIT', currency: 'TZS' },
      { id: 'a1502', code: '1502', name: 'Motor Vehicles', type: 'ASSET', subtype: 'FIXED_ASSET', parent_id: 'a1500', description: null, is_system: false, is_active: true, normal_balance: 'DEBIT', currency: 'TZS' },
    ],
  },
  {
    id: 'a2000', code: '2000', name: 'Accounts Payable', type: 'LIABILITY',
    subtype: 'CURRENT_LIABILITY', parent_id: null, description: 'Amounts owed to suppliers', is_system: true,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a2200', code: '2200', name: 'VAT Payable', type: 'LIABILITY',
    subtype: 'CURRENT_LIABILITY', parent_id: null, description: null, is_system: true,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a2300', code: '2300', name: 'Withholding Tax Payable', type: 'LIABILITY',
    subtype: 'CURRENT_LIABILITY', parent_id: null, description: null, is_system: true,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a3000', code: '3000', name: 'Share Capital', type: 'EQUITY',
    subtype: 'EQUITY', parent_id: null, description: null, is_system: true,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a3100', code: '3100', name: 'Retained Earnings', type: 'EQUITY',
    subtype: 'RETAINED_EARNINGS', parent_id: null, description: null, is_system: true,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a4000', code: '4000', name: 'Freight Revenue', type: 'REVENUE',
    subtype: 'OPERATING_REVENUE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a4100', code: '4100', name: 'Customs Clearance Fees', type: 'REVENUE',
    subtype: 'OPERATING_REVENUE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a4200', code: '4200', name: 'Port Handling Revenue', type: 'REVENUE',
    subtype: 'OPERATING_REVENUE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a4300', code: '4300', name: 'Transport Revenue', type: 'REVENUE',
    subtype: 'OPERATING_REVENUE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'CREDIT', currency: 'TZS',
  },
  {
    id: 'a5000', code: '5000', name: 'Port & Customs Charges', type: 'EXPENSE',
    subtype: 'COST_OF_SERVICES', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5001', code: '5001', name: 'Freight Costs', type: 'EXPENSE',
    subtype: 'COST_OF_SERVICES', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5002', code: '5002', name: 'Transport Costs', type: 'EXPENSE',
    subtype: 'COST_OF_SERVICES', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5003', code: '5003', name: 'Storage & Demurrage', type: 'EXPENSE',
    subtype: 'COST_OF_SERVICES', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5100', code: '5100', name: 'Salaries & Wages', type: 'EXPENSE',
    subtype: 'OPERATING_EXPENSE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5101', code: '5101', name: 'Office Rent', type: 'EXPENSE',
    subtype: 'OPERATING_EXPENSE', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
  {
    id: 'a5200', code: '5200', name: 'Bank Charges', type: 'EXPENSE',
    subtype: 'FINANCE_COST', parent_id: null, description: null, is_system: false,
    is_active: true, normal_balance: 'DEBIT', currency: 'TZS',
  },
];

// ── Journal Entries (mock posted entries) ─────────────────────
export const MOCK_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'je001', entry_number: 'JE-2026-0001', entry_date: '2026-06-01',
    reference: 'INV-2026-001', description: 'Sales invoice: Cargo Ltd', status: 'POSTED',
    source_module: 'AR', source_id: 'inv001', created_by: null, posted_at: '2026-06-01T09:00:00Z',
    lines: [
      { id: 'jl001a', journal_entry_id: 'je001', account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', debit: 8500000, credit: 0, description: 'Invoice INV-2026-001', currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl001b', journal_entry_id: 'je001', account_id: 'a4000', account_code: '4000', account_name: 'Freight Revenue', debit: 0, credit: 8500000, description: 'Freight revenue', currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
  {
    id: 'je002', entry_number: 'JE-2026-0002', entry_date: '2026-06-05',
    reference: 'INV-2026-002', description: 'Sales invoice: Simba Logistics', status: 'POSTED',
    source_module: 'AR', source_id: 'inv002', created_by: null, posted_at: '2026-06-05T10:30:00Z',
    lines: [
      { id: 'jl002a', journal_entry_id: 'je002', account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', debit: 4200000, credit: 0, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl002b', journal_entry_id: 'je002', account_id: 'a4100', account_code: '4100', account_name: 'Customs Clearance Fees', debit: 0, credit: 4200000, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
  {
    id: 'je003', entry_number: 'JE-2026-0003', entry_date: '2026-06-10',
    reference: 'PMT-001', description: 'Payment received: INV-2026-001', status: 'POSTED',
    source_module: 'AR', source_id: 'inv001', created_by: null, posted_at: '2026-06-10T14:00:00Z',
    lines: [
      { id: 'jl003a', journal_entry_id: 'je003', account_id: 'a1010', account_code: '1010', account_name: 'Bank Account (TZS)', debit: 8500000, credit: 0, description: 'Cash received', currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl003b', journal_entry_id: 'je003', account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', debit: 0, credit: 8500000, description: 'Clear AR INV-2026-001', currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
  {
    id: 'je004', entry_number: 'JE-2026-0004', entry_date: '2026-06-12',
    reference: 'BILL-2026-001', description: 'Supplier bill: TPA Port Charges', status: 'POSTED',
    source_module: 'AP', source_id: 'bill001', created_by: null, posted_at: '2026-06-12T09:00:00Z',
    lines: [
      { id: 'jl004a', journal_entry_id: 'je004', account_id: 'a5000', account_code: '5000', account_name: 'Port & Customs Charges', debit: 2800000, credit: 0, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl004b', journal_entry_id: 'je004', account_id: 'a2000', account_code: '2000', account_name: 'Accounts Payable', debit: 0, credit: 2800000, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
  {
    id: 'je005', entry_number: 'JE-2026-0005', entry_date: '2026-06-15',
    reference: 'INV-2026-003', description: 'Sales invoice: DSM Exporters', status: 'POSTED',
    source_module: 'AR', source_id: 'inv003', created_by: null, posted_at: '2026-06-15T11:00:00Z',
    lines: [
      { id: 'jl005a', journal_entry_id: 'je005', account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', debit: 6100000, credit: 0, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl005b', journal_entry_id: 'je005', account_id: 'a4300', account_code: '4300', account_name: 'Transport Revenue', debit: 0, credit: 6100000, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
  {
    id: 'je006', entry_number: 'JE-2026-0006', entry_date: '2026-06-20',
    reference: 'SAL-JUN', description: 'Salaries — June 2026', status: 'POSTED',
    source_module: 'MANUAL', source_id: null, created_by: null, posted_at: '2026-06-20T08:00:00Z',
    lines: [
      { id: 'jl006a', journal_entry_id: 'je006', account_id: 'a5100', account_code: '5100', account_name: 'Salaries & Wages', debit: 4500000, credit: 0, description: 'June payroll', currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 0 },
      { id: 'jl006b', journal_entry_id: 'je006', account_id: 'a1010', account_code: '1010', account_name: 'Bank Account (TZS)', debit: 0, credit: 4500000, description: null, currency: 'TZS', exchange_rate: 1, dimensions: {}, sort_order: 1 },
    ],
  },
];

// ── Trial Balance ─────────────────────────────────────────────
export const MOCK_TRIAL_BALANCE: TrialBalanceReport = {
  period: { from: '2026-06-01', to: '2026-06-28' },
  rows: [
    { account_id: 'a1001', account_code: '1001', account_name: 'Cash on Hand', account_type: 'ASSET', opening_debit: 500000, opening_credit: 0, period_debit: 0, period_credit: 0, closing_debit: 500000, closing_credit: 0 },
    { account_id: 'a1010', account_code: '1010', account_name: 'Bank Account (TZS)', account_type: 'ASSET', opening_debit: 12000000, opening_credit: 0, period_debit: 8500000, period_credit: 4500000, closing_debit: 16000000, closing_credit: 0 },
    { account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', account_type: 'ASSET', opening_debit: 3000000, opening_credit: 0, period_debit: 18800000, period_credit: 8500000, closing_debit: 13300000, closing_credit: 0 },
    { account_id: 'a2000', account_code: '2000', account_name: 'Accounts Payable', account_type: 'LIABILITY', opening_debit: 0, opening_credit: 1500000, period_debit: 0, period_credit: 2800000, closing_debit: 0, closing_credit: 4300000 },
    { account_id: 'a3000', account_code: '3000', account_name: 'Share Capital', account_type: 'EQUITY', opening_debit: 0, opening_credit: 10000000, period_debit: 0, period_credit: 0, closing_debit: 0, closing_credit: 10000000 },
    { account_id: 'a3100', account_code: '3100', account_name: 'Retained Earnings', account_type: 'EQUITY', opening_debit: 0, opening_credit: 4000000, period_debit: 0, period_credit: 0, closing_debit: 0, closing_credit: 4000000 },
    { account_id: 'a4000', account_code: '4000', account_name: 'Freight Revenue', account_type: 'REVENUE', opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 8500000, closing_debit: 0, closing_credit: 8500000 },
    { account_id: 'a4100', account_code: '4100', account_name: 'Customs Clearance Fees', account_type: 'REVENUE', opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 4200000, closing_debit: 0, closing_credit: 4200000 },
    { account_id: 'a4300', account_code: '4300', account_name: 'Transport Revenue', account_type: 'REVENUE', opening_debit: 0, opening_credit: 0, period_debit: 0, period_credit: 6100000, closing_debit: 0, closing_credit: 6100000 },
    { account_id: 'a5000', account_code: '5000', account_name: 'Port & Customs Charges', account_type: 'EXPENSE', opening_debit: 0, opening_credit: 0, period_debit: 2800000, period_credit: 0, closing_debit: 2800000, closing_credit: 0 },
    { account_id: 'a5100', account_code: '5100', account_name: 'Salaries & Wages', account_type: 'EXPENSE', opening_debit: 0, opening_credit: 0, period_debit: 4500000, period_credit: 0, closing_debit: 4500000, closing_credit: 0 },
  ],
  totals: { debit: 37100000, credit: 37100000 },
};

// ── Balance Sheet ─────────────────────────────────────────────
export const MOCK_BALANCE_SHEET: BalanceSheetReport = {
  date: '2026-06-28',
  assets: [
    { account_id: 'a1001', account_code: '1001', account_name: 'Cash on Hand', subtype: 'CURRENT_ASSET', balance: 500000 },
    { account_id: 'a1010', account_code: '1010', account_name: 'Bank Account (TZS)', subtype: 'CURRENT_ASSET', balance: 16000000 },
    { account_id: 'a1011', account_code: '1011', account_name: 'Bank Account (USD)', subtype: 'CURRENT_ASSET', balance: 2400000 },
    { account_id: 'a1100', account_code: '1100', account_name: 'Accounts Receivable', subtype: 'CURRENT_ASSET', balance: 13300000 },
    { account_id: 'a1200', account_code: '1200', account_name: 'Prepaid Expenses', subtype: 'CURRENT_ASSET', balance: 800000 },
    { account_id: 'a1501', account_code: '1501', account_name: 'Office Equipment', subtype: 'FIXED_ASSET', balance: 3200000 },
    { account_id: 'a1502', account_code: '1502', account_name: 'Motor Vehicles', subtype: 'FIXED_ASSET', balance: 8500000 },
  ],
  liabilities: [
    { account_id: 'a2000', account_code: '2000', account_name: 'Accounts Payable', subtype: 'CURRENT_LIABILITY', balance: 4300000 },
    { account_id: 'a2200', account_code: '2200', account_name: 'VAT Payable', subtype: 'CURRENT_LIABILITY', balance: 1260000 },
    { account_id: 'a2300', account_code: '2300', account_name: 'Withholding Tax Payable', subtype: 'CURRENT_LIABILITY', balance: 420000 },
  ],
  equity: [
    { account_id: 'a3000', account_code: '3000', account_name: 'Share Capital', subtype: 'EQUITY', balance: 10000000 },
    { account_id: 'a3100', account_code: '3100', account_name: 'Retained Earnings', subtype: 'RETAINED_EARNINGS', balance: 28720000 },
  ],
  totals: { assets: 44700000, liabilities: 5980000, equity: 38720000 },
};

// ── Profit & Loss ─────────────────────────────────────────────
export const MOCK_PROFIT_LOSS: ProfitLossReport = {
  period: { from: '2026-06-01', to: '2026-06-28' },
  revenue: [
    { account_id: 'a4000', account_code: '4000', account_name: 'Freight Revenue', subtype: 'OPERATING_REVENUE', amount: 8500000 },
    { account_id: 'a4100', account_code: '4100', account_name: 'Customs Clearance Fees', subtype: 'OPERATING_REVENUE', amount: 4200000 },
    { account_id: 'a4200', account_code: '4200', account_name: 'Port Handling Revenue', subtype: 'OPERATING_REVENUE', amount: 1800000 },
    { account_id: 'a4300', account_code: '4300', account_name: 'Transport Revenue', subtype: 'OPERATING_REVENUE', amount: 6100000 },
  ],
  expenses: [
    { account_id: 'a5000', account_code: '5000', account_name: 'Port & Customs Charges', subtype: 'COST_OF_SERVICES', amount: 2800000 },
    { account_id: 'a5001', account_code: '5001', account_name: 'Freight Costs', subtype: 'COST_OF_SERVICES', amount: 1200000 },
    { account_id: 'a5002', account_code: '5002', account_name: 'Transport Costs', subtype: 'COST_OF_SERVICES', amount: 900000 },
    { account_id: 'a5003', account_code: '5003', account_name: 'Storage & Demurrage', subtype: 'COST_OF_SERVICES', amount: 450000 },
    { account_id: 'a5100', account_code: '5100', account_name: 'Salaries & Wages', subtype: 'OPERATING_EXPENSE', amount: 4500000 },
    { account_id: 'a5101', account_code: '5101', account_name: 'Office Rent', subtype: 'OPERATING_EXPENSE', amount: 800000 },
    { account_id: 'a5200', account_code: '5200', account_name: 'Bank Charges', subtype: 'FINANCE_COST', amount: 120000 },
  ],
  totals: { revenue: 20600000, expenses: 10770000, net: 9830000 },
};

// ── Accounts Receivable Ledger ────────────────────────────────
export const MOCK_AR_LEDGER: LedgerReport = {
  account: { id: 'a1100', code: '1100', name: 'Accounts Receivable', type: 'ASSET', normal_balance: 'DEBIT' },
  period: { from: '2026-06-01', to: '2026-06-28' },
  opening_balance: 3000000,
  entries: [
    { id: 'je001', date: '2026-06-01', entry_number: 'JE-2026-0001', reference: 'INV-2026-001', description: 'Sales invoice: Cargo Ltd', debit: 8500000, credit: 0, running_balance: 11500000, source_module: 'AR' },
    { id: 'je002', date: '2026-06-05', entry_number: 'JE-2026-0002', reference: 'INV-2026-002', description: 'Sales invoice: Simba Logistics', debit: 4200000, credit: 0, running_balance: 15700000, source_module: 'AR' },
    { id: 'je003', date: '2026-06-10', entry_number: 'JE-2026-0003', reference: 'PMT-001', description: 'Payment received: INV-2026-001', debit: 0, credit: 8500000, running_balance: 7200000, source_module: 'AR' },
    { id: 'je005', date: '2026-06-15', entry_number: 'JE-2026-0005', reference: 'INV-2026-003', description: 'Sales invoice: DSM Exporters', debit: 6100000, credit: 0, running_balance: 13300000, source_module: 'AR' },
  ],
  closing_balance: 13300000,
};

// ── Aged Receivables ──────────────────────────────────────────
export const MOCK_AGED_RECEIVABLES: AgedReport = {
  as_of: '2026-06-28',
  rows: [
    { entity_id: 'c001', entity_name: 'Simba Logistics Ltd', current: 4200000, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 4200000, oldest_invoice_date: '2026-06-05' },
    { entity_id: 'c002', entity_name: 'DSM Exporters Co.', current: 6100000, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 6100000, oldest_invoice_date: '2026-06-15' },
    { entity_id: 'c003', entity_name: 'Pemba Spice Trading', current: 0, days_1_30: 1800000, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 1800000, oldest_invoice_date: '2026-05-28' },
    { entity_id: 'c004', entity_name: 'Zanzibar Transit Hub', current: 0, days_1_30: 0, days_31_60: 2200000, days_61_90: 0, days_90_plus: 0, total: 2200000, oldest_invoice_date: '2026-04-15' },
    { entity_id: 'c005', entity_name: 'Kilimanjaro Imports', current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 750000, total: 750000, oldest_invoice_date: '2026-02-10' },
  ],
  totals: { current: 10300000, days_1_30: 1800000, days_31_60: 2200000, days_61_90: 0, days_90_plus: 750000, total: 15050000 },
};

// ── Aged Payables ─────────────────────────────────────────────
export const MOCK_AGED_PAYABLES: AgedReport = {
  as_of: '2026-06-28',
  rows: [
    { entity_id: 's001', entity_name: 'TPA (Tanzania Ports Authority)', current: 2800000, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 2800000, oldest_invoice_date: '2026-06-12' },
    { entity_id: 's002', entity_name: 'TANCIS Processing Fees', current: 0, days_1_30: 850000, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 850000, oldest_invoice_date: '2026-06-02' },
    { entity_id: 's003', entity_name: 'Maersk Line (Freight)', current: 0, days_1_30: 0, days_31_60: 1500000, days_61_90: 0, days_90_plus: 0, total: 1500000, oldest_invoice_date: '2026-04-20' },
  ],
  totals: { current: 2800000, days_1_30: 850000, days_31_60: 1500000, days_61_90: 0, days_90_plus: 0, total: 5150000 },
};

// ── Cash Flow ─────────────────────────────────────────────────
export const MOCK_CASH_FLOW: CashFlowReport = {
  period: { from: '2026-06-01', to: '2026-06-28' },
  opening_cash: 12500000,
  closing_cash: 16400000,
  totals: { operating: 4500000, investing: -600000, financing: 0, net: 3900000 },
  items: [
    { label: 'Cash from customers (AR collections)', amount: 8500000, category: 'OPERATING' },
    { label: 'Payments to suppliers (AP)', amount: -1200000, category: 'OPERATING' },
    { label: 'Salaries paid', amount: -4500000, category: 'OPERATING' },
    { label: 'Other operating outflows', amount: -300000, category: 'OPERATING' },
    { label: 'Purchase of office equipment', amount: -600000, category: 'INVESTING' },
  ],
};

// ── Ledger accounts (richer domain data — mirrors what FinanceLedger renders) ──
export interface LedgerAccount {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  openingBalance: number; // positive = debit-normal; negative = credit-normal
  entries: Array<{ date: string; ref: string; description: string; debit: number; credit: number }>;
}

export const MOCK_LEDGER_ACCOUNTS: LedgerAccount[] = [
  { code:'1100', name:'Cash & Bank', type:'ASSET', openingBalance:98_400_000, entries:[
    { date:'2026-06-01', ref:'RCT-0241', description:'Receipt – Dangote Industries (INV-0081)', debit:18_700_000, credit:0 },
    { date:'2026-06-03', ref:'PMT-0118', description:'Payment – TPA Port Charges (CLR-2026-0005)', debit:0, credit:1_850_000 },
    { date:'2026-06-05', ref:'RCT-0242', description:'Receipt – TPC Ltd Sugar Mill (INV-0079)', debit:14_200_000, credit:0 },
    { date:'2026-06-08', ref:'PMT-0119', description:'Salary disbursement – June 2026', debit:0, credit:12_400_000 },
    { date:'2026-06-10', ref:'PMT-0120', description:'MSC Demurrage payment', debit:0, credit:840_000 },
    { date:'2026-06-12', ref:'RCT-0243', description:'Receipt – Simba Cement Ltd (INV-0082)', debit:9_600_000, credit:0 },
    { date:'2026-06-14', ref:'PMT-0121', description:'Office rent – June 2026', debit:0, credit:2_800_000 },
  ]},
  { code:'1200', name:'Accounts Receivable', type:'ASSET', openingBalance:64_300_000, entries:[
    { date:'2026-06-02', ref:'INV-0083', description:'Invoice – East African Breweries', debit:11_400_000, credit:0 },
    { date:'2026-06-05', ref:'RCT-0242', description:'Receipt from TPC Ltd – settled', debit:0, credit:14_200_000 },
    { date:'2026-06-07', ref:'INV-0084', description:'Invoice – Kariakoo General Traders', debit:5_800_000, credit:0 },
    { date:'2026-06-01', ref:'RCT-0241', description:'Receipt from Dangote – settled', debit:0, credit:18_700_000 },
    { date:'2026-06-13', ref:'INV-0085', description:'Invoice – TAZARA Railway', debit:16_400_000, credit:0 },
    { date:'2026-06-12', ref:'RCT-0243', description:'Receipt from Simba Cement – settled', debit:0, credit:9_600_000 },
  ]},
  { code:'1300', name:'Prepaid Expenses', type:'ASSET', openingBalance:6_200_000, entries:[
    { date:'2026-06-01', ref:'JNL-0044', description:'Prepaid insurance – amortisation June', debit:0, credit:620_000 },
    { date:'2026-06-01', ref:'JNL-0045', description:'Prepaid software licences – amortisation', debit:0, credit:480_000 },
    { date:'2026-06-10', ref:'PMT-0122', description:'Annual vehicle insurance – prepaid', debit:3_600_000, credit:0 },
  ]},
  { code:'1500', name:'Office Equipment (Net)', type:'ASSET', openingBalance:24_800_000, entries:[
    { date:'2026-06-01', ref:'JNL-0046', description:'Depreciation – office equipment June', debit:0, credit:412_000 },
    { date:'2026-06-09', ref:'PO-0061', description:'New laptop – accounts team', debit:1_850_000, credit:0 },
  ]},
  { code:'1600', name:'Motor Vehicles (Net)', type:'ASSET', openingBalance:68_000_000, entries:[
    { date:'2026-06-01', ref:'JNL-0047', description:'Depreciation – motor vehicles June', debit:0, credit:1_133_000 },
    { date:'2026-06-06', ref:'PMT-0123', description:'Vehicle repair & maintenance', debit:0, credit:1_240_000 },
  ]},
  { code:'2100', name:'Accounts Payable', type:'LIABILITY', openingBalance:-38_400_000, entries:[
    { date:'2026-06-03', ref:'PMT-0118', description:'Payment to TPA – port charges settled', debit:1_850_000, credit:0 },
    { date:'2026-06-05', ref:'BILL-0041', description:'Bill received – Maersk Line freight', debit:0, credit:8_400_000 },
    { date:'2026-06-08', ref:'BILL-0042', description:'Bill received – TASAC inspection fees', debit:0, credit:1_100_000 },
    { date:'2026-06-11', ref:'PMT-0124', description:'Payment to CMA CGM – settled', debit:4_200_000, credit:0 },
  ]},
  { code:'2200', name:'VAT Payable', type:'LIABILITY', openingBalance:-9_800_000, entries:[
    { date:'2026-06-02', ref:'JNL-0048', description:'VAT on sales invoices – June batch 1', debit:0, credit:1_710_000 },
    { date:'2026-06-07', ref:'JNL-0049', description:'VAT on sales invoices – June batch 2', debit:0, credit:870_000 },
    { date:'2026-06-10', ref:'TRA-0022', description:'VAT remittance – May 2026', debit:8_600_000, credit:0 },
    { date:'2026-06-13', ref:'JNL-0050', description:'VAT on sales invoices – June batch 3', debit:0, credit:2_460_000 },
  ]},
  { code:'2300', name:'Withholding Tax Payable', type:'LIABILITY', openingBalance:-2_400_000, entries:[
    { date:'2026-06-08', ref:'JNL-0051', description:'WHT deducted from supplier payments', debit:0, credit:420_000 },
    { date:'2026-06-10', ref:'TRA-0023', description:'WHT remittance to TRA – May 2026', debit:2_100_000, credit:0 },
  ]},
  { code:'2400', name:'Advance from Customers', type:'LIABILITY', openingBalance:-18_000_000, entries:[
    { date:'2026-06-04', ref:'RCT-0244', description:'Advance received – TAZARA new shipment', debit:0, credit:6_500_000 },
    { date:'2026-06-13', ref:'JNL-0052', description:'Advance applied to INV-0085 (TAZARA)', debit:6_500_000, credit:0 },
  ]},
  { code:'3100', name:'Share Capital', type:'EQUITY', openingBalance:-100_000_000, entries:[
    { date:'2026-06-01', ref:'JNL-0053', description:'No movement – share capital unchanged', debit:0, credit:0 },
  ]},
  { code:'3200', name:'Retained Earnings', type:'EQUITY', openingBalance:-161_500_000, entries:[
    { date:'2026-06-01', ref:'JNL-0054', description:'Opening retained earnings b/f', debit:0, credit:0 },
  ]},
  { code:'4100', name:'Clearance Fees', type:'REVENUE', openingBalance:-42_600_000, entries:[
    { date:'2026-06-02', ref:'INV-0083', description:'Clearance fee – East African Breweries', debit:0, credit:2_200_000 },
    { date:'2026-06-07', ref:'INV-0084', description:'Clearance fee – Kariakoo Traders', debit:0, credit:1_800_000 },
    { date:'2026-06-13', ref:'INV-0085', description:'Clearance fee – TAZARA Railway', debit:0, credit:3_400_000 },
  ]},
  { code:'4200', name:'Agency Fees', type:'REVENUE', openingBalance:-10_200_000, entries:[
    { date:'2026-06-02', ref:'INV-0083', description:'Agency fee – East African Breweries', debit:0, credit:620_000 },
    { date:'2026-06-07', ref:'INV-0084', description:'Agency fee – Kariakoo Traders', debit:0, credit:500_000 },
    { date:'2026-06-13', ref:'INV-0085', description:'Agency fee – TAZARA Railway', debit:0, credit:800_000 },
  ]},
  { code:'4300', name:'Transport Fees', type:'REVENUE', openingBalance:-7_800_000, entries:[
    { date:'2026-06-07', ref:'INV-0084', description:'Transport fee – Kariakoo Traders', debit:0, credit:480_000 },
    { date:'2026-06-13', ref:'INV-0085', description:'Transport fee – TAZARA (Dar-Mwanza)', debit:0, credit:1_200_000 },
  ]},
  { code:'4400', name:'Documentation Fees', type:'REVENUE', openingBalance:-5_600_000, entries:[
    { date:'2026-06-02', ref:'INV-0083', description:'Documentation – East African Breweries', debit:0, credit:350_000 },
    { date:'2026-06-13', ref:'INV-0085', description:'Documentation – TAZARA Railway', debit:0, credit:350_000 },
  ]},
  { code:'4500', name:'Storage & Demurrage Recovery', type:'REVENUE', openingBalance:-6_200_000, entries:[
    { date:'2026-06-05', ref:'INV-0086', description:'Demurrage recovery – TPC Ltd (CLR-0005)', debit:0, credit:840_000 },
    { date:'2026-06-09', ref:'INV-0087', description:'Storage recovery – EAL CLR-0016', debit:0, credit:480_000 },
  ]},
  { code:'5100', name:'Port & Terminal Charges', type:'EXPENSE', openingBalance:16_200_000, entries:[
    { date:'2026-06-03', ref:'BILL-0040', description:'TPA port charges – CLR-2026-0001', debit:1_850_000, credit:0 },
    { date:'2026-06-08', ref:'BILL-0043', description:'Terminal handling – CLR-2026-0005', debit:1_400_000, credit:0 },
  ]},
  { code:'5200', name:'Shipping Line Fees', type:'EXPENSE', openingBalance:6_400_000, entries:[
    { date:'2026-06-05', ref:'BILL-0041', description:'Maersk freight charges – CLR-2026-0014', debit:8_400_000, credit:0 },
  ]},
  { code:'5300', name:'Government Duties (Passthrough)', type:'EXPENSE', openingBalance:12_800_000, entries:[
    { date:'2026-06-04', ref:'TRA-0024', description:'Import duty – Dangote CLR-2026-0001', debit:72_000_000, credit:0 },
    { date:'2026-06-04', ref:'TRA-0024', description:'Rebilled to client – Dangote', debit:0, credit:72_000_000 },
    { date:'2026-06-09', ref:'TRA-0025', description:'Import duty – TPC CLR-2026-0005', debit:58_200_000, credit:0 },
    { date:'2026-06-09', ref:'TRA-0025', description:'Rebilled to client – TPC', debit:0, credit:58_200_000 },
  ]},
  { code:'5400', name:'Inspection & Survey Fees', type:'EXPENSE', openingBalance:3_800_000, entries:[
    { date:'2026-06-08', ref:'BILL-0042', description:'TASAC inspection – CLR-2026-0011', debit:1_100_000, credit:0 },
    { date:'2026-06-10', ref:'BILL-0044', description:'TMDA inspection – CLR-2026-0008', debit:280_000, credit:0 },
  ]},
  { code:'5500', name:'Haulage & Transport Costs', type:'EXPENSE', openingBalance:4_800_000, entries:[
    { date:'2026-06-07', ref:'BILL-0045', description:'Haulage Dar–Arusha – CLR-2026-0002', debit:450_000, credit:0 },
    { date:'2026-06-13', ref:'BILL-0046', description:'Delivery to Muhimbili – CLR-2026-0010', debit:190_000, credit:0 },
  ]},
  { code:'6100', name:'Staff Salaries & Allowances', type:'EXPENSE', openingBalance:16_000_000, entries:[
    { date:'2026-06-08', ref:'PMT-0119', description:'Payroll – June 2026 (all staff)', debit:12_400_000, credit:0 },
  ]},
  { code:'6200', name:'Rent & Utilities', type:'EXPENSE', openingBalance:8_400_000, entries:[
    { date:'2026-06-14', ref:'PMT-0121', description:'Office rent – Msasani Road, June 2026', debit:2_800_000, credit:0 },
    { date:'2026-06-14', ref:'PMT-0125', description:'TANESCO electricity bill – June', debit:340_000, credit:0 },
  ]},
  { code:'6300', name:'Communications', type:'EXPENSE', openingBalance:1_040_000, entries:[
    { date:'2026-06-01', ref:'PMT-0126', description:'Mobile & internet – June 2026', debit:380_000, credit:0 },
  ]},
  { code:'6500', name:'Vehicle Running Expenses', type:'EXPENSE', openingBalance:1_600_000, entries:[
    { date:'2026-06-06', ref:'PMT-0123', description:'Vehicle repair & service – TZ-123-ABC', debit:1_240_000, credit:0 },
  ]},
  { code:'6600', name:'Bank Charges & Forex', type:'EXPENSE', openingBalance:480_000, entries:[
    { date:'2026-06-10', ref:'BNK-0031', description:'NBC bank charges – June 2026', debit:220_000, credit:0 },
    { date:'2026-06-13', ref:'BNK-0032', description:'Forex loss – USD payment', debit:84_000, credit:0 },
  ]},
];

// ── Trial balance accounts (mirrors FinanceTrialBalance TB_ACCOUNTS) ──────────
export interface TBAccount {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  debit: number;
  credit: number;
}

export const MOCK_TB_ACCOUNTS: TBAccount[] = [
  { code:'1100', name:'Cash & Bank',                     type:'ASSET',     debit:168_810_000, credit:0 },
  { code:'1200', name:'Accounts Receivable',             type:'ASSET',     debit: 55_500_000, credit:0 },
  { code:'1300', name:'Prepaid Expenses',                type:'ASSET',     debit:  8_700_000, credit:0 },
  { code:'1500', name:'Office Equipment (Net)',           type:'ASSET',     debit: 26_238_000, credit:0 },
  { code:'1600', name:'Motor Vehicles (Net)',             type:'ASSET',     debit: 65_627_000, credit:0 },
  { code:'2100', name:'Accounts Payable',                type:'LIABILITY', debit:0, credit: 43_850_000 },
  { code:'2200', name:'VAT Payable',                     type:'LIABILITY', debit:0, credit:  4_040_000 },
  { code:'2300', name:'Withholding Tax Payable',         type:'LIABILITY', debit:0, credit:    720_000 },
  { code:'2400', name:'Advance from Customers',          type:'LIABILITY', debit:0, credit: 18_000_000 },
  { code:'3100', name:'Share Capital',                   type:'EQUITY',    debit:0, credit:100_000_000 },
  { code:'3200', name:'Retained Earnings',               type:'EQUITY',    debit:0, credit:161_500_000 },
  { code:'4100', name:'Clearance Fees',                  type:'REVENUE',   debit:0, credit: 49_600_000 },
  { code:'4200', name:'Agency Fees',                     type:'REVENUE',   debit:0, credit: 12_120_000 },
  { code:'4300', name:'Transport Fees',                  type:'REVENUE',   debit:0, credit:  9_480_000 },
  { code:'4400', name:'Documentation Fees',              type:'REVENUE',   debit:0, credit:  6_300_000 },
  { code:'4500', name:'Storage & Demurrage Recovery',    type:'REVENUE',   debit:0, credit:  7_520_000 },
  { code:'5100', name:'Port & Terminal Charges',         type:'EXPENSE',   debit: 19_450_000, credit:0 },
  { code:'5200', name:'Shipping Line Fees',              type:'EXPENSE',   debit: 14_800_000, credit:0 },
  { code:'5300', name:'Government Duties (Passthrough)', type:'EXPENSE',   debit: 13_000_000, credit:0 },
  { code:'5400', name:'Inspection & Survey Fees',        type:'EXPENSE',   debit:  5_180_000, credit:0 },
  { code:'5500', name:'Haulage & Transport Costs',       type:'EXPENSE',   debit:  5_440_000, credit:0 },
  { code:'6100', name:'Staff Salaries & Allowances',     type:'EXPENSE',   debit: 28_400_000, credit:0 },
  { code:'6200', name:'Rent & Utilities',                type:'EXPENSE',   debit: 11_540_000, credit:0 },
  { code:'6300', name:'Communications',                  type:'EXPENSE',   debit:  1_420_000, credit:0 },
  { code:'6500', name:'Vehicle Running Expenses',        type:'EXPENSE',   debit:  2_840_000, credit:0 },
  { code:'6600', name:'Bank Charges & Forex',            type:'EXPENSE',   debit:    784_000, credit:0 },
];

// ── Aged receivables customers (richer data than MOCK_AGED_RECEIVABLES) ───────
export interface AgedCustomer {
  name: string; current: number; d30: number; d60: number; d90: number; over90: number; total: number;
}
export const MOCK_AR_CUSTOMERS: AgedCustomer[] = [
  { name:'Simba Logistics Ltd',      current:1_720_000, d30:0,         d60:0,         d90:0,       over90:0,       total:1_720_000 },
  { name:'Dar Freight Solutions',    current:0,         d30:3_100_000, d60:0,         d90:0,       over90:0,       total:3_100_000 },
  { name:'Zanzibar Export Bureau',   current:850_000,   d30:0,         d60:420_000,   d90:0,       over90:0,       total:1_270_000 },
  { name:'Mombasa Gate Clearers',    current:740_000,   d30:0,         d60:0,         d90:0,       over90:0,       total:740_000   },
  { name:'TanzaPort Logistics',      current:0,         d30:0,         d60:2_200_000, d90:0,       over90:0,       total:2_200_000 },
  { name:'Nairobi Express Cargo',    current:660_000,   d30:0,         d60:0,         d90:660_000, over90:0,       total:1_320_000 },
  { name:'Arusha Port Agents',       current:0,         d30:0,         d60:0,         d90:540_000, over90:0,       total:540_000   },
  { name:'Ocean Bridge Clearing',    current:0,         d30:0,         d60:0,         d90:0,       over90:320_000, total:320_000   },
  { name:'Dodoma Trade Solutions',   current:420_000,   d30:0,         d60:0,         d90:0,       over90:180_000, total:600_000   },
];

export interface AgedSupplier {
  name: string; current: number; d30: number; d60: number; d90: number; over90: number; total: number;
}
export const MOCK_AP_SUPPLIERS: AgedSupplier[] = [
  { name:'DHL Express EA',              current:850_000,  d30:0,       d60:0,         d90:0,       over90:0,       total:850_000   },
  { name:'TPA (Dar Port Authority)',    current:0,        d30:480_000, d60:0,         d90:0,       over90:0,       total:480_000   },
  { name:'TRA (Revenue Authority)',     current:1_200_000,d30:0,       d60:0,         d90:0,       over90:0,       total:1_200_000 },
  { name:'MSC Mediterranean Shipping', current:0,        d30:0,       d60:1_100_000, d90:0,       over90:0,       total:1_100_000 },
  { name:'Zanzibar Port Corp',          current:290_000,  d30:0,       d60:0,         d90:0,       over90:0,       total:290_000   },
  { name:'Kenya Revenue Authority',     current:0,        d30:0,       d60:0,         d90:620_000, over90:0,       total:620_000   },
  { name:'TAZARA Rail Freight',         current:0,        d30:0,       d60:0,         d90:0,       over90:240_000, total:240_000   },
  { name:'Freight Logistics Kenya',     current:420_000,  d30:0,       d60:310_000,   d90:0,       over90:0,       total:730_000   },
  { name:'Mombasa Port Services',       current:0,        d30:185_000, d60:0,         d90:0,       over90:0,       total:185_000   },
];

// ── Flat account map for quick lookups ────────────────────────
function flattenCOA(tree: ChartOfAccount[]): ChartOfAccount[] {
  const result: ChartOfAccount[] = [];
  function walk(accounts: ChartOfAccount[]) {
    for (const a of accounts) {
      result.push(a);
      if (a.children?.length) walk(a.children);
    }
  }
  walk(tree);
  return result;
}

export const FLAT_COA = flattenCOA(MOCK_COA);
export const COA_MAP = Object.fromEntries(FLAT_COA.map(a => [a.code, a]));
