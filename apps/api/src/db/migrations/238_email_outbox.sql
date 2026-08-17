-- 238_email_outbox.sql
-- The one shared, durable send queue every app enqueues into (MailService.
-- enqueue/enqueueTemplated) instead of calling EmailIntegration.sendEmail
-- directly. Closes the "a failed payslip email is just silently lost" gap —
-- every prior send was a synchronous await or a fire-and-forget .catch()
-- with no retry anywhere in the codebase. Polled by mail-outbox.job.ts.
CREATE TABLE IF NOT EXISTS email_outbox (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  to_address       VARCHAR(320) NOT NULL,
  cc_addresses     JSONB,
  from_name        VARCHAR(200),
  from_address     VARCHAR(320),
  subject          TEXT         NOT NULL,
  body_html        TEXT         NOT NULL,
  template_key     VARCHAR(100),
  source_app       VARCHAR(50),  -- which caller enqueued it, for observability
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | sending | sent | failed
  attempts         INT          NOT NULL DEFAULT 0,
  max_attempts     INT          NOT NULL DEFAULT 5,
  last_error       TEXT,
  next_attempt_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sent_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_due    ON email_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_email_outbox_tenant ON email_outbox(tenant_id);
