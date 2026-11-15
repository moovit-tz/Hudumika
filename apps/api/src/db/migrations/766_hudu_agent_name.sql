-- The built-in platform agent is branded "Hudu" (was "Workspace Agent").
-- Rows are found by kind='platform', never by name, so this is display-only.
UPDATE agent_identities SET name = 'Hudu' WHERE kind = 'platform' AND name = 'Workspace Agent';
