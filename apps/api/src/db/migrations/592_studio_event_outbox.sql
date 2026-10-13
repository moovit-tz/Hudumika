CREATE TABLE studio_event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, event_id)
);
CREATE INDEX studio_event_outbox_due ON studio_event_outbox(status, available_at);
ALTER TABLE studio_event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_event_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON studio_event_outbox
 USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
