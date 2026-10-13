ALTER TABLE onsite_applications ADD COLUMN provider_connection_id uuid;
ALTER TABLE onsite_applications ADD CONSTRAINT onsite_applications_provider_connection_fk
  FOREIGN KEY (tenant_id, provider_connection_id)
  REFERENCES onsite_provider_connections (tenant_id, id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ON onsite_applications (tenant_id, provider_connection_id);

-- Historical runs retain identity even if a connection is removed or a snapshot restored.
ALTER TABLE onsite_deployments ADD COLUMN provider_connection_id uuid;
