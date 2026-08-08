-- Migration to add Epics and Cycles to Lens

CREATE TABLE IF NOT EXISTS lens_cycles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(200) NOT NULL,
  start_date  DATE,
  end_date    DATE,
  status      VARCHAR(16) NOT NULL DEFAULT 'PLANNING',
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lens_cycles DROP CONSTRAINT IF EXISTS lens_cycles_status_valid;
ALTER TABLE lens_cycles ADD CONSTRAINT lens_cycles_status_valid
  CHECK (status IN ('PLANNING', 'ACTIVE', 'CLOSED'));

ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES lens_items(id) ON DELETE SET NULL;
ALTER TABLE lens_items ADD COLUMN IF NOT EXISTS cycle_id UUID REFERENCES lens_cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lens_items_parent_idx ON lens_items (parent_id);
CREATE INDEX IF NOT EXISTS lens_items_cycle_idx ON lens_items (cycle_id);

-- Update the kind constraint to allow EPIC
ALTER TABLE lens_items DROP CONSTRAINT IF EXISTS lens_items_kind_valid;
ALTER TABLE lens_items ADD CONSTRAINT lens_items_kind_valid
  CHECK (kind IN ('BUG', 'FEATURE', 'DEBT', 'DECISION', 'QUESTION', 'RISK', 'EPIC'));
