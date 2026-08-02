-- Migration 166: a usable calculation history, and reporting a bug from
-- inside the app.
--
-- 1. landed_cost_records kept only summary figures — a total, a duty amount,
--    an HS code. Nothing there can reopen a report, and the history panel
--    said so out loud: "View-only — re-enter items to recalculate". A
--    206-line consignment could not be recovered at all. `payload` stores the
--    same structured result the share links already store (migration 151), so
--    a saved calculation re-renders through exactly the same report code as
--    the app. `parent_id` records that one calculation was derived from
--    another — amending a saved estimate produces a new version rather than
--    overwriting the figures a customer was already quoted.
--
-- 2. platform_support_tickets carried a subject, a category and a priority.
--    A bug report needs to say which app it came from and what the user was
--    looking at, or whoever picks it up starts by asking. `context` holds the
--    calculation as it stood; `record_id` links it to the saved calculation
--    when there is one. Attachments get their own table — a screenshot is
--    usually the whole report.

-- ── 1. Calculation history ────────────────────────────────────────────────
ALTER TABLE landed_cost_records
  -- The full result + inputs, exactly as sent to the report renderer.
  ADD COLUMN IF NOT EXISTS payload JSONB,
  -- Who the estimate was prepared for. Descriptive; it never fed the maths,
  -- which is why it was never stored, but it is how a person finds one again.
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  -- A name the user gave this estimate, so a list of forty is navigable.
  ADD COLUMN IF NOT EXISTS title TEXT,
  -- The calculation this one was derived from, if any.
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES landed_cost_records(id) ON DELETE SET NULL,
  -- 1 for an original; 2, 3 … for each amendment saved from it.
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS item_count INTEGER,
  -- Set when the estimate was shared as a QR link, so history can offer the
  -- same public URL instead of minting a second one for the same figures.
  ADD COLUMN IF NOT EXISTS share_token TEXT;

-- The history page sorts newest-first within a tenant and searches by text.
CREATE INDEX IF NOT EXISTS idx_lcr_tenant_created ON landed_cost_records(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lcr_parent ON landed_cost_records(parent_id) WHERE parent_id IS NOT NULL;
-- Platform-wide view: every tenant's calculations, newest first.
CREATE INDEX IF NOT EXISTS idx_lcr_created ON landed_cost_records(created_at DESC);

-- ── 2. Issue reports ──────────────────────────────────────────────────────
ALTER TABLE platform_support_tickets
  -- Which app the report came from ('clearos', 'seal', …). A bug list that
  -- cannot be filtered by app is a single undifferentiated queue.
  ADD COLUMN IF NOT EXISTS app TEXT,
  -- 'bug' | 'general' | … — kept alongside the existing free-text category.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'general',
  -- What the user was looking at: route, the calculation summary, browser.
  -- Never trusted as an input to anything; it exists to be read by a human.
  ADD COLUMN IF NOT EXISTS context JSONB,
  ADD COLUMN IF NOT EXISTS record_id UUID,
  -- Filled by platform staff when the ticket is closed out, and shown to the
  -- tenant so "RESOLVED" is not the whole of the answer they get.
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pst_kind_created ON platform_support_tickets(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_support_attachments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES platform_support_tickets(id) ON DELETE CASCADE,
  -- Recorded so a download can be checked against the caller's own tenant
  -- without a join, and so a deleted ticket still leaves an auditable row.
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER NOT NULL,
  -- Path under the uploads root, same convention as cloud_files.
  storage_key TEXT NOT NULL,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psa_ticket ON platform_support_attachments(ticket_id);
