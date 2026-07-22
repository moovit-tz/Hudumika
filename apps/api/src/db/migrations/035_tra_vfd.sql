-- TRA VFD (Virtual Fiscal Device) Integration Tables
-- Stores per-tenant TRA configuration and tracks submission state

CREATE TABLE IF NOT EXISTS tra_vfd_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE,

  -- TRA Registration credentials (stored after registration)
  tin VARCHAR(20),                  -- Taxpayer Identification Number
  cert_key VARCHAR(50),             -- CERTKEY / EFDSERIAL (e.g., "10TZ0001")
  cert_serial VARCHAR(200),         -- Base64-encoded certificate serial for HTTP header
  pfx_path VARCHAR(500),            -- Path to uploaded .pfx certificate file
  pfx_password VARCHAR(200),        -- Encrypted password for the .pfx file

  -- Received from TRA after registration
  reg_id VARCHAR(100),              -- REGID from TRA
  serial VARCHAR(50),               -- SERIAL / EFDSERIAL from TRA
  uin VARCHAR(100),                 -- UIN from TRA
  vrn VARCHAR(50),                  -- VAT Registration Number
  receipt_code VARCHAR(50),         -- RECEIPTCODE (prefix for RCTVNUM)
  username VARCHAR(200),            -- USERNAME for token requests
  password VARCHAR(200),            -- PASSWORD for token requests
  token_path VARCHAR(500),          -- TOKENPATH URL from TRA
  tax_office VARCHAR(200),          -- TAXOFFICE from TRA
  tax_code CHAR(1) DEFAULT 'A',    -- A=Standard 18%, B=Special, C=Zero, D=Special Relief

  -- Token caching
  access_token TEXT,                -- Current bearer token
  token_expires_at TIMESTAMPTZ,     -- When token expires

  -- Global counters (must always increment, never reset)
  gc BIGINT DEFAULT 0,              -- Global Counter (total receipts ever issued)
  dc INT DEFAULT 0,                 -- Daily Counter (resets to 0 at midnight)
  dc_date DATE,                     -- The date DC was last reset

  -- Z-Report tracking
  last_zreport_date DATE,           -- Date of last successful Z-report submission

  -- Environment
  environment VARCHAR(10) DEFAULT 'test',  -- 'test' or 'production'

  registered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add TRA columns to sales_invoices
ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS tra_status VARCHAR(20) DEFAULT 'pending',
  -- 'pending' | 'submitted' | 'failed' | 'skipped'
  ADD COLUMN IF NOT EXISTS tra_rctnum BIGINT,        -- RCTNUM / GC assigned at time of submission
  ADD COLUMN IF NOT EXISTS tra_dc INT,               -- DC assigned at time of submission
  ADD COLUMN IF NOT EXISTS tra_znum VARCHAR(10),     -- ZNUM = date in YYYYMMDD format
  ADD COLUMN IF NOT EXISTS tra_rctvnum VARCHAR(100), -- RECEIPTCODE + GC (the full verification number)
  ADD COLUMN IF NOT EXISTS tra_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tra_ack_code INT,         -- 0 = success, else error code
  ADD COLUMN IF NOT EXISTS tra_ack_msg VARCHAR(200), -- Acknowledgement message from TRA
  ADD COLUMN IF NOT EXISTS tra_qr_url TEXT;          -- Full QR verification URL

-- Add EFD verification columns to supplier_bills (for verifying expense receipts)
ALTER TABLE supplier_bills
  ADD COLUMN IF NOT EXISTS efd_receipt_number VARCHAR(100),   -- The EFD/VFD receipt number from supplier
  ADD COLUMN IF NOT EXISTS efd_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS efd_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS efd_verification_data JSONB;       -- Raw verification response from TRA

-- Index for looking up pending invoices
CREATE INDEX IF NOT EXISTS idx_sales_invoices_tra_status ON sales_invoices(tenant_id, tra_status);
CREATE INDEX IF NOT EXISTS idx_tra_vfd_config_tenant ON tra_vfd_config(tenant_id);
