-- ============================================================
-- 098 — ComplyOS: two-stage expiry reminders (90-day / 30-day)
--        + non-renewal risk description per certificate
-- ============================================================

ALTER TABLE comply_certificates
  ADD COLUMN reminder_90d_sent_at TIMESTAMPTZ,
  ADD COLUMN reminder_30d_sent_at TIMESTAMPTZ,
  ADD COLUMN non_renewal_risk     TEXT;
