-- 419_metric_registry_hr_cargo_and_journal.sql
--
-- Adds 'journal_correction' audit event type for the electronic journal
-- append-only correction trail, and seeds NexusHR headcount/attendance
-- and CargoTracker active trips metrics into metric_definitions.

ALTER TYPE sign_event_type ADD VALUE IF NOT EXISTS 'journal_correction';

INSERT INTO metric_definitions (metric_key, name, description, app, module, domain, kind, config, unit, format, owner, visibility) VALUES
('nexushr.headcount', 'Active headcount', 'Total active employees in the organization.', 'nexushr', 'employees', 'operational', 'special',
  '{"sourceTables":["users"],"formula":"COUNT(*) WHERE active = true AND tenant_id = tenantId"}', 'count', 'number', 'NexusHR', 'restricted'),
('nexushr.late_clockin_pct', 'Late clock-in rate', 'Percentage of clock-in sessions flagged late in the period.', 'nexushr', 'attendance', 'operational', 'special',
  '{"sourceTables":["hr_clock_sessions"],"formula":"COUNT(is_late = true) / COUNT(*), as a %"}', 'percent', 'percent', 'NexusHR', 'restricted'),
('nexushr.pending_leave_requests', 'Pending leave requests', 'Current pending employee leave approval requests.', 'nexushr', 'leave', 'operational', 'special',
  '{"sourceTables":["hr_leave_requests"],"formula":"COUNT(*) WHERE status = PENDING"}', 'count', 'number', 'NexusHR', 'standard'),
('cargotracker.active_trips', 'Active trips in transit', 'Fleet trips currently in progress or dispatched.', 'cargotracker', 'fleet', 'operational', 'special',
  '{"sourceTables":["trips"],"formula":"COUNT(*) WHERE status = IN_PROGRESS"}', 'count', 'number', 'CargoTracker', 'standard')
ON CONFLICT (metric_key) DO NOTHING;
