-- Legal domain core tables (ported from LexCore schema)
-- LexCore @ 4875f43 → Hudumika Kysely/Postgres
-- All tables use UUID PKs, tenant_id for RLS, snake_case naming

-- ── Fee earner profiles ─────────────────────────────────────
CREATE TABLE fee_earner_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  grade         TEXT NOT NULL CHECK (grade IN ('PARTNER','SENIOR_ASSOCIATE','ASSOCIATE','PARALEGAL','SUPPORT')),
  charge_rate_minor BIGINT NOT NULL DEFAULT 0,
  cost_rate_minor   BIGINT NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'TZS',
  pc_number     TEXT,
  pc_expires_at TIMESTAMPTZ,
  tls_number    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE fee_earner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_earner_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY fee_earner_profiles_tenant ON fee_earner_profiles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Legal clients ───────────────────────────────────────────
CREATE TABLE legal_clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  name_norm   TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('INDIVIDUAL','COMPANY','NGO','GOVERNMENT')) DEFAULT 'INDIVIDUAL',
  brela       TEXT,
  tin         TEXT,
  nida        TEXT,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',
  risk_score  INTEGER,
  aml_status  TEXT NOT NULL CHECK (aml_status IN ('PENDING','APPROVED','EDD','REJECTED')) DEFAULT 'PENDING',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX legal_clients_tenant ON legal_clients(tenant_id);
CREATE INDEX legal_clients_name_norm ON legal_clients(tenant_id, name_norm);

ALTER TABLE legal_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_clients FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_clients_tenant ON legal_clients
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Matters ─────────────────────────────────────────────────
CREATE TABLE matters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  reference             TEXT NOT NULL,
  client_id             UUID NOT NULL REFERENCES legal_clients(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  type                  TEXT NOT NULL CHECK (type IN ('LITIGATION','CONVEYANCING','CORPORATE','EMPLOYMENT','PROBATE','ADVISORY','OTHER')),
  status                TEXT NOT NULL DEFAULT 'ENQUIRY' CHECK (status IN (
    'ENQUIRY','CONFLICT_CHECK','KYC_PENDING','ENGAGEMENT_PENDING',
    'OPEN','ON_HOLD','CLOSED','BILLING_COMPLETE','CONCLUDED','ARCHIVED','DESTROY_DUE'
  )),
  responsible_partner_id UUID REFERENCES users(id),
  practice_group        TEXT,
  fee_arrangement       TEXT NOT NULL CHECK (fee_arrangement IN ('HOURLY','FIXED','RETAINER','CAPPED','CONTINGENCY','MILESTONE')) DEFAULT 'HOURLY',
  fee_amount_minor      BIGINT,
  currency              TEXT NOT NULL DEFAULT 'TZS',
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  wall_id               TEXT,
  conflict_checked_at   TIMESTAMPTZ,
  kyc_completed_at      TIMESTAMPTZ,
  destroy_due_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reference)
);

CREATE INDEX matters_tenant ON matters(tenant_id);
CREATE INDEX matters_client ON matters(tenant_id, client_id);
CREATE INDEX matters_status ON matters(tenant_id, status);

ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;
CREATE POLICY matters_tenant ON matters
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Court cases ─────────────────────────────────────────────
CREATE TABLE court_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  case_number     TEXT NOT NULL,
  court_name      TEXT NOT NULL,
  court_hierarchy TEXT NOT NULL CHECK (court_hierarchy IN (
    'COURT_OF_APPEAL','HIGH_COURT','RESIDENT_MAGISTRATE','DISTRICT','PRIMARY','TRIBUNAL'
  )),
  division_type   TEXT,
  filed_at        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX court_cases_matter ON court_cases(tenant_id, matter_id);

ALTER TABLE court_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY court_cases_tenant ON court_cases
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Court events ────────────────────────────────────────────
CREATE TABLE court_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  court_case_id     UUID NOT NULL REFERENCES court_cases(id),
  matter_id         UUID NOT NULL REFERENCES matters(id),
  event_type        TEXT NOT NULL CHECK (event_type IN ('MENTION','HEARING','PTC','JUDGMENT','RULING','EXECUTION','FILING')),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  outcome           TEXT,
  notes             TEXT,
  next_event_type   TEXT,
  next_event_date   TIMESTAMPTZ,
  recorded_by_id    UUID REFERENCES users(id),
  reminders_sent    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX court_events_case ON court_events(tenant_id, court_case_id);
CREATE INDEX court_events_scheduled ON court_events(tenant_id, scheduled_at);

ALTER TABLE court_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE court_events FORCE ROW LEVEL SECURITY;
CREATE POLICY court_events_tenant ON court_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Deadlines ───────────────────────────────────────────────
CREATE TABLE legal_deadlines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  matter_id       UUID NOT NULL REFERENCES matters(id),
  court_case_id   UUID REFERENCES court_cases(id),
  deadline_type   TEXT NOT NULL CHECK (deadline_type IN ('LIMITATION','APPEAL_WINDOW','STATUTORY','COURT_ORDER','REMINDER','CUSTOM')),
  description     TEXT NOT NULL,
  due_date        DATE NOT NULL,
  raw_due_date    DATE,
  completed_at    TIMESTAMPTZ,
  is_automatic    BOOLEAN NOT NULL DEFAULT FALSE,
  computed_from   TEXT,
  is_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX legal_deadlines_matter ON legal_deadlines(tenant_id, matter_id);
CREATE INDEX legal_deadlines_due ON legal_deadlines(tenant_id, due_date) WHERE completed_at IS NULL;

ALTER TABLE legal_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_deadlines FORCE ROW LEVEL SECURITY;
CREATE POLICY legal_deadlines_tenant ON legal_deadlines
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ── Tanzania holidays (for deadline engine) ─────────────────
CREATE TABLE tanzania_holidays (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
