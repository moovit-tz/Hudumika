-- Petti flags — a lightweight way to raise a concern about a specific
-- deposit or withdrawal after the fact ("this receipt looks wrong", "I don't
-- recognise this charge"), separate from the approve/reject step that
-- already gates a withdrawal *before* it's disbursed. Deliberately not a
-- full ticketing system (no priority, no assignee, no comment thread) —
-- reason + resolve covers the real ask for an internal petty-cash tool;
-- anything needing more structure already has Hudumika's own Tasks app to
-- escalate into.
CREATE TABLE IF NOT EXISTS petti_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type VARCHAR(20) NOT NULL, -- deposit | withdrawal
  subject_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES petti_wallets(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | resolved
  raised_by UUID NOT NULL,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_petti_flags_tenant ON petti_flags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_petti_flags_subject ON petti_flags(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_petti_flags_wallet_status ON petti_flags(wallet_id, status);

ALTER TABLE petti_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE petti_flags FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'tenant_isolation_policy' AND polrelid = 'petti_flags'::regclass) THEN
    CREATE POLICY tenant_isolation_policy ON petti_flags
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  END IF;
END $$;
