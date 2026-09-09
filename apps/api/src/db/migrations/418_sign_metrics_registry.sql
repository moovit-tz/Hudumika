-- 418_sign_metrics_registry.sql
--
-- Phase S3 of METRICS_AND_SIGN_PLAN.md: Sign's own real numbers, registered
-- into the same Metric Registry every other app already uses (see
-- 411/413's own headers) — "ONE metric definition... Sign → Query Builder
-- → HuduBI", not a separate Sign-only analytics formula. Every metric here
-- is computed by sign-metrics.service.ts's computeSignKpis(), which reads
-- real sign_envelopes/sign_events/sign_recipients rows — nothing invented.
--
-- Deliberately NOT included: an identity-verification-failure rate. See
-- sign-metrics.service.ts's own header — POST /public/:token/verify-otp
-- never persists a failed attempt anywhere today, so that number cannot be
-- honestly computed yet. Registering it here would be exactly the
-- fabricated-metric mistake this program has avoided everywhere else.
INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner, visibility) VALUES
('sign.envelopes_created', 'Envelopes created', 'Total envelopes created in the selected period.', 'sign', 'envelopes', 'operational', 'special',
  '{"sourceTables":["sign_envelopes"],"formula":"COUNT(*) for the period"}', 'count', 'number', 'Sign', 'standard'),
('sign.completion_rate_pct', 'Completion rate', 'Share of sent envelopes that reached completed status.', 'sign', 'envelopes', 'operational', 'special',
  '{"sourceTables":["sign_envelopes"],"formula":"COUNT(status=completed) / COUNT(sent_at IS NOT NULL), as a %"}', 'percent', 'percent', 'Sign', 'standard'),
('sign.avg_completion_hours', 'Avg time to completion', 'Average hours from sent to completed, over envelopes that completed in the period.', 'sign', 'envelopes', 'operational', 'special',
  '{"sourceTables":["sign_envelopes"],"formula":"AVG(completed_at - sent_at), hours, over completed envelopes"}', 'hours', 'duration', 'Sign', 'standard'),
('sign.witnessed_count', 'Witnessed signatures', 'Count of distinct "witnessed" audit events in the period.', 'sign', 'execution', 'operational', 'special',
  '{"sourceTables":["sign_events"],"formula":"COUNT(*) WHERE event_type = witnessed"}', 'count', 'number', 'Sign', 'standard'),
('sign.certified_count', 'Certifications completed', 'Count of distinct "certified" audit events (notary/commissioner acts) in the period.', 'sign', 'execution', 'operational', 'special',
  '{"sourceTables":["sign_events"],"formula":"COUNT(*) WHERE event_type = certified"}', 'count', 'number', 'Sign', 'standard'),
('sign.otp_verified_count', 'SMS identity verifications', 'Count of recipients who completed SMS OTP verification before signing, in the period.', 'sign', 'envelopes', 'operational', 'special',
  '{"sourceTables":["sign_recipients"],"formula":"COUNT(*) WHERE otp_verified_at IS NOT NULL"}', 'count', 'number', 'Sign', 'standard');
