-- Migration 632: Add source_event_id to expenses and sales_invoices so
-- subscriber-created rows tie back to the domain event that triggered them.
-- This replaces the fragile category/charge-head and status/created_by
-- predicates in migration 631 with a proper operation key.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES domain_events(id) ON DELETE SET NULL;

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES domain_events(id) ON DELETE SET NULL;

-- One subscriber-created row per (tenant, domain event). This is the real
-- idempotency key: a redelivered event that already produced a row is a
-- no-op. Manual entries never set source_event_id, so they're unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_source_event
  ON expenses (tenant_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_invoices_source_event
  ON sales_invoices (tenant_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

-- Drop the old predicate-based constraints that could collide with manual
-- entries sharing the same category or block legitimate split billing.
DROP INDEX IF EXISTS uq_expenses_subscriber_duty;
DROP INDEX IF EXISTS uq_sales_invoices_autodraft;
