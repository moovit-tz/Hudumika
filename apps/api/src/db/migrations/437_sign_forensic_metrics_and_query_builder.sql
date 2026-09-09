-- Digital Execution Seal, Phase 7 — platform integration (metrics + Query
-- Builder), the last of the 7 phases. Same template as
-- 418_sign_metrics_registry.sql: every metric here is computed by one real
-- function (sign-forensic-metrics.service.ts's computeForensicKpis(), which
-- reads real sign_forensic_cases/sign_verifications rows), registered as
-- 'special' kind so this catalog and metrics-registry.service.ts's
-- SPECIAL_METRIC_HANDLERS describe the same six numbers, not a parallel set.
--
-- domain = 'security' — the metrics catalog's own taxonomy comment
-- (411_metric_registry.sql) already names 'security'/'compliance' as
-- buckets; nothing registered under either yet before this. A forensic
-- case is exactly what that bucket is for.
INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner, visibility) VALUES
('sign.forensics.cases_opened', 'Forensic cases opened', 'Forensic cases opened in the selected period (a seal that failed to validate, or a scanned copy whose content did not match the canonical record).', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_forensic_cases"],"formula":"COUNT(*) WHERE opened_at is in the period"}', 'count', 'number', 'Sign', 'standard'),
('sign.forensics.cases_resolved', 'Forensic cases resolved', 'Forensic cases marked resolved or dismissed in the selected period.', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_forensic_cases"],"formula":"COUNT(*) WHERE status IN (resolved, dismissed) AND resolved_at is in the period"}', 'count', 'number', 'Sign', 'standard'),
('sign.forensics.avg_resolution_hours', 'Avg time to resolve a case', 'Average hours from a forensic case opening to its resolution, over cases resolved in the period.', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_forensic_cases"],"formula":"AVG(resolved_at - opened_at), hours, over resolved cases"}', 'hours', 'duration', 'Sign', 'standard'),
('sign.forensics.open_cases_count', 'Open forensic cases', 'Current count of forensic cases still open or under review — a backlog gauge, not scoped to the selected period.', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_forensic_cases"],"formula":"COUNT(*) WHERE status IN (open, reviewing), current snapshot"}', 'count', 'number', 'Sign', 'standard'),
('sign.forensics.verification_attempts', 'Document verification attempts', 'Count of upload-and-compare verification attempts in the selected period, clean or not.', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_verifications"],"formula":"COUNT(*) WHERE method = upload AND looked_up_at is in the period"}', 'count', 'number', 'Sign', 'standard'),
('sign.forensics.non_clean_verdict_rate_pct', 'Non-clean verdict rate', 'Share of upload verification attempts whose comparison came back non-clean (content difference, seal invalid, mismatch, or inconclusive) in the period.', 'sign', 'forensics', 'security', 'special',
  '{"sourceTables":["sign_verifications"],"formula":"COUNT(content_verdict IN needs-case set) / COUNT(*), as a %, over upload attempts"}', 'percent', 'percent', 'Sign', 'standard');
