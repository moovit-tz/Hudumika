-- ============================================================
-- 096 — ComplyOS: Legal Firm Marketplace v1
--        Status-tracked engagements/milestones (no real payment
--        processing — confirmed scope).
-- ============================================================

-- ── Firms (global reference — no tenant_id) ──────────────────
CREATE TABLE comply_legal_firms (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  initials              TEXT        NOT NULL,
  color                 TEXT        NOT NULL DEFAULT '#1d4ed8',
  specialties           JSONB       NOT NULL DEFAULT '[]',
  agencies_handled      JSONB       NOT NULL DEFAULT '[]',
  location              TEXT,
  founded_year          INT,
  rating                NUMERIC(2,1) NOT NULL DEFAULT 0,
  review_count          INT         NOT NULL DEFAULT 0,
  starting_price_label  TEXT,
  description           TEXT,
  verified              BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Engagements ───────────────────────────────────────────────
CREATE TABLE comply_legal_engagements (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT        NOT NULL,
  firm_id          UUID        NOT NULL REFERENCES comply_legal_firms(id) ON DELETE RESTRICT,
  application_id   UUID        REFERENCES comply_applications(id) ON DELETE SET NULL,
  engagement_type  TEXT        NOT NULL,
  agency_code      TEXT,
  brief            TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'requested', -- requested | quoted | instructed | in_progress | milestone_due | completed | cancelled
  quoted_price     TEXT,
  created_by       TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_legal_engagements_tenant ON comply_legal_engagements (tenant_id);
CREATE INDEX comply_legal_engagements_firm   ON comply_legal_engagements (firm_id);

-- ── Milestones (status-tracked only — pending | paid | released) ─
CREATE TABLE comply_legal_milestones (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID        NOT NULL REFERENCES comply_legal_engagements(id) ON DELETE CASCADE,
  description    TEXT        NOT NULL,
  amount         TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending', -- pending | paid | released
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_legal_milestones_engagement ON comply_legal_milestones (engagement_id);

-- ── Messages (simple shared-workspace thread) ────────────────
CREATE TABLE comply_legal_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id  UUID        NOT NULL REFERENCES comply_legal_engagements(id) ON DELETE CASCADE,
  sender_type    TEXT        NOT NULL, -- tenant | firm
  sender_id      TEXT        NOT NULL,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_legal_messages_engagement ON comply_legal_messages (engagement_id, created_at);

-- ── Seed: the 6 firms already shown (illustratively) in the
-- frontend mock — moved server-side. Pending real firm-sourcing
-- (PRD Section 5.2 BD workstream) — NOT verified real firms.
INSERT INTO comply_legal_firms (name, initials, color, specialties, agencies_handled, location, founded_year, rating, review_count, starting_price_label, description, verified) VALUES
('Mkono & Co Advocates', 'MC', '#1d4ed8', '["Corporate Registration","Tax Compliance","Financial Licences"]', '["BRELA","TRA","BOT","CMSA"]', 'Dar es Salaam', 1976, 4.9, 124, 'From $350 / engagement', 'One of Tanzania''s oldest and most respected law firms, specializing in corporate compliance, banking regulations, and capital markets.', false),
('Rex Attorneys', 'RA', '#059669', '["Employment Law","Social Security","Workplace Safety"]', '["NSSF","WCF","NHIF","OSHA"]', 'Dar es Salaam', 2001, 4.7, 88, 'From $200 / engagement', 'Specialists in labor law and employer compliance, helping businesses navigate NSSF, WCF, and OSHA requirements efficiently.', false),
('Clyde & Co Tanzania', 'CC', '#7c3aed', '["Import/Export","Trade Licences","Product Certification"]', '["TBS","TFDA"]', 'Dar es Salaam', 2012, 4.8, 61, 'From $280 / engagement', 'International firm with deep expertise in East African trade regulations, TBS compliance, and TFDA product certification processes.', false),
('AB Attorneys', 'AB', '#b45309', '["Corporate Law","Annual Returns","NGO Compliance"]', '["BRELA","TRA"]', 'Arusha', 2008, 4.5, 47, 'From $150 / engagement', 'Northern Tanzania specialists with extensive experience handling BRELA filings and annual returns for SMEs and NGOs.', false),
('Tanzania Legal Nexus', 'TL', '#0f766e', '["Tax Advisory","VAT Compliance","Transfer Pricing"]', '["TRA","BOT"]', 'Dar es Salaam', 2019, 4.6, 39, 'From $180 / engagement', 'A new-generation firm combining legal expertise with digital tools to accelerate TRA filings and tax compliance workflows.', false),
('Nakazwe & Partners', 'NP', '#dc2626', '["Mining Licences","Environmental Compliance","Land Law"]', '["BRELA"]', 'Mwanza', 2005, 4.4, 33, 'From $220 / engagement', 'Western Tanzania firm with specialized knowledge in mining permits, environmental compliance, and land title regularization.', false);
