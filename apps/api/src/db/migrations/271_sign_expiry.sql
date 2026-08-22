-- Sign M1: a real 'expired' envelope status.
-- sign_envelopes.expires_at (267) has always been captured and editable in
-- the editor, but nothing has ever checked it — a document set to expire
-- never actually did. sign_event_type already had an 'expired' value (267)
-- for the audit log; the envelope's own status enum did not. Mirrors how
-- 269_add_stamp_field_type.sql added 'stamp' to sign_field_type.

ALTER TYPE sign_envelope_status ADD VALUE IF NOT EXISTS 'expired';
