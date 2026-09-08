-- 413_metric_registry_finops_clearos.sql
--
-- Milestone 2 of the Metric Registry program (see 411_metric_registry.sql):
-- FinOps AR/AP aging + GL trial balance, and ClearOS clearance turnaround +
-- average landed cost. Every one of these is either a direct read of an
-- already-real, already-working report (GLService.agedReceivables/
-- agedPayables/trialBalance — the same calls FinanceAgedReceivables.tsx,
-- FinanceAgedPayables.tsx and the GL Reports page already make) or a new
-- aggregate view over data that was already being captured for other
-- reasons (stage_history.duration_h, landed_cost_records.total_tzs) — see
-- clearos-metrics.service.ts's header comment. Nothing here is a new
-- calculation invented for this registry.
INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner, visibility) VALUES
('finops.ar_total', 'Accounts receivable', 'Total outstanding customer receivables, as of now.', 'finops', 'gl', 'financial', 'special',
  '{"sourceTables":["sales_invoices","sales_invoice_lines","journal_lines"],"formula":"GLService.agedReceivables(tenantId).totals.total"}', 'currency', 'currency', 'FinOps', 'restricted'),
('finops.ar_overdue_pct', 'AR overdue share', 'Share of receivables past the current bucket (31+ days).', 'finops', 'gl', 'financial', 'special',
  '{"sourceTables":["sales_invoices","sales_invoice_lines","journal_lines"],"formula":"(agedReceivables.totals.total - .current) / .total, as a %"}', 'percent', 'percent', 'FinOps', 'restricted'),
('finops.ap_total', 'Accounts payable', 'Total outstanding supplier payables, as of now.', 'finops', 'gl', 'financial', 'special',
  '{"sourceTables":["supplier_bills","journal_lines"],"formula":"GLService.agedPayables(tenantId).totals.total"}', 'currency', 'currency', 'FinOps', 'restricted'),
('finops.ap_overdue_pct', 'AP overdue share', 'Share of payables past the current bucket (31+ days).', 'finops', 'gl', 'financial', 'special',
  '{"sourceTables":["supplier_bills","journal_lines"],"formula":"(agedPayables.totals.total - .current) / .total, as a %"}', 'percent', 'percent', 'FinOps', 'restricted'),
('finops.trial_balance_variance', 'Trial balance variance', 'Total debits minus total credits over the period — should be ~0 for a balanced ledger.', 'finops', 'gl', 'financial', 'special',
  '{"sourceTables":["journal_entries","journal_lines"],"formula":"GLService.trialBalance(tenantId, from, to).totals.debit - .totals.credit"}', 'currency', 'currency', 'FinOps', 'restricted'),
('clearos.clearance_turnaround_hours', 'Avg clearance turnaround', 'Average hours from case creation to its CLOSED stage entry, for cases closed in the period.', 'clearos', 'shipments', 'operational', 'special',
  '{"sourceTables":["shipment_cases","stage_history"],"formula":"AVG(stage_history[stage=CLOSED].entered_at - shipment_cases.created_at), hours"}', 'hours', 'duration', 'ClearOS Ops', 'standard'),
('clearos.landed_cost_avg_tzs', 'Avg landed cost (TZS)', 'Average total landed cost across calculator runs saved in the period.', 'clearos', 'shipments', 'business', 'special',
  '{"sourceTables":["landed_cost_records"],"formula":"AVG(landed_cost_records.total_tzs) over the period"}', 'currency', 'currency', 'ClearOS Ops', 'standard');
