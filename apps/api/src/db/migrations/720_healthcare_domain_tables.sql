-- Healthcare (industry-readiness backlog item 22), both halves per the
-- business's own scope decision: administrative/billing AND clinical. This
-- deliberately does NOT model any clinical correctness (drug interactions,
-- dosage limits, diagnosis coding, reference ranges) — this platform has no
-- real medical reference database, and the backlog's own text is explicit:
-- "no invented medical rules." What is built here is honest record-keeping
-- with the two properties any clinical record system genuinely needs
-- regardless of domain knowledge: an identity you can actually find again
-- (patient + deduplication), and an audit trail that never silently loses
-- what was there before an edit (amendment history on encounters and
-- prescriptions, never an in-place overwrite once signed/active).

CREATE TABLE IF NOT EXISTS health_patients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  mrn            TEXT NOT NULL, -- tenant-assigned medical record number
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  date_of_birth  DATE,
  gender         TEXT CHECK (gender IN ('male','female','other',NULL)),
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  national_id    TEXT,
  customer_id    UUID REFERENCES customers(id), -- the shared billing identity, same link finance_students already uses
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_patients_tenant_idx ON health_patients (tenant_id);
-- Deduplication candidates are surfaced to the operator at creation time
-- (same first/last/DOB), never silently merged or silently blocked — names
-- and birthdates legitimately collide, so this is a prompt, not a constraint.
CREATE INDEX IF NOT EXISTS health_patients_dedup_idx ON health_patients (tenant_id, lower(first_name), lower(last_name), date_of_birth);
ALTER TABLE health_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_patients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_patients
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  work_id        UUID NOT NULL, -- links to finance_industry_work (industry='healthcare'), billing rides the existing shared engine
  patient_id     UUID NOT NULL REFERENCES health_patients(id),
  provider_id    UUID NOT NULL REFERENCES users(id), -- the actual contended resource for double-booking prevention
  scheduled_at   TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  status         TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','checked_in','completed','cancelled','no_show')),
  reason         TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS health_appointments_provider_idx ON health_appointments (tenant_id, provider_id, scheduled_at);
CREATE INDEX IF NOT EXISTS health_appointments_patient_idx ON health_appointments (tenant_id, patient_id);
ALTER TABLE health_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_appointments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_encounters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  work_id          UUID NOT NULL,
  patient_id       UUID NOT NULL REFERENCES health_patients(id),
  appointment_id   UUID REFERENCES health_appointments(id),
  provider_id      UUID NOT NULL REFERENCES users(id),
  encounter_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Free text, deliberately: this platform has no validated diagnosis/
  -- symptom catalogue, and inventing one would be exactly the fabricated
  -- clinical rule the backlog warns against.
  chief_complaint  TEXT,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','signed','amended')),
  signed_by        UUID REFERENCES users(id),
  signed_at        TIMESTAMPTZ,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_id) REFERENCES finance_industry_work (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS health_encounters_patient_idx ON health_encounters (tenant_id, patient_id);
ALTER TABLE health_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_encounters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_encounters
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Once signed, an encounter's notes/chief_complaint are never silently
-- overwritten again — a later correction is a real amendment row, keeping
-- what was originally recorded, same reasoning dsr.service.ts and
-- financeExpenses.routes.ts's own re-post-on-edit pattern already use
-- elsewhere in this codebase: an edit must never erase the prior truth.
CREATE TABLE IF NOT EXISTS health_encounter_amendments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  encounter_id    UUID NOT NULL REFERENCES health_encounters(id),
  amended_by      UUID REFERENCES users(id),
  amended_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_notes  TEXT,
  previous_chief_complaint TEXT,
  reason          TEXT NOT NULL
);
ALTER TABLE health_encounter_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_encounter_amendments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_encounter_amendments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  encounter_id  UUID NOT NULL REFERENCES health_encounters(id),
  order_type    TEXT NOT NULL CHECK (order_type IN ('lab','imaging','referral','procedure','other')),
  description   TEXT NOT NULL,
  ordered_by    UUID REFERENCES users(id),
  ordered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','in_progress','completed','cancelled'))
);
CREATE INDEX IF NOT EXISTS health_orders_encounter_idx ON health_orders (tenant_id, encounter_id);
ALTER TABLE health_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_orders
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  order_id      UUID NOT NULL REFERENCES health_orders(id),
  -- Free text, not validated against any reference range — this platform
  -- has no real lab reference-value database; recording what was entered,
  -- not grading it, is the honest behaviour here.
  result_text   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'preliminary' CHECK (status IN ('preliminary','final','amended')),
  recorded_by   UUID REFERENCES users(id),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_results_order_idx ON health_results (tenant_id, order_id);
ALTER TABLE health_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_results
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  encounter_id    UUID NOT NULL REFERENCES health_encounters(id),
  patient_id      UUID NOT NULL REFERENCES health_patients(id),
  -- Free text, deliberately: no real drug database exists here to validate
  -- against (name, strength, interactions) — recording what the
  -- prescriber wrote, not grading its clinical correctness.
  medication_name TEXT NOT NULL,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration        TEXT,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','dispensed','cancelled')),
  prescribed_by   UUID REFERENCES users(id),
  prescribed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS health_prescriptions_patient_idx ON health_prescriptions (tenant_id, patient_id);
ALTER TABLE health_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_prescriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_prescriptions
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS health_prescription_amendments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  prescription_id  UUID NOT NULL REFERENCES health_prescriptions(id),
  amended_by       UUID REFERENCES users(id),
  amended_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_dosage  TEXT,
  previous_frequency TEXT,
  reason           TEXT NOT NULL
);
ALTER TABLE health_prescription_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_prescription_amendments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON health_prescription_amendments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
