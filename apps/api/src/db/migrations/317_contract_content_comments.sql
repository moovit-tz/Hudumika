-- Migration 317: M2b of Contracts — a real Content field (the actual
-- contract body/terms text, distinct from `description`'s short internal
-- summary) and a Comments thread, same shape as todo_comments
-- (283_tasks_collaboration.sql).
--
-- Scope note: the reference product's Contract detail also shows a
-- separate "Notes" tab alongside Comments. Building two structurally
-- identical threaded-comment tables for one record would be duplication
-- for its own sake, not a real second capability — Comments alone covers
-- it; Notes is not being built as a separate table.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS content TEXT;

CREATE TABLE IF NOT EXISTS contract_comments (
  id          UUID PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_comments_contract ON contract_comments(contract_id);

ALTER TABLE contract_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON contract_comments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
