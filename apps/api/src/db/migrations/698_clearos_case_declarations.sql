CREATE TABLE clearos_case_declarations (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id UUID NOT NULL,
  declaration_id UUID NOT NULL,
  declared_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, shipment_id)
);

CREATE INDEX clearos_case_declarations_period_idx
  ON clearos_case_declarations (tenant_id, declared_at);

CREATE FUNCTION record_clearos_case_declaration() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.clearos_case_declarations (tenant_id, shipment_id, declaration_id, declared_at)
  VALUES (NEW.tenant_id, NEW.shipment_id, NEW.id, NEW.declared_at)
  ON CONFLICT (tenant_id, shipment_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Keep declaration writes locked until the trigger and historical import are visible together.
CREATE TRIGGER record_clearos_case_declaration
  AFTER INSERT OR UPDATE OF declared_at ON declarations
  FOR EACH ROW WHEN (NEW.declared_at IS NOT NULL)
  EXECUTE FUNCTION record_clearos_case_declaration();

INSERT INTO clearos_case_declarations (tenant_id, shipment_id, declaration_id, declared_at, recorded_at)
SELECT DISTINCT ON (tenant_id, shipment_id) tenant_id, shipment_id, id, declared_at, NULL
FROM declarations
WHERE declared_at IS NOT NULL
ORDER BY tenant_id, shipment_id, declared_at, id;

ALTER TABLE clearos_case_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE clearos_case_declarations FORCE ROW LEVEL SECURITY;
CREATE POLICY clearos_case_declarations_tenant ON clearos_case_declarations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE UPDATE, DELETE ON clearos_case_declarations FROM hudumika_app;
GRANT SELECT, INSERT ON clearos_case_declarations TO hudumika_app;
