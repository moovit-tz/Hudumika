ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'finalizing';
ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'finalization_failed';

-- Sender-selected user_id is not evidence of who actually signed.
ALTER TABLE sign_recipients ADD COLUMN authenticated_signer_id UUID REFERENCES users(id) ON DELETE SET NULL;
