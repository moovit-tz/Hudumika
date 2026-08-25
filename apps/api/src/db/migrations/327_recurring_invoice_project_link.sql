-- Migration 327: M16 of the standalone Projects app — retainer/recurring
-- project billing. A thin link on top of the already-real recurring_invoices
-- (FinOps program, this session) — no new billing infrastructure, just a
-- nullable project_id so "Set up retainer" on a project can create a
-- recurring invoice scoped to it, through the same real
-- POST /v1/invoices/recurring endpoint every other recurring invoice uses.

ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_recurring_invoices_project ON recurring_invoices(project_id) WHERE project_id IS NOT NULL;
