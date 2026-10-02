-- Standard charge-code catalogue (shared across all tenants; read-only from app)
CREATE TABLE IF NOT EXISTS charge_codes (
  code        VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  category    VARCHAR(30),   -- maps to CHARGE_HEADS vocabulary
  sort_order  INT DEFAULT 0
);

INSERT INTO charge_codes (code, description, category, sort_order) VALUES
  ('CCLR',   'Customs Clearance / Agency Fees',      'CLEARANCE_AGENCY',  1),
  ('OCART',  'Pick Up Cartage',                       'TRANSPORT',          2),
  ('OSEC',   'Origin Security Surcharge',             'OTHER',              3),
  ('ECCLR',  'Export Customs Clearance Fee',          'CLEARANCE_AGENCY',   4),
  ('OSSC',   'Origin Security Screening Charge',      'OTHER',              5),
  ('FRT',    'International Freight',                 'FREIGHT',            6),
  ('DUTY',   'Import Duty',                           'DUTY_TAXES',         7),
  ('VAT',    'Value Added Tax',                       'DUTY_TAXES',         8),
  ('EXCISE', 'Excise Duty',                           'DUTY_TAXES',         9),
  ('CPF',    'Customs Processing Fee',                'DUTY_TAXES',        10),
  ('RDL',    'Railway Development Levy',              'DUTY_TAXES',        11),
  ('TPA',    'Tanzania Ports Authority (TPA) Levy',   'TPA',               12),
  ('ICD',    'ICD Handling & Storage',                'ICD',               13),
  ('TBS',    'TBS Conformity Assessment',             'TBS',               14),
  ('WFGE',   'Wharfage',                              'OTHER',             15),
  ('INS',    'Marine Insurance',                      'INSURANCE',         16),
  ('TRANS',  'Inland Transport / Delivery',           'TRANSPORT',         17),
  ('DEM',    'Demurrage & Detention',                 'OTHER',             18),
  ('BOND',   'Bond / Guarantee Fee',                  'OTHER',             19),
  ('MISC',   'Miscellaneous Charges',                 'OTHER',             20)
ON CONFLICT (code) DO NOTHING;

-- Per-shipment job charge lines — the CargoWise "Invoicing" grid model:
-- each row pairs one cost leg (what we pay a vendor/creditor) with one
-- sell leg (what we charge the client/debtor), both in their original
-- currency and converted to local currency at the stored FX rate.
CREATE TABLE IF NOT EXISTS shipment_job_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  shipment_id         UUID NOT NULL,              -- bare UUID; shipment_cases is partitioned so no FK

  -- Identity
  charge_code         VARCHAR(20) NOT NULL,
  description         TEXT NOT NULL,
  display_sequence    INT  DEFAULT 0,
  invoice_type        VARCHAR(10) DEFAULT 'FIN',  -- FIN = Final, PRE = Preliminary

  -- Cost leg (AP — amounts we owe a creditor/vendor)
  creditor_id         UUID REFERENCES customers(id),
  creditor_name       VARCHAR(200),
  cost_currency       VARCHAR(5)     DEFAULT 'USD',
  cost_amount         NUMERIC(15,2)  DEFAULT 0,
  cost_exchange_rate  NUMERIC(15,6),              -- units of local currency per 1 cost_currency
  cost_local_amount   NUMERIC(15,2),              -- = cost_amount * cost_exchange_rate
  cost_posted         BOOLEAN        DEFAULT false,
  cost_reference      VARCHAR(200),

  -- Sell leg (AR — amounts the client/debtor owes us)
  debtor_id           UUID REFERENCES customers(id),
  debtor_name         VARCHAR(200),
  sell_currency       VARCHAR(5)     DEFAULT 'USD',
  sell_amount         NUMERIC(15,2)  DEFAULT 0,
  sell_exchange_rate  NUMERIC(15,6),              -- units of local currency per 1 sell_currency
  sell_local_amount   NUMERIC(15,2),              -- = sell_amount * sell_exchange_rate
  sell_posted         BOOLEAN        DEFAULT false,
  sell_reference      VARCHAR(200),
  sell_invoice_id     UUID REFERENCES sales_invoices(id),

  override_comment    TEXT,

  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sjc_shipment ON shipment_job_charges(tenant_id, shipment_id);
CREATE INDEX idx_sjc_seq      ON shipment_job_charges(tenant_id, shipment_id, display_sequence);

ALTER TABLE shipment_job_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_job_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY sjc_tenant_isolation ON shipment_job_charges
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
