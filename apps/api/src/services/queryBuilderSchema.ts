/**
 * The actual security boundary for the query builder's visual mode: a
 * hand-written allowlist, not live information_schema introspection. Every
 * table/column a client requests is checked against this list before it
 * ever reaches sql.table()/sql.ref() in queryBuilder.service.ts — those
 * calls only handle identifier quoting, not authorization.
 *
 * Deliberately excludes whole tables holding credentials/secrets
 * (password_reset_tokens, api_keys, tra_vfd_config, sso_providers,
 * hr_login_history, hr_devices, cloud_storage_connections,
 * cloud_external_files) and specific sensitive columns within otherwise
 * safe tables (password_hash, wa_token, smtp_config, storage_key, bank
 * details, national IDs, share/reset tokens, card_last4, license_number).
 * Not exhaustive over all ~150 tables in the schema — covers the apps this
 * session's Reports module already prioritized (ClearOS/FinOps/NexusHR/
 * Tracking/ComplyOS) plus core/customer data. Growing this list is a plain
 * array edit, not an architecture change.
 */

export interface AllowedColumn {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean';
}

export interface AllowedTable {
  table: string;
  label: string;
  category: string;
  columns: AllowedColumn[];
}

function col(name: string, label: string, type: AllowedColumn['type'] = 'text'): AllowedColumn {
  return { name, label, type };
}

export const ALLOWED_TABLES: AllowedTable[] = [
  {
    table: 'tenants', label: 'Tenants', category: 'Core',
    columns: [
      col('id', 'ID'), col('slug', 'Slug'), col('name', 'Name'), col('plan', 'Plan'),
      col('active', 'Active', 'boolean'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'users', label: 'Users', category: 'Core',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('email', 'Email'), col('role', 'Role'),
      col('name', 'Name'), col('phone', 'Phone'), col('active', 'Active', 'boolean'),
      col('last_login_at', 'Last Login', 'date'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'customers', label: 'Customers', category: 'Core',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('name', 'Name'), col('contact_name', 'Contact Name'),
      col('email', 'Email'), col('phone', 'Phone'), col('category', 'Category'), col('tax_id', 'Tax ID'),
      col('active', 'Active', 'boolean'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'contacts', label: 'Contacts', category: 'Core',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('first_name', 'First Name'), col('last_name', 'Last Name'),
      col('email', 'Email'), col('phone', 'Phone'), col('company', 'Company'), col('job_title', 'Job Title'),
      col('status', 'Status'), col('industry', 'Industry'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'hr_departments', label: 'Departments', category: 'NexusHR',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('name', 'Name'), col('status', 'Status'),
      col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'shipment_cases', label: 'Shipments', category: 'ClearOS',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('ref_number', 'Ref Number'), col('customer_id', 'Customer'),
      col('type', 'Type'), col('goods_desc', 'Goods Description'), col('hs_code', 'HS Code'),
      col('bl_number', 'BL Number'), col('awb_number', 'AWB Number'), col('vessel', 'Vessel'),
      col('origin_port', 'Origin Port'), col('dest_port', 'Destination Port'),
      col('gross_weight_kg', 'Gross Weight (kg)', 'number'), col('cif_value_usd', 'CIF Value (USD)', 'number'),
      col('eta', 'ETA', 'date'), col('stage', 'Stage'), col('sla_deadline', 'SLA Deadline', 'date'),
      col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'sales_invoices', label: 'Sales Invoices', category: 'FinOps',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('invoice_number', 'Invoice Number'),
      col('shipment_ref', 'Shipment Ref'), col('customer_id', 'Customer'), col('client_name', 'Client Name'),
      col('mode', 'Mode'), col('bill_date', 'Bill Date', 'date'), col('due_date', 'Due Date', 'date'),
      col('status', 'Status'), col('received', 'Received', 'number'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'finance_expenses', label: 'Expenses', category: 'FinOps',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('name', 'Name'), col('amount', 'Amount', 'number'),
      col('expense_date', 'Expense Date', 'date'), col('category', 'Category'), col('is_revenue', 'Is Revenue', 'boolean'),
      col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'hr_payroll', label: 'Payroll', category: 'NexusHR',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('user_id', 'Employee'), col('period_month', 'Period Month', 'number'),
      col('period_year', 'Period Year', 'number'), col('basic_pay', 'Basic Pay', 'number'),
      col('allowances', 'Allowances', 'number'), col('deductions', 'Deductions', 'number'),
      col('status', 'Status'), col('paid_at', 'Paid At', 'date'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'vehicles', label: 'Vehicles', category: 'Tracking',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('name', 'Name'), col('plate_number', 'Plate Number'),
      col('type', 'Type'), col('driver_name', 'Driver Name'), col('status', 'Status'), col('make', 'Make'),
      col('model', 'Model'), col('year', 'Year', 'number'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'trips', label: 'Trips', category: 'Tracking',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('vehicle_id', 'Vehicle'), col('driver_id', 'Driver'),
      col('customer_id', 'Customer'), col('origin', 'Origin'), col('destination', 'Destination'),
      col('status', 'Status'), col('cargo_desc', 'Cargo Description'), col('distance_km', 'Distance (km)', 'number'),
      col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'comply_certificates', label: 'Certificates', category: 'ComplyOS',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('cert_number', 'Certificate Number'), col('name', 'Name'),
      col('agency_code', 'Agency Code'), col('agency_name', 'Agency Name'), col('issued_date', 'Issued Date', 'date'),
      col('expiry_date', 'Expiry Date', 'date'), col('status', 'Status'), col('created_at', 'Created At', 'date'),
    ],
  },
  {
    table: 'comply_applications', label: 'Applications', category: 'ComplyOS',
    columns: [
      col('id', 'ID'), col('tenant_id', 'Tenant'), col('app_number', 'Application Number'), col('cert_type', 'Cert Type'),
      col('agency_code', 'Agency Code'), col('status', 'Status'), col('submitted_at', 'Submitted At', 'date'),
      col('created_at', 'Created At', 'date'),
    ],
  },
];

export function findAllowedTable(table: string): AllowedTable | undefined {
  return ALLOWED_TABLES.find(t => t.table === table);
}

export function isAllowedColumn(table: AllowedTable, column: string): boolean {
  return table.columns.some(c => c.name === column);
}
