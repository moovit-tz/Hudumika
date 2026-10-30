-- Migration 631: Database-level idempotency constraints for finance
-- subscriber auto-created rows (I03).
--
-- finance.subscribers.ts already does a SELECT-before-INSERT guard, but
-- that check is not atomic — two concurrent deliveries of the same event
-- (perfectly normal after a crash-recovery replay) can both pass the
-- check and both INSERT. A UNIQUE constraint makes the DB the final
-- arbiter: the second INSERT fails with a conflict, which the subscriber
-- catches and silently ignores.

-- One subscriber-created duty expense per shipment (the finance subscriber
-- inserts category = 'DUTY', charge_head = 'DUTY_TAXES' for a released
-- declaration). Scoped to that exact pattern so manually created expenses
-- in the same category are not blocked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_subscriber_duty
  ON expenses (tenant_id, shipment_id)
  WHERE shipment_id IS NOT NULL
    AND category = 'DUTY'
    AND charge_head = 'DUTY_TAXES';

-- One auto-drafted invoice per shipment reference. Scoped to subscriber-
-- created drafts (created_by IS NULL) so split invoices and subsequent
-- manual billing are not blocked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_invoices_autodraft
  ON sales_invoices (tenant_id, shipment_ref)
  WHERE shipment_ref IS NOT NULL
    AND status = 'Draft'
    AND created_by IS NULL;
