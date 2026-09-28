/**
 * Compile-time PII field catalog — mirrors the pii_field_registry DB table
 * so the policy engine and access logger can work without a DB round-trip per
 * request. Keep in sync with migration 526 when new tables are added.
 */

export type PiiSensitivity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PiiDomain =
  | 'GENERAL' | 'CUSTOMER' | 'FINANCIAL' | 'HR' | 'HR_SENSITIVE'
  | 'PAYROLL' | 'IDENTITY' | 'HEALTH' | 'LEGAL' | 'PRIVACY'
  | 'BIOMETRIC' | 'SECURITY' | 'WHISTLEBLOWER' | 'EXECUTIVE_CONFIDENTIAL';

export type PiiCategory =
  | 'NAME' | 'EMAIL' | 'PHONE' | 'DOB' | 'GENDER' | 'ADDRESS'
  | 'NATIONAL_ID' | 'FINANCIAL_ACCOUNT' | 'SALARY' | 'TAX_NUMBER'
  | 'BIOMETRIC' | 'HEALTH' | 'FREE_TEXT' | 'IP_ADDRESS' | 'CREDENTIALS'
  | 'EMPLOYMENT' | 'LEGAL_DOCUMENT' | 'TECHNICAL_IDENTIFIER';

export interface FieldMeta {
  column: string;
  domain: PiiDomain;
  sensitivity: PiiSensitivity;
  piiCategory: PiiCategory;
  requiresPurpose?: boolean;
}

export const PII_FIELDS: Record<string, FieldMeta[]> = {
  users: [
    { column: 'email',               domain: 'GENERAL',   sensitivity: 'MEDIUM',   piiCategory: 'EMAIL' },
    { column: 'phone',               domain: 'GENERAL',   sensitivity: 'MEDIUM',   piiCategory: 'PHONE' },
    { column: 'name',                domain: 'GENERAL',   sensitivity: 'LOW',      piiCategory: 'NAME'  },
    { column: 'password_hash',       domain: 'SECURITY',  sensitivity: 'CRITICAL', piiCategory: 'CREDENTIALS', requiresPurpose: true },
    { column: 'national_id',         domain: 'IDENTITY',  sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID',       requiresPurpose: true },
    { column: 'tax_id',              domain: 'IDENTITY',  sensitivity: 'CRITICAL', piiCategory: 'TAX_NUMBER',        requiresPurpose: true },
    { column: 'social_security_no',  domain: 'IDENTITY',  sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID',       requiresPurpose: true },
    { column: 'health_insurance_no', domain: 'HEALTH',    sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID',       requiresPurpose: true },
    { column: 'basic_salary',        domain: 'PAYROLL',   sensitivity: 'HIGH',     piiCategory: 'SALARY',            requiresPurpose: true },
    { column: 'bank_account_no',     domain: 'FINANCIAL', sensitivity: 'CRITICAL', piiCategory: 'FINANCIAL_ACCOUNT', requiresPurpose: true },
    { column: 'bank_account_name',   domain: 'FINANCIAL', sensitivity: 'HIGH',     piiCategory: 'FINANCIAL_ACCOUNT', requiresPurpose: true },
    { column: 'bank_name',           domain: 'FINANCIAL', sensitivity: 'MEDIUM',   piiCategory: 'FINANCIAL_ACCOUNT' },
    { column: 'bank_branch',         domain: 'FINANCIAL', sensitivity: 'MEDIUM',   piiCategory: 'FINANCIAL_ACCOUNT' },
    { column: 'mobile_money_number', domain: 'FINANCIAL', sensitivity: 'CRITICAL', piiCategory: 'FINANCIAL_ACCOUNT', requiresPurpose: true },
    { column: 'profile.date_of_birth', domain: 'HR',      sensitivity: 'HIGH',     piiCategory: 'DOB',               requiresPurpose: true },
    { column: 'profile.gender',      domain: 'HR',        sensitivity: 'MEDIUM',   piiCategory: 'GENDER' },
    { column: 'profile.address',     domain: 'GENERAL',   sensitivity: 'MEDIUM',   piiCategory: 'ADDRESS' },
    { column: 'profile.biometric_id',domain: 'BIOMETRIC', sensitivity: 'CRITICAL', piiCategory: 'BIOMETRIC',         requiresPurpose: true },
  ],
  hr_people: [
    { column: 'national_identifiers', domain: 'IDENTITY',  sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID',  requiresPurpose: true },
    { column: 'date_of_birth',        domain: 'HR',        sensitivity: 'HIGH',     piiCategory: 'DOB',          requiresPurpose: true },
    { column: 'gender',               domain: 'HR',        sensitivity: 'MEDIUM',   piiCategory: 'GENDER'        },
    { column: 'personal_email',       domain: 'HR',        sensitivity: 'MEDIUM',   piiCategory: 'EMAIL'         },
    { column: 'emergency_contacts',   domain: 'HR',        sensitivity: 'HIGH',     piiCategory: 'FREE_TEXT',    requiresPurpose: true },
  ],
  payroll_payslips: [
    { column: 'gross_pay',              domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
    { column: 'net_pay',                domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
    { column: 'income_tax',             domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
    { column: 'taxable_pay',            domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
    { column: 'employee_contributions', domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
    { column: 'lines',                  domain: 'PAYROLL', sensitivity: 'HIGH', piiCategory: 'SALARY', requiresPurpose: true },
  ],
  hr_leaves: [
    { column: 'reason', domain: 'HEALTH', sensitivity: 'HIGH', piiCategory: 'FREE_TEXT', requiresPurpose: true },
  ],
  hr_review_instances: [
    { column: 'self_response',    domain: 'HR_SENSITIVE', sensitivity: 'HIGH', piiCategory: 'FREE_TEXT', requiresPurpose: true },
    { column: 'manager_response', domain: 'HR_SENSITIVE', sensitivity: 'HIGH', piiCategory: 'FREE_TEXT', requiresPurpose: true },
    { column: 'calibration_notes',domain: 'HR_SENSITIVE', sensitivity: 'HIGH', piiCategory: 'FREE_TEXT', requiresPurpose: true },
  ],
  hr_feedback_notes: [
    { column: 'message', domain: 'HR_SENSITIVE', sensitivity: 'HIGH', piiCategory: 'FREE_TEXT', requiresPurpose: true },
  ],
  ondi_kyc_submissions: [
    { column: 'extracted_full_name',      domain: 'IDENTITY', sensitivity: 'CRITICAL', piiCategory: 'NAME',        requiresPurpose: true },
    { column: 'extracted_dob',            domain: 'IDENTITY', sensitivity: 'CRITICAL', piiCategory: 'DOB',         requiresPurpose: true },
    { column: 'extracted_document_number',domain: 'IDENTITY', sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID', requiresPurpose: true },
    { column: 'mrz_raw',                  domain: 'IDENTITY', sensitivity: 'CRITICAL', piiCategory: 'NATIONAL_ID', requiresPurpose: true },
  ],
  contacts: [
    { column: 'email',    domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'EMAIL'     },
    { column: 'phone',    domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'PHONE'     },
    { column: 'birthday', domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'DOB'       },
    { column: 'notes',    domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'FREE_TEXT' },
  ],
  customers: [
    { column: 'tax_id',       domain: 'CUSTOMER', sensitivity: 'HIGH',   piiCategory: 'TAX_NUMBER',  requiresPurpose: true },
    { column: 'email',        domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'EMAIL'        },
    { column: 'phone_wa',     domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'PHONE'        },
    { column: 'phone_wechat', domain: 'CUSTOMER', sensitivity: 'MEDIUM', piiCategory: 'PHONE'        },
  ],
  declarations: [
    { column: 'payment_bank_account', domain: 'FINANCIAL', sensitivity: 'CRITICAL', piiCategory: 'FINANCIAL_ACCOUNT', requiresPurpose: true },
    { column: 'security_account_no',  domain: 'FINANCIAL', sensitivity: 'CRITICAL', piiCategory: 'FINANCIAL_ACCOUNT', requiresPurpose: true },
  ],
  hr_signature_events: [
    { column: 'ip_address', domain: 'SECURITY', sensitivity: 'MEDIUM', piiCategory: 'IP_ADDRESS'          },
    { column: 'user_agent', domain: 'SECURITY', sensitivity: 'LOW',    piiCategory: 'TECHNICAL_IDENTIFIER' },
  ],
};

/** Columns that require purpose logging (HIGH or CRITICAL) in every table. */
export const HIGH_SENSITIVITY_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(PII_FIELDS).map(([table, fields]) => [
    table,
    fields.filter(f => f.sensitivity === 'HIGH' || f.sensitivity === 'CRITICAL').map(f => f.column),
  ]).filter(([, cols]) => cols.length > 0),
);

/** Look up metadata for a single column. Returns undefined if the column is not classified. */
export function getFieldMeta(table: string, column: string): FieldMeta | undefined {
  return PII_FIELDS[table]?.find(f => f.column === column);
}

/** Returns the highest sensitivity level for a set of columns in a table. */
export function maxSensitivity(table: string, columns: string[]): PiiSensitivity {
  const levels: PiiSensitivity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  let max: PiiSensitivity = 'LOW';
  for (const col of columns) {
    const meta = getFieldMeta(table, col);
    if (meta && levels.indexOf(meta.sensitivity) > levels.indexOf(max)) {
      max = meta.sensitivity;
    }
  }
  return max;
}
