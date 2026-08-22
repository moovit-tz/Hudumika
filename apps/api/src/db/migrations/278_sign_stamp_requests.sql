-- Migration 278: Stamp requests — the approval workflow for a person whose
-- role doesn't clear the tenant's stamp-access gate (tenant_settings's
-- 'esign' key, stamp_roles array — a plain settings value, not a schema
-- change, since it's tenant-editable UI config, same shape as every other
-- Settings.tsx section's own JSON blob).
--
-- The approver is tagged by the requester (EntityPicker), not resolved from
-- an org-chart "manager" field — see sign-pdf's own M2/M5 planning note:
-- hr_employments' manager chain has no proven link to users.id anywhere in
-- this codebase and may be unpopulated for most tenants, so building an
-- auto-resolved approval chain on top of it would be guessing at data that
-- likely isn't there. Manual tagging is also what the user actually asked
-- for ("...request stamping from their top leader after tagging them").

CREATE TABLE IF NOT EXISTS sign_stamp_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES users(id),
  approver_id   UUID NOT NULL REFERENCES users(id),
  -- What the stamp is for — free text the requester supplies (e.g. "Invoice
  -- INV-2026-0043 for Aleka Holdings") plus an optional structured pointer
  -- once a real consumer (M6's invoice flow, or another app later) exists.
  target_type   TEXT,
  target_ref    TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  decision_note TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sign_stamp_requests_tenant_idx ON sign_stamp_requests(tenant_id);
CREATE INDEX IF NOT EXISTS sign_stamp_requests_approver_idx ON sign_stamp_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS sign_stamp_requests_requester_idx ON sign_stamp_requests(requested_by);

ALTER TABLE sign_stamp_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_stamp_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'sign_stamp_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON sign_stamp_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
