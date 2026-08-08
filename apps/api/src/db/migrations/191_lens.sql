-- Lens — the internal developer record.
--
-- What is pending, what is broken, what was decided and why, across every part
-- of the platform. It exists because that knowledge currently lives in commit
-- messages, in CLAUDE.md, in AGENTS.md and in the heads of whoever last touched
-- a thing — which is exactly why the same traps get hit twice.
--
-- ── This is platform data, NOT tenant data. ────────────────────────────────
--
-- Every other table in this schema is tenant-scoped, and CLAUDE.md's first rule
-- is that every query carries an explicit tenant_id filter. These tables
-- deliberately have no tenant_id: a bug in FinOps is not a fact about one
-- customer's workspace, it is a fact about the software. Access is by role
-- (SUPER_ADMIN) rather than by tenancy, the same way superadmin.routes.ts
-- already works.
--
-- That is a real exception to the house rule, so it is written down here rather
-- than left to be discovered: do not "fix" these tables by adding tenant_id.
--
-- ── Why `confidence` is a first-class column ───────────────────────────────
--
-- The recurring failure in this codebase is not ignorance, it is confident
-- wrongness — a P&L overflow fixed in the wrong component, an "under-charging"
-- alarm raised before checking whether the tenant was even VAT-registered, a
-- seal_movements chain scoped by the wrong column and reported as valid. Every
-- one looked like a finding.
--
-- So an item records how strongly it is believed and what would settle it.
-- CONFIRMED means somebody ran it. SUSPECTED means it is a reading of the code.
-- Filtering the board to SUSPECTED is the most useful view in it.

CREATE TABLE IF NOT EXISTS lens_areas (
  id          VARCHAR(32) PRIMARY KEY,
  name        VARCHAR(64) NOT NULL,
  kind        VARCHAR(16) NOT NULL DEFAULT 'APP',
  description TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lens_areas DROP CONSTRAINT IF EXISTS lens_areas_kind_valid;
ALTER TABLE lens_areas ADD CONSTRAINT lens_areas_kind_valid
  CHECK (kind IN ('APP', 'PLATFORM', 'INFRA', 'INTEGRATION'));

CREATE SEQUENCE IF NOT EXISTS lens_item_ref_seq START 1;

CREATE TABLE IF NOT EXISTS lens_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short human handle. What you say out loud: "LENS-14 is the one about VAT
  -- periods." Generated, never reused.
  ref         VARCHAR(16) NOT NULL UNIQUE,

  kind        VARCHAR(16) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,

  area_id     VARCHAR(32) REFERENCES lens_areas(id) ON DELETE SET NULL,

  status      VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  severity    VARCHAR(16) NOT NULL DEFAULT 'NORMAL',

  -- How strongly this is believed, and what settles it.
  confidence  VARCHAR(16) NOT NULL DEFAULT 'SUSPECTED',
  -- The actual proof: the command that was run, the figures that came back, the
  -- query that returned the row. Prose, because "how do you know" does not fit
  -- a dropdown.
  evidence    TEXT,

  -- Who it is waiting on. Free text on purpose — some of these wait on a
  -- customer, an accountant or a revenue authority, not a user in this system.
  waiting_on  VARCHAR(120),

  -- Where the answer lives, if it is elsewhere: a commit, a file, a migration,
  -- a URL. Stored as a list so the board can show them without a join.
  refs        JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags        JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_by  UUID,
  resolved_at TIMESTAMPTZ,
  resolution  TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_kind_valid;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_kind_valid
  CHECK (kind IN ('BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK'));

ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_status_valid;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_status_valid
  CHECK (status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'WONTFIX'));

ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_severity_valid;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_severity_valid
  CHECK (severity IN ('CRITICAL', 'HIGH', 'NORMAL', 'LOW'));

ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_confidence_valid;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_confidence_valid
  CHECK (confidence IN ('CONFIRMED', 'SUSPECTED', 'UNVERIFIED'));

-- A closed item must say how it was closed. "DONE" with no resolution is the
-- thing you find a year later and cannot act on.
ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_closed_has_resolution;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_closed_has_resolution
  CHECK (status NOT IN ('DONE', 'WONTFIX')
         OR (resolution IS NOT NULL AND length(trim(resolution)) > 0));

CREATE INDEX IF NOT EXISTS lens_items_status_idx     ON lens_items (status);
CREATE INDEX IF NOT EXISTS lens_items_area_idx       ON lens_items (area_id);
CREATE INDEX IF NOT EXISTS lens_items_confidence_idx ON lens_items (confidence);

-- Append-only trail. Same reasoning as every other ledger here: what changed
-- and when is itself information, and an edit that erases it destroys the only
-- record of how something was understood at the time.
CREATE TABLE IF NOT EXISTS lens_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES lens_items(id) ON DELETE CASCADE,
  kind       VARCHAR(24) NOT NULL,
  detail     TEXT,
  actor_id   UUID,
  actor_name VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lens_events_item_idx ON lens_events (item_id, created_at DESC);

COMMENT ON TABLE lens_items IS
  'Internal developer record: pending features, bugs, debt and decisions across '
  'the platform. Platform-scoped by design — no tenant_id, access by role.';
COMMENT ON COLUMN lens_items.confidence IS
  'CONFIRMED means somebody ran it and it behaved as described. SUSPECTED is a '
  'reading of the code. The most useful filter on the board.';
COMMENT ON COLUMN lens_items.evidence IS
  'How it is known — the command run, the figures returned, the query that '
  'produced the row. Not a summary of the problem; the proof of it.';


-- ---------------------------------------------------------------------------
-- The parts of the platform.
-- ---------------------------------------------------------------------------
INSERT INTO lens_areas (id, name, kind, sort_order, description) VALUES
  ('finops',      'FinOps',        'APP',         10, 'Invoices, bills, GL, tax, VAT returns'),
  ('clearos',     'ClearOS',       'APP',         20, 'Customs declarations and clearance'),
  ('seal',        'SEAL',          'APP',         30, 'Bonded warehousing and the movement ledger'),
  ('complyos',    'ComplyOS',      'APP',         40, 'Licences, obligations, legal'),
  ('nexushr',     'NexusHR',       'APP',         50, 'Staff, org chart, employment records'),
  ('crm',         'CRM',           'APP',         60, 'Leads, quotations, customers'),
  ('bliss',       'Bliss',         'APP',         70, 'Support, ticketing, knowledge base'),
  ('studio',      'Studio',        'APP',         80, 'Workflow builder'),
  ('cargotracker','CargoTracker',  'APP',         90, 'BL/AWB tracking and demurrage'),
  ('inventory',   'Inventory',     'APP',        100, 'Stock, counts, warehouses'),
  ('tracking',    'Tracking',      'APP',        110, 'Fleet and trips'),
  ('drive',       'Drive',         'APP',        120, 'Files and cloud storage'),
  ('admin',       'Admin',         'PLATFORM',   130, 'Tenant and SuperAdmin consoles'),
  ('design',      'Design system', 'PLATFORM',   140, 'ui/ components, tokens, PageHeader'),
  ('auth',        'Auth & tenancy','PLATFORM',   150, 'Ondi, roles, entitlements, RLS'),
  ('db',          'Database',      'INFRA',      160, 'Migrations, schema, integrity'),
  ('jobs',        'Jobs & queues', 'INFRA',      170, 'BullMQ, schedules, notifications'),
  ('tra',         'TRA / EFDMS',   'INTEGRATION',180, 'Tanzanian fiscalisation'),
  ('fiscal',      'Fiscalisation', 'INTEGRATION',190, 'Other authorities: eTIMS, EFRIS, E-VAT, EBM'),
  ('ai',          'AI',            'PLATFORM',   200, 'Assistant, memory, OCR')
ON CONFLICT (id) DO NOTHING;
