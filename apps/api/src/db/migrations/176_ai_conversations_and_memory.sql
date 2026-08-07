-- The assistant had no memory of any kind. POST /v1/ai/chat took the whole
-- message array from the client, answered, and stored nothing; AIChat.tsx held
-- the thread in a plain useState. A refresh, a navigation, or a second device
-- and the conversation was gone — and nothing the user had ever told it
-- survived to the next question.
--
-- Two different things are needed, and they are deliberately separate tables:
--
--   ai_conversations / ai_messages  the transcript. What was said, in order,
--                                   so a thread can be reopened and continued.
--   ai_memory                       durable facts worth carrying into every
--                                   future conversation, regardless of which
--                                   thread they were learned in.
--
-- Keeping them apart matters: a transcript grows without limit and is mostly
-- noise, while memory is a small curated set that gets injected into the
-- prompt. Deriving one from the other at query time would mean re-reading
-- every message ever sent on every single turn.

CREATE TABLE IF NOT EXISTS ai_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Threads belong to a person, not to the workspace: one user's questions
  -- are not another's to read, even inside the same tenant.
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  -- What the assistant actually looked up to answer. Kept so an answer can be
  -- audited later against the tools that produced it, rather than being taken
  -- on trust.
  tool_calls      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- NULL means the whole workspace shares it ("we clear through Sirari"),
  -- a user id means it is that person's own ("I handle the Dangote account").
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  -- Where it came from, so a fact the assistant inferred is never presented
  -- with the authority of one the user stated outright.
  source      VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'assistant')),
  -- The conversation it was learned in, kept so a remembered fact can always
  -- be traced back to what was actually said. Nullable: memory added straight
  -- from a settings screen has no conversation behind it.
  source_conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every read is "this tenant's threads, newest first" or "this thread's
-- messages, oldest first", so the indexes match those two shapes exactly.
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant_user
  ON ai_conversations(tenant_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation
  ON ai_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_messages_tenant
  ON ai_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_tenant_user
  ON ai_memory(tenant_id, user_id);

-- RLS is enabled to match every other tenant-scoped table, but note what
-- CLAUDE.md says about it: the API connects as a role that owns these tables,
-- and Postgres exempts an owner from its own policies. The policy is a second
-- line, not the first. Every query in ai.routes.ts filters tenant_id itself.
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_memory        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ai_conversations'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ai_conversations
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ai_messages'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ai_messages
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'ai_memory'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON ai_memory
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
