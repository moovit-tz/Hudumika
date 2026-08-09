-- Who did it, as a column rather than a payload convention.
--
-- `domain_events` already records what happened to which record, and is the
-- generic per-record event store this platform needs — there is no case for a
-- fourth activity table beside hr_activity_log, invoice_activity_log and
-- contact_activity_log. What it cannot answer is the question a per-record
-- activity trail exists to answer: who changed this.
--
-- Today the actor is sometimes in the payload and sometimes not, under whatever
-- key the call site chose. Worse, the keys that look like an actor usually are
-- not: `userId` on hr.leave_requested is the person the leave is *for*, and
-- `assignedTo` on shipment.case_opened is the person it was given *to*. Reading
-- either as "who did this" would attribute an action to whoever it was done to
-- — which is precisely backwards, and would be believed because it appears in
-- an audit trail.
--
-- So: a real column, nullable, and NOT backfilled by guessing. Existing rows
-- keep a null actor and the trail says so, because "we did not record this"
-- is true and "Emmanuel did it" would not be.

ALTER TABLE domain_events
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- The one key that is unambiguous by name. Every other candidate names the
-- subject of the event, not its author.
UPDATE domain_events
   SET actor_id = (payload ->> 'changedBy')::uuid
 WHERE actor_id IS NULL
   AND payload ->> 'changedBy' IS NOT NULL
   AND payload ->> 'changedBy' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = (payload ->> 'changedBy')::uuid);

-- The trail is always read as "this record, newest first".
CREATE INDEX IF NOT EXISTS domain_events_record_idx
  ON domain_events (tenant_id, entity_type, entity_id, created_at DESC);

COMMENT ON COLUMN domain_events.actor_id IS
  'Who performed this. NULL means it was a background job or was never recorded — not that nobody did it.';
