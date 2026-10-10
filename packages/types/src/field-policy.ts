import type { UserRole } from './user.js';

export const FIELD_POLICY_RESOURCES = [
  'customers', 'contacts', 'leads', 'suppliers',
  'employees', 'invoices', 'bills', 'shipments',
] as const;

export type FieldPolicyResource = (typeof FIELD_POLICY_RESOURCES)[number];

export const FIELD_GROUPS = ['operational', 'contact', 'financial', 'sensitive'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  operational: 'Operational',
  contact: 'Contact details',
  financial: 'Financial',
  sensitive: 'Sensitive / internal',
};

export const RESOURCE_FIELD_MAP: Record<FieldPolicyResource, Record<FieldGroup, readonly string[]>> = {
  customers: {
    operational: ['name', 'status', 'account_status', 'sector', 'classification', 'industry', 'type', 'source', 'created_at', 'updated_at'],
    contact: ['email', 'phone', 'website', 'address', 'city', 'region', 'country', 'postal_code'],
    financial: ['credit_terms', 'credit_limit', 'outstanding', 'payment_terms', 'tin', 'vat_number', 'bank_name', 'bank_account', 'bank_branch', 'currency', 'price_list_id'],
    sensitive: ['notes', 'internal_notes', 'margin_target', 'contract_pricing', 'custom_rates', 'rating'],
  },
  contacts: {
    operational: ['first_name', 'last_name', 'name', 'title', 'company', 'department', 'source', 'status', 'labels', 'created_at'],
    contact: ['email', 'phone', 'mobile', 'work_phone', 'address', 'city', 'country', 'social_profiles'],
    financial: ['deal_value', 'lifetime_value'],
    sensitive: ['notes', 'internal_notes', 'do_not_contact'],
  },
  leads: {
    operational: ['name', 'company', 'status', 'source', 'stage', 'assigned_to', 'score', 'created_at'],
    contact: ['email', 'phone', 'website', 'address', 'city', 'country'],
    financial: ['deal_value', 'budget', 'currency'],
    sensitive: ['notes', 'internal_notes', 'loss_reason', 'competitor'],
  },
  suppliers: {
    operational: ['name', 'status', 'category', 'type', 'created_at'],
    contact: ['email', 'phone', 'website', 'address', 'city', 'country', 'contact_person'],
    financial: ['payment_terms', 'tin', 'vat_number', 'bank_name', 'bank_account', 'bank_branch', 'currency', 'outstanding'],
    sensitive: ['notes', 'internal_notes', 'rating', 'approved_by'],
  },
  employees: {
    operational: ['name', 'employee_number', 'department', 'title', 'position', 'office', 'status', 'hire_date', 'manager_id'],
    contact: ['work_email', 'work_phone', 'extension'],
    financial: ['salary', 'bank_account', 'bank_name', 'tax_id', 'nssf_number', 'tin', 'pay_frequency', 'currency'],
    sensitive: ['personal_email', 'personal_phone', 'home_address', 'date_of_birth', 'national_id', 'passport', 'next_of_kin', 'next_of_kin_phone', 'termination_reason', 'disciplinary_notes', 'medical_info'],
  },
  invoices: {
    operational: ['invoice_number', 'date', 'due_date', 'status', 'customer_id', 'customer_name', 'line_items', 'total', 'currency', 'created_at'],
    contact: [],
    financial: ['margin', 'cost_breakdown', 'discount', 'discount_reason', 'payment_terms', 'tax_breakdown', 'applied_credits'],
    sensitive: ['internal_notes', 'approval_notes'],
  },
  bills: {
    operational: ['bill_number', 'date', 'due_date', 'status', 'supplier_id', 'supplier_name', 'line_items', 'total', 'currency', 'created_at'],
    contact: [],
    financial: ['payment_terms', 'tax_breakdown', 'withholding', 'fx_rate'],
    sensitive: ['internal_notes', 'approval_notes'],
  },
  shipments: {
    operational: ['reference', 'status', 'mode', 'origin', 'destination', 'customer_name', 'eta', 'etd', 'carrier', 'vessel', 'container_numbers', 'created_at'],
    contact: ['shipper_contact', 'consignee_contact', 'notify_party'],
    financial: ['declared_value', 'freight_charges', 'duty_amount', 'vat_amount', 'total_charges', 'currency'],
    sensitive: ['internal_notes', 'margin', 'cost_breakdown', 'agent_commission'],
  },
};

export const DEFAULT_FIELD_POLICIES: Record<FieldPolicyResource, Record<FieldGroup, readonly UserRole[]>> = {
  customers: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  contacts: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  leads: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'],
  },
  suppliers: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  employees: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  invoices: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  bills: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
  shipments: {
    operational: ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE', 'SALES', 'SENIOR', 'JUNIOR'],
    contact:     ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'SALES', 'SENIOR'],
    financial:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN', 'MANAGER', 'FINANCE'],
    sensitive:   ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'],
  },
};

export interface TenantFieldPolicy {
  id: string;
  tenant_id: string;
  resource: FieldPolicyResource;
  field_group: FieldGroup;
  allowed_roles: UserRole[];
  created_at: string;
  updated_at: string;
}

export interface FieldPolicyMatrix {
  resource: FieldPolicyResource;
  groups: {
    group: FieldGroup;
    label: string;
    fields: readonly string[];
    allowed_roles: UserRole[];
    is_default: boolean;
  }[];
}
