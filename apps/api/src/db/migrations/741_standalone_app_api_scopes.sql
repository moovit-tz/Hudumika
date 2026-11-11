-- OAuth resource contracts for independent Hudumika apps. These scopes are
-- intentionally limited to the shared APIs that can be safely delegated to
-- an authenticated workspace user. Higher-risk payroll, identity and banking
-- scopes remain gated by the approval requirements already in the catalogue.
INSERT INTO oauth_resource_scopes
  (scope, resource, operation, sensitivity_level, data_domain, description,
   requires_tenant_approval, requires_hudumika_verification)
VALUES
  ('crm.read',          'crm',         'read',   'MEDIUM', 'CUSTOMER', 'Read CRM records for the active workspace', false, false),
  ('crm.write',         'crm',         'write',  'MEDIUM', 'CUSTOMER', 'Create and update CRM records for the active workspace', false, false),
  ('notes.read',        'notes',       'read',   'MEDIUM', 'CUSTOMER', 'Read workspace notes', false, false),
  ('notes.write',       'notes',       'write',  'MEDIUM', 'CUSTOMER', 'Create and update workspace notes', false, false),
  ('email.read',        'email',       'read',   'MEDIUM', 'CUSTOMER', 'Read workspace email data', false, false),
  ('email.write',       'email',       'write',  'HIGH',   'CUSTOMER', 'Send or update workspace email', false, false),
  ('sms.read',          'sms',         'read',   'MEDIUM', 'CUSTOMER', 'Read workspace SMS data', false, false),
  ('sms.write',         'sms',         'write',  'HIGH',   'CUSTOMER', 'Send or update workspace SMS', false, false),
  ('compliance.read',   'compliance',  'read',   'HIGH',   'GENERAL',  'Read workspace compliance records', false, false),
  ('compliance.write',  'compliance',  'write',  'HIGH',   'GENERAL',  'Create or update workspace compliance records', false, false),
  ('finance.read',      'finance',     'read',   'HIGH',   'FINANCIAL', 'Read workspace finance records', true, false),
  ('finance.write',     'finance',     'write',  'HIGH',   'FINANCIAL', 'Create or update workspace finance records', true, false),
  ('hr.basic.read',     'employees',   'read',   'HIGH',   'HR',       'Read basic employee records', true, false),
  ('hr.basic.write',    'employees',   'write',  'HIGH',   'HR',       'Create or update basic employee records', true, false)
ON CONFLICT (scope) DO NOTHING;

