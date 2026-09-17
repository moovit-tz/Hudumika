-- 463_sign_envelope_search.sql
-- Closes a named Sign gap: GET /v1/sign/envelopes only ever did an in-memory
-- client-side substring match over whatever page happened to be fetched
-- (same shape Email had before its own fix). Real Postgres full-text search
-- over the fields a signer/preparer would actually search by.
ALTER TABLE sign_envelopes ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(message, '') || ' ' ||
      coalesce(file_name, '') || ' ' || coalesce(matter_reference, '')
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_sign_envelopes_search ON sign_envelopes USING GIN (search_vector);
