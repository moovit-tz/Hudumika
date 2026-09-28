-- Supplementary indexes for DSR/consent query patterns and backfill
-- the evidence JSONB on existing privacy_policy_acknowledgements rows
-- (currently written as empty {}).

-- Composite index for the DPO overdue-requests query.
CREATE INDEX IF NOT EXISTS idx_dsr_overdue
  ON data_subject_requests (tenant_id, due_at)
  WHERE status IN ('PENDING', 'IN_REVIEW', 'PROCESSING');

-- Index for the user-facing "my requests" list, newest first.
CREATE INDEX IF NOT EXISTS idx_dsr_requester_recent
  ON data_subject_requests (requester_id, created_at DESC)
  WHERE requester_id IS NOT NULL;

-- Index for consent grant/withdrawal lookups by activity.
CREATE INDEX IF NOT EXISTS idx_consent_user_activity
  ON consent_records (user_id, activity_id)
  INCLUDE (status, granted_at, withdrawn_at);

-- Back-fill acknowledgement_method and evidence sentinel so downstream
-- code can always rely on these columns being non-null.
UPDATE privacy_policy_acknowledgements
SET evidence = jsonb_build_object(
  'backfilled_at', NOW()::text,
  'note', 'Evidence not captured at registration time; backfilled by migration 527.'
)
WHERE evidence = '{}'::jsonb;
