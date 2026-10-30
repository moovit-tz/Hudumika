-- Phase K: Marketplace — real provider workspaces, engagements, quotations,
-- milestones, delivery acceptance, disputes.

-- ── 1. Provider listings (provider-scoped) ─────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_provider_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name      TEXT NOT NULL,
  tagline           TEXT,
  description       TEXT,
  services          TEXT[] NOT NULL DEFAULT '{}',
  jurisdictions     TEXT[] NOT NULL DEFAULT '{}',
  industries        TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'published', 'suspended', 'archived')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'expired', 'rejected')),
  verification_evidence JSONB NOT NULL DEFAULT '{}',
  verified_at       TIMESTAMPTZ,
  verified_by       UUID REFERENCES users(id),
  avg_rating        NUMERIC(3,2),
  review_count      INTEGER NOT NULL DEFAULT 0,
  min_fee           NUMERIC(14,2),
  max_fee           NUMERIC(14,2),
  fee_currency      TEXT NOT NULL DEFAULT 'TZS',
  contact_email     TEXT,
  contact_phone     TEXT,
  website_url       TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_provider_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_provider_listings FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'marketplace_provider_listings'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON marketplace_provider_listings
      USING (provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mpl_provider ON marketplace_provider_listings(provider_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mpl_status ON marketplace_provider_listings(status, verification_status);

-- Platform-wide read policy: published listings visible to all tenants
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'published_read_policy' AND polrelid = 'marketplace_provider_listings'::regclass) THEN
    CREATE POLICY published_read_policy ON marketplace_provider_listings
      FOR SELECT
      USING (status = 'published');
  END IF;
END $$;

-- ── 2. Enquiries (client → provider, redacted brief) ──────────────
CREATE TABLE IF NOT EXISTS marketplace_enquiries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id        UUID REFERENCES marketplace_provider_listings(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL,
  brief             TEXT,
  services_requested TEXT[] NOT NULL DEFAULT '{}',
  jurisdictions     TEXT[] NOT NULL DEFAULT '{}',
  urgency           TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'responded', 'accepted', 'declined', 'withdrawn', 'expired')),
  budget_min        NUMERIC(14,2),
  budget_max        NUMERIC(14,2),
  budget_currency   TEXT NOT NULL DEFAULT 'TZS',
  responded_at      TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_enquiries FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'enquiry_policy' AND polrelid = 'marketplace_enquiries'::regclass) THEN
    CREATE POLICY enquiry_policy ON marketplace_enquiries
      USING (
        client_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_me_client ON marketplace_enquiries(client_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_me_provider ON marketplace_enquiries(provider_tenant_id, status);

-- ── 3. Quotations (provider → client) ──────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_quotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id        UUID REFERENCES marketplace_enquiries(id) ON DELETE SET NULL,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_number      TEXT NOT NULL,
  scope_description TEXT NOT NULL,
  line_items        JSONB NOT NULL DEFAULT '[]',
  authority_fees    NUMERIC(14,2) NOT NULL DEFAULT 0,
  professional_fees NUMERIC(14,2) NOT NULL DEFAULT 0,
  platform_charges  NUMERIC(14,2) NOT NULL DEFAULT 0,
  variable_services NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'TZS',
  valid_until       DATE,
  status            TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded', 'withdrawn')),
  accepted_at       TIMESTAMPTZ,
  accepted_by       UUID REFERENCES users(id),
  rejection_reason  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_quotations FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'quotation_policy' AND polrelid = 'marketplace_quotations'::regclass) THEN
    CREATE POLICY quotation_policy ON marketplace_quotations
      USING (
        client_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mq_provider ON marketplace_quotations(provider_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mq_client ON marketplace_quotations(client_tenant_id, status);

-- ── 4. Marketplace assignments (work items under an engagement) ────
CREATE TABLE IF NOT EXISTS marketplace_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  engagement_id     UUID REFERENCES provider_engagements(id) ON DELETE SET NULL,
  mandate_id        UUID REFERENCES delegation_mandates(id) ON DELETE SET NULL,
  quotation_id      UUID REFERENCES marketplace_quotations(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  assigned_to       UUID REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'under_review', 'completed',
                      'cancelled', 'reassigned', 'disputed')),
  priority          TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  started_at        TIMESTAMPTZ,
  due_date          DATE,
  completed_at      TIMESTAMPTZ,
  reassigned_from   UUID REFERENCES users(id),
  reassigned_at     TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_assignments FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'assignment_policy' AND polrelid = 'marketplace_assignments'::regclass) THEN
    CREATE POLICY assignment_policy ON marketplace_assignments
      USING (
        client_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ma_provider ON marketplace_assignments(provider_tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_ma_client ON marketplace_assignments(client_tenant_id, status);

-- ── 5. Evidence/milestones ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_milestones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES marketplace_assignments(id) ON DELETE CASCADE,
  provider_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  evidence_type     TEXT NOT NULL DEFAULT 'document'
    CHECK (evidence_type IN ('document', 'screenshot', 'receipt', 'certificate', 'correspondence', 'other')),
  evidence_url      TEXT,
  evidence_file_id  UUID,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'waived')),
  submitted_at      TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_milestones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'marketplace_milestones'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON marketplace_milestones
      USING (provider_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Client also needs to see milestones for their assignments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'milestone_client_read_policy' AND polrelid = 'marketplace_milestones'::regclass) THEN
    CREATE POLICY milestone_client_read_policy ON marketplace_milestones
      FOR SELECT
      USING (
        assignment_id IN (
          SELECT id FROM marketplace_assignments
          WHERE client_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mm_assignment ON marketplace_milestones(assignment_id, status);

-- ── 6. Disputes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_disputes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     UUID NOT NULL REFERENCES marketplace_assignments(id) ON DELETE CASCADE,
  raised_by_tenant  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  against_tenant    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  details           TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'mediation', 'resolved', 'escalated', 'closed')),
  resolution        TEXT,
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_disputes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'dispute_policy' AND polrelid = 'marketplace_disputes'::regclass) THEN
    CREATE POLICY dispute_policy ON marketplace_disputes
      USING (
        raised_by_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR against_tenant = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_md_raised ON marketplace_disputes(raised_by_tenant, status);
CREATE INDEX IF NOT EXISTS idx_md_against ON marketplace_disputes(against_tenant, status);
