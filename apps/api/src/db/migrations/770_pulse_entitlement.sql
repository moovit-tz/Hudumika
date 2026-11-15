-- Pulse, the marketing suite, becomes a plan feature.
--
-- Pulse sends through the Email and SMS apps and builds its audiences from
-- CRM leads, customers and Contacts, so it is granted to the plans that
-- already carry both CRM and SMS. Adjust per package in SuperAdmin ▸ Packages.

INSERT INTO package_features (package_code, feature_key)
SELECT p, 'pulse'
FROM unnest(ARRAY['business-tzs', 'enterprise', 'growth', 'logistics-tzs', 'scale', 'scale-tzs', 'starter']) AS p
WHERE EXISTS (SELECT 1 FROM package_features pf WHERE pf.package_code = p)
ON CONFLICT DO NOTHING;

INSERT INTO app_status (app_id, status, is_beta, commercially_available)
VALUES ('pulse', 'active', true, true)
ON CONFLICT (app_id) DO NOTHING;
