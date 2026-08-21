-- Notes — was a client-only, localStorage-backed prototype (in-progress,
-- never committed) with fabricated demo content, no backend, and no way for
-- a note to survive a cleared browser or be seen by a second device or
-- teammate. This gives it a real tenant-scoped table so it actually
-- functions as a platform app rather than a per-browser toy.
--
-- subject_type/subject_id is the same polymorphic-link shape
-- dg_declarations already established (252_dangerous_goods.sql) — an
-- optional tag connecting a note to a real record in any other app
-- (a shipment, a customer, ...) without a bespoke join table per app.
-- NULL means a plain, unattached personal/team note — the common case.
--
-- Labels are their own table (not a text[] of names) so renaming a label
-- doesn't require rewriting every note that carries it; notes reference
-- labels by id via label_ids.

CREATE TABLE IF NOT EXISTS note_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_note_labels_tenant ON note_labels(tenant_id);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'default',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  is_trashed BOOLEAN NOT NULL DEFAULT false,
  checklist JSONB NOT NULL DEFAULT '[]',
  -- Images/drawing are stored inline (data URIs) rather than through the
  -- Cloud drive/file system — that system requires a drive_id and is built
  -- around folders, wrong shape for a note's own small attachments. A
  -- deliberate scope boundary, not an oversight: fine for the sketch/photo
  -- sizes a notes app actually carries, revisit only if that stops being true.
  images TEXT[] NOT NULL DEFAULT '{}',
  drawing TEXT,
  reminder_at TIMESTAMPTZ,
  label_ids UUID[] NOT NULL DEFAULT '{}',
  subject_type TEXT,
  subject_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_tenant ON notes(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(tenant_id, subject_type, subject_id) WHERE subject_type IS NOT NULL;

ALTER TABLE note_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_labels FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'note_labels'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON note_labels
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'notes'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON notes
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

-- New app entitlement, seeded across every plan tier like every other base
-- app (060_entitlements.sql's own seed comment: "nothing is plan-restricted
-- at the app level yet" — matching that default-allow baseline, and the
-- 'free app' intent already written into packages/types/src/user.ts's
-- AppId comment for 'notes').
INSERT INTO package_features (package_code, feature_key)
SELECT p, 'notes'
FROM unnest(ARRAY['starter','operations','growth','professional','finance','scale','enterprise']) AS p
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status) VALUES ('notes', 'active')
ON CONFLICT (app_id) DO NOTHING;

-- Same bug, same fix, for Petti (261_petti_wallets.sql) — its
-- package_features/app_status rows were seeded correctly at the time, but
-- 'petti' was never added to ALL_FEATURE_KEYS (packages/types/src/entitlements.ts),
-- so GET /v1/entitlements never reports features.petti at all. RequireAppEnabled
-- only blocks on an explicit `=== false`, so `undefined` silently passes —
-- Petti has been rendering for every tenant regardless of plan since it
-- shipped, exactly the "onsite/seal/inventory" failure this file's sibling
-- migrations already fixed once. The rows already exist; nothing to insert
-- here — the fix is the ALL_FEATURE_KEYS edit in the same commit as this migration.
