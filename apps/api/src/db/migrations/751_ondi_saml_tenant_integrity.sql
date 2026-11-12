-- Keep the tenant relationships inside the SAML session table enforceable at
-- the database boundary, even if a future route accidentally supplies a
-- foreign tenant's user or service-provider ID.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ondi_saml_sp_clients_tenant_id
  ON ondi_saml_sp_clients (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_tenant_id
  ON users (tenant_id, id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ondi_saml_sessions_client_tenant_fk'
      AND conrelid = 'ondi_saml_idp_sessions'::regclass
  ) THEN
    ALTER TABLE ondi_saml_idp_sessions
      ADD CONSTRAINT ondi_saml_sessions_client_tenant_fk
      FOREIGN KEY (tenant_id, client_id)
      REFERENCES ondi_saml_sp_clients (tenant_id, id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ondi_saml_sessions_user_tenant_fk'
      AND conrelid = 'ondi_saml_idp_sessions'::regclass
  ) THEN
    ALTER TABLE ondi_saml_idp_sessions
      ADD CONSTRAINT ondi_saml_sessions_user_tenant_fk
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES users (tenant_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;
