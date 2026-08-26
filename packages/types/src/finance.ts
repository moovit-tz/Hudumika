// ─── Hudumika Finance Core Types ──────────────────────────────

// ── Chart of Accounts ─────────────────────────────────────────
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountSubtype =
  | 'CURRENT_ASSET' | 'FIXED_ASSET' | 'OTHER_ASSET' | 'DEFERRED_TAX'
  | 'CURRENT_LIABILITY' | 'LONG_TERM_LIABILITY'
  | 'EQUITY' | 'RETAINED_EARNINGS'
  | 'OPERATING_REVENUE' | 'OTHER_REVENUE'
  | 'COST_OF_SERVICES' | 'OPERATING_EXPENSE' | 'ADMIN_EXPENSE' | 'FINANCE_COST' | 'TAX_EXPENSE';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype | null;
  parent_id: string | null;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  normal_balance: 'DEBIT' | 'CREDIT';
  currency: string;
  children?: ChartOfAccount[];
}

// ── Journal / General Ledger ──────────────────────────────────
export type JournalStatus = 'DRAFT' | 'POSTED' | 'VOIDED';
export type SourceModule = 'AR' | 'AP' | 'EXPENSE' | 'MANUAL' | 'PAYROLL';

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string | null;
  currency: string;
  exchange_rate: number;
  dimensions: Record<string, string>;
  sort_order: number;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  reference: string | null;
  description: string;
  status: JournalStatus;
  source_module: SourceModule | null;
  source_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  lines: JournalLine[];
}

// ── Posting Engine (what modules send) ────────────────────────
export interface PostingLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  currency?: string;
  exchangeRate?: number;
  dimensions?: Record<string, string>;
}

export interface PostingRequest {
  entryDate: string;
  description: string;
  reference?: string;
  sourceModule: SourceModule;
  sourceId?: string;
  createdBy?: string;
  /** Tags this entry to one of the tenant's accounting_entities (M8, multi-entity accounting). Omit for a tenant with no branches — unchanged from before this field existed. */
  entityId?: string;
  lines: PostingLineInput[];
}

// ── Reporting types ───────────────────────────────────────────
export interface TrialBalanceRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
}

export interface TrialBalanceReport {
  period: { from: string; to: string };
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
}

export interface BalanceSheetLine {
  account_id: string;
  account_code: string;
  account_name: string;
  subtype: AccountSubtype | null;
  balance: number;
}

export interface BalanceSheetReport {
  date: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totals: { assets: number; liabilities: number; equity: number };
}

export interface ProfitLossLine {
  account_id: string;
  account_code: string;
  account_name: string;
  subtype: AccountSubtype | null;
  amount: number;
}

export interface ProfitLossReport {
  period: { from: string; to: string };
  revenue: ProfitLossLine[];
  expenses: ProfitLossLine[];
  totals: { revenue: number; expenses: number; net: number };
}

export interface LedgerEntry {
  id: string;
  date: string;
  entry_number: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  source_module: SourceModule | null;
}

export interface LedgerReport {
  account: Pick<ChartOfAccount, 'id' | 'code' | 'name' | 'type' | 'normal_balance'>;
  period: { from: string; to: string };
  opening_balance: number;
  entries: LedgerEntry[];
  closing_balance: number;
}

export interface AgedRow {
  entity_id: string;
  entity_name: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
  oldest_invoice_date: string | null;
}

export interface AgedReport {
  as_of: string;
  rows: AgedRow[];
  totals: Omit<AgedRow, 'entity_id' | 'entity_name' | 'oldest_invoice_date'>;
}

export interface CashFlowItem {
  label: string;
  amount: number;
  category: 'OPERATING' | 'INVESTING' | 'FINANCING';
}

export interface CashFlowReport {
  period: { from: string; to: string };
  items: CashFlowItem[];
  totals: { operating: number; investing: number; financing: number; net: number };
  opening_cash: number;
  closing_cash: number;
}

// ── Purchase Orders ───────────────────────────────────────────
export type POStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface POLine {
  id: string;
  po_id: string;
  description: string;
  category: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  received_qty: number;
  sort_order: number;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: POStatus;
  order_date: string | null;
  expected_date: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: POLine[];
}

// ── Delivery Notes ────────────────────────────────────────────
export type DNStatus = 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'RETURNED';

export interface DNLine {
  id: string;
  dn_id: string;
  description: string;
  qty_ordered: number;
  qty_delivered: number;
  unit: string | null;
  notes: string | null;
  sort_order: number;
}

export interface DeliveryNote {
  id: string;
  dn_number: string;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  delivery_date: string | null;
  status: DNStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  lines?: DNLine[];
}
