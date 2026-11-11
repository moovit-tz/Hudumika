-- Phase 3B follow-through: oauthResourceForPath() (apps/api/src/lib/ondi-oauth-access.ts)
-- maps /v1/contacts, /v1/invoices, /v1/shipments, and /v1/documents to the
-- 'contacts', 'invoices', 'orders', and 'documents' resources, and the
-- progress doc claimed those were covered — but migration 741 only registered
-- scopes for crm/notes/email/sms/compliance/finance/employees. With zero rows
-- for these four resources, middleware/auth.ts's ownsRequiredScope check
-- (requiredScopes.length > 0 && ...) can never be true for them, so every
-- Ondi-delegated call to those routes was a silent, permanent 403 regardless
-- of what the app actually requested — deny-by-default held, but the
-- documented coverage was wrong. This closes that gap the same way 741 did.
INSERT INTO oauth_resource_scopes
  (scope, resource, operation, sensitivity_level, data_domain, description,
   requires_tenant_approval, requires_hudumika_verification)
VALUES
  ('contacts.read',   'contacts', 'read',  'MEDIUM', 'CUSTOMER', 'Read workspace contacts', false, false),
  ('contacts.write',  'contacts', 'write', 'MEDIUM', 'CUSTOMER', 'Create and update workspace contacts', false, false),
  ('invoices.read',   'invoices', 'read',  'HIGH',   'FINANCIAL', 'Read workspace sales invoices', false, false),
  ('invoices.write',  'invoices', 'write', 'HIGH',   'FINANCIAL', 'Create and update workspace sales invoices', false, false),
  ('orders.read',     'orders',   'read',  'MEDIUM', 'CUSTOMER', 'Read workspace shipments/orders', false, false),
  ('orders.write',    'orders',   'write', 'MEDIUM', 'CUSTOMER', 'Create and update workspace shipments/orders', false, false),
  ('documents.read',  'documents', 'read', 'MEDIUM', 'GENERAL', 'Read workspace document metadata', false, false),
  ('documents.write', 'documents', 'write','MEDIUM', 'GENERAL', 'Create and update workspace document metadata', false, false)
ON CONFLICT (scope) DO NOTHING;
