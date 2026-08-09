-- Uptime has to be measured before it can be reported.
--
-- onsite_health_checks carries last_checked_at, last_status_code,
-- last_response_ms and a uptime_30d rollup, and nothing in the codebase ever
-- wrote any of them: creating a monitor inserted a row and that was the end of
-- it. The Monitoring page filled the gap with `uptime_30d ?? 99.9`, reporting
-- four nines for a service nothing had ever contacted.
--
-- This is the missing half: one row per probe, append-only, so uptime_30d can
-- be derived from real samples instead of asserted. Keeping the samples also
-- makes "when did it break, and for how long" answerable, which a single
-- last_* column never can.

CREATE TABLE IF NOT EXISTS onsite_health_check_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  check_id        UUID NOT NULL REFERENCES onsite_health_checks(id) ON DELETE CASCADE,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok              BOOLEAN NOT NULL,
  status_code     INTEGER,
  response_ms     INTEGER,
  error           TEXT
);

-- The two queries this table exists to serve: the rolling window per check,
-- and the tenant's recent history.
CREATE INDEX IF NOT EXISTS idx_onsite_hcr_check_time  ON onsite_health_check_results (check_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_onsite_hcr_tenant_time ON onsite_health_check_results (tenant_id, checked_at DESC);

COMMENT ON TABLE onsite_health_check_results IS
  'One row per uptime probe. Append-only; uptime_30d on onsite_health_checks is derived from these, never set by hand.';
