-- ES-07: intermediate finalization states so completion is never announced
-- before the signed PDF is actually persisted.
ALTER TYPE sign_envelope_status ADD VALUE IF NOT EXISTS 'finalizing';
ALTER TYPE sign_envelope_status ADD VALUE IF NOT EXISTS 'finalization_failed';
