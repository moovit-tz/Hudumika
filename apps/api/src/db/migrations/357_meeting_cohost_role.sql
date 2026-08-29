-- bliss_meeting_participants.role was constrained to ('HOST', 'PARTICIPANT')
-- from its original hr_meeting_participants definition (migration 350),
-- before co-hosts existed as a concept. Widen it to admit 'CO_HOST'.
ALTER TABLE bliss_meeting_participants DROP CONSTRAINT IF EXISTS hr_meeting_participants_role_valid;
ALTER TABLE bliss_meeting_participants ADD CONSTRAINT bliss_meeting_participants_role_valid CHECK (role IN ('HOST', 'CO_HOST', 'PARTICIPANT'));
