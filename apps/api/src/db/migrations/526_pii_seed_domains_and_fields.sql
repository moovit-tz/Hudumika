-- Seed: all data domain definitions and the known sensitive field catalog.
-- Derived from the platform-wide PII survey (Sep 2026).

-- ── Data domains ────────────────────────────────────────────────────────────

INSERT INTO pii_data_domains (id, label, description, default_sensitivity, requires_special_role, break_glass_eligible) VALUES
  ('GENERAL',                 'General',                    'Non-sensitive operational data.',                                   'LOW',      NULL,                                          false),
  ('CUSTOMER',                'Customer',                   'Customer contact and account information.',                          'MEDIUM',   NULL,                                          false),
  ('FINANCIAL',               'Financial',                  'Bank accounts, payment methods and transaction data.',              'HIGH',     ARRAY['ADMIN','FINANCE'],                      false),
  ('HR',                      'HR',                         'Human resources — employment, attendance, documents.',              'MEDIUM',   ARRAY['ADMIN','MANAGER'],                      false),
  ('HR_SENSITIVE',            'HR Sensitive',               'Performance reviews, feedback, disciplinary records.',              'HIGH',     ARRAY['ADMIN'],                                false),
  ('PAYROLL',                 'Payroll',                    'Salary, deductions, pay components, payslips.',                     'HIGH',     ARRAY['ADMIN','FINANCE'],                      false),
  ('IDENTITY',                'Identity',                   'Government-issued IDs, national ID numbers, passports.',            'CRITICAL', ARRAY['ADMIN'],                                true),
  ('HEALTH',                  'Health',                     'Medical information, health insurance, sick-leave reasons.',        'CRITICAL', ARRAY['ADMIN'],                                true),
  ('LEGAL',                   'Legal',                      'Legal privilege records, contracts, legal proceedings.',            'HIGH',     ARRAY['ADMIN'],                                false),
  ('PRIVACY',                 'Privacy',                    'Consent records, data-subject requests, privacy settings.',         'MEDIUM',   NULL,                                          false),
  ('BIOMETRIC',               'Biometric',                  'Fingerprints, face recognition, biometric identifiers.',            'CRITICAL', ARRAY['ADMIN'],                                true),
  ('SECURITY',                'Security',                   'Audit trails, IP addresses, session tokens.',                       'HIGH',     ARRAY['ADMIN'],                                false),
  ('WHISTLEBLOWER',           'Whistleblower',              'Protected disclosures, whistleblower case files.',                  'CRITICAL', ARRAY['ADMIN'],                                true),
  ('EXECUTIVE_CONFIDENTIAL',  'Executive Confidential',     'Board resolutions, executive compensation, M&A materials.',         'CRITICAL', ARRAY['ADMIN'],                                true)
ON CONFLICT (id) DO NOTHING;

-- ── PII field catalog ────────────────────────────────────────────────────────

INSERT INTO pii_field_registry
  (table_name, column_name, data_domain, sensitivity_level, pii_category, requires_purpose, notes)
VALUES
  -- users — core identity
  ('users', 'email',                 'GENERAL',    'MEDIUM',   'EMAIL',             false, 'Login identity, used platform-wide'),
  ('users', 'phone',                 'GENERAL',    'MEDIUM',   'PHONE',             false, 'Contact number'),
  ('users', 'name',                  'GENERAL',    'LOW',      'NAME',              false, 'Display name'),
  ('users', 'password_hash',         'SECURITY',   'CRITICAL', 'CREDENTIALS',       true,  'Never returned in API responses'),
  -- users — statutory payroll fields (migration 195)
  ('users', 'national_id',           'IDENTITY',   'CRITICAL', 'NATIONAL_ID',       true,  'Tanzania NIDA or equivalent'),
  ('users', 'tax_id',                'IDENTITY',   'CRITICAL', 'TAX_NUMBER',        true,  'TIN / TRA tax identifier'),
  ('users', 'social_security_no',    'IDENTITY',   'CRITICAL', 'NATIONAL_ID',       true,  'NSSF/PSSSF membership number'),
  ('users', 'health_insurance_no',   'HEALTH',     'CRITICAL', 'NATIONAL_ID',       true,  'NHIF membership number'),
  ('users', 'basic_salary',          'PAYROLL',    'HIGH',     'SALARY',            true,  'Current base salary'),
  -- users — payment details (migration 203)
  ('users', 'bank_account_no',       'FINANCIAL',  'CRITICAL', 'FINANCIAL_ACCOUNT', true,  'Bank account number'),
  ('users', 'bank_account_name',     'FINANCIAL',  'HIGH',     'FINANCIAL_ACCOUNT', true,  'Account holder name'),
  ('users', 'bank_name',             'FINANCIAL',  'MEDIUM',   'FINANCIAL_ACCOUNT', false, 'Bank name'),
  ('users', 'bank_branch',           'FINANCIAL',  'MEDIUM',   'FINANCIAL_ACCOUNT', false, 'Branch name'),
  ('users', 'mobile_money_number',   'FINANCIAL',  'CRITICAL', 'FINANCIAL_ACCOUNT', true,  'M-Pesa / Airtel Money number'),
  -- users.profile JSONB sub-fields
  ('users', 'profile.date_of_birth', 'HR',         'HIGH',     'DOB',               true,  'JSONB sub-field of profile'),
  ('users', 'profile.gender',        'HR',         'MEDIUM',   'GENDER',            false, 'JSONB sub-field of profile'),
  ('users', 'profile.address',       'GENERAL',    'MEDIUM',   'ADDRESS',           false, 'JSONB sub-field of profile'),
  ('users', 'profile.biometric_id',  'BIOMETRIC',  'CRITICAL', 'BIOMETRIC',         true,  'JSONB sub-field; access very restricted'),
  -- hr_people
  ('hr_people', 'national_identifiers', 'IDENTITY', 'CRITICAL', 'NATIONAL_ID',      true,  'JSONB: NIDA, SSN, Passport numbers'),
  ('hr_people', 'date_of_birth',        'HR',       'HIGH',     'DOB',               true,  NULL),
  ('hr_people', 'gender',               'HR',       'MEDIUM',   'GENDER',            false, NULL),
  ('hr_people', 'personal_email',       'HR',       'MEDIUM',   'EMAIL',             false, 'Personal (non-work) email'),
  ('hr_people', 'emergency_contacts',   'HR',       'HIGH',     'FREE_TEXT',         true,  'JSONB: next-of-kin names and contacts'),
  -- payroll_payslips
  ('payroll_payslips', 'gross_pay',              'PAYROLL', 'HIGH',     'SALARY',  true, NULL),
  ('payroll_payslips', 'net_pay',                'PAYROLL', 'HIGH',     'SALARY',  true, NULL),
  ('payroll_payslips', 'income_tax',             'PAYROLL', 'HIGH',     'SALARY',  true, NULL),
  ('payroll_payslips', 'taxable_pay',            'PAYROLL', 'HIGH',     'SALARY',  true, NULL),
  ('payroll_payslips', 'employee_contributions', 'PAYROLL', 'HIGH',     'SALARY',  true, NULL),
  ('payroll_payslips', 'lines',                  'PAYROLL', 'HIGH',     'SALARY',  true, 'Full per-component pay breakdown JSONB'),
  -- hr_leaves
  ('hr_leaves', 'reason', 'HEALTH', 'HIGH', 'FREE_TEXT', true, 'Free text; may contain medical information'),
  -- hr_review_instances
  ('hr_review_instances', 'self_response',    'HR_SENSITIVE', 'HIGH', 'FREE_TEXT', true, 'Self-evaluation text'),
  ('hr_review_instances', 'manager_response', 'HR_SENSITIVE', 'HIGH', 'FREE_TEXT', true, 'Manager evaluation text'),
  ('hr_review_instances', 'calibration_notes','HR_SENSITIVE', 'HIGH', 'FREE_TEXT', true, 'Calibration committee notes'),
  -- hr_feedback_notes
  ('hr_feedback_notes', 'message', 'HR_SENSITIVE', 'HIGH', 'FREE_TEXT', true, 'Continuous feedback messages'),
  -- ondi_kyc_submissions
  ('ondi_kyc_submissions', 'extracted_full_name',       'IDENTITY', 'CRITICAL', 'NAME',       true, NULL),
  ('ondi_kyc_submissions', 'extracted_dob',              'IDENTITY', 'CRITICAL', 'DOB',        true, NULL),
  ('ondi_kyc_submissions', 'extracted_document_number',  'IDENTITY', 'CRITICAL', 'NATIONAL_ID',true, NULL),
  ('ondi_kyc_submissions', 'mrz_raw',                   'IDENTITY', 'CRITICAL', 'NATIONAL_ID',true, 'Raw MRZ string from document scan'),
  -- contacts
  ('contacts', 'email',    'CUSTOMER', 'MEDIUM', 'EMAIL',  false, NULL),
  ('contacts', 'phone',    'CUSTOMER', 'MEDIUM', 'PHONE',  false, NULL),
  ('contacts', 'birthday', 'CUSTOMER', 'MEDIUM', 'DOB',    false, NULL),
  ('contacts', 'notes',    'CUSTOMER', 'MEDIUM', 'FREE_TEXT', false, 'May contain personal context'),
  -- customers
  ('customers', 'tax_id',       'CUSTOMER', 'HIGH',   'TAX_NUMBER',        true,  'Business TIN'),
  ('customers', 'email',        'CUSTOMER', 'MEDIUM', 'EMAIL',             false, NULL),
  ('customers', 'phone_wa',     'CUSTOMER', 'MEDIUM', 'PHONE',             false, 'WhatsApp number'),
  ('customers', 'phone_wechat', 'CUSTOMER', 'MEDIUM', 'PHONE',             false, 'WeChat number'),
  -- declarations (customs)
  ('declarations', 'payment_bank_account', 'FINANCIAL', 'CRITICAL', 'FINANCIAL_ACCOUNT', true, NULL),
  ('declarations', 'security_account_no',  'FINANCIAL', 'CRITICAL', 'FINANCIAL_ACCOUNT', true, NULL),
  -- ondi_auth_events / hr_signature_events
  ('hr_signature_events', 'ip_address', 'SECURITY', 'MEDIUM', 'IP_ADDRESS', false, NULL),
  ('hr_signature_events', 'user_agent', 'SECURITY', 'LOW',    'TECHNICAL_IDENTIFIER', false, NULL)
ON CONFLICT (table_name, column_name) DO NOTHING;

-- ── OAuth resource scopes ────────────────────────────────────────────────────

INSERT INTO oauth_resource_scopes
  (scope, resource, operation, sensitivity_level, data_domain, description, requires_tenant_approval, requires_hudumika_verification)
VALUES
  ('contacts.basic.read',         'contacts',  'read',   'MEDIUM',   'CUSTOMER',  'Read contact name and job title',                     false, false),
  ('contacts.email.read',         'contacts',  'read',   'MEDIUM',   'CUSTOMER',  'Read contact email address',                          false, false),
  ('contacts.phone.read',         'contacts',  'read',   'MEDIUM',   'CUSTOMER',  'Read contact phone numbers',                          false, false),
  ('contacts.write',              'contacts',  'write',  'MEDIUM',   'CUSTOMER',  'Create and update contacts',                          false, false),
  ('orders.read',                 'orders',    'read',   'LOW',      'GENERAL',   'Read orders and their status',                        false, false),
  ('orders.write',                'orders',    'write',  'LOW',      'GENERAL',   'Create and update orders',                            false, false),
  ('employees.basic.read',        'employees', 'read',   'MEDIUM',   'HR',        'Read employee name, title and department',            true,  false),
  ('employees.payroll.read',      'employees', 'read',   'HIGH',     'PAYROLL',   'Read salary, deductions and payslips',                true,  true),
  ('employees.identity.read',     'employees', 'read',   'CRITICAL', 'IDENTITY',  'Read national IDs, tax IDs, passport numbers',        true,  true),
  ('employees.banking.read',      'employees', 'read',   'CRITICAL', 'FINANCIAL', 'Read bank account and mobile money details',          true,  true),
  ('invoices.read',               'invoices',  'read',   'MEDIUM',   'FINANCIAL', 'Read invoices and payment history',                   false, false),
  ('invoices.write',              'invoices',  'write',  'MEDIUM',   'FINANCIAL', 'Create and update invoices',                          false, false),
  ('documents.read',              'documents', 'read',   'MEDIUM',   'HR',        'Read documents metadata',                             true,  false),
  ('documents.upload',            'documents', 'write',  'MEDIUM',   'HR',        'Upload documents',                                    true,  false),
  ('identity.government_id.read', 'identity',  'read',   'CRITICAL', 'IDENTITY',  'Read government-issued ID numbers',                   true,  true),
  ('financial.bank.read',         'financial', 'read',   'CRITICAL', 'FINANCIAL', 'Read bank account details',                           true,  true)
ON CONFLICT (scope) DO NOTHING;
