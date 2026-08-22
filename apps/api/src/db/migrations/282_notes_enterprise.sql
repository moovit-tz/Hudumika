-- Enterprise-readiness pass on Notes (265_notes_app.sql): per-user pin/
-- archive state, real sharing (private/shared/team visibility + a
-- collaborator list), an actual revision history, working reminders (a
-- notified flag so the new reminder job fires exactly once), trash
-- retention + legal hold, and an audit column (updated_by).

-- ── Per-user pin/archive ──
-- is_pinned/is_archived used to live on the note row itself, so one person
-- pinning a note pinned it for the whole tenant. Every real notes app
-- (including Keep, which this one is modeled on) treats pin/archive as a
-- personal view preference, not a shared property of the note. Moved to its
-- own per-(note,user) table; existing pins/archives are attributed to the
-- note's own creator (the only person who could have set them under the old
-- single-column model) before the columns are dropped. Migrated legacy
-- notes (created_by NULL) have no one to attribute to and are simply left
-- unpinned/unarchived for everyone — a safe default, not a fabrication.
CREATE TABLE IF NOT EXISTS note_user_state (
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_note_user_state_user ON note_user_state(tenant_id, user_id);

INSERT INTO note_user_state (note_id, tenant_id, user_id, is_pinned, is_archived)
SELECT id, tenant_id, created_by, is_pinned, is_archived
FROM notes
WHERE created_by IS NOT NULL AND (is_pinned = true OR is_archived = true)
ON CONFLICT (note_id, user_id) DO NOTHING;

ALTER TABLE notes DROP COLUMN IF EXISTS is_pinned;
ALTER TABLE notes DROP COLUMN IF EXISTS is_archived;

-- ── Sharing ──
-- 'team' (default) keeps today's behaviour — every note visible tenant-wide.
-- 'private' is visible only to its creator. 'shared' is visible to the
-- creator plus whoever is listed in note_shares, each with their own
-- view/edit permission — the first real per-note ACL this app has had; it
-- used to be honestly labelled "shared with your whole team" because there
-- was no other option.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'team'
  CHECK (visibility IN ('team', 'private', 'shared'));

CREATE TABLE IF NOT EXISTS note_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  permission TEXT NOT NULL DEFAULT 'edit' CHECK (permission IN ('view', 'edit')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (note_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_note_shares_note ON note_shares(note_id);
CREATE INDEX IF NOT EXISTS idx_note_shares_user ON note_shares(tenant_id, user_id);

-- ── Revision history / audit ──
-- A snapshot of title/content/checklist is written before every content
-- change (notes.service.ts's updateNote), so "who changed what, when" is
-- answerable for the first time — load-bearing now that this app also
-- carries real compliance/invoice/lead notes (266_notes_migrate_existing.sql).
ALTER TABLE notes ADD COLUMN IF NOT EXISTS updated_by UUID;

CREATE TABLE IF NOT EXISTS note_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  changed_by UUID,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  checklist JSONB NOT NULL DEFAULT '[]',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions(note_id, changed_at DESC);

-- ── Reminders that actually fire ──
-- reminder_at was stored and displayed but nothing ever read it — no job,
-- no notification, ever fired. notes-reminder.job.ts (new) now polls for
-- it; reminder_notified_at is the guard that makes that safe to run on a
-- short interval without re-notifying the same reminder on every pass.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMPTZ;

-- ── Trash retention + legal hold ──
-- Trash never auto-emptied — is_trashed had no timestamp to measure
-- retention against. notes-purge.job.ts (new) permanently deletes notes
-- trashed more than 30 days ago, mirroring Cloud's own
-- TRASH_RETENTION_DAYS (cloud-trash-expiry.job.ts) rather than inventing a
-- different number for this app. legal_hold exempts a note from that sweep
-- regardless of age, for compliance content that must not disappear on a timer.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;

UPDATE notes SET trashed_at = updated_at WHERE is_trashed = true AND trashed_at IS NULL;

ALTER TABLE note_user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_user_state FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'note_user_state'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON note_user_state
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_shares FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'note_shares'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON note_shares
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;

ALTER TABLE note_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE note_revisions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'note_revisions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON note_revisions
      USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
  END IF;
END $$;
