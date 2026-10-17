ALTER TABLE sign_templates ADD COLUMN document_definition jsonb;
CREATE TABLE sign_generated_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 created_by uuid NOT NULL REFERENCES users(id),
 template_id uuid REFERENCES sign_templates(id) ON DELETE SET NULL,
 template_name text NOT NULL,
 definition jsonb NOT NULL,
 title text NOT NULL,
 jurisdiction text NOT NULL,
 answers jsonb NOT NULL DEFAULT '{}',
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sign_generated_documents_tenant ON sign_generated_documents(tenant_id, updated_at DESC);
ALTER TABLE sign_generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE sign_generated_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON sign_generated_documents
 USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
