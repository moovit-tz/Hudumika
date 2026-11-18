-- Migration 916: Help Centre & Getting Started progress persistence
CREATE TABLE IF NOT EXISTS user_tour_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_tour_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_step_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  dismissed_tour_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_user_tour_progress_tenant_user ON user_tour_progress(tenant_id, user_id);

ALTER TABLE user_tour_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tour_progress FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON user_tour_progress
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
