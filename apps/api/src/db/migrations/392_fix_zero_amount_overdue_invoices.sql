-- Data correction: a handful of subscription_invoices rows were generated
-- while packages.monthly_price for 'enterprise' was 0/unset (before that
-- plan's custom pricing was configured), so their amount was captured as
-- $0.00 at generation time. With nothing owed, "due"/"overdue" was never a
-- correct status for them — that combination read as a confusing, seemingly
-- nonsensical "$0.00 · overdue" in Workspace > Subscription > Billing. Not
-- fabricating a historical charge that was never actually billed — just
-- correcting the status to match the (real, zero) amount, same fix now
-- applied going forward in billing.routes.ts's /invoices/generate.
UPDATE subscription_invoices
SET status = 'paid'
WHERE amount = 0
  AND status IN ('due', 'overdue');
