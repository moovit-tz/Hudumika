-- Cloud storage product, steps 7-10 of the storage-product review:
--   7. storage add-ons (extra quota purchasable on top of the plan)
--   8/9. real billing gateway + scheduled invoices, proration, webhooks, dunning
--   10. retention, legal hold, malware-scan status, storage integrity

-- ── 7. Storage add-ons ─────────────────────────────────────────────────
-- An add-on with storage_bytes set grants that much extra quota per unit
-- (tenant_addons.quantity). Prices below are catalog defaults a SuperAdmin
-- can edit like any other add-on. feature_key 'storage' is not an app
-- entitlement — no route checks it — so buying storage never unlocks an app.
ALTER TABLE package_addons ADD COLUMN IF NOT EXISTS storage_bytes BIGINT;

INSERT INTO package_addons (code, name, description, feature_key, monthly_price, annual_price, color, sort_order, storage_bytes) VALUES
('storage-100gb', 'Extra storage · 100 GB',
 'Adds 100 GB to your Cloud storage quota on top of your plan. Buy several for more.',
 'storage', 5, 50, '#0d9488', 10, 107374182400),
('storage-1tb', 'Extra storage · 1 TB',
 'Adds 1 TB to your Cloud storage quota on top of your plan.',
 'storage', 40, 400, '#0d9488', 11, 1099511627776)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE tenant_addons ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_addons_quantity_positive') THEN
    ALTER TABLE tenant_addons ADD CONSTRAINT tenant_addons_quantity_positive CHECK (quantity >= 1);
  END IF;
END $$;

-- ── 8/9. Billing: gateway, proration, dunning ──────────────────────────
-- kind: a normal monthly 'period' invoice, or a 'proration' invoice for an
-- add-on bought mid-period (covers today → period end; the next period
-- invoice bills it in full).
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'period';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_invoices_kind_valid') THEN
    ALTER TABLE subscription_invoices ADD CONSTRAINT subscription_invoices_kind_valid CHECK (kind IN ('period', 'proration'));
  END IF;
END $$;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS gateway VARCHAR(30);
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS gateway_ref VARCHAR(100);
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;
-- Dunning: which reminder/escalation step this invoice has reached, and the
-- last automatic charge attempt against a stored payment method.
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS dunning_stage INT NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS last_attempt_error TEXT;
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- One regular invoice per tenant per period (proration invoices share the period).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_invoices_period
  ON subscription_invoices (tenant_id, period_start) WHERE kind = 'period';
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_gateway_ref
  ON subscription_invoices (gateway_ref) WHERE gateway_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscription_invoices_open
  ON subscription_invoices (status, due_date) WHERE status IN ('due', 'overdue');

-- Every gateway webhook delivery, keyed by the gateway's own event id, so a
-- redelivered event is recognised and ignored. Platform-level (a webhook
-- arrives before we know the tenant), not tenant-scoped.
CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway      VARCHAR(30) NOT NULL,
  event_id     VARCHAR(120) NOT NULL,
  event_type   VARCHAR(60),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcome      VARCHAR(30),
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gateway, event_id)
);

-- ── 10. Retention, legal hold, scan status, integrity ──────────────────
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS retain_until TIMESTAMPTZ;
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS legal_hold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS legal_hold_reason TEXT;
-- scan_status: clean | infected | skipped (scanner unconfigured/unreachable at upload time)
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS scan_status VARCHAR(10);
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS storage_verified_at TIMESTAMPTZ;
ALTER TABLE cloud_files ADD COLUMN IF NOT EXISTS storage_missing BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_cloud_files_rescan ON cloud_files (tenant_id) WHERE scan_status IS NULL OR scan_status = 'skipped';
CREATE INDEX IF NOT EXISTS idx_cloud_files_legal_hold ON cloud_files (tenant_id) WHERE legal_hold;

-- Per-tenant override of how long a retention_class is kept (days). The code
-- carries defaults (lib/cloud-retention.ts); a row here replaces the default.
CREATE TABLE IF NOT EXISTS cloud_retention_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  retention_class VARCHAR(40) NOT NULL,
  retain_days     INT NOT NULL CHECK (retain_days >= 0),
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, retention_class)
);
ALTER TABLE cloud_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON cloud_retention_policies
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Already-filed financial records get the default 7-year hold too, so the
-- protection is not limited to files filed after this migration.
UPDATE cloud_files SET retain_until = created_at + interval '2555 days'
WHERE retention_class = 'financial_record' AND retain_until IS NULL;
