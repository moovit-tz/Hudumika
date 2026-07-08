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
  CPCCode,
  TicketStatus,
  TicketPriority,
  AssetType
} from '@hudumika/types';

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
  subdomain: string | null;
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
  tags: any; // JSONB: string[]
  nps_score: number | null;
  csat_score: number | null;
  feedback_text: string | null;
  first_reply_at: Date | null;
  first_reply_time_seconds: number | null;
  resolved_at: Date | null;
  resolution_time_seconds: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  co2_emissions_kg: number | null;
  carbon_credits_saved: number | null;
  co2_calc_details: string | null;
  vessel_mmsi: string | null;
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
  // Workspace app context columns (migration 020)
  app: Generated<string>;         // which app generated this (default 'clearos')
  entity_type: string | null;     // 'shipment' | 'invoice' | 'employee' | 'ticket'
  entity_id: string | null;
  entity_label: string | null;    // e.g. 'CLR-2026-0001'
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
  description: string | null;
  labels: any; // JSONB string[]
  cover_color: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaskChecklistsTable {
  id: Generated<string>;
  tenant_id: string;
  task_id: string;
  title: string;
  position: Generated<number>;
  created_at: Generated<Date>;
}

export interface TaskChecklistItemsTable {
  id: Generated<string>;
  checklist_id: string;
  task_id: string;
  title: string;
  completed: Generated<boolean>;
  completed_by: string | null;
  completed_at: Date | null;
  due_date: Date | null;
  assigned_to: string | null;
  position: Generated<number>;
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

export interface TaskCommentsTable {
  id: Generated<string>;
  tenant_id: string;
  task_id: string;
  shipment_id: string;
  author_id: string;
  author_name: string;
  content: string;
  mentions: any; // JSONB — [{user_id, name}]
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ShipmentNotesTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ShipmentParticipantCustomersTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  customer_id: string;
  added_by: string | null;
  wa_enabled: Generated<boolean>;
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

export interface HrTeamsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  lead_user_id: string | null;
  created_at: Generated<Date>;
}

export interface HrTeamMembersTable {
  id: Generated<string>;
  team_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface HrInvitationsTable {
  id: Generated<string>;
  tenant_id: string;
  email: string;
  role: string;
  token: string;
  invited_by: string | null;
  status: Generated<string>;
  expires_at: Date;
  created_at: Generated<Date>;
}

export interface HrDeleteRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  requested_by: string | null;
  reason: string | null;
  status: Generated<string>;
  decided_by: string | null;
  decided_at: Date | null;
  created_at: Generated<Date>;
}

export interface HrLoginHistoryTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  status: Generated<string>;
  created_at: Generated<Date>;
}

export interface HrDevicesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  device_label: string;
  device_type: Generated<string>;
  user_agent: string | null;
  trusted: Generated<boolean>;
  last_used_at: Generated<Date>;
  created_at: Generated<Date>;
}

export interface HrActivityLogTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  action: string;
  module: Generated<string>;
  created_at: Generated<Date>;
}

export interface PasswordResetTokensTable {
  id: Generated<string>;
  user_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
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
  // TRA VFD fields
  tra_status: Generated<string> | null;      // 'pending' | 'submitted' | 'failed' | 'skipped'
  tra_rctnum: number | null;                 // RCTNUM / GC at time of submission
  tra_dc: number | null;                     // Daily counter at submission
  tra_znum: string | null;                   // ZNUM = YYYYMMDD
  tra_rctvnum: string | null;                // RECEIPTCODE + GC
  tra_submitted_at: Date | null;
  tra_ack_code: number | null;               // 0 = success
  tra_ack_msg: string | null;
  tra_qr_url: string | null;
  tra_total_incl: number | null;             // Tax-inclusive total submitted to TRA
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

export interface SuppliersTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: Generated<string>;
  tax_id: string | null;
  category: Generated<string>;
  currency: Generated<string>;
  payment_terms: Generated<string>;
  status: Generated<string>;
  bank_name: string | null;
  bank_account: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  // EFD/VFD Verification fields
  efd_receipt_number: string | null;         // Supplier's EFD/VFD receipt number
  efd_verified: Generated<boolean> | null;   // Whether verified against TRA portal
  efd_verified_at: Date | null;
  efd_verification_data: Record<string, any> | null; // Raw response from TRA
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

export interface PackagesTable {
  id: Generated<string>;
  code: string;
  name: string;
  monthly_price: number;
  annual_price: number;
  max_users: number;
  features: string[];           // JSONB — auto-parsed to a native array by the pg driver
  color: string | null;
  popular: Generated<boolean>;
  is_active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PlatformTransactionsTable {
  id: Generated<string>;
  tenant_id: string;
  package_code: string;
  billing_cycle: string;
  amount: number;
  currency: Generated<string>;
  method: string;
  status: Generated<string>;
  tx_ref: string;
  payer_name: string | null;
  card_last4: string | null;
  mobile_number: string | null;
  created_at: Generated<Date>;
}

export interface TrackingSnapshotsTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string | null;
  tracking_type: string;        // 'AWB' | 'BL'
  tracking_number: string;
  carrier: string | null;
  origin_name: string | null;
  origin_code: string | null;
  dest_name: string | null;
  dest_code: string | null;
  current_location: string | null;
  status: string | null;
  status_code: string | null;
  eta: Date | null;
  progress_pct: Generated<number>;
  events: string;               // JSONB stored as string
  share_token: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupportTicketsTable {
  id: Generated<string>;
  tenant_id: string;
  ref_number: string;
  customer_id: string;
  subject: string;
  description: string | null;
  channel: MessageChannel;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assigned_to: string | null;
  group_id: string | null;
  tags: any | null;
  nps_score: number | null;
  csat_score: number | null;
  feedback_text: string | null;
  first_reply_at: Date | null;
  first_reply_time_seconds: number | null;
  resolved_at: Date | null;
  resolution_time_seconds: number | null;
  sla_deadline: Date | null;
  sla_escalated_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupportRulesTable {
  id: Generated<string>;
  tenant_id: string;
  type: 'auto_assign' | 'sla_escalation' | 'status_automation' | 'notification_trigger';
  name: string;
  enabled: Generated<boolean>;
  config: any;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupportGroupsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  color: string;
  created_at: Generated<Date>;
}

export interface SupportViewsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  filters: any;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SupportMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  ticket_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  author_id: string;
  author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER' | 'SYSTEM';
  content: string;
  external_ref: string | null;
  created_at: Generated<Date>;
}

export interface CustomerAssetsTable {
  id: Generated<string>;
  tenant_id: string;
  customer_id: string;
  asset_type: AssetType;
  asset_ref: string;
  status: string;
  metadata: any | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface KbCategoriesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: Generated<Date>;
}

export interface KnowledgeBaseTable {
  id: Generated<string>;
  tenant_id: string;
  category_id: string | null;
  title: string;
  content: string;
  status: string | null; // e.g. 'Published', 'Draft'
  views: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LiveChatSessionsTable {
  id: Generated<string>;
  tenant_id: string;
  customer_id: string | null;
  visitor_name: string | null;
  status: string; // 'waiting', 'active', 'closed'
  assigned_to: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LiveChatMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  session_id: string;
  sender_type: string; // 'visitor' or 'agent'
  sender_id: string | null;
  content: string;
  created_at: Generated<Date>;
}

export interface Database {
  support_tickets: SupportTicketsTable;
  support_messages: SupportMessagesTable;
  support_groups: SupportGroupsTable;
  support_views: SupportViewsTable;
  support_rules: SupportRulesTable;
  customer_assets: CustomerAssetsTable;
  kb_categories: KbCategoriesTable;
  knowledge_base: KnowledgeBaseTable;
  live_chat_sessions: LiveChatSessionsTable;
  live_chat_messages: LiveChatMessagesTable;
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
  task_comments: TaskCommentsTable;
  task_checklists: TaskChecklistsTable;
  task_checklist_items: TaskChecklistItemsTable;
  shipment_notes: ShipmentNotesTable;
  shipment_participant_customers: ShipmentParticipantCustomersTable;
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
  hr_teams: HrTeamsTable;
  hr_team_members: HrTeamMembersTable;
  hr_invitations: HrInvitationsTable;
  hr_delete_requests: HrDeleteRequestsTable;
  hr_login_history: HrLoginHistoryTable;
  hr_devices: HrDevicesTable;
  hr_activity_log: HrActivityLogTable;
  password_reset_tokens: PasswordResetTokensTable;
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
  // Suppliers / Vendors
  suppliers: SuppliersTable;
  // Supplier Bills
  supplier_bills: SupplierBillsTable;
  supplier_bill_lines: SupplierBillLinesTable;
  bill_payments: BillPaymentsTable;
  recurring_bills: RecurringBillsTable;
  // Tenant Settings
  tenant_settings: TenantSettingsTable;
  // Signup / Onboarding
  packages: PackagesTable;
  platform_transactions: PlatformTransactionsTable;
  // AWB / BL Tracking
  tracking_snapshots: TrackingSnapshotsTable;
  // General Ledger
  chart_of_accounts: ChartOfAccountsTable;
  journal_entries: JournalEntriesTable;
  journal_lines: JournalLinesTable;
  // Purchase Orders & Delivery Notes
  purchase_orders: PurchaseOrdersTable;
  purchase_order_lines: PurchaseOrderLinesTable;
  delivery_notes: DeliveryNotesTable;
  delivery_note_lines: DeliveryNoteLinesTable;
  // Accounting Integrations
  accounting_integrations: AccountingIntegrationsTable;
  accounting_sync_logs: AccountingSyncLogsTable;
  // NexusHR Core
  hr_legal_entities: HrLegalEntitiesTable;
  hr_locations: HrLocationsTable;
  hr_cost_centers: HrCostCentersTable;
  hr_job_catalog: HrJobCatalogTable;
  hr_people: HrPeopleTable;
  hr_employments: HrEmploymentsTable;
  hr_employment_effective_records: HrEmploymentEffectiveRecordsTable;
  hr_compensations: HrCompensationsTable;
  hr_compensation_components: HrCompensationComponentsTable;
  // NexusHR Workflows
  hr_workflow_definitions: HrWorkflowDefinitionsTable;
  hr_workflow_stages: HrWorkflowStagesTable;
  hr_workflow_cases: HrWorkflowCasesTable;
  hr_workflow_tasks: HrWorkflowTasksTable;
  hr_workflow_conditions: HrWorkflowConditionsTable;
  // NexusHR Documents & Assets
  hr_documents: HrDocumentsTable;
  hr_document_templates: HrDocumentTemplatesTable;
  hr_signature_requests: HrSignatureRequestsTable;
  hr_signature_events: HrSignatureEventsTable;
  hr_assets: HrAssetsTable;
  // NexusHR Performance & Wellness
  hr_goals: HrGoalsTable;
  hr_goal_checkins: HrGoalCheckinsTable;
  hr_review_cycles: HrReviewCyclesTable;
  hr_review_templates: HrReviewTemplatesTable;
  hr_review_instances: HrReviewInstancesTable;
  hr_feedback_notes: HrFeedbackNotesTable;
  hr_survey_templates: HrSurveyTemplatesTable;
  hr_survey_instances: HrSurveyInstancesTable;
  hr_survey_responses: HrSurveyResponsesTable;
  hr_wellness_programs: HrWellnessProgramsTable;
  // Contacts App
  contacts: ContactsTable;
  contact_labels: ContactLabelsTable;
  contact_label_mappings: ContactLabelMappingsTable;
  contact_activity_log: ContactActivityLogTable;
  // ComplyOS
  comply_certificates:   ComplyCertificatesTable;
  comply_applications:   ComplyApplicationsTable;
  comply_obligations:    ComplyObligationsTable;
  comply_renewals:       ComplyRenewalsTable;
  comply_agency_syncs:   ComplyAgencySyncsTable;
  // TRA VFD Integration
  tra_vfd_config: TraVfdConfigTable;
  // Customs Intelligence Suite
  hs_codes: HsCodesTable;
  customs_penalties: CustomsPenaltiesTable;
  landed_cost_records: LandedCostRecordsTable;
  vessel_positions: VesselPositionsTable;
  geofences: GeofencesTable;
  geofence_events: GeofenceEventsTable;
  // Cloud / Drive File Manager
  cloud_files: CloudFilesTable;
  cloud_file_shares: CloudFileSharesTable;
  cloud_storage_connections: CloudStorageConnectionsTable;
  cloud_external_files: CloudExternalFilesTable;
  cloud_drives: CloudDrivesTable;
  cloud_drive_members: CloudDriveMembersTable;
}

// ── TRA VFD Integration ──────────────────────────────────────────────────────

export interface TraVfdConfigTable {
  id: Generated<string>;
  tenant_id: string;
  // TRA credentials
  tin: string | null;
  cert_key: string | null;
  cert_serial: string | null;
  pfx_path: string | null;
  pfx_password: string | null;
  // From TRA registration response
  reg_id: string | null;
  serial: string | null;
  uin: string | null;
  vrn: string | null;
  receipt_code: string | null;
  username: string | null;
  password: string | null;
  token_path: string | null;
  tax_office: string | null;
  tax_code: Generated<string>;
  // Token cache
  access_token: string | null;
  token_expires_at: Date | null;
  // Counters
  gc: Generated<number>;
  dc: Generated<number>;
  dc_date: Date | null;
  gross_total: Generated<number>;            // Cumulative TZS total ever fiscalized (not a receipt count)
  // Z-Report tracking
  last_zreport_date: Date | null;
  // Config
  environment: Generated<string>;
  registered_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── Customs Intelligence Suite ─────────────────────────────────────

export interface HsCodesTable {
  id: Generated<string>;
  code: string;
  level: number;
  description: string;
  parent_code: string | null;
  import_duty_rate: Generated<number>;
  vat_rate: Generated<number>;
  excise_rate: Generated<number>;
  rdl_rate: Generated<number>;
  cpf_rate: Generated<number>;
  ifs_rate: Generated<number>;
  pvoc_required: Generated<boolean>;
  di_required: Generated<boolean>;
  permits: string | null;
  restrictions: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomsPenaltiesTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_ref: string | null;
  hs_code: string | null;
  violation_type: string;
  declared_value: number | null;
  actual_value: number | null;
  declared_hs: string | null;
  actual_hs: string | null;
  duty_shortfall: Generated<number>;
  penalty_amount: Generated<number>;
  late_months: Generated<number>;
  currency: Generated<string>;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LandedCostRecordsTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_ref: string | null;
  hs_code: string | null;
  description: string | null;
  cif_usd: number | null;
  fx_rate: number | null;
  cif_tzs: number | null;
  duty_rate: number | null;
  duty_amount: number | null;
  vat_amount: number | null;
  rdl_amount: number | null;
  cpf_amount: number | null;
  icd_amount: number | null;
  wharfage_amount: number | null;
  total_tzs: number | null;
  qty: Generated<number>;
  per_unit_tzs: number | null;
  source: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface VesselPositionsTable {
  mmsi: string;
  imo: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  course: number | null;
  heading: number | null;
  nav_status: string | null;
  destination: string | null;
  eta_raw: string | null;
  draught: number | null;
  last_updated: Generated<Date>;
}

export interface GeofencesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  zone_type: Generated<string>;
  center_lat: number;
  center_lon: number;
  radius_km: number;
  active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GeofenceEventsTable {
  id: Generated<string>;
  geofence_id: string;
  mmsi: string;
  vessel_name: string | null;
  event_type: 'ENTER' | 'EXIT';
  latitude: number;
  longitude: number;
  occurred_at: Generated<Date>;
}

export interface AccountingIntegrationsTable {
  id: Generated<string>;
  tenant_id: string;
  provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY';
  status: Generated<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>;
  config: Generated<Record<string, any>>;
  last_sync_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountingSyncLogsTable {
  id: Generated<string>;
  tenant_id: string;
  provider: string;
  entity_type: 'COA' | 'INVOICE' | 'BILL' | 'PAYMENT';
  entity_id: string;
  external_id: string | null;
  status: 'SUCCESS' | 'FAILED';
  error_message: string | null;
  synced_at: Generated<Date>;
}

export interface ChartOfAccountsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  subtype: string | null;
  parent_id: string | null;
  description: string | null;
  is_system: Generated<boolean>;
  is_active: Generated<boolean>;
  normal_balance: 'DEBIT' | 'CREDIT' | null;
  currency: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  entry_number: string;
  entry_date: Date;
  reference: string | null;
  description: string;
  status: Generated<string>;
  source_module: string | null;
  source_id: string | null;
  created_by: string | null;
  posted_at: Generated<Date>;
  voided_at: Date | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalLinesTable {
  id: Generated<string>;
  journal_entry_id: string;
  account_id: string;
  debit: Generated<number>;
  credit: Generated<number>;
  description: string | null;
  currency: Generated<string>;
  exchange_rate: Generated<number>;
  dimensions: Generated<Record<string, string>>;
  sort_order: Generated<number>;
}

export interface PurchaseOrdersTable {
  id: Generated<string>;
  tenant_id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  status: Generated<string>;
  order_date: Date | null;
  expected_date: Date | null;
  currency: Generated<string>;
  subtotal: Generated<number>;
  tax_amount: Generated<number>;
  total: Generated<number>;
  notes: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  payment_terms: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseOrderLinesTable {
  id: Generated<string>;
  po_id: string;
  description: string;
  category: string | null;
  qty: Generated<number>;
  unit_price: Generated<number>;
  tax_rate: Generated<number>;
  tax_amount: Generated<number>;
  line_total: Generated<number>;
  received_qty: Generated<number>;
  sort_order: Generated<number>;
}

export interface DeliveryNotesTable {
  id: Generated<string>;
  tenant_id: string;
  dn_number: string;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  delivery_date: Date | null;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryNoteLinesTable {
  id: Generated<string>;
  dn_id: string;
  description: string;
  qty_ordered: Generated<number>;
  qty_delivered: Generated<number>;
  unit: string | null;
  notes: string | null;
  sort_order: Generated<number>;
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

// ── NexusHR Types ───────────────────────────────────────────────────────────

export interface HrLegalEntitiesTable {
  id: Generated<string>;
  tenant_id: string;
  legal_name: string;
  registration_no: string | null;
  tax_id: string | null;
  country_code: string;
  currency: Generated<string>;
  registered_address: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrLocationsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  timezone: Generated<string>;
  address: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrCostCentersTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrJobCatalogTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  job_grade: string | null;
  job_family: string | null;
  description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrPeopleTable {
  id: Generated<string>;
  tenant_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: Date | null;
  gender: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  national_identifiers: Generated<Record<string, any>>;
  emergency_contacts: Generated<any[]>;
  avatar_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrEmploymentsTable {
  id: Generated<string>;
  tenant_id: string;
  person_id: string;
  legal_entity_id: string;
  status: Generated<string>;
  employment_type: Generated<string>;
  start_date: Date;
  end_date: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrEmploymentEffectiveRecordsTable {
  id: Generated<string>;
  tenant_id: string;
  employment_id: string;
  effective_date: Date;
  end_date: Date | null;
  job_title: string;
  department_id: string | null;
  location_id: string | null;
  cost_center_id: string | null;
  manager_id: string | null;
  change_reason: string | null;
  created_at: Generated<Date>;
}

export interface HrCompensationsTable {
  id: Generated<string>;
  tenant_id: string;
  employment_id: string;
  effective_date: Date;
  end_date: Date | null;
  base_salary: Generated<number>;
  currency: Generated<string>;
  pay_frequency: Generated<string>;
  created_at: Generated<Date>;
}

export interface HrCompensationComponentsTable {
  id: Generated<string>;
  tenant_id: string;
  compensation_id: string;
  name: string;
  type: string;
  amount: Generated<number>;
  is_taxable: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface HrWorkflowDefinitionsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  category: string;
  trigger_event: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrWorkflowStagesTable {
  id: Generated<string>;
  tenant_id: string;
  definition_id: string;
  name: string;
  sort_order: number;
  stage_type: Generated<string>;
  assignee_rule: string;
  specific_user_id: string | null;
  sla_hours: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrWorkflowCasesTable {
  id: Generated<string>;
  tenant_id: string;
  definition_id: string;
  subject_id: string;
  subject_type: string;
  current_stage_id: string | null;
  status: Generated<string>;
  started_at: Generated<Date>;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrWorkflowTasksTable {
  id: Generated<string>;
  tenant_id: string;
  case_id: string;
  stage_id: string;
  name: string;
  assignee_id: string | null;
  status: Generated<string>;
  due_date: Date | null;
  completed_at: Date | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrWorkflowConditionsTable {
  id: Generated<string>;
  tenant_id: string;
  stage_id: string;
  field_name: string;
  operator: string;
  value: string;
  next_stage_id: string | null;
  created_at: Generated<Date>;
}

export interface HrDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  person_id: string | null;
  employment_id: string | null;
  case_id: string | null;
  name: string;
  type: string;
  storage_key: string;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrDocumentTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  type: string;
  country_code: string | null;
  body: string;
  version: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrSignatureRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  document_id: string;
  signer_role: string;
  signer_user_id: string | null;
  status: Generated<string>;
  sent_at: Generated<Date>;
  completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrSignatureEventsTable {
  id: Generated<string>;
  tenant_id: string;
  request_id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  recorded_at: Generated<Date>;
}

export interface HrAssetsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  type: string;
  serial_number: string;
  assigned_to: string | null;
  assigned_date: Date | null;
  returned_date: Date | null;
  condition_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrGoalsTable {
  id: Generated<string>;
  tenant_id: string;
  owner_id: string;
  parent_goal_id: string | null;
  title: string;
  description: string | null;
  goal_type: Generated<string>;
  target_value: Generated<number>;
  current_value: Generated<number>;
  unit: Generated<string>;
  weight: Generated<number>;
  due_date: Date | null;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrGoalCheckinsTable {
  id: Generated<string>;
  tenant_id: string;
  goal_id: string;
  current_value: number;
  status: string;
  comment: string | null;
  recorded_by: string | null;
  created_at: Generated<Date>;
}

export interface HrReviewCyclesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  type: Generated<string>;
  start_date: Date;
  end_date: Date;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrReviewTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  sections: Generated<Record<string, any>>;
  rating_scale: Generated<any[]>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrReviewInstancesTable {
  id: Generated<string>;
  tenant_id: string;
  cycle_id: string;
  template_id: string;
  employment_id: string;
  self_rating: number | null;
  manager_rating: number | null;
  final_rating: number | null;
  self_response: Generated<Record<string, any>>;
  manager_response: Generated<Record<string, any>>;
  calibration_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrFeedbackNotesTable {
  id: Generated<string>;
  tenant_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  is_visible_to_manager: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface HrSurveyTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  description: string | null;
  questions: Generated<any[]>;
  is_anonymous: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrSurveyInstancesTable {
  id: Generated<string>;
  tenant_id: string;
  template_id: string;
  status: Generated<string>;
  ends_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrSurveyResponsesTable {
  id: Generated<string>;
  tenant_id: string;
  instance_id: string;
  answers: Generated<Record<string, any>>;
  created_at: Generated<Date>;
}

export interface HrWellnessProgramsTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  description: string | null;
  start_date: Date;
  end_date: Date;
  points: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── Contacts App Types ───────────────────────────────────────────────────────

export interface ContactsTable {
  id: Generated<string>;
  tenant_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  company_id: string | null;
  job_title: string | null;
  notes: string | null;
  birthday: Date | null;
  is_favorite: Generated<boolean>;
  avatar_url: string | null;
  status: Generated<string>;
  website: string | null;
  location: string | null;
  industry: string | null;
  company_size: string | null;
  sales_owner: string | null;
  last_contacted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContactActivityLogTable {
  id: Generated<string>;
  tenant_id: string;
  contact_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  created_at: Generated<Date>;
}

export interface ContactLabelsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface ContactLabelMappingsTable {
  contact_id: string;
  label_id: string;
}

// ── ComplyOS Tables ──────────────────────────────────────────────────────────

export interface ComplyCertificatesTable {
  id:             Generated<string>;
  tenant_id:      string;
  cert_number:    string;
  name:           string;
  agency_code:    string;
  agency_name:    string;
  agency_class:   Generated<string>;
  issued_date:    Date | null;
  expiry_date:    Date | null;
  status:         Generated<string>;  // active | expiring | expired | revoked
  document_url:   string | null;
  external_ref:   string | null;
  auto_renew:     Generated<boolean>;
  last_synced_at: Date | null;
  metadata:       Generated<Record<string, any>>;
  created_at:     Generated<Date>;
  updated_at:     Generated<Date>;
}

export interface ComplyApplicationsTable {
  id:             Generated<string>;
  tenant_id:      string;
  app_number:     string;
  cert_type:      string;
  agency_code:    string;
  status:         Generated<string>;  // draft | submitted | review | issued | rejected | pending
  submitted_at:   Date | null;
  created_at:     Generated<Date>;
  updated_at:     Generated<Date>;
  created_by:     string;
  agency_ref:     string | null;
  notes:          string | null;
  linked_cert_id: string | null;
  metadata:       Generated<Record<string, any>>;
}

export interface ComplyObligationsTable {
  id:                   Generated<string>;
  tenant_id:            string;
  obligation_code:      string;
  agency_code:          string;
  agency_class:         Generated<string>;
  name:                 string;
  frequency:            string;
  mandatory:            Generated<boolean>;
  status:               Generated<string>;  // active | pending | expired | not-started
  due_date:             Date | null;
  last_fulfilled_date:  Date | null;
  linked_cert_id:       string | null;
  created_at:           Generated<Date>;
  updated_at:           Generated<Date>;
}

export interface ComplyRenewalsTable {
  id:            Generated<string>;
  tenant_id:     string;
  cert_id:       string;
  status:        Generated<string>;  // pending_review | approved | submitted | issued | failed | cancelled
  trigger:       Generated<string>;  // automatic | manual
  triggered_at:  Generated<Date>;
  approved_by:   string | null;
  approved_at:   Date | null;
  submitted_at:  Date | null;
  completed_at:  Date | null;
  notes:         string | null;
  linked_app_id: string | null;
  metadata:      Generated<Record<string, any>>;
  created_at:    Generated<Date>;
}

export interface ComplyAgencySyncsTable {
  id:              Generated<string>;
  tenant_id:       string;
  agency_code:     string;
  synced_at:       Generated<Date>;
  status:          string;  // success | failed | partial
  records_updated: Generated<number>;
  error:           string | null;
}

// ── Cloud / Drive File Manager ──────────────────────────────────────────────

export interface CloudFilesTable {
  id:          Generated<string>;
  tenant_id:   string;
  drive_id:    string;
  name:        string;
  type:        string; // 'folder' or a file extension
  size:        number | null;
  file_count:  Generated<number>;
  parent_id:   string | null;
  color:       string | null;
  description: string | null;
  owner_id:    string | null;
  owner_name:  Generated<string>;
  starred:     Generated<boolean>;
  is_trash:    Generated<boolean>;
  trashed_at:  Date | null;
  storage_key: string | null;
  mime_type:   string | null;
  created_at:  Generated<Date>;
  updated_at:  Generated<Date>;
}

export interface CloudFileSharesTable {
  id:          Generated<string>;
  file_id:     string;
  person_name: string;
  role:        Generated<string>; // 'Viewer' | 'Editor'
  created_at:  Generated<Date>;
}

export interface CloudDrivesTable {
  id:         Generated<string>;
  tenant_id:  string;
  name:       string;
  type:       Generated<string>; // 'personal' | 'shared'
  owner_id:   string | null;
  owner_name: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CloudDriveMembersTable {
  id:          Generated<string>;
  drive_id:    string;
  person_name: string;
  role:        Generated<string>; // 'manager' | 'content_manager' | 'contributor' | 'commenter' | 'viewer'
  created_at:  Generated<Date>;
}

export interface CloudExternalFilesTable {
  id:         Generated<string>;
  tenant_id:  string;
  provider:   string; // 'box' | 'dropbox' | 'mega' | 'onedrive'
  name:       string;
  type:       string; // 'folder' or a file extension
  size:       number | null;
  parent_id:  string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CloudStorageConnectionsTable {
  id:             Generated<string>;
  tenant_id:      string;
  provider:       string; // 'box' | 'dropbox' | 'mega'
  status:         Generated<string>; // 'connected' | 'disconnected'
  account_label:  string | null;
  auto_sync:      Generated<boolean>;
  connected_at:   Date | null;
  last_synced_at: Date | null;
  created_at:     Generated<Date>;
  updated_at:     Generated<Date>;
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
