-- AgencyHost M6 — Onsite configuration backups.
--
-- A snapshot of a tenant's own Onsite CONFIGURATION rows (domains, DNS,
-- applications, environments, secrets, websites, health checks, provider
-- connections) — never a website's actual files or database, which this
-- platform has never stored a copy of (onsite-ci.service.ts only ever
-- exchanges a pipeline id/status with the CI provider, never the built
-- artifact). The snapshot lives directly as jsonb rather than through
-- integrations/minio.ts, which — despite its name — writes to local disk,
-- not a real object store; there's no actual blob here to hand to one.
CREATE TABLE onsite_backups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger       VARCHAR(20) NOT NULL CHECK (trigger IN ('manual', 'scheduled')),
  status        VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  snapshot      JSONB NOT NULL,
  size_bytes    INT NOT NULL,
  error_message TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_onsite_backups_tenant ON onsite_backups(tenant_id, created_at DESC);

ALTER TABLE onsite_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE onsite_backups FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON onsite_backups
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
