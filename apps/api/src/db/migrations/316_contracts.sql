-- Migration 316: Contracts, built for real this time.
--
-- A `contracts` table existed once (073_contracts.sql) and was deliberately
-- dropped two migrations later (075_drop_contracts.sql: "table had zero
-- rows — never used in production; feature was removed at the user's
-- request") because the old Contracts.tsx page ran entirely off a
-- hardcoded sample array with no real backend behind "New Contract" at
-- all. This is a genuine rebuild: real CRUD, a real PDF (contract-pdf
-- .service.ts, cloned from invoice-pdf.service.ts), and — once M2c wires
-- it — real e-signature via the platform's existing sign_envelopes engine
-- (sign_envelope_id below, nullable until actually sent for signature).
--
-- Part of the standalone Projects app's 'projects' (HuduPlus+) entitlement.

CREATE TABLE IF NOT EXISTS contracts (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  ref         TEXT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  subject     TEXT NOT NULL,
  value       NUMERIC(14,2),
  currency    VARCHAR(5) NOT NULL DEFAULT 'TZS',
  type        TEXT,
  start_date  DATE,
  end_date    DATE,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  -- Wired in M2c — a draft/sent/completed envelope from the existing Sign
  -- engine (sign_envelopes, migration 267). Null until actually sent.
  sign_envelope_id UUID,
  owner_id    UUID NOT NULL,
  deleted_at  TIMESTAMPTZ, -- soft-delete = the reference product's "Trash" bucket
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project ON contracts(project_id) WHERE project_id IS NOT NULL;

-- Append-only renewal history (M2d) — kept in this migration since it's the
-- same lifecycle as the contract row itself, one table, no separate ship.
CREATE TABLE IF NOT EXISTS contract_renewals (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL,
  previous_end_date DATE,
  new_end_date      DATE NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_renewals_contract ON contract_renewals(contract_id);

-- Same widening 315 did for 'project' — learned from that live 500, done
-- proactively here instead of waiting to hit it again with 'contract'.
ALTER TABLE invoice_sequences DROP CONSTRAINT IF EXISTS invoice_sequences_doc_type_check;
ALTER TABLE invoice_sequences ADD CONSTRAINT invoice_sequences_doc_type_check
  CHECK (doc_type IN ('invoice', 'quotation', 'purchase_order', 'project', 'contract'));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contracts', 'contract_renewals']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = t::regclass) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)',
        t
      );
    END IF;
  END LOOP;
END $$;
