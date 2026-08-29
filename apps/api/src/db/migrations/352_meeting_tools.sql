-- Real, working versions of the meeting-tools panel: Polls, Q&A, and a live
-- transcript (Web Speech API on the client, persisted here). Timer needs no
-- table — it's a start-time + duration broadcast over the existing room
-- signaling, computed client-side from that.

CREATE TABLE IF NOT EXISTS bliss_meeting_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id      UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  options         JSONB NOT NULL, -- ["Option A", "Option B", ...]
  created_by      UUID NOT NULL REFERENCES users(id),
  created_by_name TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_polls_meeting ON bliss_meeting_polls(tenant_id, meeting_id, created_at DESC);

ALTER TABLE bliss_meeting_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_polls FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_polls'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_polls
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bliss_meeting_poll_votes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  poll_id      UUID NOT NULL REFERENCES bliss_meeting_polls(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_poll_votes_poll ON bliss_meeting_poll_votes(tenant_id, poll_id);

ALTER TABLE bliss_meeting_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_poll_votes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_poll_votes'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_poll_votes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bliss_meeting_questions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name  TEXT NOT NULL,
  text       TEXT NOT NULL,
  answered   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_questions_meeting ON bliss_meeting_questions(tenant_id, meeting_id, created_at DESC);

ALTER TABLE bliss_meeting_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_questions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_questions'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_questions
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bliss_meeting_question_upvotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES bliss_meeting_questions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_question_upvotes_q ON bliss_meeting_question_upvotes(tenant_id, question_id);

ALTER TABLE bliss_meeting_question_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_question_upvotes FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_question_upvotes'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_question_upvotes
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- One row per recognized speech segment (Web Speech API's own utterance
-- boundaries — real segmentation, not artificially chunked). Real captions
-- are built from this, not a hardcoded placeholder sentence.
CREATE TABLE IF NOT EXISTS bliss_meeting_transcript_lines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES bliss_meetings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name  TEXT NOT NULL,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bliss_meeting_transcript_meeting ON bliss_meeting_transcript_lines(tenant_id, meeting_id, created_at ASC);

ALTER TABLE bliss_meeting_transcript_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE bliss_meeting_transcript_lines FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'bliss_meeting_transcript_lines'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON bliss_meeting_transcript_lines
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
