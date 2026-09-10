-- Production-readiness audit HUD-0009 (migration-history drift).
--
-- complyos_marketplace_requests exists on the live database (with real data)
-- but no migration file in this repo creates it — the file that originally did
-- (recorded in _migrations as "094_marketplace_framework.sql") is gone from
-- disk, one of 6 applied-but-missing filenames found while proving a fresh
-- `db:migrate` reproduces production's schema (it didn't: this table's absence
-- broke migration 456's own `ALTER TABLE complyos_marketplace_requests …`).
--
-- Not the same table as compliance_marketplace_requests (093, Trade-Wizard
-- driven, procedure_id/contact_*) — this one is customer/source_module/
-- service_category shaped and currently has ZERO route or service referencing
-- it anywhere in apps/api/src: an orphaned table from a removed or
-- never-finished ComplyOS marketplace lead-capture feature. Recreated here
-- verbatim from the live schema (columns/types/defaults/PK/FKs/indexes/check)
-- so a fresh install matches production, NOT because the feature is active —
-- flagged in the audit register as a dead-table candidate for removal.

CREATE TABLE IF NOT EXISTS complyos_marketplace_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_module       TEXT NOT NULL,
  service_category    TEXT NOT NULL,
  reference_label     TEXT NOT NULL,
  reference_id        UUID,
  requirement_notes   TEXT,
  customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT,
  customer_email      TEXT,
  customer_phone      TEXT,
  requested_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_by_name   TEXT,
  requested_by_email  TEXT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'closed')),
  claimed_by          TEXT,
  claimed_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complyos_marketplace_requests_tenant ON complyos_marketplace_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complyos_marketplace_requests_status ON complyos_marketplace_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_complyos_marketplace_requests_module ON complyos_marketplace_requests(source_module);
