# Hudumika — PERFORMANCE Audit

Status: **NOT YET EXECUTED** (2026-09-10). Placeholder so the phase has a home.
Nothing here is PASS. See FINAL_PRODUCTION_READINESS_REPORT.md §5 for ordering.

## Planned scope (Phase 21)
Seed 100 / 1k / 10k / 100k rows into the heaviest list endpoints (shipments,
invoices, contacts, leads, tickets, api_usage_events). Measure API p50/p95, SQL
time, payload size. Hunt N+1 (list endpoints that fan out per row), full-table
downloads to render 20 rows, missing indexes on RLS predicates and sort columns,
unbounded `SELECT *`. `api_usage_events` is already ~666k rows — start there.
