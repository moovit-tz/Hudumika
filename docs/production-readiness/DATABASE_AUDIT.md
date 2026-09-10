# Hudumika — Database Audit

Snapshot 2026-09-10. Postgres 13.23, `localhost:5433/clearos`. 580 base tables.

## Done

- **RLS coverage** — see SECURITY_AUDIT.md. After migrations 456/457/458: 474/474
  `tenant_id` tables + 9 structural child tables `ENABLE`+`FORCE`+policy. Verified
  cross-tenant.
- **Restricted role** — app connects as `hudumika_app` (non-superuser, non-BYPASSRLS,
  migration 241); `FORCE RLS` platform-wide baseline (migration 242). Confirmed live:
  the probe role could not escalate.
- **Global reference tables** correctly have no RLS (`hs_codes` 6092, `sanctions_entries`
  18 473, `reference_countries`, `port_tariff_items`, `trade_procedure_steps` 1848, …).

## Findings

### HUD-0007 — `tenant_id` type split (MEDIUM)
12 tables use `text` `tenant_id` (all 3 `cms_*`, 9 `comply_*`); every other tenant
table uses `uuid`. Values are uuid-format. Blocks a uniform FK to `tenants(id)` and
forces a 2nd RLS policy variant. Fix = column type migration (low risk, small rows).

### HUD-0009 — migration history drift · FIXED (VERIFIED)
`_migrations` had 479 applied filenames vs. 470 `.sql` files on disk. Proved the risk
was real by running `db:migrate` against a from-scratch database (`hud_fresh_check`,
same cluster): it failed twice — `077_marketplace_apps.sql`'s seed data assumed a
`users` row already existed (fixed with a `WHERE EXISTS` guard), and
`complyos_marketplace_requests` (referenced by this audit's own migration 456) had no
creating migration anywhere in the repo (one of 6 lost filenames) — recreated verbatim
from the live schema in `100_recover_complyos_marketplace_requests.sql`.
**Re-run: 474/474 migrations apply clean on an empty database. Full schema diff
against live = 0 table / column / RLS mismatches** (one residual dead table noted,
HUD-0019). Gate now PASSES.

## Not yet audited (Phase 11 / 38)

- FK completeness / orphan rows (polymorphic tables like `crm_activities`,
  `notifications`, `stage_history` — no FK by design; check for dangling `subject_id`).
- Index coverage vs. actual query patterns; N+1 in list endpoints.
- `NOT NULL` / `CHECK` / `UNIQUE` gaps on financial tables (`sales_invoices`,
  `journal_entries`, `journal_lines`, `deals`, `quotations`).
- Soft-delete consistency (`deleted_at` vs. hard delete) across apps.
- `numeric` precision/scale on money columns (Phase 26) — no `float`/`double` for
  persisted monetary values.
- Cascade behaviour on tenant deletion.
- Realistic-volume performance (100 → 100k rows).
