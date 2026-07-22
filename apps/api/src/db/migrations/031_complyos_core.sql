-- ============================================================
-- 031 — ComplyOS: certificates, applications, obligations,
--        renewal workflows, agency sync logs
-- ============================================================

-- ── Certificates ────────────────────────────────────────────
CREATE TABLE comply_certificates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  cert_number     TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  agency_code     TEXT        NOT NULL,
  agency_name     TEXT        NOT NULL,
  agency_class    TEXT        NOT NULL DEFAULT 'gov', -- gov | tax | social | reg | fin
  issued_date     DATE,
  expiry_date     DATE,
  status          TEXT        NOT NULL DEFAULT 'active', -- active | expiring | expired | revoked
  document_url    TEXT,
  external_ref    TEXT,       -- reference ID from the issuing agency
  auto_renew      BOOLEAN     NOT NULL DEFAULT false,
  last_synced_at  TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_certs_tenant       ON comply_certificates (tenant_id);
CREATE INDEX comply_certs_expiry       ON comply_certificates (tenant_id, expiry_date);
CREATE INDEX comply_certs_status       ON comply_certificates (tenant_id, status);
CREATE UNIQUE INDEX comply_certs_ref   ON comply_certificates (tenant_id, cert_number);

-- ── Applications ─────────────────────────────────────────────
CREATE TABLE comply_applications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  app_number      TEXT        NOT NULL,
  cert_type       TEXT        NOT NULL,
  agency_code     TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'draft', -- draft | submitted | review | issued | rejected | pending
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT        NOT NULL,
  agency_ref      TEXT,
  notes           TEXT,
  linked_cert_id  UUID        REFERENCES comply_certificates(id) ON DELETE SET NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX comply_apps_tenant        ON comply_applications (tenant_id);
CREATE INDEX comply_apps_status        ON comply_applications (tenant_id, status);
CREATE UNIQUE INDEX comply_apps_number ON comply_applications (tenant_id, app_number);

-- ── Obligations ──────────────────────────────────────────────
CREATE TABLE comply_obligations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT        NOT NULL,
  obligation_code       TEXT        NOT NULL, -- e.g. OB-TRA-VAT
  agency_code           TEXT        NOT NULL,
  agency_class          TEXT        NOT NULL DEFAULT 'gov',
  name                  TEXT        NOT NULL,
  frequency             TEXT        NOT NULL, -- Annual | Monthly | Semi-annual | Once
  mandatory             BOOLEAN     NOT NULL DEFAULT true,
  status                TEXT        NOT NULL DEFAULT 'not-started', -- active | pending | expired | not-started
  due_date              DATE,
  last_fulfilled_date   DATE,
  linked_cert_id        UUID        REFERENCES comply_certificates(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_obligs_tenant      ON comply_obligations (tenant_id);
CREATE UNIQUE INDEX comply_obligs_code ON comply_obligations (tenant_id, obligation_code);

-- ── Renewal workflows ─────────────────────────────────────────
CREATE TABLE comply_renewals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT        NOT NULL,
  cert_id         UUID        NOT NULL REFERENCES comply_certificates(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending_review', -- pending_review | approved | submitted | issued | failed | cancelled
  trigger         TEXT        NOT NULL DEFAULT 'automatic',       -- automatic | manual
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by     TEXT,
  approved_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  linked_app_id   UUID        REFERENCES comply_applications(id) ON DELETE SET NULL,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX comply_renewals_tenant    ON comply_renewals (tenant_id);
CREATE INDEX comply_renewals_cert      ON comply_renewals (cert_id);
CREATE INDEX comply_renewals_status    ON comply_renewals (tenant_id, status);

-- ── Agency API sync log ───────────────────────────────────────
CREATE TABLE comply_agency_syncs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT        NOT NULL,
  agency_code      TEXT        NOT NULL,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status           TEXT        NOT NULL, -- success | failed | partial
  records_updated  INT         NOT NULL DEFAULT 0,
  error            TEXT
);

CREATE INDEX comply_syncs_tenant       ON comply_agency_syncs (tenant_id);
CREATE INDEX comply_syncs_agency       ON comply_agency_syncs (tenant_id, agency_code, synced_at DESC);
