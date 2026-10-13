CREATE TABLE studio_delivery_recoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES studio_event_outbox(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  previous_attempts integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX studio_delivery_recoveries_tenant ON studio_delivery_recoveries(tenant_id, delivery_id);
ALTER TABLE studio_delivery_recoveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_delivery_recoveries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON studio_delivery_recoveries
 USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
