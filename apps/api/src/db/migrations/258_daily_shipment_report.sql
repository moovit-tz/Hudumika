-- Daily shipment-report automation: email (PDF attached) + WhatsApp (link
-- only) at 21:00 EAT, switchable per-customer and per-shipment.
--
-- Purely additive — two nullable booleans, one new reference-style table,
-- two nullable columns on the existing email_outbox queue. Nothing here
-- changes an existing constraint or requires a backfill; every existing
-- row/tenant behaves exactly as before until someone explicitly opts in
-- (customers.daily_report_enabled default) or out.
--
-- Tri-state inheritance, same shape as this codebase's own
-- email_templates-overrides-a-code-default / tenant_settings.settings
-- pattern: NULL customers.daily_report_enabled = platform default (on);
-- NULL shipment_cases.daily_report_enabled = inherit whatever the
-- customer's own setting resolves to; a real true/false at either level is
-- an explicit override. No existing precedent for boolean inheritance
-- specifically existed in this codebase to copy — this establishes one.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS daily_report_enabled BOOLEAN;
ALTER TABLE shipment_cases ADD COLUMN IF NOT EXISTS daily_report_enabled BOOLEAN;

-- Same "unguessable token is the access control, not RLS" pattern as
-- landed_cost_shares (151) and tracking_snapshots' share_token (019) — the
-- whole point is an unauthenticated WhatsApp recipient can open it. Unlike
-- landed_cost_shares, no payload snapshot is stored: the public page
-- re-queries the shipment fresh on every view, so "check progress" always
-- shows the real current state, not a frozen 21:00 snapshot.
--
-- shipment_id is a bare UUID, not a foreign key — shipment_cases has a
-- composite primary key (id, created_at) because it's a partitioned table,
-- so a plain FK on id alone isn't valid Postgres (same reason
-- freight_bookings.converted_shipment_id and quotations.converted_shipment_id
-- are bare UUID columns too).
--
-- One persistent token per shipment (UNIQUE(shipment_id)) rather than
-- minting a new one on every send — a link already shared in an old
-- WhatsApp message keeps working rather than silently going stale the next
-- time the job runs.
CREATE TABLE IF NOT EXISTS shipment_report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shipment_id)
);
CREATE INDEX IF NOT EXISTS idx_shipment_report_shares_tenant ON shipment_report_shares(tenant_id);

-- Attachment support for the mail queue (238_email_outbox.sql) — did not
-- exist at all before this: nodemailer's own sendMail() already accepts an
-- attachments array, this just plumbs a storage reference through the
-- queue rather than storing the PDF bytes in the row itself, matching how
-- every other generated/uploaded file in this platform is a storage_key
-- reference (case_documents, cloud files, HR documents), never inline bytes.
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attachment_storage_key TEXT;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attachment_filename TEXT;
