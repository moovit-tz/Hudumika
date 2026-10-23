-- Migration 622: Domain-specific tables for hospitality and education

-- ═══════════════════════════════════════════════════════════════
-- HOSPITALITY / ACCOMMODATION
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_room_inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  room_number TEXT NOT NULL,
  room_type   TEXT NOT NULL CHECK (room_type IN ('single','double','twin','suite','deluxe','family','dormitory','conference')),
  floor       TEXT,
  capacity    INT NOT NULL DEFAULT 2 CHECK (capacity > 0),
  rate_per_night NUMERIC(18,2) NOT NULL CHECK (rate_per_night >= 0),
  currency    TEXT NOT NULL DEFAULT 'TZS',
  amenities   TEXT[],
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','occupied','maintenance','blocked','cleaning')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, room_number)
);
ALTER TABLE finance_room_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_room_inventory FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_room_inventory
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_reservations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  work_id        UUID NOT NULL REFERENCES finance_industry_work(id),
  room_id        UUID NOT NULL REFERENCES finance_room_inventory(id),
  guest_name     TEXT NOT NULL,
  guest_contact  TEXT,
  guest_count    INT NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  check_in       DATE NOT NULL,
  check_out      DATE NOT NULL,
  nights         INT GENERATED ALWAYS AS (check_out - check_in) STORED,
  rate_per_night NUMERIC(18,2) NOT NULL,
  deposit_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','checked_in','checked_out','cancelled','no_show')),
  checked_in_at  TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  folio_notes    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);
ALTER TABLE finance_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_reservations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_folio_charges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  reservation_id UUID NOT NULL REFERENCES finance_reservations(id),
  charge_type    TEXT NOT NULL CHECK (charge_type IN ('room','minibar','restaurant','laundry','spa','parking','telephone','other')),
  description    TEXT NOT NULL,
  amount         NUMERIC(18,2) NOT NULL,
  charge_date    DATE NOT NULL,
  invoice_id     UUID REFERENCES sales_invoices(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE finance_folio_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_folio_charges FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_folio_charges
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ═══════════════════════════════════════════════════════════════
-- EDUCATION
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE finance_students (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  student_number TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  date_of_birth  DATE,
  gender         TEXT CHECK (gender IN ('male','female','other',NULL)),
  guardian_name  TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  customer_id    UUID REFERENCES customers(id),
  enrollment_date DATE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('applicant','active','graduated','suspended','withdrawn','alumni')),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, student_number)
);
ALTER TABLE finance_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_students FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_students
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_fee_structures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  name         TEXT NOT NULL,
  programme    TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  term         TEXT NOT NULL,
  tuition      NUMERIC(18,2) NOT NULL DEFAULT 0,
  boarding     NUMERIC(18,2) NOT NULL DEFAULT 0,
  transport    NUMERIC(18,2) NOT NULL DEFAULT 0,
  other_fees   NUMERIC(18,2) NOT NULL DEFAULT 0,
  total        NUMERIC(18,2) GENERATED ALWAYS AS (tuition + boarding + transport + other_fees) STORED,
  currency     TEXT NOT NULL DEFAULT 'TZS',
  due_date     DATE,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, programme, academic_year, term)
);
ALTER TABLE finance_fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_fee_structures FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_fee_structures
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TABLE finance_student_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  work_id         UUID NOT NULL REFERENCES finance_industry_work(id),
  student_id      UUID NOT NULL REFERENCES finance_students(id),
  fee_structure_id UUID NOT NULL REFERENCES finance_fee_structures(id),
  scholarship_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (scholarship_pct >= 0 AND scholarship_pct <= 100),
  amount_due      NUMERIC(18,2) NOT NULL,
  amount_paid     NUMERIC(18,2) NOT NULL DEFAULT 0,
  balance         NUMERIC(18,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
  status          TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','completed','withdrawn','deferred')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, student_id, fee_structure_id)
);
ALTER TABLE finance_student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_student_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON finance_student_enrollments
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Indexes
CREATE INDEX idx_room_inventory_tenant ON finance_room_inventory(tenant_id);
CREATE INDEX idx_reservations_work ON finance_reservations(tenant_id, work_id);
CREATE INDEX idx_reservations_room ON finance_reservations(tenant_id, room_id);
CREATE INDEX idx_folio_charges_reservation ON finance_folio_charges(tenant_id, reservation_id);
CREATE INDEX idx_students_tenant ON finance_students(tenant_id);
CREATE INDEX idx_students_customer ON finance_students(tenant_id, customer_id);
CREATE INDEX idx_fee_structures_tenant ON finance_fee_structures(tenant_id);
CREATE INDEX idx_student_enrollments_work ON finance_student_enrollments(tenant_id, work_id);
CREATE INDEX idx_student_enrollments_student ON finance_student_enrollments(tenant_id, student_id);
