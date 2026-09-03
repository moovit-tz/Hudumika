-- Auto-join-your-company's-existing-workspace-by-domain: a signup whose
-- work-email domain matches an existing active tenant's real staff is
-- offered "request to join" instead of standing up a duplicate tenant.
-- Deliberately NOT a silent auto-join — a stranger typing anyone@acme.com
-- must never land inside Acme's real data with no human in the loop, so
-- this is a request queue a tenant admin reviews, mirroring
-- ondi_org_access_requests' own request/approve/deny shape (362_ondi_org_identity.sql).
--
-- The requester's password is captured and hashed at REQUEST time (same
-- "set your own password once" pattern as hr_invitations/accept-invite,
-- 040_hr_teams_invites_audit.sql) but no `users` row exists until an admin
-- approves — and the admin chooses the role at approval time, not the
-- requester, so a join request can never self-escalate.
CREATE TABLE IF NOT EXISTS tenant_join_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  deny_reason     TEXT,
  created_user_id UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_join_requests_queue ON tenant_join_requests(tenant_id, status, created_at);

-- One live request per email at a time — stops the same address from
-- queuing several simultaneous join attempts (across the same or different
-- tenants) while a decision is still pending.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_join_requests_pending_email ON tenant_join_requests(email) WHERE status = 'pending';

ALTER TABLE tenant_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_join_requests FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'tenant_join_requests'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON tenant_join_requests
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;

-- SuperAdmin visibility signal, not a gate: which recognized free consumer
-- domain (if any) the FOUNDING admin signed up with. NULL means either a
-- real work domain or a tenant created before this column existed — never
-- read NULL as "confirmed work domain".
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS founder_personal_email_domain TEXT;
