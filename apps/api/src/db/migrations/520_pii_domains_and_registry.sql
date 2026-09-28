-- Data domains and machine-readable PII field catalog.
-- Domains match the zero-trust access model (section 2 of the platform security document).
-- The field registry is the authoritative source for which table/column contains what
-- category of personal data — it drives the policy engine, access audit, and DSR exports.

CREATE TABLE pii_data_domains (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  default_sensitivity TEXT NOT NULL CHECK (default_sensitivity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  requires_special_role TEXT[],
  break_glass_eligible BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE pii_field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  -- Column name, or a dotted JSONB path such as 'profile.date_of_birth'.
  column_name TEXT NOT NULL,
  data_domain TEXT NOT NULL REFERENCES pii_data_domains(id),
  sensitivity_level TEXT NOT NULL CHECK (sensitivity_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  -- Semantic category used by DSR exports and the policy engine.
  pii_category TEXT NOT NULL CHECK (pii_category IN (
    'NAME', 'EMAIL', 'PHONE', 'DOB', 'GENDER', 'ADDRESS',
    'NATIONAL_ID', 'FINANCIAL_ACCOUNT', 'SALARY', 'TAX_NUMBER',
    'BIOMETRIC', 'HEALTH', 'FREE_TEXT', 'IP_ADDRESS', 'CREDENTIALS',
    'EMPLOYMENT', 'LEGAL_DOCUMENT', 'TECHNICAL_IDENTIFIER'
  )),
  requires_purpose BOOLEAN NOT NULL DEFAULT false,
  requires_explicit_consent BOOLEAN NOT NULL DEFAULT false,
  -- Null = use the domain's default or the platform retention policy.
  retention_days INTEGER,
  notes TEXT,
  UNIQUE (table_name, column_name)
);

CREATE INDEX pii_field_registry_table ON pii_field_registry (table_name);
CREATE INDEX pii_field_registry_domain ON pii_field_registry (data_domain, sensitivity_level);
