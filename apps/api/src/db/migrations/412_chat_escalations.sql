-- Migration 412: extends case_escalations (406) to also carry a chat
-- escalation, instead of standing up a second, parallel escalations table
-- with its own PENDING/IN_PROGRESS/RESOLVED workflow and role gating that
-- would just duplicate escalations.routes.ts. The table keeps its original
-- name — every existing case-escalation row, route, and RLS policy stays
-- untouched — but is now subject-agnostic: subject_type says which half of
-- the row is populated. case_ref drops its NOT NULL because a CHAT row has
-- no case to name; the CHECK below is what actually keeps a row internally
-- consistent per subject_type, in place of the column-level constraint.
ALTER TABLE case_escalations ALTER COLUMN case_ref DROP NOT NULL;

ALTER TABLE case_escalations ADD COLUMN IF NOT EXISTS subject_type VARCHAR(10) NOT NULL DEFAULT 'CASE' CHECK (subject_type IN ('CASE', 'CHAT'));
ALTER TABLE case_escalations ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE;
ALTER TABLE case_escalations ADD COLUMN IF NOT EXISTS channel_name VARCHAR(255);
ALTER TABLE case_escalations ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;
ALTER TABLE case_escalations ADD COLUMN IF NOT EXISTS message_snippet TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'case_escalations_subject_shape'
  ) THEN
    ALTER TABLE case_escalations ADD CONSTRAINT case_escalations_subject_shape CHECK (
      (subject_type = 'CASE' AND case_ref IS NOT NULL) OR
      (subject_type = 'CHAT' AND channel_id IS NOT NULL)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_case_escalations_channel ON case_escalations(channel_id) WHERE channel_id IS NOT NULL;
