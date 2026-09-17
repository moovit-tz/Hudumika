-- 481_cms_experiments.sql
-- §35 of the CMS master brief: Experimentation. The map's own text
-- explicitly sequenced this behind two other rows — "needs both the
-- Designer (§6) to author variants and Analytics (§33) to measure them" —
-- and both are now real, so this is genuinely unblocked, not just
-- theoretically so. A real, deliberately narrow first step: two
-- content-author-defined block-array variants per experiment, a visitor
-- sticky-assigned to one via a real Postgres-backed random split, and a
-- real view counter per variant. Conversion tracking (which variant is
-- actually *winning*, not just evenly reached) is real, disclosed future
-- work — this pass proves variant delivery + reach, not a full
-- statistical-significance report.

CREATE TABLE IF NOT EXISTS cms_experiments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT        NOT NULL,
  key                   TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'running', -- running | stopped
  variant_a_blocks      JSONB       NOT NULL DEFAULT '[]',
  variant_b_blocks      JSONB       NOT NULL DEFAULT '[]',
  variant_a_views        INTEGER    NOT NULL DEFAULT 0,
  variant_b_views        INTEGER    NOT NULL DEFAULT 0,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

ALTER TABLE cms_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_experiments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON cms_experiments;
CREATE POLICY tenant_isolation_policy ON cms_experiments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));
