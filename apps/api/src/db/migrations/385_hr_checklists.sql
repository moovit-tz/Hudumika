-- Onboarding/offboarding checklists — confirmed absent in the audit (only
-- an invite email and a deactivation queue existed, no "day-1 tasks"
-- workflow). One editable template per type per tenant (not a template
-- library) — an admin maintains "our onboarding checklist" and "our
-- offboarding checklist"; each new joiner/leaver gets their own real copy,
-- generated from whatever the template said at that moment, so editing the
-- template later never rewrites someone's already-in-progress checklist.
CREATE TABLE IF NOT EXISTS hr_checklist_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('onboarding','offboarding')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, type)
);
ALTER TABLE hr_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_checklist_templates FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_checklist_templates'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_checklist_templates
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_checklist_template_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES hr_checklist_templates(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hr_checklist_template_items ON hr_checklist_template_items(template_id, sort_order);
ALTER TABLE hr_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_checklist_template_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_checklist_template_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_checklist_template_items
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- Real per-person copies. type is denormalized here (not just via the
-- template) so a checklist instance still means something if its template
-- is later deleted/replaced.
CREATE TABLE IF NOT EXISTS hr_checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('onboarding','offboarding')),
  status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_checklists_employee ON hr_checklists(tenant_id, employee_id);
-- At most one active checklist of a given type per person — re-onboarding
-- someone (e.g. rehire) only makes sense once their previous one is done.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_checklists_one_active ON hr_checklists(tenant_id, employee_id, type) WHERE status = 'in_progress';
ALTER TABLE hr_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_checklists FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_checklists'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_checklists
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hr_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  checklist_id UUID NOT NULL REFERENCES hr_checklists(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  done         BOOLEAN NOT NULL DEFAULT false,
  done_by      UUID REFERENCES users(id),
  done_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_checklist_items ON hr_checklist_items(checklist_id, sort_order);
ALTER TABLE hr_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_checklist_items FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'hr_checklist_items'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON hr_checklist_items
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
