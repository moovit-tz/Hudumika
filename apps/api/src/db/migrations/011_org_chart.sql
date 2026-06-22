-- Organization chart nodes
CREATE TABLE IF NOT EXISTS org_chart_nodes (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id      UUID         REFERENCES users(id) ON DELETE SET NULL,
  label        VARCHAR(200) NOT NULL,
  job_title    VARCHAR(200),
  department   VARCHAR(200),
  email        VARCHAR(300),
  phone        VARCHAR(100),
  avatar_color VARCHAR(20)  NOT NULL DEFAULT '#0891b2',
  parent_id    UUID         REFERENCES org_chart_nodes(id) ON DELETE SET NULL,
  position_x   FLOAT        NOT NULL DEFAULT 0,
  position_y   FLOAT        NOT NULL DEFAULT 0,
  node_type    VARCHAR(50)  NOT NULL DEFAULT 'person',
  color        VARCHAR(20)  NOT NULL DEFAULT '#0891b2',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_chart_nodes_tenant    ON org_chart_nodes(tenant_id);
CREATE INDEX IF NOT EXISTS org_chart_nodes_parent    ON org_chart_nodes(tenant_id, parent_id);
