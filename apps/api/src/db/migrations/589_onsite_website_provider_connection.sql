ALTER TABLE onsite_provider_connections
  ADD CONSTRAINT onsite_provider_connections_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE onsite_websites ADD COLUMN provider_connection_id uuid;
ALTER TABLE onsite_websites ADD CONSTRAINT onsite_websites_provider_connection_fk
  FOREIGN KEY (tenant_id, provider_connection_id)
  REFERENCES onsite_provider_connections (tenant_id, id);

CREATE INDEX onsite_websites_provider_connection_idx
  ON onsite_websites (tenant_id, provider_connection_id);
