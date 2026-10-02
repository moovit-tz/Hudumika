DO $$
DECLARE
  t_id UUID;
  parent_asset_id UUID;
BEGIN
  FOR t_id IN SELECT id FROM tenants LOOP
    SELECT id INTO parent_asset_id FROM chart_of_accounts
      WHERE tenant_id = t_id AND code = '1000';

    INSERT INTO chart_of_accounts (tenant_id, code, name, type, subtype, parent_id, normal_balance, is_system)
    VALUES
      (t_id, '1020', 'Card Settlement Clearing', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1021', 'Mobile Money Clearing', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE),
      (t_id, '1022', 'Other Payment Clearing', 'ASSET', 'CURRENT_ASSET', parent_asset_id, 'DEBIT', TRUE)
    ON CONFLICT (tenant_id, code) DO NOTHING;
  END LOOP;
END $$;
