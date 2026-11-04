-- Legal domain billing & trust tables (ported from LexCore schema)

-- ── Time entries ────────────────────────────────────────────
CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,
  narrative       TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  billing_type    TEXT NOT NULL CHECK (billing_type IN ('STANDARD','REDUCED','NO_CHARGE','FIXED')) DEFAULT 'STANDARD',
  rate_minor      BIGINT NOT NULL DEFAULT 0,
  amount_minor    BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','INVOICED','WRITTEN_OFF')),
  invoice_id      UUID,
  offline_captured BOOLEAN NOT NULL DEFAULT FALSE,
  suggested_source TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX time_entries_matter ON time_entries(tenant_id, matter_id);
CREATE INDEX time_entries_user ON time_entries(tenant_id, user_id, date);
CREATE INDEX time_entries_status ON time_entries(tenant_id, status);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY time_entries_tenant ON time_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Disbursements ───────────────────────────────────────────
CREATE TABLE disbursements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('COURT_FEE','STAMP_DUTY','BRELA','TRAVEL','EXPERT','COUNSEL_FEE','OTHER')),
  description     TEXT NOT NULL,
  amount_minor    BIGINT NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  vat_treatment   TEXT NOT NULL CHECK (vat_treatment IN ('STANDARD','EXEMPT','ZERO_RATED')) DEFAULT 'STANDARD',
  is_recoverable  BOOLEAN NOT NULL DEFAULT TRUE,
  receipt_key     TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','INVOICED','WRITTEN_OFF')),
  invoice_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX disbursements_matter ON disbursements(tenant_id, matter_id);

ALTER TABLE disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements FORCE ROW LEVEL SECURITY;
CREATE POLICY disbursements_tenant ON disbursements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Legal invoices ──────────────────────────────────────────
CREATE TABLE legal_invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  client_id       UUID NOT NULL REFERENCES legal_clients(id),
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL,
  due_date        DATE NOT NULL,
  subtotal_minor  BIGINT NOT NULL DEFAULT 0,
  vat_minor       BIGINT NOT NULL DEFAULT 0,
  wht_minor       BIGINT NOT NULL DEFAULT 0,
  total_minor     BIGINT NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'TZS',
  status          TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','SENT','PARTIALLY_PAID','PAID','WRITTEN_OFF')),
  pdf_key         TEXT,
  issued_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX legal_invoices_matter ON legal_invoices(tenant_id, matter_id);
CREATE INDEX legal_invoices_client ON legal_invoices(tenant_id, client_id);
CREATE INDEX legal_invoices_status ON legal_invoices(tenant_id, status);

ALTER TABLE legal_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_invoices_tenant ON legal_invoices
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Add FK from time_entries and disbursements to legal_invoices
ALTER TABLE time_entries ADD CONSTRAINT time_entries_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES legal_invoices(id);
ALTER TABLE disbursements ADD CONSTRAINT disbursements_invoice_fk
  FOREIGN KEY (invoice_id) REFERENCES legal_invoices(id);

-- ── Invoice lines ───────────────────────────────────────────
CREATE TABLE legal_invoice_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  invoice_id      UUID NOT NULL REFERENCES legal_invoices(id),
  description     TEXT NOT NULL,
  amount_minor    BIGINT NOT NULL,
  vat_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  wht_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  line_type       TEXT NOT NULL CHECK (line_type IN ('TIME','DISBURSEMENT','FIXED_FEE')),
  reference_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX legal_invoice_lines_invoice ON legal_invoice_lines(tenant_id, invoice_id);

ALTER TABLE legal_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_invoice_lines_tenant ON legal_invoice_lines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Trust accounts ──────────────────────────────────────────
CREATE TABLE trust_accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  bank_name   TEXT NOT NULL,
  account_number TEXT NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'TZS',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trust_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY trust_accounts_tenant ON trust_accounts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Trust transactions (hash-chained ledger) ────────────────
CREATE TABLE trust_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  matter_id         UUID NOT NULL REFERENCES matters(id),
  client_id         UUID NOT NULL REFERENCES legal_clients(id),
  trust_account_id  UUID NOT NULL REFERENCES trust_accounts(id),
  direction         TEXT NOT NULL CHECK (direction IN ('IN','OUT','OUT_TO_OFFICE')),
  amount_minor      BIGINT NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  reference         TEXT,
  description       TEXT,
  reversal_of       UUID REFERENCES trust_transactions(id),
  invoice_id        UUID REFERENCES legal_invoices(id),
  raised_by         UUID NOT NULL REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  workflow_id       UUID,
  hash_prev         TEXT,
  hash_self         TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX trust_tx_matter ON trust_transactions(tenant_id, matter_id);
CREATE INDEX trust_tx_account ON trust_transactions(tenant_id, trust_account_id);

ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY trust_transactions_tenant ON trust_transactions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Partner capital accounts ────────────────────────────────
CREATE TABLE partner_capitals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  tax_year              INTEGER NOT NULL,
  opening_minor         BIGINT NOT NULL DEFAULT 0,
  capital_introduced_minor BIGINT NOT NULL DEFAULT 0,
  profit_share_minor    BIGINT NOT NULL DEFAULT 0,
  drawings_minor        BIGINT NOT NULL DEFAULT 0,
  tax_reserve_minor     BIGINT NOT NULL DEFAULT 0,
  closing_minor         BIGINT NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'TZS',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, tax_year)
);

ALTER TABLE partner_capitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_capitals FORCE ROW LEVEL SECURITY;
CREATE POLICY partner_capitals_tenant ON partner_capitals
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
