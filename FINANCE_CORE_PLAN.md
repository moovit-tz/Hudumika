# Finance Core — Parallel Build Plan
> Two-agent execution: **Agent A (Antigravity) = backend**, **Agent B (Claude) = frontend**
> Stack: TypeScript · Node.js (Express + Kysely) · PostgreSQL · React

---

## Repo Context

```
d:\Apps\ClearOS\
  apps/
    api/src/
      db/client.ts          ← Kysely Database interface + table interfaces
      db/migrations/        ← SQL files, numbered 001–020
      routes/               ← Express routers, one file per domain
      services/             ← Business logic classes
    web/src/
      pages/                ← React page components
      shells/               ← App shells (FinOpsShell.tsx owns /finance/*)
      lib/navConfigs.ts     ← HorizontalNav categories per app
      data/                 ← Client-side stores (calendarStore, taskStore pattern)
  packages/
    types/src/
      finance.ts            ← NEW: shared types (written first, unblocks both tracks)
      index.ts              ← barrel export
```

### Existing finance tables (already in DB)
`sales_invoices`, `sales_invoice_lines`, `invoice_payments`,
`supplier_bills`, `supplier_bill_lines`, `bill_payments`, `recurring_bills`,
`quotations`, `quotation_lines`, `expenses`

### Existing finance API routes
`/v1/invoices/*`, `/v1/bills/*`, `/v1/quotations/*`
(shipment-scoped expenses live inside `/v1/shipments/:id/expenses`)

---

## Phase 0 — Shared Contract (do this FIRST — both agents need it)

**Owner: Agent B (Claude)** — write `packages/types/src/finance.ts` immediately.
Agent A must not start coding until this file is committed.

### File: `packages/types/src/finance.ts`

```typescript
// ── Chart of Accounts ─────────────────────────────────────────
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountSubtype =
  | 'CURRENT_ASSET' | 'FIXED_ASSET' | 'OTHER_ASSET'
  | 'CURRENT_LIABILITY' | 'LONG_TERM_LIABILITY'
  | 'EQUITY' | 'RETAINED_EARNINGS'
  | 'OPERATING_REVENUE' | 'OTHER_REVENUE'
  | 'COST_OF_SERVICES' | 'OPERATING_EXPENSE' | 'ADMIN_EXPENSE' | 'FINANCE_COST';

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

// ── Journal / GL ──────────────────────────────────────────────
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
  entry_date: string;         // ISO date
  reference: string | null;
  description: string;
  status: JournalStatus;
  source_module: SourceModule | null;
  source_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  lines: JournalLine[];
}

// ── Posting Engine (what callers send) ────────────────────────
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
  entryDate: string;           // ISO date
  description: string;
  reference?: string;
  sourceModule: SourceModule;
  sourceId?: string;
  createdBy?: string;
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
```

Also add to `packages/types/src/index.ts`:
```typescript
export * from './finance.js';
```

---

## Track A — Backend (Agent: Antigravity)

**Stack reminders:**
- ORM: Kysely — use `db.selectFrom('table').select(...).where(...).execute()`
- Tenancy: always filter `where('tenant_id', '=', tenantId)` — use `withTenant(tenantId, trx => ...)`
- Auth middleware: routes already get `req.tenantId` and `req.user` injected
- Migration naming: next is `021_finance_gl.sql` then `022_purchase_orders_delivery_notes.sql`
- Register new routes in `apps/api/src/index.ts`

---

### A1 — Migration: GL Tables
**File:** `apps/api/src/db/migrations/021_finance_gl.sql`

```sql
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF (SELECT ABS(COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0))
        FROM journal_lines WHERE journal_entry_id = OLD.journal_entry_id) > 0.01 THEN
      RAISE EXCEPTION 'Journal entry would be unbalanced after delete';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
```

Also seed the standard Tanzania CoA in `apps/api/src/db/seed.ts` — call `seedChartOfAccounts(tenantId, trx)` on new tenant creation.

Standard CoA seed (insert as `is_system = true`):
```
ASSETS
  1000  Cash and Cash Equivalents   ASSET  CURRENT_ASSET  normal=DEBIT
    1001  Cash on Hand
    1010  Bank Account (TZS)
    1011  Bank Account (USD)
  1100  Accounts Receivable         ASSET  CURRENT_ASSET  normal=DEBIT
  1200  Prepaid Expenses            ASSET  CURRENT_ASSET  normal=DEBIT
  1300  Inventory                   ASSET  CURRENT_ASSET  normal=DEBIT
  1500  Fixed Assets (net)          ASSET  FIXED_ASSET    normal=DEBIT
    1501  Office Equipment
    1502  Motor Vehicles
    1503  Accumulated Depreciation  (normal=CREDIT — contra asset)

LIABILITIES
  2000  Accounts Payable            LIABILITY  CURRENT_LIABILITY  normal=CREDIT
  2100  Accrued Liabilities         LIABILITY  CURRENT_LIABILITY  normal=CREDIT
  2200  VAT Payable                 LIABILITY  CURRENT_LIABILITY  normal=CREDIT
  2300  Withholding Tax Payable     LIABILITY  CURRENT_LIABILITY  normal=CREDIT
  2500  Long-term Loans             LIABILITY  LONG_TERM_LIABILITY normal=CREDIT

EQUITY
  3000  Share Capital               EQUITY  EQUITY  normal=CREDIT
  3100  Retained Earnings           EQUITY  RETAINED_EARNINGS  normal=CREDIT

REVENUE
  4000  Freight Revenue             REVENUE  OPERATING_REVENUE  normal=CREDIT
  4100  Customs Clearance Fees      REVENUE  OPERATING_REVENUE  normal=CREDIT
  4200  Port Handling Revenue       REVENUE  OPERATING_REVENUE  normal=CREDIT
  4300  Transport Revenue           REVENUE  OPERATING_REVENUE  normal=CREDIT
  4500  Other Revenue               REVENUE  OTHER_REVENUE      normal=CREDIT

EXPENSES
  5000  Port & Customs Charges      EXPENSE  COST_OF_SERVICES  normal=DEBIT
  5001  Freight Costs               EXPENSE  COST_OF_SERVICES  normal=DEBIT
  5002  Transport Costs             EXPENSE  COST_OF_SERVICES  normal=DEBIT
  5003  Storage & Demurrage         EXPENSE  COST_OF_SERVICES  normal=DEBIT
  5100  Salaries & Wages            EXPENSE  OPERATING_EXPENSE normal=DEBIT
  5101  Office Rent                 EXPENSE  OPERATING_EXPENSE normal=DEBIT
  5102  Utilities                   EXPENSE  OPERATING_EXPENSE normal=DEBIT
  5200  Bank Charges                EXPENSE  FINANCE_COST      normal=DEBIT
  5201  Interest Expense            EXPENSE  FINANCE_COST      normal=DEBIT
```

---

### A2 — Migration: Purchase Orders + Delivery Notes
**File:** `apps/api/src/db/migrations/022_purchase_orders_delivery_notes.sql`

```sql
CREATE TABLE IF NOT EXISTS purchase_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  po_number     VARCHAR(100) NOT NULL,
  supplier_id   VARCHAR(100),
  supplier_name VARCHAR(300),
  status        VARCHAR(20) DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','SENT','PARTIAL','RECEIVED','CANCELLED')),
  order_date    DATE,
  expected_date DATE,
  currency      VARCHAR(5) DEFAULT 'TZS',
  subtotal      NUMERIC(15,2) DEFAULT 0,
  tax_amount    NUMERIC(15,2) DEFAULT 0,
  total         NUMERIC(15,2) DEFAULT 0,
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, po_number)
);

CREATE TABLE IF NOT EXISTS purchase_order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL,
  category      VARCHAR(100),
  qty           NUMERIC(10,2) DEFAULT 1,
  unit_price    NUMERIC(15,2) DEFAULT 0,
  tax_rate      NUMERIC(5,2) DEFAULT 0,
  tax_amount    NUMERIC(15,2) DEFAULT 0,
  line_total    NUMERIC(15,2) DEFAULT 0,
  received_qty  NUMERIC(10,2) DEFAULT 0,
  sort_order    INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  dn_number     VARCHAR(100) NOT NULL,
  invoice_id    UUID REFERENCES sales_invoices(id),
  customer_id   UUID,
  customer_name VARCHAR(300),
  delivery_date DATE,
  status        VARCHAR(20) DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','DISPATCHED','DELIVERED','RETURNED')),
  notes         TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, dn_number)
);

CREATE TABLE IF NOT EXISTS delivery_note_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dn_id         UUID NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
  description   VARCHAR(500) NOT NULL,
  qty_ordered   NUMERIC(10,2) DEFAULT 0,
  qty_delivered NUMERIC(10,2) DEFAULT 0,
  unit          VARCHAR(50),
  notes         TEXT,
  sort_order    INT DEFAULT 0
);
```

---

### A3 — Kysely table interfaces
**File:** `apps/api/src/db/client.ts` — add to the file, then add keys to `Database` interface

```typescript
export interface ChartOfAccountsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  subtype: string | null;
  parent_id: string | null;
  description: string | null;
  is_system: Generated<boolean>;
  is_active: Generated<boolean>;
  normal_balance: 'DEBIT' | 'CREDIT' | null;
  currency: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  entry_number: string;
  entry_date: Date;
  reference: string | null;
  description: string;
  status: Generated<string>;
  source_module: string | null;
  source_id: string | null;
  created_by: string | null;
  posted_at: Generated<Date>;
  voided_at: Date | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalLinesTable {
  id: Generated<string>;
  journal_entry_id: string;
  account_id: string;
  debit: Generated<number>;
  credit: Generated<number>;
  description: string | null;
  currency: Generated<string>;
  exchange_rate: Generated<number>;
  dimensions: Generated<Record<string, string>>;
  sort_order: Generated<number>;
}

export interface PurchaseOrdersTable {
  id: Generated<string>;
  tenant_id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: Generated<string>;
  order_date: Date | null;
  expected_date: Date | null;
  currency: Generated<string>;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  total: Generated<number>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseOrderLinesTable {
  id: Generated<string>;
  po_id: string;
  description: string;
  category: string | null;
  qty: Generated<number>;
  unit_price: Generated<number>;
  tax_rate: Generated<number>;
  tax_amount: Generated<number>;
  line_total: Generated<number>;
  received_qty: Generated<number>;
  sort_order: Generated<number>;
}

export interface DeliveryNotesTable {
  id: Generated<string>;
  tenant_id: string;
  dn_number: string;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  delivery_date: Date | null;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryNoteLinesTable {
  id: Generated<string>;
  dn_id: string;
  description: string;
  qty_ordered: Generated<number>;
  qty_delivered: Generated<number>;
  unit: string | null;
  notes: string | null;
  sort_order: Generated<number>;
}
```

Add to `Database` interface:
```typescript
chart_of_accounts:    ChartOfAccountsTable;
journal_entries:      JournalEntriesTable;
journal_lines:        JournalLinesTable;
purchase_orders:      PurchaseOrdersTable;
purchase_order_lines: PurchaseOrderLinesTable;
delivery_notes:       DeliveryNotesTable;
delivery_note_lines:  DeliveryNoteLinesTable;
```

---

### A4 — GL Service
**File:** `apps/api/src/services/gl.service.ts`

```typescript
import { withTenant } from '../db/client.js';
import type { PostingRequest } from '@hudumika/types';

export class GLService {
  /** Core posting engine — the ONLY path that writes to journal_lines */
  static async post(tenantId: string, req: PostingRequest): Promise<string> {
    return withTenant(tenantId, async (trx) => {
      // 1. Validate: lines must balance
      const totalDebit  = req.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = req.lines.reduce((s, l) => s + l.credit, 0);
      if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Journal entry does not balance: DR ${totalDebit} ≠ CR ${totalCredit}`);
      }

      // 2. Resolve account IDs from codes
      const codes = req.lines.map(l => l.accountCode);
      const accounts = await trx
        .selectFrom('chart_of_accounts')
        .select(['id', 'code'])
        .where('tenant_id', '=', tenantId)
        .where('code', 'in', codes)
        .execute();
      const codeToId = Object.fromEntries(accounts.map(a => [a.code, a.id]));

      // 3. Generate entry number (JE-YYYY-NNNN)
      const year = new Date().getFullYear();
      const count = await trx
        .selectFrom('journal_entries')
        .select(trx.fn.count('id').as('n'))
        .where('tenant_id', '=', tenantId)
        .where('entry_number', 'like', `JE-${year}-%`)
        .executeTakeFirst();
      const seq = String((Number((count as any)?.n ?? 0) + 1)).padStart(4, '0');
      const entryNumber = `JE-${year}-${seq}`;

      // 4. Insert header
      const [entry] = await trx
        .insertInto('journal_entries')
        .values({
          tenant_id:     tenantId,
          entry_number:  entryNumber,
          entry_date:    new Date(req.entryDate),
          reference:     req.reference ?? null,
          description:   req.description,
          status:        'POSTED',
          source_module: req.sourceModule,
          source_id:     req.sourceId ?? null,
          created_by:    req.createdBy ?? null,
          posted_at:     new Date(),
        })
        .returning('id')
        .execute();

      // 5. Insert lines
      await trx
        .insertInto('journal_lines')
        .values(
          req.lines.map((l, i) => ({
            journal_entry_id: entry.id,
            account_id:       codeToId[l.accountCode],
            debit:            l.debit,
            credit:           l.credit,
            description:      l.description ?? null,
            currency:         l.currency ?? 'TZS',
            exchange_rate:    l.exchangeRate ?? 1,
            dimensions:       JSON.stringify(l.dimensions ?? {}),
            sort_order:       i,
          }))
        )
        .execute();

      return entry.id;
    });
  }

  /** Trial balance — net movement per account for the period */
  static async trialBalance(tenantId: string, from: string, to: string) { /* ... */ }

  /** Balance sheet — cumulative balances as at a date */
  static async balanceSheet(tenantId: string, date: string) { /* ... */ }

  /** Profit & loss — revenue and expense movements for a period */
  static async profitLoss(tenantId: string, from: string, to: string) { /* ... */ }

  /** Ledger — all movements for a single account */
  static async ledger(tenantId: string, accountCode: string, from: string, to: string) { /* ... */ }

  /** Aged receivables — from unpaid/partial sales invoices */
  static async agedReceivables(tenantId: string) { /* ... */ }

  /** Aged payables — from unpaid/partial supplier bills */
  static async agedPayables(tenantId: string) { /* ... */ }
}
```

---

### A5 — GL Routes
**File:** `apps/api/src/routes/gl.routes.ts`

```
GET  /v1/finance/chart-of-accounts           → ChartOfAccount[] tree
POST /v1/finance/journal-entries             → PostingRequest → { id, entry_number }
GET  /v1/finance/journal-entries             → JournalEntry[] (with lines)
GET  /v1/finance/journal-entries/:id         → JournalEntry (with lines)
POST /v1/finance/journal-entries/:id/void    → void a posted entry

GET  /v1/finance/trial-balance?from=&to=     → TrialBalanceReport
GET  /v1/finance/balance-sheet?date=         → BalanceSheetReport
GET  /v1/finance/profit-loss?from=&to=       → ProfitLossReport
GET  /v1/finance/ledger?account=&from=&to=   → LedgerReport
GET  /v1/finance/aged-receivables            → AgedReport
GET  /v1/finance/aged-payables               → AgedReport
GET  /v1/finance/cash-flow?from=&to=         → CashFlowReport
```

Register in `apps/api/src/index.ts`:
```typescript
import { glRouter } from './routes/gl.routes.js';
app.use('/v1/finance', glRouter);
```

---

### A6 — Wire existing flows to GL

**In `invoices.routes.ts` — after recording a payment:**
```typescript
// When invoice is paid (status → Paid or Partial):
await GLService.post(tenantId, {
  entryDate: paymentDate,
  description: `Payment received: ${invoiceNumber}`,
  reference: invoiceNumber,
  sourceModule: 'AR',
  sourceId: invoiceId,
  createdBy: req.user.id,
  lines: [
    { accountCode: '1010', debit: amount, credit: 0, description: 'Cash received' },
    { accountCode: '1100', debit: 0, credit: amount, description: `Clear AR: ${invoiceNumber}` },
  ],
});
```

**In `invoices.routes.ts` — when invoice is created/finalized (status → Unpaid):**
```typescript
await GLService.post(tenantId, {
  entryDate: billDate,
  description: `Sales invoice: ${invoiceNumber}`,
  reference: invoiceNumber,
  sourceModule: 'AR',
  sourceId: invoiceId,
  lines: [
    { accountCode: '1100', debit: totalAmount, credit: 0 },
    { accountCode: '4000', debit: 0, credit: totalAmount },
  ],
});
```

**In `bills.routes.ts` — when bill is posted (status → POSTED):**
```typescript
await GLService.post(tenantId, {
  entryDate: billDate,
  description: `Supplier bill: ${billNumber}`,
  sourceModule: 'AP',
  sourceId: billId,
  lines: [
    { accountCode: '5000', debit: subtotal, credit: 0 },
    { accountCode: '2000', debit: 0, credit: total },
    // If tax: { accountCode: '2200', debit: 0, credit: taxAmount }
  ],
});
```

**In `bills.routes.ts` — after recording a bill payment:**
```typescript
await GLService.post(tenantId, {
  entryDate: paymentDate,
  description: `Bill payment: ${billNumber}`,
  sourceModule: 'AP',
  sourceId: billId,
  lines: [
    { accountCode: '2000', debit: amount, credit: 0 },
    { accountCode: '1010', debit: 0, credit: amount },
  ],
});
```

---

### A7 — Purchase Orders Routes
**File:** `apps/api/src/routes/purchase-orders.routes.ts`

```
GET    /v1/purchase-orders           → PurchaseOrder[]
POST   /v1/purchase-orders           → create
GET    /v1/purchase-orders/:id       → PurchaseOrder with lines
PATCH  /v1/purchase-orders/:id       → update header
PATCH  /v1/purchase-orders/:id/status → { status: POStatus }
DELETE /v1/purchase-orders/:id
POST   /v1/purchase-orders/:id/lines → add line
PATCH  /v1/purchase-orders/:id/lines/:lineId
DELETE /v1/purchase-orders/:id/lines/:lineId
```

---

### A8 — Delivery Notes Routes
**File:** `apps/api/src/routes/delivery-notes.routes.ts`

```
GET    /v1/delivery-notes            → DeliveryNote[]
POST   /v1/delivery-notes            → create
GET    /v1/delivery-notes/:id        → DeliveryNote with lines
PATCH  /v1/delivery-notes/:id        → update
PATCH  /v1/delivery-notes/:id/status → { status: DNStatus }
DELETE /v1/delivery-notes/:id
```

---

## Track B — Frontend (Agent: Claude)

**Stack reminders:**
- Pages live in `apps/web/src/pages/`
- Data fetching uses `apiFetch(path)` from `apps/web/src/lib/api.js`
- All finance routes are inside `FinOpsShell` → `PageLayout`
- Existing report pages are structural placeholders — fully replace their content
- Use `var(--ink)`, `var(--teal)`, `var(--border)` CSS variables throughout
- `apiFetch` returns the parsed JSON body directly

---

### B1 — Shared types ✅
`packages/types/src/finance.ts` — written first (see Phase 0 above)

---

### B2 — Client-side GL Store (dev mock — swapped to API in B-final)
**File:** `apps/web/src/data/glStore.ts`

Seed enough mock data to build all report UIs against. Follows the same
`useSyncExternalStore` pattern as `calendarStore.ts`.

Exports:
- `useChartOfAccounts(): ChartOfAccount[]`
- `useJournalEntries(): JournalEntry[]`
- `useTrialBalance(from, to): TrialBalanceReport`
- `useBalanceSheet(date): BalanceSheetReport`
- `useProfitLoss(from, to): ProfitLossReport`
- `useLedger(accountCode, from, to): LedgerReport`
- `useAgedReceivables(): AgedReport`
- `useAgedPayables(): AgedReport`

---

### B3 — Chart of Accounts page
**File:** `apps/web/src/pages/AccountsQuery.tsx` (replace existing placeholder)

UI: hierarchical tree with type-coloured badges, search/filter bar, expand/collapse,
"New Account" button (opens a slide-in form), account detail panel on click.
Data: `GET /v1/finance/chart-of-accounts` → tree render.

---

### B4 — General Ledger page
**File:** `apps/web/src/pages/FinanceLedger.tsx` (replace placeholder)

UI: account selector dropdown, date range pickers, table of entries with
date | entry# | reference | description | debit | credit | running balance.
Opening/closing balance rows pinned at top/bottom. Export button (CSV).

---

### B5 — Trial Balance page
**File:** `apps/web/src/pages/FinanceTrialBalance.tsx` (replace placeholder)

UI: period selector, account-type grouped table, debit/credit columns,
totals row (must equal), export CSV. Highlight rows where opening ≠ closing
net movement is zero.

---

### B6 — Balance Sheet page
**File:** `apps/web/src/pages/FinanceBalanceSheet.tsx` (replace placeholder)

UI: as-at date picker, 3-section layout (Assets | Liabilities | Equity),
subtotals per subtype, grand total equality check banner.

---

### B7 — Profit & Loss page
**File:** `apps/web/src/pages/FinanceProfitLoss.tsx` (replace placeholder)

UI: period pickers, two-column layout (Revenue | Expenses), net income/loss
highlighted at bottom. Optional: period comparison (this period vs last).

---

### B8 — Aged Receivables + Aged Payables
**Files:** `FinanceAgedReceivables.tsx`, `FinanceAgedPayables.tsx`

UI: as-of date, customer/supplier table with columns: Name | Current |
1-30 days | 31-60 | 61-90 | 90+ | Total. Colour-coded cell backgrounds
(green/amber/red by age). Totals row. Click row → link to invoice/bill list.

---

### B9 — Remaining report pages
**Files:** `FinanceCashFlow.tsx`, `FinanceTaxReport.tsx`, `FinanceIncomeVsExpenses.tsx`

- **Cash Flow**: period pickers, waterfall-style card layout (Operating | Investing |
  Financing), net change + opening/closing cash.
- **Tax Report**: period pickers, table of taxable transactions grouped by tax type
  (VAT 18%, WHT 5%, etc.), totals.
- **Income vs Expenses**: dual-bar chart (month-by-month), summary cards (total
  revenue, total expenses, net, margin %).

---

### B10 — Purchase Orders page (replace mock data)
**File:** `apps/web/src/pages/PurchaseOrders.tsx`

Replace hardcoded `MOCK_PRODUCTS` / `MOCK_SUPPLIERS` with `apiFetch('/v1/purchase-orders')`.
Keep existing UI structure, just wire to real data.

---

### B11 — Delivery Notes page (replace mock data)
**File:** `apps/web/src/pages/DeliveryNotes.tsx`

Replace hardcoded mock data with `apiFetch('/v1/delivery-notes')`.

---

### B12 — Migrate client-side stores to API
- `FinanceVendors.tsx` → `GET /v1/finance/vendors` (new endpoint, add to Track A)
- `FinanceProducts.tsx` → `GET /v1/finance/products` (new endpoint)
- `FinancePayments.tsx` → `GET /v1/finance/payments` (already partial)

---

## Sync Points (coordination gates)

| Gate | Trigger | Action |
|------|---------|--------|
| **S0** | Phase 0 types committed | Both tracks start |
| **S1** | A3 (DB interfaces) done | A4/A5 can start; B2 can build mock against confirmed shape |
| **S2** | A5 (GL routes deployed to staging) | B3–B9 switch from glStore mock to `apiFetch` calls |
| **S3** | A6 (wiring done) | Run end-to-end: post invoice → check trial balance reflects it |
| **S4** | A7/A8 done | B10/B11 switch from mock to API |
| **S-final** | All pages live, all routes wired | Integration test: full AR cycle (invoice → payment → GL → TB → BS → P&L) |

---

## API Response Shape Quick Reference (for frontend to code against)

```
GET /v1/finance/chart-of-accounts
→ { accounts: ChartOfAccount[] }           // nested tree via children[]

GET /v1/finance/trial-balance?from=&to=
→ TrialBalanceReport                       // see types above

GET /v1/finance/balance-sheet?date=
→ BalanceSheetReport

GET /v1/finance/profit-loss?from=&to=
→ ProfitLossReport

GET /v1/finance/ledger?account=CODE&from=&to=
→ LedgerReport

GET /v1/finance/aged-receivables
GET /v1/finance/aged-payables
→ AgedReport

GET /v1/finance/cash-flow?from=&to=
→ CashFlowReport

GET  /v1/purchase-orders
→ { purchase_orders: PurchaseOrder[] }

GET  /v1/delivery-notes
→ { delivery_notes: DeliveryNote[] }
```

---

## Execution Order Summary

```
Day 0  │ B: Write packages/types/src/finance.ts + export from index.ts
       │
Day 1  │ A: 021 migration + 022 migration + Kysely interfaces (A1-A3)
       │ B: glStore.ts mock data (B2)
       │
Day 2  │ A: GLService.post() + trial balance / balance sheet / P&L methods (A4)
       │ B: AccountsQuery CoA page (B3) + FinanceLedger page (B4)
       │
Day 3  │ A: GL routes registered (A5)  ← S2 gate
       │ B: FinanceTrialBalance (B5) + FinanceBalanceSheet (B6) + FinanceProfitLoss (B7)
       │
Day 4  │ A: Wire invoice + bill payments to GL (A6)  ← S3 gate
       │ B: Aged pages (B8) + remaining reports (B9)
       │
Day 5  │ A: PO routes (A7) + DN routes (A8)  ← S4 gate
       │ B: Switch all pages from glStore → apiFetch (B-final)
       │    Wire PurchaseOrders (B10) + DeliveryNotes (B11)
       │
Day 6  │ Both: Integration test full AR + AP cycle end-to-end
```
