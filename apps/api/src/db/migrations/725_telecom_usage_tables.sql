-- Telecom & Subscriptions (industry-readiness backlog item 27), scoped
-- per the business's own answer: real mobile/telecom usage (airtime,
-- data, SMS), not generic SaaS seats. The backlog's own P0: "usage-to-
-- invoice reconciliation and disputed-usage correction" — the two things
-- this schema and telecom.service.ts are actually built to prove.

CREATE TABLE IF NOT EXISTS telecom_subscribers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  work_id         UUID NOT NULL,
  msisdn          TEXT NOT NULL,
  subscriber_name TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  suspended_at    TIMESTAMPTZ,
  suspended_reason TEXT,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, msisdn),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
ALTER TABLE telecom_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_subscribers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telecom_subscribers
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Effective-dated, same discipline as tax_codes/energy_tariffs: a plan
-- price/allowance change is a new row, never an edit to history.
CREATE TABLE IF NOT EXISTS telecom_plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id),
  name                   TEXT NOT NULL,
  monthly_fee            NUMERIC(18,2) NOT NULL DEFAULT 0,
  allowance_voice_minutes NUMERIC(18,2) NOT NULL DEFAULT 0,
  allowance_data_mb      NUMERIC(18,2) NOT NULL DEFAULT 0,
  allowance_sms          NUMERIC(18,2) NOT NULL DEFAULT 0,
  overage_rate_voice     NUMERIC(18,4) NOT NULL DEFAULT 0,
  overage_rate_data      NUMERIC(18,4) NOT NULL DEFAULT 0,
  overage_rate_sms       NUMERIC(18,4) NOT NULL DEFAULT 0,
  effective_from         DATE NOT NULL,
  effective_to           DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE telecom_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telecom_plans
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- A subscriber's plan assignment over time — supports a genuine
-- mid-period plan change without rewriting what already happened under
-- the old plan.
CREATE TABLE IF NOT EXISTS telecom_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  subscriber_id  UUID NOT NULL REFERENCES telecom_subscribers(id),
  plan_id        UUID NOT NULL REFERENCES telecom_plans(id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','changed','cancelled'))
);
CREATE INDEX IF NOT EXISTS telecom_subscriptions_subscriber_idx ON telecom_subscriptions (tenant_id, subscriber_id, status);
ALTER TABLE telecom_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telecom_subscriptions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- One row per real usage event. external_event_id is unique per tenant —
-- the actual duplicate-safe ingestion mechanism the backlog's own
-- acceptance text names ("duplicate-safe usage").
CREATE TABLE IF NOT EXISTS telecom_usage_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  subscriber_id    UUID NOT NULL REFERENCES telecom_subscribers(id),
  event_type       TEXT NOT NULL CHECK (event_type IN ('voice','data','sms')),
  quantity         NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  occurred_at      TIMESTAMPTZ NOT NULL,
  external_event_id TEXT NOT NULL,
  rated_amount     NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- rated: counted toward billing. disputed: flagged, excluded from
  -- billing until resolved. voided: a dispute was upheld, permanently
  -- excluded. corrected: superseded by a correction (kept for the audit
  -- chain, same discipline as energy_readings' own status column).
  status           TEXT NOT NULL DEFAULT 'rated' CHECK (status IN ('rated','disputed','voided','corrected')),
  dispute_reason   TEXT,
  corrects_event_id UUID REFERENCES telecom_usage_events(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_event_id)
);
CREATE INDEX IF NOT EXISTS telecom_usage_events_subscriber_idx ON telecom_usage_events (tenant_id, subscriber_id, event_type, occurred_at);
ALTER TABLE telecom_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telecom_usage_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Usage-to-invoice reconciliation: one charge per billed period, carrying
-- exactly which events it summed so a later dispute/correction can be
-- traced back to what it actually changed.
CREATE TABLE IF NOT EXISTS telecom_charges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  subscriber_id UUID NOT NULL REFERENCES telecom_subscribers(id),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  monthly_fee_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  usage_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','voided')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telecom_charges_subscriber_idx ON telecom_charges (tenant_id, subscriber_id, period_start);
ALTER TABLE telecom_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE telecom_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telecom_charges
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
