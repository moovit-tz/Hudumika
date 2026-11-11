-- Phase 4 follow-through: Legal's full acceptance scenario walk-through
-- ("conflict-check, open matter, receive retainer, record/approve work,
-- bill/apply funds, reconcile trust and close an auditable file") found
-- "bill/apply funds" genuinely absent, and traced the reason: legal_matters
-- bills through legal_clients, which has no link to the platform's shared
-- customers table that sales_invoices.customer_id actually requires — so
-- even a minimal "generate an invoice from approved billable time" feature
-- couldn't reuse the existing invoicing pipeline. The business resolved
-- this directly: link legal_clients to customers (not a separate
-- legal-specific billing table).
--
-- Nullable: existing legal_clients rows predate this column and have no
-- customer to backfill from (a legal client and a platform customer are
-- created through entirely separate flows) — a matter simply can't be
-- billed until its client is explicitly linked, which the new billing
-- endpoint enforces at call time rather than this migration guessing a link.
ALTER TABLE legal_clients
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS legal_clients_customer_idx ON legal_clients(tenant_id, customer_id) WHERE customer_id IS NOT NULL;

-- "record/approve work" — legal_time_entries already tracked is_billable/
-- is_billed, but nothing ever marked an entry approved, and nothing read
-- that field even if it existed. A real approval gate matters here: billing
-- directly off whatever hours were logged, with no review step, is how a
-- client gets billed for a typo'd 8.0-hour entry that should have read 0.8.
ALTER TABLE legal_time_entries
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
