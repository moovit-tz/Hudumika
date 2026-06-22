import pg from 'pg';
import { Kysely, PostgresDialect, sql, Generated, Transaction } from 'kysely';
import { env } from '../config/env.js';
import type { 
  TenantPlan, 
  UserRole, 
  CustomerCategory, 
  PreferredChannel, 
  ShipmentType, 
  ClearanceStage, 
  DocumentType, 
  DocumentStatus, 
  ExpenseCategory, 
  MessageChannel, 
  MessageDirection, 
  RiskFlagType, 
  RiskSeverity, 
  Container,
  DeclarationMode,
  TansadFormType,
  DeclarationStatus,
  SelectivityChannel,
  DeclarationNoticeType,
  TaxType,
  CPCCode
} from '@clearos/types';

export interface TenantsTable {
  id: Generated<string>;
  slug: string;
  name: string;
  plan: TenantPlan;
  wa_phone_id: string | null;
  wa_token: string | null;
  smtp_config: string | null;
  logo_url: string | null;
  primary_color: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LocationsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  code: string;
  type: string;
  city: string;
  country: string;
  created_at: Generated<Date>;
}

export interface UsersTable {
  id: Generated<string>;
  tenant_id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  name: string;
  phone: string | null;
  location_id: string | null;
  avatar_url: string | null;
  active: Generated<boolean>;
  last_login_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomersTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  phone_wa: string | null;
  phone_wechat: string | null;
  category: Generated<CustomerCategory>;
  preferred_channel: Generated<PreferredChannel>;
  tax_id: string | null;
  avatar_color: string | null;
  avatar_initials: string | null;
  assigned_officer_id: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ShipmentCasesTable {
  id: Generated<string>;
  tenant_id: string;
  ref_number: string;
  customer_id: string;
  type: ShipmentType;
  goods_desc: string;
  hs_code: string | null;
  containers: string; // JSONB storage of Container[]
  bl_number: string | null;
  awb_number: string | null;
  vessel: string;
  origin_port: string;
  dest_port: string;
  // Extended shipment details (migration 008)
  port_of_loading: string | null;
  port_of_discharge: string | null;
  gross_weight_kg: number | null;
  cif_value_usd: number | null;
  container_numbers: string | null; // JSONB
  internal_notes: string | null;
  eta: Date | null;
  stage: Generated<ClearanceStage>;
  assigned_to: string | null;
  location_id: string | null;
  sla_deadline: Date | null;
  free_time_end: Date | null;
  // TANCIS / TANESW fields
  tancis_ref: string | null;
  tansad_number: string | null;
  selectivity_channel: string | null;
  declaration_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StageHistoryTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  stage: ClearanceStage;
  entered_at: Generated<Date>;
  exited_at: Date | null;
  duration_h: number | null;
  actor_id: string | null;
  note: string | null;
  blocker: string | null;
}

export interface CaseDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  type: DocumentType;
  filename: string;
  storage_key: string;
  status: Generated<DocumentStatus>;
  uploaded_by: string | null;
  verified_at: Date | null;
  due_date: Date | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface ExpensesTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  category: ExpenseCategory;
  label: string;
  amount_tzs: number;
  is_revenue: Generated<boolean>;
  is_passthrough: Generated<boolean>;
  recorded_by: string | null;
  created_at: Generated<Date>;
}

export interface CaseMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  author_id: string;
  author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER' | 'SYSTEM';
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  created_at: Generated<Date>;
}

export interface RiskFlagsTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  type: RiskFlagType;
  severity: RiskSeverity;
  message: string;
  deadline: Date | null;
  resolved: Generated<boolean>;
  resolved_at: Date | null;
  created_at: Generated<Date>;
}

export interface NotificationsTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string | null;
  user_id: string | null;
  customer_id: string | null;
  trigger_type: string | null;
  channel: MessageChannel | null;
  recipient: string | null;
  content: string | null;
  status: Generated<string>;
  read: Generated<boolean>;
  read_at: Date | null;
  created_at: Generated<Date>;
  // In-app notification bell columns (migration 014)
  type: Generated<string>;
  title: string;
  message: string | null;
  link: string | null;
  metadata: any;
}

export interface TenantCompaniesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  slug: string;
  plan: string;
  billing_address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AnalyticsKpisTable {
  id: Generated<string>;
  tenant_id: string;
  metric: string;
  value: number;
  period_start: Date;
  period_end: Date;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Declaration Tables (TANESW Integration)
// ═══════════════════════════════════════════════════════════════

export interface DeclarationsTable {
  id: Generated<string>;
  shipment_id: string;
  tenant_id: string;
  tancis_ref: string;
  tansad_number: string | null;
  declaration_mode: string;
  tansad_form_type: string;
  clearing_office: string;
  reference_date: Date;
  cl_plan: string | null;
  total_packages: number;
  package_type: string | null;
  gross_weight_kg: number;
  net_weight_kg: number;
  ucr_number: string | null;
  no_of_items: number;
  consignment_country: string;
  country_of_export: string;
  trading_country: string | null;
  country_of_destination: string;
  exporter_tin: string | null;
  exporter_name: string | null;
  exporter_address: string | null;
  importer_tin: string;
  importer_name: string;
  importer_address: string | null;
  declarant_tin: string;
  declarant_name: string;
  declarant_address: string | null;
  delivery_term: string | null;
  delivery_place: string | null;
  invoice_number: string | null;
  invoice_date: Date | null;
  total_invoice_value: number;
  invoice_currency: string;
  exchange_rate: number;
  payment_method: string | null;
  payment_bank: string | null;
  payment_bank_account: string | null;
  security_distinction_type: string | null;
  security_account_no: string | null;
  nature_of_transaction: string | null;
  freight_amount: number;
  freight_currency: string;
  insurance_amount: number;
  insurance_currency: string;
  other_charges: number;
  other_charges_currency: string;
  deductions: number;
  deductions_currency: string;
  total_customs_value: number;
  self_assessment: Generated<boolean>;
  transport_mode: string | null;
  identity_of_transport: string | null;
  nationality_of_transport: string | null;
  arrival_date: Date | null;
  crn: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  portal_of_bl: string | null;
  shipment_place: string | null;
  discharge_place: string | null;
  discharge_date: Date | null;
  entry_office: string | null;
  location_of_goods: string | null;
  total_container_count: number | null;
  warehouse: string | null;
  previous_warehouse: string | null;
  period_days: number | null;
  cargo_receipt_ref: string | null;
  status: Generated<string>;
  selectivity_channel: string | null;
  declared_at: Date | null;
  assessed_at: Date | null;
  paid_at: Date | null;
  released_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeclarationItemsTable {
  id: Generated<string>;
  declaration_id: string;
  item_number: number;
  hs_code: string;
  commodity_description: string | null;
  marks_and_numbers_1: string | null;
  marks_and_numbers_2: string | null;
  country_of_origin: string;
  cpc_code: string;
  preference_ref: string | null;
  valuation_method: string | null;
  brand_name: string | null;
  purpose_of_submission: string | null;
  preceding_tansad_no: string | null;
  preceding_tansad_date: Date | null;
  preceding_item_no: number | null;
  letter_ref_no: string | null;
  vat_deferment_apply_no: string | null;
  quantity: number;
  unit_of_measure: string;
  base_of_duty: number | null;
  specific_code: string | null;
  gross_weight_kg: number;
  net_weight_kg: number;
  customs_value: number;
  statistical_value: number;
  is_vehicle: Generated<boolean>;
  drawback_specific_code: string | null;
  created_at: Generated<Date>;
}

export interface DeclarationItemModelsTable {
  id: Generated<string>;
  item_id: string;
  model_number: number;
  standard_commodity: string | null;
  model_specification: string | null;
  component: string | null;
  preceding_model_no: string | null;
  quantity: number;
  unit_of_measure: string | null;
  unit_price: number;
  invoice_price: number;
}

export interface DeclarationNoticesTable {
  id: Generated<string>;
  declaration_id: string;
  shipment_id: string;
  tenant_id: string;
  notice_type: string;
  notice_number: string;
  tancis_ref: string;
  importer_tin: string;
  notice_date: Date;
  declare_date: Date;
  total_tax_amount: number | null;
  selectivity_channel: string | null;
  bill_number: string | null;
  bill_date: Date | null;
  bill_tax_amount: number | null;
  paid_amount: number | null;
  payment_receipt: string | null;
  query_text: string | null;
  response_deadline: Date | null;
  acknowledged: Generated<boolean>;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  created_at: Generated<Date>;
}

export interface TaxLinesTable {
  id: Generated<string>;
  notice_id: string;
  tax_type: string;
  hs_code: string | null;
  duty_rate_code: string | null;
  rate_percent: number;
  base_amount: number;
  tax_amount: number;
  mot: number | null;
}

export interface DeclarationAttachmentsTable {
  id: Generated<string>;
  declaration_id: string;
  document_no: number;
  document_type: string;
  document_description: string | null;
  filename: string | null;
  storage_key: string | null;
  item_number: number | null;
  issuing_organization: string | null;
  issue_date: Date | null;
  registration_date: Date | null;
  created_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Demurrage Engine Tables
// ═══════════════════════════════════════════════════════════════

export interface DemurrageTariffsTable {
  id: Generated<string>;
  tenant_id: string;
  carrier_name: string;
  container_size: string;
  free_days: number;
  rate_tiers: string; // JSONB
  currency: string;
  effective_from: Date;
  effective_to: Date | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContainerTrackingTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  container_number: string;
  container_size: string;
  seal_number: string | null;
  carrier_name: string | null;
  discharge_date: Date | null;
  gate_out_date: Date | null;
  return_date: Date | null;
  free_days: number;
  total_days: number;
  demurrage_days: number;
  demurrage_cost: number;
  demurrage_currency: string;
  status: string;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Quotations Tables
// ═══════════════════════════════════════════════════════════════

export interface QuotationsTable {
  id: Generated<string>;
  tenant_id: string;
  quote_number: string;
  customer_id: string;
  title: string;
  shipment_type: string;
  goods_description: string | null;
  origin_port: string | null;
  origin_city: string | null;
  destination_port: string | null;
  destination_city: string | null;
  container_requirements: string | null; // JSONB
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  valid_from: Date | null;
  valid_until: Date | null;
  status: Generated<string>;
  converted_shipment_id: string | null;
  prepared_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QuotationLinesTable {
  id: Generated<string>;
  quotation_id: string;
  line_number: number;
  description: string;
  category: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  is_optional: Generated<boolean>;
  vendor: string | null;
  notes: string | null;
  created_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Road Consignments & Transit Tables
// ═══════════════════════════════════════════════════════════════

export interface RoadConsignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  consignment_number: string;
  shipment_id: string | null;
  customer_id: string;
  goods_description: string | null;
  weight_kg: number | null;
  volume_cbm: number | null;
  package_count: number | null;
  origin_location: string;
  destination_location: string;
  distance_km: number | null;
  estimated_transit_days: number | null;
  status: Generated<string>;
  dispatched_at: Date | null;
  delivered_at: Date | null;
  assigned_driver: string | null;
  driver_phone: string | null;
  vehicle_registration: string | null;
  trailer_registration: string | null;
  transport_cost: number | null;
  cost_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ConsignmentTripsTable {
  id: Generated<string>;
  consignment_id: string;
  trip_number: number;
  from_location: string;
  to_location: string;
  distance_km: number | null;
  start_date: Date | null;
  end_date: Date | null;
  driver_name: string | null;
  vehicle: string | null;
  status: Generated<string>;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface BorderCrossingsTable {
  id: Generated<string>;
  consignment_id: string;
  trip_id: string | null;
  border_name: string;
  country_from: string;
  country_to: string;
  arrival_at: Date | null;
  cleared_at: Date | null;
  status: Generated<string>;
  delay_reason: string | null;
  customs_ref: string | null;
  documents_checked: Generated<boolean>;
  notes: string | null;
  created_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Vendor Bills & Client Invoices (Ops-to-Finance)
// ═══════════════════════════════════════════════════════════════

export interface VendorBillsTable {
  id: Generated<string>;
  tenant_id: string;
  bill_number: string;
  shipment_id: string | null;
  vendor_name: string;
  total_amount: number;
  currency: string;
  status: Generated<string>;
  due_date: Date | null;
  paid_at: Date | null;
  expense_ids: string; // JSONB
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ShipmentTasksTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  title: string;
  status: string; // open | in_progress | complete | blocked
  priority: string; // low | medium | high | urgent
  assigned_to: string | null;
  due_date: Date | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ShipmentTimeEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  member: string;
  task_ref: string | null;
  hours: number;
  note: string | null;
  log_date: Date;
  created_at: Generated<Date>;
}

export interface ClientInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_number: string;
  shipment_id: string | null;
  customer_id: string;
  total_amount: number;
  tax_amount: number;
  currency: string;
  status: Generated<string>;
  due_date: Date | null;
  sent_at: Date | null;
  paid_at: Date | null;
  expense_ids: string; // JSONB
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// HR Module Tables
// ═══════════════════════════════════════════════════════════════

export interface HrDepartmentsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  head_user_id: string | null;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrDesignationsTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  department_id: string | null;
  created_at: Generated<Date>;
}

export interface HrShiftsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: Generated<number>;
  color: Generated<string>;
  created_at: Generated<Date>;
}

export interface HrShiftAssignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  shift_id: string;
  date: string;
  created_at: Generated<Date>;
}

export interface HrAttendanceTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  date: string;
  status: Generated<string>;
  clock_in: string | null;
  clock_out: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrLeavesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  type: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: Generated<string>;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrPayrollTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  period_month: number;
  period_year: number;
  basic_pay: number;
  allowances: Generated<number>;
  deductions: Generated<number>;
  status: Generated<string>;
  paid_at: Date | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrAnnouncementsTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  body: string;
  category: Generated<string>;
  audience: Generated<string>;
  author_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrHolidaysTable {
  id: Generated<string>;
  tenant_id: string;
  date: string;
  name: string;
  type: Generated<string>;
  created_at: Generated<Date>;
}

export interface SalesInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_number: string;
  shipment_ref: string | null;
  customer_id: string | null;
  client_name: string | null;
  client_address: string;
  bl_number: string | null;
  origin: string | null;
  destination: string | null;
  mode: Generated<string>;
  bill_date: Date | null;
  due_date: Date | null;
  sale_agent: string | null;
  payment_terms: string | null;
  exchange_rate: Generated<number>;
  status: Generated<string>;
  received: Generated<number>;
  version: Generated<number>;
  ref_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesInvoiceLinesTable {
  id: Generated<string>;
  invoice_id: string;
  name: string;
  unit: Generated<string>;
  rate: Generated<number>;
  qty: Generated<number>;
  tax_pct: Generated<number>;
  line_group: Generated<string>;
  currency: Generated<string>;
  sort_order: Generated<number>;
}

export interface InvoicePaymentsTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  amount: number;
  method: string | null;
  payment_date: Date | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SupplierBillsTable {
  id: Generated<string>;
  tenant_id: string;
  bill_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  shipment_ref: string | null;
  po_number: string | null;
  bill_date: Date | null;
  due_date: Date | null;
  status: Generated<string>;
  currency: Generated<string>;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  total: Generated<number>;
  paid_amount: Generated<number>;
  recurring_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupplierBillLinesTable {
  id: Generated<string>;
  bill_id: string;
  description: string;
  category: Generated<string>;
  qty: Generated<number>;
  unit_price: Generated<number>;
  tax_rate: Generated<number>;
  sort_order: Generated<number>;
}

export interface BillPaymentsTable {
  id: Generated<string>;
  tenant_id: string;
  bill_id: string;
  amount: number;
  currency: Generated<string>;
  payment_date: Date | null;
  method: string | null;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface RecurringBillsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  frequency: Generated<string>;
  currency: Generated<string>;
  amount: Generated<number>;
  tax_rate: Generated<number>;
  category: Generated<string>;
  description: string | null;
  payment_terms: string | null;
  next_due: Date | null;
  end_date: Date | null;
  state: Generated<string>;
  bills_generated: Generated<number>;
  total_spend: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantSettingsTable {
  id: Generated<string>;
  tenant_id: string;
  settings: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  tenant_companies: TenantCompaniesTable;
  analytics_kpis: AnalyticsKpisTable;
  tenants: TenantsTable;
  locations: LocationsTable;
  users: UsersTable;
  customers: CustomersTable;
  shipment_cases: ShipmentCasesTable;
  stage_history: StageHistoryTable;
  case_documents: CaseDocumentsTable;
  expenses: ExpensesTable;
  case_messages: CaseMessagesTable;
  risk_flags: RiskFlagsTable;
  notifications: NotificationsTable;
  // Declaration tables (TANESW)
  declarations: DeclarationsTable;
  declaration_items: DeclarationItemsTable;
  declaration_item_models: DeclarationItemModelsTable;
  declaration_notices: DeclarationNoticesTable;
  tax_lines: TaxLinesTable;
  declaration_attachments: DeclarationAttachmentsTable;
  // Demurrage Engine
  demurrage_tariffs: DemurrageTariffsTable;
  container_tracking: ContainerTrackingTable;
  // Quotations
  quotations: QuotationsTable;
  quotation_lines: QuotationLinesTable;
  // Road Consignments
  road_consignments: RoadConsignmentsTable;
  consignment_trips: ConsignmentTripsTable;
  border_crossings: BorderCrossingsTable;
  // Finance Pipeline
  vendor_bills: VendorBillsTable;
  client_invoices: ClientInvoicesTable;
  // Shipment Ops
  shipment_tasks: ShipmentTasksTable;
  shipment_time_entries: ShipmentTimeEntriesTable;
  // HR Module
  hr_departments: HrDepartmentsTable;
  hr_designations: HrDesignationsTable;
  hr_shifts: HrShiftsTable;
  hr_shift_assignments: HrShiftAssignmentsTable;
  hr_attendance: HrAttendanceTable;
  hr_leaves: HrLeavesTable;
  hr_payroll: HrPayrollTable;
  hr_announcements: HrAnnouncementsTable;
  hr_holidays: HrHolidaysTable;
  // HR Time Tracking
  hr_tasks: HrTasksTable;
  hr_time_entries: HrTimeEntriesTable;
  // Org Chart
  org_chart_nodes: OrgChartNodesTable;
  // Role permissions matrix
  org_permissions: OrgPermissionsTable;
  // Sales Invoices
  sales_invoices: SalesInvoicesTable;
  sales_invoice_lines: SalesInvoiceLinesTable;
  invoice_payments: InvoicePaymentsTable;
  // Supplier Bills
  supplier_bills: SupplierBillsTable;
  supplier_bill_lines: SupplierBillLinesTable;
  bill_payments: BillPaymentsTable;
  recurring_bills: RecurringBillsTable;
  // Tenant Settings
  tenant_settings: TenantSettingsTable;
}

export interface HrTasksTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  category: Generated<string>;
  is_billable: Generated<boolean>;
  color: Generated<string>;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrTimeEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  task_id: string | null;
  task_name: string | null;
  is_billable: Generated<boolean>;
  started_at: Generated<Date>;
  ended_at: Date | null;
  duration_minutes: number | null;
  is_extended: Generated<boolean>;
  is_full_day: Generated<boolean>;
  notes: string | null;
  entry_type: Generated<string>;
  date: string;
  last_ack_at: Date | null;
  project_id: string | null;
  project_ref: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgPermissionsTable {
  id: Generated<string>;
  tenant_id: string;
  role: string;
  resource: string;
  action: string;
  allowed: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrgChartNodesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  label: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  avatar_color: Generated<string>;
  parent_id: string | null;
  position_x: number;
  position_y: number;
  node_type: Generated<string>;
  color: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});

/**
 * Execute a db transaction with tenant isolation RLS parameter set.
 * Row-level security relies on the current_setting('app.tenant_id') matching tenant_id.
 */
export async function withTenant<T>(
  tenantId: string | null,
  callback: (trx: Transaction<Database>) => Promise<T>
): Promise<T> {
  return await db.transaction().execute(async (trx) => {
    if (tenantId) {
      await sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`.execute(trx);
    } else {
      await sql`SELECT set_config('app.tenant_id', '', true)`.execute(trx);
    }
    return await callback(trx);
  });
}
