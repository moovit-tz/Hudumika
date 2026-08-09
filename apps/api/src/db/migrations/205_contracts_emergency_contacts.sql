-- Two things an HR record is expected to hold and this one could not.
--
-- Emergency contacts are the plainer of the pair: the person to call when
-- something happens at work. There is nowhere to put that today, which means it
-- lives in someone's phone.
--
-- Contracts are the one with teeth. A fixed-term contract that quietly expires
-- is a person working without one — an employment-law problem, not a data
-- problem — which is why the interesting query is not "show me contracts" but
-- "show me the ones about to run out". Hence the index on end_date and the
-- CHECK below.

CREATE TABLE IF NOT EXISTS hr_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_type   VARCHAR(24) NOT NULL,
  start_date      DATE NOT NULL,
  -- NULL means open-ended, which is what PERMANENT is. The CHECK makes that
  -- the *only* reading: a fixed-term contract with no end date is the exact
  -- record that silently expires, so it cannot be stored in the first place.
  end_date        DATE,
  reference       VARCHAR(80),
  -- The signed PDF, when there is one. ON DELETE SET NULL rather than CASCADE:
  -- losing the file must not delete the fact that the contract existed.
  document_id     UUID REFERENCES hr_documents(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hr_contracts_type_valid CHECK (
    contract_type IN ('PERMANENT', 'FIXED_TERM', 'PROBATION', 'CASUAL', 'INTERNSHIP')
  ),
  CONSTRAINT hr_contracts_dates_ordered CHECK (end_date IS NULL OR end_date >= start_date),
  -- Only a permanent contract may be open-ended. Everything else has to say
  -- when it ends, because that is the whole point of it not being permanent.
  CONSTRAINT hr_contracts_term_needs_end CHECK (
    contract_type = 'PERMANENT' OR end_date IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS hr_contracts_tenant_user_idx ON hr_contracts (tenant_id, user_id);
-- The query this table exists to answer: what runs out soon. Partial, because
-- open-ended contracts never appear in it.
CREATE INDEX IF NOT EXISTS hr_contracts_expiry_idx
  ON hr_contracts (tenant_id, end_date) WHERE end_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS hr_emergency_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(160) NOT NULL,
  relationship    VARCHAR(60),
  phone           VARCHAR(40) NOT NULL,
  alt_phone       VARCHAR(40),
  address         TEXT,
  -- Who to try first. Not enforced as one-per-person by a constraint, because
  -- the application clears the others on write and a partial unique index here
  -- would turn a routine save into a constraint violation mid-edit.
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hr_emergency_contacts_tenant_user_idx
  ON hr_emergency_contacts (tenant_id, user_id);

COMMENT ON COLUMN hr_contracts.end_date IS
  'NULL only for PERMANENT. A fixed-term contract without an end date is the one that silently expires.';
