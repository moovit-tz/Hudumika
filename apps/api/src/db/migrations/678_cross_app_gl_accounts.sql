-- Migration 664: Seed cross-app GL accounts for trust and float bridges
-- Trust Funds Held (2700): fiduciary liability for LexCore trust accounts
-- Agent Float Held (2710): liability for Tuma agent float balances

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2700', 'Client Trust Funds Held', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '2700'
);

INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '2710', 'Agent Float Held', 'LIABILITY', 'CURRENT_LIABILITY', 'CREDIT', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '2710'
);

-- Legal services revenue account
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '4400', 'Legal Fees Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '4400'
);

-- Automotive workshop revenue
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '4500', 'Workshop Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '4500'
)
AND EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '4500'
) IS FALSE;

-- Parcel delivery revenue
INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, normal_balance, is_system)
SELECT t.id, '4600', 'Parcel Delivery Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts c WHERE c.tenant_id = t.id AND c.code = '4600'
);
