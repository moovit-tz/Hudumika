import pg from 'pg';
import { Kysely, PostgresDialect, sql, Generated, ColumnType, Transaction } from 'kysely';
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
  /**
   * ISO 3166-1 alpha-2, the country this tenant operates in. Decides its
   * holiday calendar. NULL means unknown, and unknown is treated as unknown —
   * guessing fills the calendar with another country's public holidays.
   */
  country: string | null;
  active: Generated<boolean>;
  /** Links this tenant back to a platform-level Organization (see
   *  OrganizationsTable) when the same real-world company also runs its own
   *  tenant independent of being anyone's customer. Additive/nullable — the
   *  flow to set it is separate follow-on work, not built alongside this column. */
  organization_id: string | null;
  /** AgencyHost M8 — which tenant's referral link this tenant signed up
   *  through, if any. Set once at signup, never reassigned. Migration 250. */
  referred_by_tenant_id: string | null;
  /** Ondi M5 (migration 362) — the tenant's own business-registration KYB,
   *  reviewed by the platform SuperAdmin (a tenant can't self-certify its
   *  own business identity). See ondi_org_kyb. */
  kyb_status: Generated<'not_started' | 'pending' | 'verified' | 'rejected'>;
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
  profile: Generated<Record<string, any>>;
  active: Generated<boolean>;
  last_login_at: Date | null;
  /**
   * Payroll identity. These sit on the column rather than inside `profile`
   * because the payroll engine depends on them: residency alone switches the
   * calculation to a flat rate with no tax-free band, and a value the engine
   * reads should not live somewhere it can be overwritten by an unrelated
   * profile save. null everywhere means not yet captured, never zero.
   */
  activity_consent: Generated<boolean>;      // opt-in to intensity-only activity monitoring (migration 221)
  activity_consent_at: Date | null;
  tax_residency: 'RESIDENT' | 'NON_RESIDENT' | null;
  national_id: string | null;
  tax_id: string | null;
  social_security_no: string | null;
  health_insurance_no: string | null;
  basic_salary: string | null;
  pay_currency: string | null;
  /**
   * When employment began. The leave cycle is counted from this date rather
   * than the calendar year, so it decides what somebody is owed and when it
   * resets. Backfilled from created_at, which is a proxy and not the same
   * thing — anyone hired before this system existed has the wrong anchor until
   * their real date is entered.
   */
  hire_date: string | null;
  /**
   * How the net figure actually reaches the person. Mobile money is not a
   * fallback here — for a large share of staff it is the only account they
   * have, so it gets its own fields rather than being squeezed into the bank
   * ones. null pay_method means nobody has been asked yet, which is not the
   * same as having chosen CASH.
   */
  pay_method: 'BANK' | 'MOBILE_MONEY' | 'CASH' | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  mobile_money_provider: string | null;
  mobile_money_number: string | null;
  /** NSSF or PSSSF — same rate, different return. */
  pension_fund: 'NSSF' | 'PSSSF' | null;
  /**
   * For CUSTOMER-role logins: the customers row they act for. Eleven call sites
   * used to assume this was the login's own id; it never was, so every
   * customer-scoped query matched nothing. NULL means unlinked, which must be
   * read as "sees nothing".
   */
  customer_id: string | null;
  // Ondi identity (M0, migration 358) — see that migration's own header for
  // why ondi_handle is a global unique index rather than per-tenant like email.
  ondi_handle: string | null;
  verification_level: Generated<'unverified' | 'phone_verified' | 'id_verified' | 'enhanced'>;
  kyc_status: Generated<'not_started' | 'pending' | 'approved' | 'rejected'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LeadsTable {
  id: Generated<string>;
  tenant_id: string;
  company: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  source: Generated<string>;
  stage: Generated<string>;
  value: Generated<string>;
  priority: Generated<string>;
  assigned_to: string | null;
  expected_close: DateOnlyNull;
  notes: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Every real customer/lead search — see 264_crm_search_history.sql. */
export interface CrmSearchHistoryTable {
  id: Generated<string>;
  tenant_id: string;
  searched_by: string;
  query: string;
  result_count: Generated<number>;
  source: string | null;
  created_at: Generated<Date>;
}

/** Real notes-app storage — see 265_notes_app.sql. */
export interface NoteLabelsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  created_by: string;
  created_at: Generated<Date>;
}

export interface NotesTable {
  id: Generated<string>;
  tenant_id: string;
  /** Nullable — 266_notes_migrate_existing.sql backfills legacy notes
   *  pulled from other apps' own single-field notes, which have no real
   *  per-note author to attribute (see that migration's own header). Every
   *  note created through the Notes app itself always sets a real one. */
  created_by: string | null;
  title: Generated<string>;
  content: Generated<string>;
  color: Generated<string>;
  is_trashed: Generated<boolean>;
  checklist: any; // JSONB: ChecklistItem[]
  images: string[]; // native text[] — pg driver auto-parses to a native array
  drawing: string | null;
  reminder_at: Date | null;
  /** Set once notes-reminder.job.ts has actually notified reminder_at —
   *  the guard that lets a short-interval job poll for due reminders
   *  without re-notifying the same one every pass (282_notes_enterprise.sql). */
  reminder_notified_at: Date | null;
  label_ids: string[]; // native uuid[]
  subject_type: string | null;
  subject_id: string | null;
  /** 'team' (default, tenant-wide — the original and only behaviour before
   *  282_notes_enterprise.sql) | 'private' (creator only) | 'shared'
   *  (creator + note_shares). */
  visibility: Generated<string>;
  updated_by: string | null;
  trashed_at: Date | null;
  /** Exempts a note from notes-purge.job.ts's 30-day trash sweep — for
   *  compliance content that must not disappear on a timer. */
  legal_hold: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Per-(note,user) pin/archive — a personal view preference, not a shared
 *  property of the note (282_notes_enterprise.sql; see its header for why
 *  this replaced notes.is_pinned/is_archived). */
export interface NoteUserStateTable {
  note_id: string;
  tenant_id: string;
  user_id: string;
  is_pinned: Generated<boolean>;
  is_archived: Generated<boolean>;
  updated_at: Generated<Date>;
}

/** A note's real per-note ACL — only meaningful when notes.visibility = 'shared'
 *  (282_notes_enterprise.sql). */
export interface NoteSharesTable {
  id: Generated<string>;
  note_id: string;
  tenant_id: string;
  user_id: string;
  permission: Generated<string>; // 'view' | 'edit'
  created_at: Generated<Date>;
}

/** A snapshot written before every content change to a note — the audit
 *  trail this app never had (282_notes_enterprise.sql). */
export interface NoteRevisionsTable {
  id: Generated<string>;
  note_id: string;
  tenant_id: string;
  changed_by: string | null;
  title: Generated<string>;
  content: Generated<string>;
  checklist: any; // JSONB: ChecklistItem[]
  changed_at: Generated<Date>;
}

export interface CustomersTable {
  /** A real logo, when the company has one. Initials are derived, not stored. */
  logo_url: string | null;
  /**
   * Flags rather than one `kind`, because a company is routinely both: a peer
   * clearing agent who also ships their own consignments is a partner and a
   * customer, and a single type would force a duplicate record.
   */
  is_customer: Generated<boolean>;
  is_partner: Generated<boolean>;
  partner_role: string | null;
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
  // Soft-delete tombstone (migration 338) — set by DELETE /v1/customers/:id,
  // filtered out of GET / and GET /partners; a lookup by id is untouched.
  deleted_at: Date | null;
  // BRELA-derived company profile fields (migration 104) — nullable, only
  // populated for companies imported via ComplyOS's BRELA Search.
  source: Generated<string>;
  registry_number: string | null;
  entity_type: string | null;
  registration_status: string | null;
  registered_address: string | null;
  incorporation_date: DateOnlyNull;
  // Profile-tab fields (migration 134) — collected by the Customers edit
  // form since before these columns existed; account_status is the real
  // 3-way status the UI displays ('Active'/'Inactive'/'Suspended'), kept in
  // sync with the legacy `active` boolean rather than replacing it.
  account_status: Generated<string>;
  notes: string | null;
  address: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  vat_number: string | null;
  import_license: string | null;
  preferred_port: string | null;
  freight_terms: string | null;
  commodity_type: string | null;
  credit_days: number | null;
  client_type: string | null;
  // Currency + TANCIS registration (migration 135) — were rendered as
  // editable Profile-tab fields with no backing column (Currency had no
  // onValueChange at all; TANCIS input had no value/onChange).
  currency: Generated<string>;
  tancis_number: string | null;
  /** Links this tenant-private customer record to a platform-level
   *  Organization (migration 230), so the same real-world company served by
   *  more than one tenant can be tracked as one identity. Nullable/additive —
   *  staff-linked only, no self-service claiming (see organizations.routes.ts). */
  organization_id: string | null;
  /** AgencyHost M9 — when this customers row (in an agency's own tenant)
   *  represents one of that agency's real agency_managed_tenants clients,
   *  this is the exact tenant it stands in for. Migration 249. */
  linked_client_tenant_id: string | null;
  /** Daily shipment-report automation (migration 258) — tri-state: NULL =
   *  platform default (on), true/false = explicit customer-level choice.
   *  A shipment_cases row can further override this per shipment. */
  daily_report_enabled: boolean | null;
}

/** Platform-level identity for a real-world company, sitting above `tenants`
 *  as a peer — not scoped to any one tenant (no tenant_id column). Lets the
 *  same company, served by more than one clearing agent, be tracked as one
 *  entity instead of N disconnected `customers` rows. See migration 230. */
export interface OrganizationsTable {
  id:         Generated<string>;
  name:       string;
  email:      string | null;
  tax_id:     string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A separate login mechanism for an Organization — its own table, own
 *  password, own JWT shape (role 'ORG', no tenant_id claim at all). A third
 *  identity type alongside staff `users` and per-tenant CUSTOMER logins. */
export interface OrganizationUsersTable {
  id:              Generated<string>;
  organization_id: string;
  email:           string;
  password_hash:   string;
  name:            string;
  active:          Generated<boolean>;
  created_at:      Generated<Date>;
  updated_at:      Generated<Date>;
}

/** A one-time code letting an Organization self-service-link to one
 *  customer record — only redeemable by whoever received it at that
 *  customer's own registered contact channel. See migration 231. */
export interface CustomerClaimCodesTable {
  id:              Generated<string>;
  tenant_id:       string;
  customer_id:     string;
  token:           string;
  issued_by:       string | null;
  expires_at:      Date;
  used_at:         Date | null;
  used_by_org_id:  string | null;
  created_at:      Generated<Date>;
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
  // Holds a ClearanceStage literal for legacy/default-workflow shipments, or
  // a workflow_steps.id (UUID) for shipments governed by a tenant-defined
  // workflow — always some string, never NULL. See workflow-resolver.service.ts.
  stage: Generated<string>;
  assigned_to: string | null;
  location_id: string | null;
  sla_deadline: Date | null;
  free_time_end: Date | null;
  // Manually-set business due date (migration 141) — distinct from
  // sla_deadline, which is auto-recalculated on every stage transition and
  // so isn't safe to expose as a user-editable commitment date.
  due_date: Date | null;
  // Tenant-configurable workflow (migration 105) — resolved once at creation,
  // NULL for shipments running on the legacy fixed-stage system.
  workflow_id: string | null;
  workflow_step_id: string | null;
  consignment_type: Generated<string>;
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
  whatsapp_bot_active: Generated<boolean>;
  deleted_at: Date | null;
  deleted_by: string | null;
  /** Daily shipment-report automation (migration 258) — tri-state override
   *  of the parent customer's daily_report_enabled; NULL = inherit. */
  daily_report_enabled: boolean | null;
}

export interface StageHistoryTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  stage: string; // ClearanceStage literal or a workflow_steps.id — see ShipmentCasesTable.stage
  entered_at: Generated<Date>;
  exited_at: Date | null;
  duration_h: number | null;
  actor_id: string | null;
  note: string | null;
  blocker: string | null;
}

export interface WorkflowsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: Generated<string>;
  is_active: Generated<boolean>;
  is_default: Generated<boolean>;
  is_system: Generated<boolean>;      // platform-seeded default (migration 217)
  template_key: string | null;        // stable key of the source template, if system-seeded
  origin_template_key: string | null;      // template this workflow was seeded/adopted from (migration 218)
  origin_template_version: number | null;  // …and which version of it — the self-learning diff baseline
  triggers: string; // JSONB: WorkflowTrigger
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface WorkflowTemplatesTable {
  id: Generated<string>;
  template_key: string;
  version: Generated<number>;
  name: string;
  description: Generated<string>;
  freight_modes: string;      // JSONB: string[]
  consignment_types: string;  // JSONB: string[]
  steps: string;              // JSONB: DefaultStepDef[]
  status: Generated<string>;  // draft | published | archived
  is_system: Generated<boolean>;
  source: Generated<string>;  // platform | superadmin | learned
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowStepsTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  name: string;
  description: Generated<string>;
  step_order: number;
  is_start: Generated<boolean>;
  is_terminal: Generated<boolean>;
  next_step_ids: string; // JSONB: string[]
  entry_conditions: string; // JSONB: FieldCondition[]
  auto_comms: string; // JSONB: AutoComm[]
  sla_hours: number | null;
  color: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowInstancesTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  current_step_id: string;
  status: Generated<string>;
  started_at: Generated<Date>;
  resolved_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowInstanceEventsTable {
  id: Generated<string>;
  tenant_id: string;
  instance_id: string;
  from_step_id: string | null;
  to_step_id: string;
  to_step_name: string;
  status: string;
  note: string | null;
  conditions: Generated<string>;
  actor_id: string | null;
  created_at: Generated<Date>;
}

export interface ActivityMonitorSettingsTable {
  tenant_id: string;
  enabled: Generated<boolean>;
  capture_keystrokes: Generated<boolean>;
  capture_heatmap: Generated<boolean>;
  interval_seconds: Generated<number>;
  updated_by: string | null;
  updated_at: Generated<Date>;
}

export interface ActivitySamplesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  window_start: Date;
  window_end: Date;
  keystrokes: Generated<number>;
  mouse_distance_px: Generated<number>;
  clicks: Generated<number>;
  active_seconds: Generated<number>;
  zones: Generated<string>;   // JSONB heatmap buckets
  app: string | null;
  path: string | null;
  created_at: Generated<Date>;
}

export interface WorkflowLearningSignalsTable {
  id: Generated<string>;
  template_key: string;
  base_version: number;
  edit_type: string;
  step_signature: string;
  anchor_after: Generated<string>;
  detail: string;                 // JSONB
  support_tenants: Generated<number>;
  editing_tenants: Generated<number>;
  support_pct: Generated<number>;
  computed_at: Generated<Date>;
}

export interface WorkflowTemplateProposalsTable {
  id: Generated<string>;
  template_key: string;
  base_version: number;
  proposed_version: number;
  name: string;
  description: Generated<string>;
  freight_modes: Generated<string>;      // JSONB
  consignment_types: Generated<string>;  // JSONB
  steps: Generated<string>;              // JSONB
  rationale: Generated<string>;          // JSONB
  supporting_tenants: Generated<number>;
  editing_tenants: Generated<number>;
  confidence: Generated<number>;
  status: Generated<string>;
  created_at: Generated<Date>;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
}

export interface WorkflowCommQueueTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  workflow_step_id: string;
  auto_comm_id: string;
  fire_at: Date;
  status: Generated<string>; // PENDING | SENT | FAILED | CANCELLED
  error: string | null;
  created_at: Generated<Date>;
  sent_at: Date | null;
  /** The transition run that queued this, so its eventual outcome can be
   *  written back onto that run rather than left reading QUEUED. */
  run_id: string | null;
}

/**
 * One row per clearance transition attempt — what the automation actually did,
 * not just where the shipment ended up (that is stage_history's job).
 * See migration 168.
 */
export interface WorkflowStepRunsTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string | null;   // NULL on the legacy fixed-stage system
  shipment_id: string;
  /** TEXT: a workflow_steps UUID, or a ClearanceStage literal on legacy. */
  from_step_id: string | null;
  to_step_id: string;
  to_step_name: string;
  actor_id: string | null;
  status: string;               // SUCCESS | PARTIAL | BLOCKED | FAILED | SIMULATED
  conditions: Generated<string>;
  comms: Generated<string>;
  error_message: string | null;
  duration_ms: Generated<number>;
  simulated: Generated<boolean>;
  created_at: Generated<Date>;
}

// ── SEAL (bonded warehouse) — Increment 1: the ledger ──
export interface SealCompartmentsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  warehouse_type: Generated<string>;
  licence_number: string | null;
  licence_expiry: DateOnlyNull;
  customs_office_code: string | null;
  jurisdiction: Generated<string>;
  default_storage_days: Generated<number>;
  active: Generated<boolean>;
  guarantee_id: string | null;
  storage_fee_per_day: Generated<string>;
  storage_fee_currency: Generated<string>;
  handling_fee_flat: Generated<string>;
  storage_fee_per_cbm_per_day: Generated<string>;
  billing_method: Generated<string>;
  geofence_id: string | null;
  logo_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealZonesTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  code: string;
  name: string;
  zone_type: Generated<string>;
  created_at: Generated<Date>;
}

export interface SealLocationsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  zone_id: string;
  code: string;
  location_type: Generated<string>;
  max_weight_kg: number | null;
  is_pickable: Generated<boolean>;
  capacity_units: Generated<number>;
  floor_level: Generated<number>;
  max_stack_tiers: Generated<number>;
  grid_row: number | null;
  grid_col: number | null;
  length_m: string | null;
  width_m: string | null;
  height_m: string | null;
  floor_area_sqm: Generated<string | null>;
  volume_cbm: Generated<string | null>;
  created_at: Generated<Date>;
}

export interface SealLotsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  owner_id: string;
  shipment_case_id: string | null;
  description: string;
  hs_code: string | null;
  country_of_origin: string | null;
  marks_and_numbers: string | null;
  customs_status: string;
  entry_reference: string | null;
  procedure_code: string | null;
  current_location_id: string | null;
  qty_on_hand: Generated<string>;
  qty_allocated: Generated<string>;
  uom: Generated<string>;
  customs_value: string | null;
  currency: string | null;
  duty_at_risk: Generated<string>;
  tax_at_risk: Generated<string>;
  batch: string | null;
  serial: string | null;
  expiry_date: DateOnlyNull;
  warehoused_on: DateOnlyNull;
  expires_on: DateOnlyNull;
  is_dangerous_goods: Generated<boolean>;
  un_number: string | null;
  imdg_class: string | null;
  requires_reefer: Generated<boolean>;
  reefer_setpoint_c: string | null;
  stack_tier: Generated<number>;
  storage_billed_through: DateOnlyNull;
  volume_cbm: string | null;
  gross_weight_kg: string | null;
  destination_label: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealMovementsTable {
  id: Generated<string>;
  tenant_id: string;
  occurred_at: Generated<Date>;
  recorded_at: Generated<Date>;
  actor_id: string | null;
  actor_type: Generated<string>;
  movement_type: string;
  lot_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  qty_delta: Generated<string>;
  from_customs_status: string | null;
  to_customs_status: string | null;
  entry_reference: string | null;
  duty_delta: string | null;
  tax_delta: string | null;
  reason_code: string | null;
  reference: string | null;
  prev_hash: string | null;
  hash: string;
}

export interface SealGuaranteesTable {
  id: Generated<string>;
  tenant_id: string;
  instrument_type: string;
  issuer: string | null;
  reference: string;
  face_value: string;
  currency: string;
  effective_from: DateOnly;
  expires_on: DateOnly;
  status: Generated<string>;
  created_at: Generated<Date>;
}

export interface SealBondOverridesTable {
  id: Generated<string>;
  tenant_id: string;
  guarantee_id: string;
  actor_id: string | null;
  reason: string;
  shortfall: string;
  currency: string;
  created_at: Generated<Date>;
}

export interface SealConsignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  owner_id: string;
  shipment_case_id: string | null;
  transport_doc_type: Generated<string>;
  transport_doc_number: string | null;
  status: Generated<string>;
  expected_arrival: DateOnlyNull;
  goods_description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealContainersTable {
  id: Generated<string>;
  tenant_id: string;
  consignment_id: string;
  container_number: string;
  container_size: Generated<string>;
  seal_number: string | null;
  gross_weight_kg: string | null;
  tare_weight_kg: string | null;
  net_weight_kg: string | null;
  vgm_weight_kg: string | null;
  gate_in_at: Date | null;
  gate_out_at: Date | null;
  eir_reference: string | null;
  yard_slot_id: string | null;
  vehicle_id: string | null;
  created_at: Generated<Date>;
}

export interface SealAppointmentsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  consignment_id: string | null;
  appointment_type: string;
  scheduled_at: Date;
  status: Generated<string>;
  reference: string | null;
  created_at: Generated<Date>;
}

export interface SealDiscrepanciesTable {
  id: Generated<string>;
  tenant_id: string;
  container_id: string;
  discrepancy_type: string;
  severity: Generated<string>;
  description: string;
  status: Generated<string>;
  resolution_note: string | null;
  created_at: Generated<Date>;
}

export interface SealCustomsEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  lot_id: string;
  procedure_code: Generated<string>;
  jurisdiction: Generated<string>;
  declaration_date: DateOnly;
  hs_code: string;
  hs_code_ref_id: string | null;
  country_of_origin: string | null;
  invoice_value: string;
  freight: Generated<string>;
  insurance: Generated<string>;
  currency: string;
  fx_rate: string;
  valuation_method: Generated<string>;
  computation: string | null; // JSONB
  status: Generated<string>;
  submission_reference: string | null;
  payment_reference: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  doc_type: Generated<string>;
  filename: string;
  storage_key: string;
  size_bytes: number | null;
  status: Generated<string>;
  notes: string | null;
  uploaded_by: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  created_at: Generated<Date>;
}

export interface SealExaminationsTable {
  id: Generated<string>;
  tenant_id: string;
  customs_entry_id: string;
  selectivity_channel: Generated<string>;
  examination_type: Generated<string>;
  status: Generated<string>;
  officer_name: string | null;
  officer_reference: string | null;
  scheduled_at: Date | null;
  completed_at: Date | null;
  outcome: string | null;
  findings: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealStockAccountPeriodsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  period_start: DateOnly;
  period_end: DateOnly;
  status: Generated<string>;
  opening_lot_count: Generated<number>;
  closing_lot_count: Generated<number>;
  total_duty_at_risk: Generated<string>;
  total_tax_at_risk: Generated<string>;
  generated_at: Date | null;
  submission_reference: string | null;
  submitted_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SealStockAccountLinesTable {
  id: Generated<string>;
  tenant_id: string;
  period_id: string;
  lot_id: string;
  opening_qty: Generated<string>;
  received_qty: Generated<string>;
  released_qty: Generated<string>;
  adjusted_qty: Generated<string>;
  closing_qty: Generated<string>;
  closing_customs_status: string | null;
  duty_at_risk: Generated<string>;
  tax_at_risk: Generated<string>;
}

export interface SealDgSegregationRulesTable {
  id: Generated<string>;
  class_a: string;
  class_b: string;
  compatible: Generated<boolean>;
  note: string | null;
}

export interface SealReeferReadingsTable {
  id: Generated<string>;
  tenant_id: string;
  lot_id: string;
  recorded_at: Generated<Date>;
  temperature_c: string;
  within_range: boolean;
  recorded_by: string | null;
  note: string | null;
}

export interface SealYardSlotsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  code: string;
  capacity_teu: Generated<number>;
  active: Generated<boolean>;
}

export interface SealLedgerAnchorsTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  checkpoint_hash: string;
  snapshot: unknown; // JSONB [{lotId, movementId, hash}, ...]
  lot_count: number;
  ots_proof: Buffer;
  ots_proof_upgraded: Buffer | null;
  status: Generated<string>; // pending | confirmed | failed
  bitcoin_block_height: number | null;
  bitcoin_block_time: Date | null;
  trigger: string; // manual | scheduled
  requested_by: string | null;
  error_message: string | null;
  last_checked_at: Date | null;
  created_at: Generated<Date>;
}

export interface DeclarationLedgerAnchorsTable {
  id: Generated<string>;
  tenant_id: string;
  checkpoint_hash: string;
  snapshot: unknown; // JSONB [{declarationId, eventId, hash}, ...]
  declaration_count: number;
  ots_proof: Buffer;
  ots_proof_upgraded: Buffer | null;
  status: Generated<string>; // pending | confirmed | failed
  bitcoin_block_height: number | null;
  bitcoin_block_time: Date | null;
  trigger: string; // manual | scheduled
  requested_by: string | null;
  error_message: string | null;
  last_checked_at: Date | null;
  created_at: Generated<Date>;
}

export interface DeclarationEventsTable {
  id: Generated<string>;
  tenant_id: string;
  declaration_id: string;
  occurred_at: Generated<Date>;
  actor_id: string | null;
  event_type: string;
  payload: unknown; // JSONB
  prev_hash: string | null;
  hash: string;
}

export interface DomainEventsTable {
  id: Generated<string>;
  tenant_id: string;
  event_type: string;
  source_app: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown; // JSONB
  /**
   * Who performed this. NULL means a background job, or that it was never
   * recorded — not that nobody did it. Never inferred from the payload: the
   * keys that look like an actor (`userId`, `assignedTo`) name the subject of
   * the event, so reading them as the author attributes an action to the person
   * it was done to.
   */
  actor_id: string | null;
  created_at: Generated<Date>;
}

export interface SealFulfillmentOrdersTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  customer_id: string;
  reference: string;
  status: Generated<string>; // draft | picking | picked | packed | dispatched | cancelled
  vehicle_id: string | null;
  carrier_note: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  packed_at: Date | null;
  dispatched_at: Date | null;
}

export interface SealFulfillmentLinesTable {
  id: Generated<string>;
  tenant_id: string;
  order_id: string;
  lot_id: string;
  requested_qty: string;
  picked_qty: Generated<string>;
  packed: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SealDispatchRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  lot_id: string;
  requested_by_org_id: string;
  qty_requested: string;
  note: string | null;
  status: Generated<string>; // PENDING | APPROVED | REJECTED
  decided_by: string | null;
  decided_at: Date | null;
  fulfillment_order_id: string | null;
  created_at: Generated<Date>;
}

export interface SealAutomationRulesTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string | null;
  name: string;
  trigger_type: string; // lot_flagged | storage_expiring | examination_pending | low_stock
  threshold_value: string | null;
  action_type: string; // create_task | create_ticket
  action_assignee: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealAutomationRunsTable {
  id: Generated<string>;
  tenant_id: string;
  rule_id: string;
  subject_id: string;
  subject_type: string; // 'lot' | 'examination'
  status: Generated<string>; // open | resolved
  result_type: string | null;
  result_id: string | null;
  fired_at: Generated<Date>;
  resolved_at: Date | null;
}

export interface SealSensorDevicesTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  zone_id: string | null;
  location_id: string | null;
  device_id: string;
  device_type: string; // camera | occupancy_sensor | weight_sensor | door_sensor
  name: string;
  active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SealSensorReadingsTable {
  id: Generated<string>;
  tenant_id: string;
  device_id: string;
  reading_type: string; // occupancy_count | motion | weight_kg | door_state
  value: string;
  recorded_at: Generated<Date>;
  created_at: Generated<Date>;
}

export interface SealEquipmentTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string;
  equipment_type: string;
  asset_tag: string;
  name: string;
  status: Generated<string>; // operational | under_maintenance | out_of_service | retired
  condition: Generated<string>; // good | fair | poor
  last_service_date: DateOnlyNull;
  next_service_due_date: DateOnlyNull;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SealEquipmentMaintenanceRecordsTable {
  id: Generated<string>;
  tenant_id: string;
  equipment_id: string;
  maintenance_type: string; // inspection | repair | service | calibration
  performed_at: DateOnlyGenerated;
  performed_by_user_id: string | null;
  description: string | null;
  cost: string | null;
  next_due_date: DateOnlyNull;
  created_at: Generated<Date>;
}

export interface SealTasksTable {
  id: Generated<string>;
  tenant_id: string;
  compartment_id: string | null;
  lot_id: string | null;
  title: string;
  status: Generated<string>; // open | in_progress | complete | blocked
  priority: Generated<string>; // low | medium | high | urgent
  assigned_to: string | null;
  due_date: DateOnlyNull;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ChatChannelsTable {
  id: Generated<string>;
  tenant_id: string;
  type: 'channel' | 'dm' | 'group';
  name: string;
  description: string | null;
  created_by: string;
  created_at: Generated<Date>;
}

export interface ChatChannelMembersTable {
  channel_id: string;
  user_id: string;
  last_read_at: Generated<Date>;
  joined_at: Generated<Date>;
  is_favorite: Generated<boolean>;
}

export interface ChatMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  channel_id: string;
  author_id: string;
  content: string;
  created_at: Generated<Date>;
}

export interface ChatMessageReactionsTable {
  id: Generated<string>;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Generated<Date>;
}

export interface ShipmentListenersTable {
  id: Generated<string>;
  tenant_id: string;
  shipment_id: string;
  type: 'internal' | 'customer';
  user_id: string | null;
  name: string;
  role: string | null;
  channels: string; // JSONB: string[]
  created_at: Generated<Date>;
  created_by: string | null;
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
  /** The landed-cost card this actual belongs under, so an actual and the
   *  estimate it is compared against share one vocabulary. See CHARGE_HEADS. */
  charge_head: string | null;
  estimate_record_id: string | null;
}

export interface FinanceExpensesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  amount: number;
  expense_date: DateOnlyGenerated;
  category: string;
  shipment_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  payment_mode: string | null;
  reference: string | null;
  note: string | null;
  is_revenue: Generated<boolean>;
  attachment_data: string | null;
  efd_verified: boolean | null;
  efd_verified_at: Date | null;
  efd_error: string | null;
  retirement_status: Generated<string>; // not_required | pending | retired | short | written_off
  retired_by: string | null;
  retired_at: Date | null;
  retirement_note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  // Expense claims approval (M11, migration 340) — opt-in, off unless
  // tenant_settings.finance_expenses_require_approval is set.
  status: Generated<string>; // 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  submitted_at: Date | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
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
  period_start: DateOnly;
  period_end: DateOnly;
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
  reference_date: DateOnly;
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
  invoice_date: DateOnlyNull;
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
  arrival_date: DateOnlyNull;
  crn: string | null;
  bl_number: string | null;
  vessel_name: string | null;
  portal_of_bl: string | null;
  shipment_place: string | null;
  discharge_place: string | null;
  discharge_date: DateOnlyNull;
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
  preceding_tansad_date: DateOnlyNull;
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
  bill_date: DateOnlyNull;
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
  issue_date: DateOnlyNull;
  registration_date: DateOnlyNull;
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
  effective_from: DateOnly;
  effective_to: DateOnlyNull;
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
  discharge_date: DateOnlyNull;
  gate_out_date: DateOnlyNull;
  return_date: DateOnlyNull;
  free_days: number;
  total_days: number;
  demurrage_days: number;
  demurrage_cost: number;
  demurrage_currency: string;
  status: string;
  /** Who carries the demurrage charge — see migration 175. CUSTOMER (the
   *  default) means it is recoverable and recharged on the shipment's
   *  invoice; COMPANY means we were late and absorb it as an expense. */
  liable_party: Generated<string>;
  liability_reason: string | null;
  /** Set once a recoverable charge has been billed, so it cannot be
   *  recharged twice. Absorbed charges never get one. */
  recharged_invoice_id: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ═══════════════════════════════════════════════════════════════
// Quotations Tables
// ═══════════════════════════════════════════════════════════════

export interface CarriersTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  mode: string;
  scac_or_iata: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  active: Generated<boolean>;
  logo_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FreightRateCardsTable {
  id: Generated<string>;
  tenant_id: string;
  carrier_id: string;
  mode: string;
  origin_port: string;
  destination_port: string;
  cost_rate: number;
  sell_rate: number;
  currency: Generated<string>;
  valid_from: DateOnlyNull;
  valid_to: DateOnlyNull;
  notes: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CarrierRateContractsTable {
  id: Generated<string>;
  tenant_id: string;
  carrier_id: string;
  contract_reference: string | null;
  mode: string;
  origin_port: string;
  destination_port: string;
  buy_rate: number;
  currency: Generated<string>;
  transit_days: number | null;
  valid_from: DateOnlyNull;
  valid_to: DateOnlyNull;
  notes: string | null;
  active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FreightBookingsTable {
  id: Generated<string>;
  tenant_id: string;
  booking_number: string;
  customer_id: string;
  carrier_id: string | null;
  rate_card_id: string | null;
  mode: string;
  origin_port: string;
  destination_port: string;
  cargo_desc: string | null;
  quantity: Generated<number>;
  requested_ship_date: DateOnlyNull;
  status: Generated<string>;
  quoted_cost: number | null;
  quoted_sell: number | null;
  currency: Generated<string>;
  vessel_name: string | null;
  voyage_number: string | null;
  carrier_booking_ref: string | null;
  bl_number: string | null;
  awb_number: string | null;
  eta: DateOnlyNull;
  converted_shipment_id: string | null;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

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
  valid_from: DateOnlyNull;
  valid_until: DateOnlyNull;
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
  tax_code_id: string | null;
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
  due_date: DateOnlyNull;
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
  due_date: DateOnlyNull;
  note: string | null;
  description: string | null;
  labels: any; // JSONB string[]
  cover_color: string | null;
  created_by: string | null;
  product_id: string | null;
  service_name: string | null;
  service_rate: number | null;
  service_currency: string | null;
  service_unit: string | null;
  closed_by: string | null;    // who signed the task off (migration 220)
  closed_at: Date | null;      // when — NULL means still open
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
  due_date: DateOnlyNull;
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
  log_date: DateOnly;
  product_id: string | null;
  service_name: string | null;
  service_rate: number | null;
  service_currency: string | null;
  service_unit: string | null;
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
  due_date: DateOnlyNull;
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
  /** Minutes after the start before an arrival is late. */
  grace_minutes: Generated<number>;
  is_default: Generated<boolean>;
  active: Generated<boolean>;
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
  shift_id: string | null;
  /** Derived, never typed. null means not yet computed — not zero worked. */
  worked_minutes: number | null;
  overtime_minutes: number | null;
  /** How the record came to exist: a machine, or somebody typing. */
  method: Generated<'MANUAL' | 'WEB' | 'MOBILE' | 'BIOMETRIC' | 'IMPORT'>;
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
  /** Nullable: rows predating the ledger carry a free-text type only. */
  leave_type_id: string | null;
  /** How the approved days should be paid — sick leave is not one rate. */
  full_pay_days: string | null;
  reduced_pay_days: string | null;
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

/**
 * Leave entitlement. `cycle_months` is the field a "days per year" model does
 * not have: sick leave and maternity run on 36 months, not 12.
 */
export interface HrLeaveTypesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  days_entitled: string;
  cycle_months: Generated<number>;
  /** Days paid in full before the rate drops. null means all days are full pay. */
  full_pay_days: string | null;
  reduced_pay_pct: string | null;
  paid: Generated<boolean>;
  carry_forward_max: Generated<string>;
  requires_document: Generated<boolean>;
  applies_to: Generated<'ALL' | 'FEMALE' | 'MALE'>;
  min_service_months: Generated<number>;
  /** True where the entitlement comes from statute, not company policy. */
  statutory: Generated<boolean>;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrLeaveBalancesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  leave_type_id: string;
  /** Anchored to the employment anniversary, not the calendar year. */
  cycle_start: string;
  cycle_end: string;
  entitled: Generated<string>;
  carried_forward: Generated<string>;
  /** Derived from approved requests, never typed. */
  taken: Generated<string>;
  /** Held against the balance so two pending requests cannot both be approved. */
  pending: Generated<string>;
  adjustment: Generated<string>;
  adjustment_note: string | null;
  recomputed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Overtime, as something somebody approves — hours worked are a fact, hours
 * paid at a premium are an authorisation.
 */
export interface HrOvertimeRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  date: string;
  hours: string;
  /** Derived from the calendar, not chosen — nobody picks the cheaper rate. */
  kind: Generated<'NORMAL' | 'REST_DAY' | 'PUBLIC_HOLIDAY'>;
  /** The rate that applied on the day worked. A later change must not rewrite it. */
  rate_multiplier: Generated<string>;
  reason: string | null;
  status: Generated<'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  decision_note: string | null;
  paid_in_run_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrHolidaysTable {
  id: Generated<string>;
  tenant_id: string;
  date: string;
  name: string;
  type: Generated<string>;
  /** ISO 3166-1 alpha-2. Which country's calendar this belongs to. */
  country: string | null;
  local_name: string | null;
  /** MANUAL rows are the tenant's own and are never touched by a sync. */
  source: Generated<'MANUAL' | 'SYNCED' | 'COMPUTED'>;
  category: Generated<'PUBLIC' | 'RELIGIOUS' | 'INTERNATIONAL' | 'COMPANY'>;
  /** The date follows a moon sighting and may shift by a day. */
  is_provisional: Generated<boolean>;
  /** True means "worth noting, still a working day" — not a day off. */
  is_working_day: Generated<boolean>;
  synced_at: Date | null;
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
  revoked_at: Date | null;
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
  // Real typed FK (M15, migration 326) — an invoice-to-project link is
  // always the same target, unlike tasks' polymorphic subject_type/
  // subject_id (which varies by type), so a plain FK is simpler and correct.
  project_id: string | null;
  client_name: string | null;
  client_address: string;
  bl_number: string | null;
  origin: string | null;
  destination: string | null;
  // Migration 183 dropped the 'SEA' default and made NULL a real, meaningful
  // value ("not applicable" for a non-freight invoice) — this type had been
  // left declaring the column as always a string, silently out of sync with
  // what the database has actually allowed since that migration.
  mode: Generated<string | null>;
  bill_date: DateOnlyNull;
  due_date: DateOnlyNull;
  sale_agent: string | null;
  payment_terms: string | null;
  /** ISO 4217 code the invoice is settled in — migration 179. Lines may carry
   *  a different currency (a USD freight line on a TZS invoice is normal);
   *  those convert at exchange_rate. Never infer this from line_group. */
  currency: Generated<string>;
  /** Units of the invoice currency per one unit of a foreign line currency. */
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
  stamped_file_url: string | null;
  stamped_at: Date | null;
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
  /**
   * The tax *treatment*. `tax_pct` remains the rate that was actually charged;
   * this says which of the four 0% treatments it was, which is what a return
   * needs and a percentage cannot express. NULL = never recorded.
   */
  tax_code_id: string | null;
}

/**
 * Tenant-scoped tax treatments. `kind` carries the meaning, `rate` is a
 * consequence of it — see migration 180 for why a bare percentage was not
 * enough (TRA's TAXCODE 4 and 5 were unreachable by construction).
 */
export type TaxCodeKind =
  | 'STANDARD' | 'REDUCED' | 'ZERO_RATED' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';

export type TaxCodeScope = 'SALES' | 'PURCHASE' | 'BOTH';

/**
 * Lens — the internal developer record. Platform-scoped on purpose: these
 * tables carry no tenant_id, because a bug in FinOps is a fact about the
 * software, not about one customer's workspace. See migration 191.
 */
export interface LensAreasTable {
  id: string;
  name: string;
  kind: Generated<'APP' | 'PLATFORM' | 'INFRA' | 'INTEGRATION'>;
  description: string | null;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
}

export interface LensCyclesTable {
  id: Generated<string>;
  name: string;
  start_date: DateOnlyNull;
  end_date: DateOnlyNull;
  status: Generated<'PLANNING' | 'ACTIVE' | 'CLOSED'>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Statutory payroll. Rates and bands are rows rather than code so that a tenant
 * can hold its own, and so the next jurisdiction is a seed rather than a branch.
 */
export interface PayrollTaxBandsTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  residency: Generated<'RESIDENT' | 'NON_RESIDENT'>;
  seq: number;
  lower_bound: string;
  /** null is the open-ended top band, never a stand-in large number. */
  upper_bound: string | null;
  rate_pct: string;
  /** Cumulative tax at the foot of the band, as published. */
  fixed_amount: Generated<string>;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollContributionSchemesTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  code: string;
  name: string;
  employee_pct: Generated<string>;
  employer_pct: Generated<string>;
  calc_base: Generated<'BASIC' | 'GROSS' | 'TAXABLE'>;
  /** True for an approved retirement fund; false for health insurance. */
  reduces_tax_base: Generated<boolean>;
  /** Headcount floor before the scheme applies. 0 means always. */
  min_employees: Generated<number>;
  on_payslip: Generated<boolean>;
  active: Generated<boolean>;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollComponentTypesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  direction: 'EARNING' | 'DEDUCTION';
  taxable: Generated<boolean>;
  statutory: Generated<boolean>;
  default_amount: string | null;
  frequency: Generated<'MONTHLY' | 'ANNUAL' | 'ONE_OFF'>;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollEmployeeComponentsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  component_type_id: string;
  amount: string;
  effective_from: Date;
  effective_to: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollRunsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  period_year: number;
  period_month: number;
  period_start: Date;
  period_end: Date;
  jurisdiction: Generated<string>;
  status: Generated<'DRAFT' | 'CALCULATED' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'CANCELLED'>;
  /** Headcount when calculated — the levy thresholds depend on it. */
  employee_count: Generated<number>;
  total_gross: Generated<string>;
  total_net: Generated<string>;
  total_employee_deductions: Generated<string>;
  /** What employing these people costs beyond their pay — excludes income tax. */
  total_employer_cost: Generated<string>;
  /** Everything forwarded to the authorities, whoever it was withheld from. */
  total_remitted: Generated<string>;
  calculated_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PayrollPayslipsTable {
  id: Generated<string>;
  tenant_id: string;
  run_id: string;
  user_id: string;
  residency: Generated<'RESIDENT' | 'NON_RESIDENT'>;
  basic_pay: Generated<string>;
  gross_pay: Generated<string>;
  /** The tax base after the retirement-fund deduction. */
  taxable_pay: Generated<string>;
  income_tax: Generated<string>;
  employee_contributions: Generated<string>;
  other_deductions: Generated<string>;
  total_deductions: Generated<string>;
  employer_contributions: Generated<string>;
  net_pay: Generated<string>;
  /** Every line behind the totals, so a payslip explains itself. */
  lines: Generated<unknown>;
  created_at: Generated<Date>;
}

export interface LensItemsTable {
  id: Generated<string>;
  ref: string;
  kind: 'BUG' | 'FEATURE' | 'DEBT' | 'DECISION' | 'QUESTION' | 'RISK' | 'EPIC';
  title: string;
  body: string | null;
  area_id: string | null;
  status: Generated<'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'WONTFIX'>;
  severity: Generated<'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'>;
  /** CONFIRMED means somebody ran it. SUSPECTED is a reading of the code. */
  confidence: Generated<'CONFIRMED' | 'SUSPECTED' | 'UNVERIFIED'>;
  /** The proof, not a restatement of the problem. */
  evidence: string | null;
  waiting_on: string | null;
  refs: Generated<unknown>;
  tags: Generated<unknown>;
  created_by: string | null;
  resolved_at: Date | null;
  resolution: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  parent_id: string | null;
  cycle_id: string | null;
}

export interface LensIntegrationsTable {
  id: Generated<string>;
  provider: 'github' | 'slack' | 'jira' | 'linear' | 'circleci';
  status: Generated<'disconnected' | 'connected' | 'error'>;
  config: Generated<unknown>;
  /** Never returned by the API — endpoints report only whether one is present. */
  credential: string | null;
  webhook_secret: string | null;
  last_sync_at: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface LensLinksTable {
  id: Generated<string>;
  item_id: string;
  provider: 'github' | 'slack' | 'jira' | 'linear' | 'circleci';
  kind: string;
  external_id: string;
  url: string | null;
  title: string | null;
  /** Mirrored inward for display. Never closes a Lens item on its own. */
  external_status: string | null;
  synced_at: Date | null;
  created_at: Generated<Date>;
}

export interface LensColumnsTable {
  id: string;
  name: string;
  status: string;
  sort_order: Generated<number>;
  /** Shown, never enforced — a WIP limit is a prompt to a person. */
  wip_limit: number | null;
}

export interface LensEventsTable {
  id: Generated<string>;
  item_id: string;
  kind: string;
  detail: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: Generated<Date>;
}

/**
 * Whether a workspace may charge VAT in a jurisdiction. An absent row means
 * *unknown*, not *unregistered* — the two have different consequences.
 */
export interface TaxRegistrationsTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  regime: Generated<string>;
  status: 'registered' | 'not_registered' | 'pending' | 'deregistered';
  registration_number: string | null;
  basis: string | null;
  registered_from: DateOnlyNull;
  registered_to: DateOnlyNull;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Optional breakdown of a tax code into separately-named taxes. A code with no
 * component rows is a single tax at its own rate — which is every code in every
 * single-rate jurisdiction.
 */
export interface TaxCodeComponentsTable {
  id: Generated<string>;
  tax_code_id: string;
  sequence: Generated<number>;
  code: string;
  name: string;
  rate: number;
  /** NET, or NET_PLUS_PRIOR for a levy that compounds on the ones before it. */
  basis: Generated<'NET' | 'NET_PLUS_PRIOR'>;
  recoverable: Generated<boolean>;
  gl_account_code: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Reference data for onboarding a country. Never authoritative — see `as_of`. */
export interface TaxJurisdictionsTable {
  code: string;
  name: string;
  regime: Generated<string>;
  currency: string | null;
  standard_rate: number | null;
  threshold_amount: number | null;
  threshold_window_months: number | null;
  threshold_alt_amount: number | null;
  threshold_alt_window_months: number | null;
  registration_label: string | null;
  fiscalisation: string | null;
  /** True only for Tanzania — tra_* fields are EFDMS-specific. */
  uses_tra_codes: Generated<boolean>;
  as_of: DateOnly;
  source: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * A filing period, per tenant per jurisdiction.
 *
 * Closing one freezes every document dated inside it and stores the return as
 * filed. The snapshot is never recomputed — a figure that can change is not a
 * filed figure.
 */
export interface VatPeriodsTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  period_start: DateOnly;
  period_end: DateOnly;
  status: Generated<'open' | 'closed'>;
  return_snapshot: unknown | null;
  adjustment_entry_id: string | null;
  adjustment_amount: number | null;
  closed_at: Date | null;
  closed_by: string | null;
  reopened_at: Date | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaxCodesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  kind: TaxCodeKind;
  rate: Generated<number>;
  jurisdiction: string;
  /**
   * On a SALES code: whether making this supply allows recovery of tax on its
   * costs. On a PURCHASE code: whether the tax charged is deductible.
   */
  input_tax_recoverable: Generated<boolean>;
  /** 'SALES' | 'PURCHASE' | 'BOTH' — a blocked-input code has no meaning on a sale. */
  applies_to: Generated<TaxCodeScope>;
  /** TRA EFDMS <TAXCODE> 1–5, or null where TRA has no equivalent. */
  tra_tax_code: number | null;
  /** EFDMS <VATRATE> letter for the VATTOTALS grouping (A–E), or null. */
  tra_vat_rate: string | null;
  /** Tenant-written note on which supplies belong under this treatment, and why. */
  guidance: string | null;
  is_default: Generated<boolean>;
  status: Generated<string>;
  effective_from: DateOnlyNull;
  effective_to: DateOnlyNull;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InvoicePaymentsTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  amount: number;
  method: string | null;
  payment_date: DateOnlyNull;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface InvoiceNotesTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: Generated<Date>;
}

export interface InvoiceTasksTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  description: string;
  assignee: string | null;
  due_date: DateOnlyNull;
  done: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface InvoiceRemindersTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  remind_date: DateOnly;
  message: string;
  done: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface InvoiceActivityLogTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  created_at: Generated<Date>;
}

export interface BillActivityLogTable {
  id: Generated<string>;
  tenant_id: string;
  bill_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  created_at: Generated<Date>;
}

export interface CreditNotesTable {
  id: Generated<string>;
  tenant_id: string;
  credit_note_number: string;
  original_invoice_id: string | null;
  customer_id: string | null;
  client_name: string | null;
  client_address: Generated<unknown>;
  currency: Generated<string>;
  exchange_rate: Generated<number>;
  credit_date: DateOnlyNull;
  reason: string | null;
  status: Generated<'DRAFT' | 'POSTED' | 'VOID'>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CreditNoteLinesTable {
  id: Generated<string>;
  credit_note_id: string;
  name: string;
  unit: Generated<string>;
  rate: Generated<number>;
  qty: Generated<number>;
  tax_pct: Generated<number>;
  tax_code_id: string | null;
  line_group: Generated<string>;
  currency: Generated<string>;
  sort_order: Generated<number>;
}

export interface FixedAssetsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  category: Generated<string>;
  asset_account_code: Generated<string>;
  acquisition_date: string;
  cost: number;
  salvage_value: Generated<number>;
  useful_life_months: number;
  depreciation_method: Generated<'STRAIGHT_LINE'>;
  status: Generated<'ACTIVE' | 'DISPOSED'>;
  disposed_at: DateOnlyNull;
  disposal_proceeds: number | null;
  acquisition_journal_entry_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FixedAssetDepreciationEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  asset_id: string;
  period_date: string;
  amount: number;
  journal_entry_id: string | null;
  created_at: Generated<Date>;
}

export interface BudgetsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  fiscal_year: number;
  entity_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BudgetLinesTable {
  id: Generated<string>;
  budget_id: string;
  account_code: string;
  period_month: number;
  amount: Generated<number>;
}

export interface BankStatementsTable {
  id: Generated<string>;
  tenant_id: string;
  account_code: Generated<string>;
  bank_name: string | null;
  statement_date_from: string;
  statement_date_to: string;
  opening_balance: Generated<number>;
  closing_balance: Generated<number>;
  imported_by: string | null;
  created_at: Generated<Date>;
}

export interface BankStatementLinesTable {
  id: Generated<string>;
  bank_statement_id: string;
  txn_date: string;
  description: string | null;
  amount: number;
  matched_journal_line_id: string | null;
  matched_at: Date | null;
  matched_by: string | null;
}

export interface FxRatesTable {
  id: Generated<string>;
  rate_date: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: string | null;
  fetched_at: Generated<Date>;
}

export interface GlPeriodsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  period_type: Generated<'MONTH' | 'YEAR'>;
  period_start: string;
  period_end: string;
  status: Generated<'open' | 'closed'>;
  trial_balance_snapshot: Generated<unknown>;
  closing_entry_id: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  reopened_at: Date | null;
  reopened_by: string | null;
  reopen_reason: string | null;
  created_at: Generated<Date>;
}

export interface ProductsTable {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: Generated<string>;
  description: string | null;
  category: string | null;
  unit: Generated<string>;
  sale_price: Generated<number>;
  purchase_price: Generated<number>;
  currency: Generated<string>;
  tax_rate: Generated<number>;
  tax_code_id: string | null;
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomerProductPricesTable {
  id: Generated<string>;
  tenant_id: string;
  customer_id: string;
  product_id: string;
  price: Generated<number>;
  currency: Generated<string>;
  note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SsoProvidersTable {
  id: Generated<string>;
  tenant_id: string;
  provider_type: string;
  name: string;
  config: Generated<string>;
  enabled: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  // Real FK, additive alongside po_number (M8, migration 337) — a bill can
  // still carry a free-text PO reference with no matching record.
  po_id: string | null;
  bill_date: DateOnlyNull;
  due_date: DateOnlyNull;
  status: Generated<string>;
  currency: Generated<string>;
  /** Units of the reporting currency per one unit of `currency`. 1 = no conversion. */
  exchange_rate: Generated<number>;
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
  // AP approval workflow (M9, migration 338) — opt-in, off unless
  // tenant_settings.ap_approval_required is set.
  approval_workflow_id: string | null;
  submitted_for_approval_at: Date | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
}

export interface SupplierBillLinesTable {
  id: Generated<string>;
  bill_id: string;
  description: string;
  category: Generated<string>;
  qty: Generated<number>;
  unit_price: Generated<number>;
  tax_rate: Generated<number>;
  /** Decides whether the tax on this line is claimable. NULL = never recorded. */
  tax_code_id: string | null;
  // Withholding tax classification (M1, migration 331) — NULL means "not yet
  // classified," matching tax_code_id's own convention, not "not applicable."
  wht_rate_id: string | null;
  sort_order: Generated<number>;
}

export interface BillPaymentsTable {
  id: Generated<string>;
  tenant_id: string;
  bill_id: string;
  amount: number;
  currency: Generated<string>;
  payment_date: DateOnlyNull;
  method: string | null;
  reference: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface WhtRateReferenceTable {
  id: Generated<string>;
  jurisdiction: string;
  category: string;
  payee_type: string;
  rate_pct: string; // NUMERIC — pg returns as string
  as_of: DateOnly;
  source: string | null;
  created_at: Generated<Date>;
}

export interface WhtRatesTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  category: string;
  payee_type: string;
  rate_pct: string; // NUMERIC — pg returns as string
  trigger: Generated<string>; // 'PAYMENT' | 'ACCRUAL'
  effective_from: DateOnly;
  effective_to: DateOnlyNull;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WhtDeductionsTable {
  id: Generated<string>;
  tenant_id: string;
  bill_id: string;
  bill_payment_id: string;
  supplier_id: string | null;
  gross_amount: string; // NUMERIC
  wht_amount: string; // NUMERIC
  journal_entry_id: string | null;
  certificate_number: string | null;
  certificate_issued_at: Date | null;
  remittance_id: string | null;
  created_at: Generated<Date>;
}

export interface WhtRemittancesTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: Generated<string>;
  period_start: DateOnly;
  period_end: DateOnly;
  total_amount: string; // NUMERIC
  paid_at: Date | null;
  reference: string | null;
  status: Generated<string>; // 'PENDING' | 'PAID'
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface CitRateReferenceTable {
  id: Generated<string>;
  jurisdiction: string;
  category: string;
  rate_pct: string; // NUMERIC
  duration_years: number | null;
  as_of: DateOnly;
  source: string | null;
  created_at: Generated<Date>;
}

export interface CitRatesTable {
  id: Generated<string>;
  tenant_id: string;
  jurisdiction: string;
  category: string;
  rate_pct: string; // NUMERIC
  effective_from: DateOnly;
  effective_to: DateOnlyNull;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CitAdjustmentsTable {
  id: Generated<string>;
  tenant_id: string;
  period_start: DateOnly;
  period_end: DateOnly;
  category: string; // 'DISALLOWED_EXPENSE' | 'FINE_PENALTY' | 'EXEMPT_INCOME' | 'OTHER'
  description: string;
  amount: string; // NUMERIC, signed
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface CitReturnsTable {
  id: Generated<string>;
  tenant_id: string;
  period_start: DateOnly;
  period_end: DateOnly;
  accounting_profit: string; // NUMERIC
  book_depreciation: string; // NUMERIC
  tax_depreciation: string; // NUMERIC
  adjustments_total: string; // NUMERIC
  taxable_income: string; // NUMERIC
  rate_category: string;
  rate_pct: string; // NUMERIC
  rate_source: Generated<string>; // 'TENANT' | 'REFERENCE_DEFAULT'
  is_amt: Generated<boolean>;
  turnover: string | null; // NUMERIC
  tax_liability: string; // NUMERIC
  status: Generated<string>; // 'DRAFT' | 'ACCRUED'
  journal_entry_id: string | null;
  computed_by: string | null;
  computed_at: Generated<Date>;
  accrued_at: Date | null;
}

export interface CitInstallmentsTable {
  id: Generated<string>;
  tenant_id: string;
  cit_return_id: string | null;
  period_start: DateOnly;
  period_end: DateOnly;
  due_date: DateOnlyNull;
  amount: string; // NUMERIC
  status: Generated<string>; // 'PENDING' | 'PAID'
  paid_at: Date | null;
  reference: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface DeferredTaxComputationsTable {
  id: Generated<string>;
  tenant_id: string;
  as_of_date: DateOnly;
  rate_pct: string; // NUMERIC
  gross_temporary_difference: string; // NUMERIC
  target_dta_balance: Generated<string>; // NUMERIC
  target_dtl_balance: Generated<string>; // NUMERIC
  prior_dta_balance: Generated<string>; // NUMERIC
  prior_dtl_balance: Generated<string>; // NUMERIC
  journal_entry_id: string | null;
  computed_by: string | null;
  computed_at: Generated<Date>;
}

export interface CustomerCreditsTable {
  id: Generated<string>;
  tenant_id: string;
  customer_id: string | null;
  amount: string; // NUMERIC
  source_invoice_id: string | null;
  reason: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface CustomerCreditApplicationsTable {
  id: Generated<string>;
  tenant_id: string;
  credit_id: string;
  invoice_id: string;
  amount: string; // NUMERIC
  journal_entry_id: string | null;
  applied_by: string | null;
  applied_at: Generated<Date>;
}

export interface ApApprovalWorkflowsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  min_amount: Generated<string>; // NUMERIC
  approver_user_id: string;
  approver_backup_user_id: string | null;
  active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FxRevaluationsTable {
  id: Generated<string>;
  tenant_id: string;
  period_date: DateOnly;
  subject_type: string; // 'AR_INVOICE' | 'AP_BILL'
  subject_id: string;
  currency: string;
  open_balance_fc: string; // NUMERIC
  comparison_rate: string; // NUMERIC
  current_rate: string; // NUMERIC
  gain_loss: string; // NUMERIC
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface DividendsTable {
  id: Generated<string>;
  tenant_id: string;
  declared_date: DateOnly;
  amount: string; // NUMERIC
  description: string | null;
  status: Generated<string>; // 'DECLARED' | 'PAID'
  journal_entry_id: string | null;
  paid_at: DateOnlyNull;
  paid_journal_entry_id: string | null;
  reference: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface RecurringInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string | null;
  customer_id: string | null;
  // Retainer billing (M16, migration 327) — a recurring invoice scoped to
  // a project, e.g. a monthly retainer. Null for every recurring invoice
  // that isn't project-tied, which is most of them.
  project_id: string | null;
  client_name: string | null;
  frequency: Generated<string>;
  currency: Generated<string>;
  amount: Generated<number>;
  tax_rate: Generated<number>;
  tax_code_id: string | null;
  description: string | null;
  payment_terms: string | null;
  next_due: DateOnlyNull;
  end_date: DateOnlyNull;
  state: Generated<string>;
  invoices_generated: Generated<number>;
  total_billed: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  tax_code_id: string | null;
  category: Generated<string>;
  description: string | null;
  payment_terms: string | null;
  next_due: DateOnlyNull;
  end_date: DateOnlyNull;
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

export interface ReportDefinitionsTable {
  id: Generated<string>;
  name: string;
  app_id: string;
  metric_key: string;
  filters: Generated<Record<string, any>>;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ReportRunsTable {
  id: Generated<string>;
  report_definition_id: string | null;
  app_id: string;
  metric_key: string;
  filters: Generated<Record<string, any>>;
  status: Generated<string>;
  row_count: number | null;
  duration_ms: number | null;
  run_by: string;
  started_at: Generated<Date>;
  error: string | null;
}

export interface QueryBuilderRunsTable {
  id: Generated<string>;
  mode: string;
  table_name: string | null;
  columns: Generated<any[]> | null;
  filters: Generated<Record<string, any>> | null;
  raw_sql: string | null;
  status: Generated<string>;
  row_count: number | null;
  duration_ms: number | null;
  run_by: string;
  started_at: Generated<Date>;
  error: string | null;
}

export interface PackagesTable {
  id: Generated<string>;
  code: string;
  name: string;
  monthly_price: number;
  annual_price: number;
  max_users: number;
  price_per_seat: number | null;      // USD/user/month — NULL only for the custom-pricing (enterprise) tier
  monthly_item_limit: number | null;  // billable items/month across the whole platform — NULL = unlimited
  trade_wizard_monthly_searches: number | null;  // Trade Compliance Wizard runs/month — NULL = unlimited
  storage_limit_bytes: string | null; // BIGINT, comes back from pg as a string — NULL = unlimited (Cloud storage quota)
  features: string[];           // JSONB — auto-parsed to a native array by the pg driver
  color: string | null;
  popular: Generated<boolean>;
  is_active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantUsageCountersTable {
  tenant_id: string;
  period: string;   // 'YYYY-MM'
  count: Generated<number>;
  updated_at: Generated<Date>;
}

export interface PackageAppQuotasTable {
  package_code: string;
  app_id: string;
  monthly_limit: number;
  updated_at: Generated<Date>;
}

export interface TenantAppUsageCountersTable {
  tenant_id: string;
  app_id: string;
  period: string;   // 'YYYY-MM'
  count: Generated<number>;
  updated_at: Generated<Date>;
}

export interface TaskListsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
}

export interface TasksTable {
  id: string;
  tenant_id: string;
  user_id: string;
  list_id: string;
  title: string;
  notes: string | null;
  // Plain 'YYYY-MM-DD' in, Date out — never passed through JS Date parsing on
  // the way in, so there's no local-vs-UTC day-shift risk (see date-picker.tsx's
  // parseDateOnly/toDateOnlyString for the same concern on the frontend).
  due: DateOnlyNull;
  // Optional companion to `due` — plain 'HH:MM:SS' in and out, same
  // never-touches-JS-Date reasoning as `due` itself.
  due_time: string | null;
  // Real start date (migration 321) — needed for a Gantt bar to have a real
  // span instead of a single due-date point.
  start_date: DateOnlyNull;
  // Recurring tasks (M18, migration 328) — set together: a rule means this
  // task is the recurrence anchor, next_due is when the daily job next
  // clones it. Null on every plain, non-recurring task (almost all of them)
  // and on every clone the job itself creates.
  recurrence_rule: Record<string, unknown> | null; // JSONB — {freq:'daily'|'weekly'|'monthly', interval:number}
  recurrence_next_due: DateOnlyNull;
  starred: Generated<boolean>;
  someday: Generated<boolean>;
  status: Generated<string>;
  tags: string[]; // JSONB — auto-parsed to a native array by the pg driver
  completed: Generated<boolean>;
  completed_at: ColumnType<Date | null, string | null, string | null>;
  deleted_at: ColumnType<Date | null, string | null, string | null>;
  sort_order: Generated<number>;
  // A colleague tagged via EntityPicker (migration 283) — not resolved from
  // any org-chart, which this platform doesn't reliably have (see
  // migration 276_petti_workflows.sql). Null = unassigned; the owner
  // (user_id) always retains full control regardless of who it's assigned to.
  assignee_id: string | null;
  // Real reminder — mirrors notes' reminder_at/reminder_notified_at pair
  // (265_notes_app.sql/282_notes_enterprise.sql) exactly; see
  // jobs/task-reminder.job.ts for the fire-once-then-guard logic.
  reminder_at: ColumnType<Date | null, string | null, string | null>;
  reminder_notified_at: ColumnType<Date | null, string | null, string | null>;
  // 'low' | 'medium' | 'high' | 'urgent' (migration 307) — was displayed in
  // the UI (badges/filters/Kanban columns) long before it had a real column;
  // see TaskTimeEntriesTable below for the timer's identical history.
  priority: Generated<string>;
  // Projects/Milestones (migration 308, tasks.advanced-gated) — null on
  // every plain personal task, exactly as before this migration.
  project_id: string | null;
  milestone_id: string | null;
  is_private: Generated<boolean>;
  // Billable/hourly rate (migration 310, tasks.advanced).
  is_billable: Generated<boolean>;
  hourly_rate: string | null; // NUMERIC — pg returns as string
  // "Related To" polymorphic link (migration 311, tasks.advanced) — same
  // subject_type/subject_id convention as notes.subject_type etc.
  subject_type: string | null;
  subject_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Real activity feed (migration 310, tasks.advanced) — distinct from
 *  todo_comments; the old "Comments & Activity" tab only ever rendered
 *  comments despite the label. */
export interface TaskActivityLogTable {
  id: string;
  tenant_id: string;
  task_id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown>; // JSONB
  created_at: Generated<Date>;
}

/** A shared, tenant-wide project (migration 308) — unlike task_lists (a
 *  personal, single-owner grouping), this is a real multi-person container
 *  with its own roster (ProjectMembersTable) and milestones. Part of the
 *  standalone Projects app's 'projects' (HuduPlus+) entitlement. */
export interface ProjectsTable {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: Generated<string>;
  status: Generated<string>; // 'not_started' | 'in_progress' | 'on_hold' | 'cancelled' | 'finished' (migration 314)
  owner_id: string;
  start_date: DateOnlyNull;
  target_date: DateOnlyNull;
  // Enterprise fields (migration 314).
  ref: string | null; // e.g. 'PRJ-0001', via getNextDocNumber
  customer_id: string | null;
  billing_type: Generated<string>; // 'fixed' | 'hourly'
  total_rate: string | null; // NUMERIC — pg returns as string
  currency: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  // Fixed-rate double-billing guard (M15, migration 326) — a flat-rate
  // project has no per-row source to stamp like the hourly path's
  // task_time_entries.invoice_id, so this timestamp is the guard instead.
  invoiced_at: ColumnType<Date | null, string | null, string | null>;
}

export interface ProjectMembersTable {
  id: string;
  tenant_id: string;
  project_id: string;
  user_id: string;
  role: Generated<string>; // 'owner' | 'member' | 'viewer'
  added_at: Generated<Date>;
}

/** Multi-person roster on top of the single `tasks.assignee_id` (migration
 *  309, tasks.advanced) — the plural Assignees/Followers pickers. */
export interface TaskCollaboratorsTable {
  id: string;
  tenant_id: string;
  task_id: string;
  user_id: string;
  kind: string; // 'assignee' | 'follower'
  added_at: Generated<Date>;
}

export interface TaskDependenciesTable {
  id: string;
  tenant_id: string;
  task_id: string;
  depends_on_task_id: string;
  created_at: Generated<Date>;
}

export interface ProjectDiscussionsTable {
  id: string;
  tenant_id: string;
  project_id: string;
  author_id: string;
  content: string;
  mentions: Array<{ user_id: string; name: string }>; // JSONB
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProjectPinsTable {
  id: string;
  tenant_id: string;
  project_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface StoreInstalledAppsTable {
  id: string;
  tenant_id: string;
  app_id: string;
  installed_by: string | null;
  installed_at: Generated<Date>;
}

export interface ProjectTemplatesTable {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  billing_type: string | null;
  snapshot: Record<string, unknown>; // JSONB — { milestones: [...], tasks: [...] }
  created_by: string;
  created_at: Generated<Date>;
}

export interface ProjectActivityLogTable {
  id: string;
  tenant_id: string;
  project_id: string;
  actor_id: string;
  action: string;
  detail: Record<string, unknown>; // JSONB
  created_at: Generated<Date>;
}

export interface MilestonesTable {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  description: string | null;
  due_date: DateOnlyNull;
  status: Generated<string>; // 'upcoming' | 'in_progress' | 'completed'
  sort_order: Generated<number>;
  created_at: Generated<Date>;
}

/** Real Contracts (migration 316) — a hardcoded-sample version existed once
 *  (073_contracts.sql), was dropped for having no real backend at all
 *  (075_drop_contracts.sql), and was rebuilt here for real, this time with
 *  a real PDF and (once wired) real e-signature via sign_envelopes. */
export interface ContractsTable {
  id: string;
  tenant_id: string;
  ref: string | null;
  customer_id: string;
  project_id: string | null;
  subject: string;
  value: string | null; // NUMERIC — pg returns as string
  currency: Generated<string>;
  type: string | null;
  start_date: DateOnlyNull;
  end_date: DateOnlyNull;
  description: string | null;
  content: string | null; // the actual contract body/terms text (migration 317)
  status: Generated<string>; // 'active' | 'void'
  sign_envelope_id: string | null;
  owner_id: string;
  deleted_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContractRenewalsTable {
  id: string;
  tenant_id: string;
  contract_id: string;
  actor_id: string;
  previous_end_date: DateOnlyNull;
  new_end_date: DateOnlyNull;
  note: string | null;
  created_at: Generated<Date>;
}

export interface ContractCommentsTable {
  id: string;
  tenant_id: string;
  contract_id: string;
  author_id: string;
  content: string;
  created_at: Generated<Date>;
}

/** Real start/stop time entries (migration 307) — TaskTimerWidget in
 *  TasksApp.tsx already rendered a stopwatch off client-only state that
 *  reset on every reload; this is what actually persists it. At most one
 *  open (ended_at null) row per task, enforced by a partial unique index. */
export interface TaskTimeEntriesTable {
  id: string;
  tenant_id: string;
  task_id: string;
  user_id: string;
  started_at: ColumnType<Date, string, string>;
  ended_at: ColumnType<Date | null, string | null, string | null>;
  duration_minutes: number | null;
  created_at: Generated<Date>;
  // Real-billing double-billing guard (M15, migration 326) — stamped when
  // this entry is invoiced, mirroring vehicle_expenses.invoice_id.
  invoice_id: string | null;
}

export interface TaskSubtasksTable {
  id: string;
  /** Backfilled from the parent task in 285_tasks_calendar_rls.sql — every
   *  other RLS'd table in this platform has its own tenant_id column. */
  tenant_id: string;
  task_id: string;
  title: string;
  completed: Generated<boolean>;
  sort_order: Generated<number>;
}

export interface TodoCommentsTable {
  id: Generated<string>;
  tenant_id: string;
  task_id: string;
  author_id: string;
  content: string;
  mentions: Array<{ user_id: string; name: string }>; // JSONB
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaskListSharesTable {
  id: string;
  tenant_id: string;
  list_id: string;
  user_id: string;
  role: string; // 'viewer' | 'editor'
  shared_by: string;
  created_at: Generated<Date>;
}

export interface CalendarEventsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  // Full UTC ISO string in (frontend converts local wall-clock -> UTC before
  // sending), Date out — see calendarStore.ts's localToUTCISO/utcISOToLocal.
  start_at: ColumnType<Date, string, string>;
  end_at: ColumnType<Date, string, string>;
  description: string | null;
  location: string | null;
  category: Generated<string>;
  /** [{userId, email, name, status: 'pending'|'accepted'|'declined'}] —
   *  reshaped from a plain string[] of emails in 286_calendar_v2.sql. */
  guests: any; // JSONB
  all_day: Generated<boolean>;
  /** Overrides the category color when set (286_calendar_v2.sql). */
  color: string | null;
  /** {freq, interval, byWeekday?, until?, count?} or null — see
   *  services/calendar-recurrence.service.ts for the expansion logic. */
  recurrence: any; // JSONB
  reminder_offsets: number[]; // native int[]
  /** IANA zone name, e.g. 'Africa/Dar_es_Salaam' — set only when the event
   *  was created/edited with an explicit timezone rather than the browser's
   *  own (287_calendar_v3.sql). */
  timezone: string | null;
  /** Set when this event is a booking made through one of this user's own
   *  booking_pages (287_calendar_v3.sql). */
  booking_page_id: string | null;
  /** 'google' | 'outlook' | null — set when this event is a read-only
   *  mirror pulled in by calendar-external-sync.job.ts (287_calendar_v3.sql).
   *  external_id is that provider's own event id, used to upsert rather
   *  than duplicate on every sync pass. */
  external_source: string | null;
  external_id: string | null;
  /** A real, joinable Jitsi Meet room URL (https://meet.jit.si/<id>), or
   *  null when no video call was added (343_calendar_video_meeting.sql). */
  meeting_url: string | null;
  /** {startWithVideoMuted?, startWithAudioMuted?} — applied as Jitsi's own
   *  documented URL hash config at join time, never stored in meeting_url
   *  itself so the shareable room link stays stable regardless of who last
   *  changed these (343_calendar_video_meeting.sql). */
  meeting_settings: any; // JSONB
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** A public scheduling link (287_calendar_v3.sql) — booking creates a real
 *  calendar_events row (booking_page_id set, the booker as a guest with
 *  userId null) rather than a separate bookings table. */
export interface BookingPagesTable {
  id: string;
  tenant_id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_minutes: Generated<number>;
  buffer_minutes: Generated<number>;
  working_days: number[]; // native int[], 0=Sun..6=Sat
  working_start_time: Generated<string>;
  working_end_time: Generated<string>;
  timezone: Generated<string>;
  booking_window_days: Generated<number>;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** One user's connection to an external calendar provider
 *  (287_calendar_v3.sql) — the OAuth app registration itself
 *  (client_id/client_secret) lives on tenant_settings.settings.calendarSync,
 *  same split as mail-oauth's own email client_id/secret. */
export interface CalendarSyncConnectionsTable {
  id: string;
  tenant_id: string;
  user_id: string;
  provider: string; // 'google' | 'outlook'
  access_token: string | null;  // encrypted (onsite-secrets.service.ts's encryptSecret)
  refresh_token: string | null; // encrypted
  token_expires_at: ColumnType<Date, string, string> | null;
  status: Generated<string>; // 'disconnected' | 'authorized' | 'error'
  last_synced_at: ColumnType<Date, string, string> | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ── SMS app (288_sms_app.sql) ──────────────────────────────────────────
export interface SmsGroupsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SmsGroupMembersTable {
  id: Generated<string>;
  tenant_id: string;
  group_id: string;
  phone: string;
  name: string | null;
  contact_id: string | null;
  contact_source: string | null; // 'contact' | 'lead' | 'customer' | 'user' | null
  created_at: Generated<Date>;
}

export interface SmsTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  body: string;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SmsCampaignsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  body: string;
  template_id: string | null;
  group_id: string | null;
  status: Generated<string>; // 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
  scheduled_at: ColumnType<Date, string, string> | null;
  sent_at: ColumnType<Date, string, string> | null;
  total_recipients: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SmsMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  to_number: string;
  body: string;
  status: Generated<string>; // 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered'
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  segments: Generated<number>;
  source_app: string;
  campaign_id: string | null;
  template_id: string | null;
  contact_name: string | null;
  attempts: Generated<number>;
  sent_at: ColumnType<Date, string, string> | null;
  delivered_at: ColumnType<Date, string, string> | null;
  created_at: Generated<Date>;
}

// ── SMS gateways, sender IDs, opt-outs, inbound (289_sms_gateways_and_compliance.sql) ──
export interface SmsGatewaysTable {
  id: Generated<string>;
  tenant_id: string;
  provider: string; // 'africas_talking' | 'twilio' | 'nexmo' | 'bongolive'
  label: string;
  credentials: string; // encrypted JSON blob (encryptJson/decryptJson)
  sender_id: string | null;
  priority: Generated<number>;
  active: Generated<boolean>;
  last_used_at: ColumnType<Date, string, string> | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SmsSenderIdsTable {
  id: Generated<string>;
  tenant_id: string;
  gateway_id: string;
  sender_id: string;
  label: string | null;
  is_default: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SmsOptOutsTable {
  id: Generated<string>;
  tenant_id: string;
  phone: string;
  reason: Generated<string>; // 'stop_keyword' | 'manual'
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface SmsInboundMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  gateway_id: string | null;
  from_number: string;
  body: string;
  matched_keyword: string | null;
  created_at: Generated<Date>;
}

/** A single-occurrence exception to a recurring event — skip it, or
 *  override its time/title/description/location (286_calendar_v2.sql). */
export interface CalendarEventOverridesTable {
  id: string;
  tenant_id: string;
  event_id: string;
  occurrence_date: DateOnly;
  is_cancelled: Generated<boolean>;
  title: string | null;
  start_at: ColumnType<Date, string, string> | null;
  end_at: ColumnType<Date, string, string> | null;
  description: string | null;
  location: string | null;
  created_at: Generated<Date>;
}

/** Guards the reminder job against re-notifying the same occurrence twice
 *  (286_calendar_v2.sql) — see notes-reminder.job.ts for the equivalent on
 *  a non-recurring record. */
export interface CalendarEventReminderSendsTable {
  event_id: string;
  occurrence_start: ColumnType<Date, string, string>;
  offset_minutes: number;
  tenant_id: string;
  sent_at: Generated<Date>;
}

export interface UserAppSettingsTable {
  user_id: string;
  tenant_id: string;
  calendar_default_view: Generated<string>;
  week_starts_monday: Generated<boolean>;
  tasks_default_view: Generated<string>;
  updated_at: Generated<Date>;
}

export interface ApiKeysTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];           // JSONB — auto-parsed to a native array by the pg driver
  acting_role: string;
  created_by: string | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  /** When the key stops working; NULL means never (migration 212). */
  expires_at: Date | null;
  /** Safe methods only (GET/HEAD/OPTIONS) when true (migration 212). */
  read_only: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface ApiUsageEventsTable {
  id: Generated<string>;
  tenant_id: string;
  api_key_id: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  created_at: Generated<Date>;
}

export interface PackageFeaturesTable {
  package_code: string;
  feature_key: string;
  created_at: Generated<Date>;
}

export interface AppStatusTable {
  app_id: string;
  status: Generated<string>;
  message: string | null;
  updated_by: string | null;
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

/** Platform-level audit trail. Deliberately cross-tenant; SUPER_ADMIN only. */
export interface PlatformActivityLogTable {
  id: Generated<string>;
  actor_user_id: string | null;
  // Snapshots, not joins: an audit trail that resolves names by join stops
  // being able to say who did something once that user is deleted.
  actor_name: string;
  action: string;
  category: 'company' | 'user' | 'billing' | 'system';
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  /** The company an action was *about* — null for platform-wide actions. */
  tenant_id: string | null;
  metadata: Generated<unknown>;
  created_at: Generated<Date>;
}

export interface PlatformDomainsTable {
  id: Generated<string>;
  tenant_id: string;
  domain: string;
  verification_token: string;
  status: Generated<'pending' | 'active' | 'failed'>;
  // Set only by a probe that actually succeeded, never on create.
  dns_verified_at: Date | null;
  ssl_verified_at: Date | null;
  ssl_expires_at: Date | null;
  last_checked_at: Date | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  eta_initial: Date | null;     // captured once on create, preserved across retracks
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
  /** Which app this ticket originated from, e.g. 'onsite' — null for every
   *  other channel. See migration 248_support_tickets_source_app.sql. */
  source_app: string | null;
  // Real project link (M13, migration 324) — nullable, a ticket doesn't
  // have to be about any particular project.
  project_id: string | null;
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
  /** No CHECK constraint on this VARCHAR(50) column — 'ORG' added for the
   *  org-portal reply route (org.routes.ts), same free-form column CUSTOMER
   *  already used. */
  author_type: 'OFFICER' | 'CUSTOMER' | 'SYSTEM' | 'ORG';
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

// ── Inventory Control (standalone app) ────────────────────────────────
export interface InventoryWarehousesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  address: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InventoryLocationsTable {
  id: Generated<string>;
  tenant_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  location_type: Generated<string>; // bin | shelf | floor | staging
  is_pickable: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface InventoryItemsTable {
  id: Generated<string>;
  tenant_id: string;
  sku: string;
  name: string;
  product_id: string | null;
  base_uom: Generated<string>;
  item_type: Generated<string>; // raw_material | finished_good | retail | consumable
  is_batch_tracked: Generated<boolean>;
  reorder_point: string | null;
  reorder_qty: string | null;
  active: Generated<boolean>;
  /** Running weighted-average cost, per item (not per location/batch) —
   *  recomputed on every 'receipt' movement, read (unchanged) by 'issue'
   *  movements to post COGS. */
  avg_cost: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface InventoryItemUomsTable {
  id: Generated<string>;
  tenant_id: string;
  item_id: string;
  uom_code: string;
  conversion_factor: string;
}

export interface InventoryMovementsTable {
  id: Generated<string>;
  tenant_id: string;
  occurred_at: Generated<Date>;
  actor_id: string | null;
  actor_type: Generated<string>;
  movement_type: string; // receipt | issue | transfer | adjust | count_correction
  item_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  qty_delta: string; // always in base_uom
  entered_qty: string;
  entered_uom: string;
  batch_no: Generated<string>;
  expiry_date: DateOnlyNull;
  reason_code: string | null;
  reference: string | null;
  /** Only meaningful on a 'receipt' — the price paid for this batch. */
  unit_cost: number | null;
  /** Only meaningful on an 'issue' — qty * the item's avg_cost at the
   *  moment this movement posted (COGS), not recomputed later. */
  total_cost: number | null;
  created_at: Generated<Date>;
}

export interface InventoryStockLevelsTable {
  tenant_id: string;
  item_id: string;
  location_id: string;
  batch_no: Generated<string>;
  expiry_date: DateOnlyNull;
  qty_on_hand: Generated<string>;
  updated_at: Generated<Date>;
}

export interface InventoryCountSessionsTable {
  id: Generated<string>;
  tenant_id: string;
  warehouse_id: string;
  status: Generated<string>; // open | posted | cancelled
  started_at: Generated<Date>;
  posted_at: Date | null;
  created_by: string | null;
  notes: string | null;
}

export interface InventoryCountLinesTable {
  id: Generated<string>;
  tenant_id: string;
  session_id: string;
  item_id: string;
  location_id: string;
  batch_no: Generated<string>;
  expected_qty: string;
  counted_qty: string | null;
  counted_at: Date | null;
  counted_by: string | null;
}

export interface InventoryTasksTable {
  id: Generated<string>;
  tenant_id: string;
  item_id: string | null;
  warehouse_id: string | null;
  title: string;
  status: Generated<string>; // open | in_progress | complete | blocked
  priority: Generated<string>; // low | medium | high | urgent
  assigned_to: string | null;
  due_date: DateOnlyNull;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}


// ── eSign App Tables ─────────────────────────────────────────────────────────

export interface SignEnvelopesTable {
  id: Generated<string>;
  tenant_id: string;
  created_by: string;
  title: string;
  message: string | null;
  file_id: string | null;
  file_name: string | null;
  document_data: string | null;
  status: Generated<string>; // sign_envelope_status enum
  order_mode: Generated<string>; // sign_order_mode enum
  template_id: string | null;
  require_otp: Generated<boolean>;
  expires_at: Date | null;
  sent_at: Date | null;
  completed_at: Date | null;
  voided_at: Date | null;
  void_reason: string | null;
  verification_code: Generated<string | null>;
  stamp_applied: Generated<boolean>;
  stamped_at: Date | null;
  stamped_file_url: string | null;
  ots_proof: Buffer | null;
  ots_proof_upgraded: Buffer | null;
  anchor_hash: string | null;
  anchor_status: string | null;
  anchor_block_height: number | null;
  anchor_block_time: Date | null;
  anchor_checked_at: Date | null;
  // Versioning (migration 342) — set when this envelope was created via
  // POST /envelopes/:id/amend on a completed one that needed correcting.
  previous_version_id: string | null;
  version_number: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SignRecipientsTable {
  id: Generated<string>;
  envelope_id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  role_label: string | null;
  sign_order: Generated<number>;
  status: Generated<string>; // sign_recipient_status enum
  token: Generated<string>;
  signature_data: string | null;
  signed_at: Date | null;
  declined_at: Date | null;
  decline_reason: string | null;
  viewed_at: Date | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  otp_code_hash: string | null;
  otp_expires_at: Date | null;
  otp_verified_at: Date | null;
  // Certified True Copy (migration 342) — real facts about a licensed
  // advocate/notary/commissioner recipient, not the tenant's own stamp.
  is_certifier: Generated<boolean>;
  certifier_title: string | null;
  certifier_roll_number: string | null;
  certifier_firm: string | null;
  created_at: Generated<Date>;
}

export interface SignFieldsTable {
  id: Generated<string>;
  envelope_id: string;
  tenant_id: string;
  recipient_id: string;
  field_type: string; // sign_field_type enum
  page: Generated<number>;
  x: number;
  y: number;
  width: number;
  height: number;
  required: Generated<boolean>;
  placeholder: string | null;
  value: string | null;
  created_at: Generated<Date>;
}

export interface SignEventsTable {
  id: Generated<string>;
  envelope_id: string;
  tenant_id: string;
  recipient_id: string | null;
  event_type: string; // sign_event_type enum
  actor_name: string | null;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  note: string | null;
  created_at: Generated<Date>;
}

export interface SignTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  created_by: string;
  name: string;
  description: string | null;
  fields: unknown; // JSONB SignTemplateFieldDef[]
  recipients: unknown; // JSONB SignTemplateRecipientDef[]
  file_id: string | null;
  file_name: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SignVerificationsTable {
  id: Generated<string>;
  envelope_id: string | null;
  tenant_id: string | null;
  verification_code: string;
  looked_up_at: Generated<Date>;
  ip_address: string | null;
  user_agent: string | null;
  result: string;
}

export interface SignStampsTable {
  id: Generated<string>;
  tenant_id: string;
  owner_type: string; // 'tenant' | 'user'
  owner_user_id: string | null;
  image_data: string;
  label: string | null;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SignStampRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  requested_by: string;
  approver_id: string;
  target_type: string | null;
  target_ref: string | null;
  note: string | null;
  status: Generated<string>; // 'pending' | 'approved' | 'declined'
  decision_note: string | null;
  created_at: Generated<Date>;
  decided_at: Date | null;
}

/** Draft document edit history (345_sign_document_versions.sql) — distinct
 *  from SignEnvelopesTable's own previous_version_id/version_number chain,
 *  which links whole separate envelopes created by amending an already-
 *  COMPLETED document. This is a lighter snapshot list for a still-draft
 *  envelope's working document, taken on each real content change. */
export interface SignDocumentVersionsTable {
  id: string;
  tenant_id: string;
  envelope_id: string;
  version_number: number;
  document_data: string;
  file_name: string | null;
  change_summary: string;
  change_details: any; // JSONB — shape varies per tool, see sign-versions.routes.ts
  created_by: string | null;
  created_by_name: string;
  created_at: Generated<Date>;
}

export interface PlatformSigningIdentitiesTable {
  id: Generated<string>;
  label: string;
  encrypted_p12: string;
  subject: string;
  issuer: string;
  is_self_signed: boolean;
  not_before: Date;
  not_after: Date;
  verified_at: Date | null;
  enabled: Generated<boolean>;
  uploaded_by: string;
  created_at: Generated<Date>;
}

export interface Database {
  inventory_warehouses: InventoryWarehousesTable;
  inventory_locations: InventoryLocationsTable;
  inventory_items: InventoryItemsTable;
  inventory_item_uoms: InventoryItemUomsTable;
  inventory_movements: InventoryMovementsTable;
  inventory_stock_levels: InventoryStockLevelsTable;
  inventory_count_sessions: InventoryCountSessionsTable;
  inventory_count_lines: InventoryCountLinesTable;
  inventory_tasks: InventoryTasksTable;
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
  organizations: OrganizationsTable;
  organization_users: OrganizationUsersTable;
  customer_claim_codes: CustomerClaimCodesTable;
  leads: LeadsTable;
  crm_search_history: CrmSearchHistoryTable;
  notes: NotesTable;
  note_labels: NoteLabelsTable;
  note_user_state: NoteUserStateTable;
  note_shares: NoteSharesTable;
  note_revisions: NoteRevisionsTable;
  shipment_cases: ShipmentCasesTable;
  stage_history: StageHistoryTable;
  workflows: WorkflowsTable;
  workflow_steps: WorkflowStepsTable;
  workflow_templates: WorkflowTemplatesTable;
  workflow_learning_signals: WorkflowLearningSignalsTable;
  workflow_template_proposals: WorkflowTemplateProposalsTable;
  activity_monitor_settings: ActivityMonitorSettingsTable;
  activity_samples: ActivitySamplesTable;
  workflow_instances: WorkflowInstancesTable;
  workflow_instance_events: WorkflowInstanceEventsTable;
  workflow_comm_queue: WorkflowCommQueueTable;
  workflow_step_runs: WorkflowStepRunsTable;
  seal_compartments: SealCompartmentsTable;
  seal_zones: SealZonesTable;
  seal_locations: SealLocationsTable;
  seal_lots: SealLotsTable;
  seal_movements: SealMovementsTable;
  seal_guarantees: SealGuaranteesTable;
  seal_bond_overrides: SealBondOverridesTable;
  seal_consignments: SealConsignmentsTable;
  seal_containers: SealContainersTable;
  seal_appointments: SealAppointmentsTable;
  seal_discrepancies: SealDiscrepanciesTable;
  seal_customs_entries: SealCustomsEntriesTable;
  seal_documents: SealDocumentsTable;
  seal_examinations: SealExaminationsTable;
  seal_stock_account_periods: SealStockAccountPeriodsTable;
  seal_stock_account_lines: SealStockAccountLinesTable;
  seal_dg_segregation_rules: SealDgSegregationRulesTable;
  seal_reefer_readings: SealReeferReadingsTable;
  seal_yard_slots: SealYardSlotsTable;
  seal_ledger_anchors: SealLedgerAnchorsTable;
  domain_events: DomainEventsTable;
  seal_tasks: SealTasksTable;
  seal_equipment: SealEquipmentTable;
  seal_equipment_maintenance_records: SealEquipmentMaintenanceRecordsTable;
  seal_sensor_devices: SealSensorDevicesTable;
  seal_sensor_readings: SealSensorReadingsTable;
  seal_automation_rules: SealAutomationRulesTable;
  seal_automation_runs: SealAutomationRunsTable;
  seal_fulfillment_orders: SealFulfillmentOrdersTable;
  seal_fulfillment_lines: SealFulfillmentLinesTable;
  seal_dispatch_requests: SealDispatchRequestsTable;
  shipment_listeners: ShipmentListenersTable;
  chat_channels: ChatChannelsTable;
  chat_channel_members: ChatChannelMembersTable;
  chat_messages: ChatMessagesTable;
  chat_message_reactions: ChatMessageReactionsTable;
  case_documents: CaseDocumentsTable;
  expenses: ExpensesTable;
  finance_expenses: FinanceExpensesTable;
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
  declaration_events: DeclarationEventsTable;
  declaration_ledger_anchors: DeclarationLedgerAnchorsTable;
  // Demurrage Engine
  demurrage_tariffs: DemurrageTariffsTable;
  container_tracking: ContainerTrackingTable;
  // Quotations
  quotations: QuotationsTable;
  quotation_lines: QuotationLinesTable;
  carriers: CarriersTable;
  freight_rate_cards: FreightRateCardsTable;
  carrier_rate_contracts: CarrierRateContractsTable;
  freight_bookings: FreightBookingsTable;
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
  hr_clock_sessions: HrClockSessionsTable;
  hr_clock_breaks: HrClockBreaksTable;
  user_presence: UserPresenceTable;
  hr_timesheet_approvals: HrTimesheetApprovalsTable;
  hr_job_openings: HrJobOpeningsTable;
  hr_candidates: HrCandidatesTable;
  hr_interviews: HrInterviewsTable;
  bliss_calls: BlissCallsTable;
  bliss_meetings: BlissMeetingsTable;
  bliss_meeting_participants: BlissMeetingParticipantsTable;
  bliss_meeting_polls: BlissMeetingPollsTable;
  bliss_meeting_poll_votes: BlissMeetingPollVotesTable;
  bliss_meeting_questions: BlissMeetingQuestionsTable;
  bliss_meeting_question_upvotes: BlissMeetingQuestionUpvotesTable;
  bliss_meeting_transcript_lines: BlissMeetingTranscriptLinesTable;
  bliss_meeting_waiting_room: BlissMeetingWaitingRoomTable;
  bliss_meeting_breakout_rooms: BlissMeetingBreakoutRoomsTable;
  bliss_meeting_breakout_assignments: BlissMeetingBreakoutAssignmentsTable;
  bliss_meeting_summaries: BlissMeetingSummariesTable;
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
  invoice_notes: InvoiceNotesTable;
  invoice_tasks: InvoiceTasksTable;
  invoice_reminders: InvoiceRemindersTable;
  invoice_activity_log: InvoiceActivityLogTable;
  credit_notes: CreditNotesTable;
  credit_note_lines: CreditNoteLinesTable;
  fixed_assets: FixedAssetsTable;
  fixed_asset_depreciation_entries: FixedAssetDepreciationEntriesTable;
  budgets: BudgetsTable;
  budget_lines: BudgetLinesTable;
  bank_statements: BankStatementsTable;
  bank_statement_lines: BankStatementLinesTable;
  fx_rates: FxRatesTable;
  gl_periods: GlPeriodsTable;
  bill_activity_log: BillActivityLogTable;
  tax_codes: TaxCodesTable;
  // Statutory payroll. Tenant-scoped like everything else here — every query
  // still needs its own explicit tenant_id filter.
  hr_overtime_requests: HrOvertimeRequestsTable;
  hr_leave_types: HrLeaveTypesTable;
  hr_leave_balances: HrLeaveBalancesTable;
  payroll_tax_bands: PayrollTaxBandsTable;
  payroll_contribution_schemes: PayrollContributionSchemesTable;
  payroll_component_types: PayrollComponentTypesTable;
  payroll_employee_components: PayrollEmployeeComponentsTable;
  payroll_runs: PayrollRunsTable;
  payroll_payslips: PayrollPayslipsTable;
  // Lens — platform-scoped, no tenant_id by design.
  lens_areas: LensAreasTable;
  lens_cycles: LensCyclesTable;
  lens_items: LensItemsTable;
  lens_events: LensEventsTable;
  lens_integrations: LensIntegrationsTable;
  lens_links: LensLinksTable;
  lens_columns: LensColumnsTable;
  vat_periods: VatPeriodsTable;
  tax_registrations: TaxRegistrationsTable;
  tax_code_components: TaxCodeComponentsTable;
  tax_jurisdictions: TaxJurisdictionsTable;
  // Suppliers / Vendors
  products: ProductsTable;
  customer_product_prices: CustomerProductPricesTable;
  suppliers: SuppliersTable;
  // Ondi (Identity & Access)
  sso_providers: SsoProvidersTable;
  // Supplier Bills
  supplier_bills: SupplierBillsTable;
  supplier_bill_lines: SupplierBillLinesTable;
  bill_payments: BillPaymentsTable;
  wht_rate_reference: WhtRateReferenceTable;
  wht_rates: WhtRatesTable;
  wht_deductions: WhtDeductionsTable;
  wht_remittances: WhtRemittancesTable;
  cit_rate_reference: CitRateReferenceTable;
  cit_rates: CitRatesTable;
  cit_adjustments: CitAdjustmentsTable;
  cit_returns: CitReturnsTable;
  cit_installments: CitInstallmentsTable;
  deferred_tax_computations: DeferredTaxComputationsTable;
  dividends: DividendsTable;
  fx_revaluations: FxRevaluationsTable;
  ap_approval_workflows: ApApprovalWorkflowsTable;
  customer_credits: CustomerCreditsTable;
  customer_credit_applications: CustomerCreditApplicationsTable;
  recurring_bills: RecurringBillsTable;
  recurring_invoices: RecurringInvoicesTable;
  // Tenant Settings
  tenant_settings: TenantSettingsTable;
  report_definitions: ReportDefinitionsTable;
  report_runs: ReportRunsTable;
  query_builder_runs: QueryBuilderRunsTable;
  // Signup / Onboarding
  packages: PackagesTable;
  tenant_usage_counters: TenantUsageCountersTable;
  package_app_quotas: PackageAppQuotasTable;
  tenant_app_usage_counters: TenantAppUsageCountersTable;
  platform_transactions: PlatformTransactionsTable;
  platform_activity_log: PlatformActivityLogTable;
  platform_domains: PlatformDomainsTable;
  task_lists: TaskListsTable;
  tasks: TasksTable;
  task_subtasks: TaskSubtasksTable;
  task_time_entries: TaskTimeEntriesTable;
  task_dependencies: TaskDependenciesTable;
  projects: ProjectsTable;
  project_members: ProjectMembersTable;
  milestones: MilestonesTable;
  contracts: ContractsTable;
  contract_renewals: ContractRenewalsTable;
  project_activity_log: ProjectActivityLogTable;
  project_templates: ProjectTemplatesTable;
  project_pins: ProjectPinsTable;
  store_installed_apps: StoreInstalledAppsTable;
  project_discussions: ProjectDiscussionsTable;
  contract_comments: ContractCommentsTable;
  task_collaborators: TaskCollaboratorsTable;
  task_activity_log: TaskActivityLogTable;
  todo_comments: TodoCommentsTable;
  task_list_shares: TaskListSharesTable;
  calendar_events: CalendarEventsTable;
  calendar_event_overrides: CalendarEventOverridesTable;
  calendar_event_reminder_sends: CalendarEventReminderSendsTable;
  booking_pages: BookingPagesTable;
  calendar_sync_connections: CalendarSyncConnectionsTable;
  sms_groups: SmsGroupsTable;
  sms_group_members: SmsGroupMembersTable;
  sms_templates: SmsTemplatesTable;
  sms_campaigns: SmsCampaignsTable;
  sms_messages: SmsMessagesTable;
  sms_gateways: SmsGatewaysTable;
  sms_sender_ids: SmsSenderIdsTable;
  sms_opt_outs: SmsOptOutsTable;
  sms_inbound_messages: SmsInboundMessagesTable;
  user_app_settings: UserAppSettingsTable;
  // AWB / BL Tracking
  tracking_snapshots: TrackingSnapshotsTable;
  // General Ledger
  chart_of_accounts: ChartOfAccountsTable;
  journal_entries: JournalEntriesTable;
  accounting_entities: AccountingEntitiesTable;
  intercompany_transactions: IntercompanyTransactionsTable;
  journal_lines: JournalLinesTable;
  // Purchase Orders
  purchase_orders: PurchaseOrdersTable;
  purchase_order_lines: PurchaseOrderLinesTable;
  // Accounting Integrations
  accounting_integrations: AccountingIntegrationsTable;
  accounting_marketplace_requests: AccountingMarketplaceRequestsTable;
  email_messages: EmailMessagesTable;
  email_templates: EmailTemplatesTable;
  email_outbox: EmailOutboxTable;
  shipment_report_shares: ShipmentReportSharesTable;
  transit_route_rates: TransitRouteRatesTable;
  petti_wallets: PettiWalletsTable;
  petti_workflows: PettiWorkflowsTable;
  petti_deposits: PettiDepositsTable;
  petti_withdrawal_requests: PettiWithdrawalRequestsTable;
  petti_transfers: PettiTransfersTable;
  petti_flags: PettiFlagsTable;
  petti_counters: PettiCountersTable;
  accounting_sync_logs: AccountingSyncLogsTable;
  accounting_integration_entity_map: AccountingIntegrationEntityMapTable;
  user_totp: UserTotpTable;
  ondi_credentials: OndiCredentialsTable;
  ondi_auth_events: OndiAuthEventsTable;
  ondi_kyc_submissions: OndiKycSubmissionsTable;
  ondi_org_kyb: OndiOrgKybTable;
  ondi_org_roles: OndiOrgRolesTable;
  ondi_org_role_members: OndiOrgRoleMembersTable;
  ondi_org_access_requests: OndiOrgAccessRequestsTable;
  ondi_org_access_request_approvals: OndiOrgAccessRequestApprovalsTable;
  ondi_oidc_signing_keys: OndiOidcSigningKeysTable;
  ondi_oauth_clients: OndiOauthClientsTable;
  ondi_oauth_consents: OndiOauthConsentsTable;
  workflow_studio_apps: WorkflowStudioAppsTable;
  workflow_studio_runs: WorkflowStudioRunsTable;
  announcements: AnnouncementsTable;
  announcement_dismissals: AnnouncementDismissalsTable;
  ai_conversations: AiConversationsTable;
  ai_messages: AiMessagesTable;
  ai_memory: AiMemoryTable;
  payment_methods: PaymentMethodsTable;
  subscription_invoices: SubscriptionInvoicesTable;
  invoice_sequences: InvoiceSequencesTable;
  platform_support_tickets: PlatformSupportTicketsTable;
  platform_support_attachments: PlatformSupportAttachmentsTable;
  platform_support_messages: PlatformSupportMessagesTable;
  // Onsite Infrastructure Platform
  onsite_projects: OnsiteProjectsTable;
  onsite_domains: OnsiteDomainsTable;
  onsite_dns_zones: OnsiteDnsZonesTable;
  onsite_dns_records: OnsiteDnsRecordsTable;
  onsite_ssl_certificates: OnsiteSslCertificatesTable;
  onsite_websites: OnsiteWebsitesTable;
  onsite_applications: OnsiteApplicationsTable;
  onsite_environments: OnsiteEnvironmentsTable;
  onsite_secrets: OnsiteSecretsTable;
  onsite_deployments: OnsiteDeploymentsTable;
  onsite_servers: OnsiteServersTable;
  onsite_provider_connections: OnsiteProviderConnectionsTable;
  onsite_health_checks: OnsiteHealthChecksTable;
  onsite_health_check_results: OnsiteHealthCheckResultsTable;
  onsite_backups: OnsiteBackupsTable;
  agency_managed_tenants: AgencyManagedTenantsTable;
  onsite_agency_profiles: OnsiteAgencyProfilesTable;
  referral_commissions: ReferralCommissionsTable;
  // NexusHR Core
  hr_legal_entities: HrLegalEntitiesTable;
  hr_locations: HrLocationsTable;
  hr_cost_centers: HrCostCentersTable;
  hr_job_catalog: HrJobCatalogTable;
  hr_compensations: HrCompensationsTable;
  hr_compensation_components: HrCompensationComponentsTable;
  // NexusHR Workflows
  // NexusHR Documents & Assets
  hr_documents: HrDocumentsTable;
  hr_contracts: HrContractsTable;
  hr_emergency_contacts: HrEmergencyContactsTable;
  hr_document_templates: HrDocumentTemplatesTable;
  hr_document_requirements: HrDocumentRequirementsTable;
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
  contact_sync_connections: ContactSyncConnectionsTable;
  // ComplyOS
  comply_certificates:   ComplyCertificatesTable;
  comply_applications:   ComplyApplicationsTable;
  comply_obligations:    ComplyObligationsTable;
  comply_renewals:       ComplyRenewalsTable;
  comply_agency_syncs:   ComplyAgencySyncsTable;
  comply_agency_directory: ComplyAgencyDirectoryTable;
  comply_reminders:        ComplyRemindersTable;
  comply_profiles:              ComplyProfilesTable;
  comply_obligation_rules:      ComplyObligationRulesTable;
  comply_legal_firms:        ComplyLegalFirmsTable;
  comply_legal_engagements: ComplyLegalEngagementsTable;
  comply_legal_milestones:  ComplyLegalMilestonesTable;
  comply_legal_messages:    ComplyLegalMessagesTable;
  comply_brela_search_history: ComplyBrelaSearchHistoryTable;
  comply_license_catalog: ComplyLicenseCatalogTable;
  // CMS (platform pages + OneSite tenant pages)
  cms_pages: CmsPagesTable;
  cms_posts: CmsPostsTable;
  cms_comments: CmsCommentsTable;
  // TRA VFD Integration
  tra_vfd_config: TraVfdConfigTable;
  // Customs Intelligence Suite
  hs_codes: HsCodesTable;
  carrier_directory: CarrierDirectoryTable;
  trade_institutions: TradeInstitutionsTable;
  trade_procedures: TradeProceduresTable;
  trade_procedure_steps: TradeProcedureStepsTable;
  trade_procedure_prechecks: TradeProcedurePrechecksTable;
  trade_wizard_usage_counters: TradeWizardUsageCountersTable;
  trade_wizard_runs: TradeWizardRunsTable;
  trade_wizard_searches: TradeWizardSearchesTable;
  wma_hs_codes: WmaHsCodesTable;
  compliance_check_log: ComplianceCheckLogTable;
  icd_directory: IcdDirectoryTable;
  clearing_agents_registry: ClearingAgentsRegistryTable;
  eac_excise_schedules: EacExciseSchedulesTable;
  port_tariff_items: PortTariffItemsTable;
  clearos_rate_card_items: ClearosRateCardItemsTable;
  landed_cost_shares: LandedCostSharesTable;
  reference_countries: ReferenceCountriesTable;
  landed_cost_share_leads: LandedCostShareLeadsTable;
  customs_penalties: CustomsPenaltiesTable;
  sanctions_entries: SanctionsEntriesTable;
  sanctions_aliases: SanctionsAliasesTable;
  sanctions_sync_runs: SanctionsSyncRunsTable;
  sanctions_screenings: SanctionsScreeningsTable;
  dangerous_goods_reference: DangerousGoodsReferenceTable;
  dg_declarations: DgDeclarationsTable;
  origin_rules: OriginRulesTable;
  certificates_of_origin: CertificatesOfOriginTable;
  delivery_documents: DeliveryDocumentsTable;
  delivery_document_lines: DeliveryDocumentLinesTable;
  depot_equipment: DepotEquipmentTable;
  equipment_interchange_receipts: EquipmentInterchangeReceiptsTable;
  landed_cost_records: LandedCostRecordsTable;
  hudubi_widget_definitions: HuduBIWidgetDefinitionsTable;
  hs_classification_events: HsClassificationEventsTable;
  trade_wizard_outcomes: TradeWizardOutcomesTable;
  compliance_outcomes: ComplianceOutcomesTable;
  vessel_positions: VesselPositionsTable;
  geofences: GeofencesTable;
  geofence_events: GeofenceEventsTable;
  // Tracking (Vehicle GPS)
  vehicles: VehiclesTable;
  vehicle_assignments: VehicleAssignmentsTable;
  vehicle_positions: VehiclePositionsTable;
  vehicle_issue_events: VehicleIssueEventsTable;
  vehicle_sensor_snapshots: VehicleSensorSnapshotsTable;
  vehicle_geofence_events: VehicleGeofenceEventsTable;
  drivers: DriversTable;
  vehicle_vendors: VehicleVendorsTable;
  trips: TripsTable;
  maintenance_records: MaintenanceRecordsTable;
  parts_stock: PartsStockTable;
  fuel_logs: FuelLogsTable;
  vehicle_documents: VehicleDocumentsTable;
  fleet_reminders: FleetRemindersTable;
  driver_messages: DriverMessagesTable;
  fleet_alerts: FleetAlertsTable;
  warehouse_locations: WarehouseLocationsTable;
  warehouse_dock_appointments: WarehouseDockAppointmentsTable;
  cargo_manifests: CargoManifestsTable;
  cargo_items: CargoItemsTable;
  vehicle_issues: VehicleIssuesTable;
  vehicle_expenses: VehicleExpensesTable;
  vehicle_meter_readings: VehicleMeterReadingsTable;
  // Cloud / Drive File Manager
  cloud_files: CloudFilesTable;
  cloud_file_shares: CloudFileSharesTable;
  cloud_file_comments: CloudFileCommentsTable;
  cloud_file_versions: CloudFileVersionsTable;
  cloud_storage_connections: CloudStorageConnectionsTable;
  cloud_external_files: CloudExternalFilesTable;
  cloud_drives: CloudDrivesTable;
  cloud_drive_members: CloudDriveMembersTable;
  // Entitlements (package-gated features + per-app maintenance status)
  package_features: PackageFeaturesTable;
  app_status: AppStatusTable;
  // Public/partner API layer
  api_keys: ApiKeysTable;
  api_usage_events: ApiUsageEventsTable;
  // eSign — signature envelopes, recipients, fields, audit trail, templates
  sign_envelopes: SignEnvelopesTable;
  sign_recipients: SignRecipientsTable;
  sign_fields: SignFieldsTable;
  sign_events: SignEventsTable;
  sign_templates: SignTemplatesTable;
  sign_verifications: SignVerificationsTable;
  sign_stamps: SignStampsTable;
  sign_stamp_requests: SignStampRequestsTable;
  sign_document_versions: SignDocumentVersionsTable;
  platform_signing_identities: PlatformSigningIdentitiesTable;
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
  dc_date: DateOnlyNull;
  gross_total: Generated<number>;            // Cumulative TZS total ever fiscalized (not a receipt count)
  // Z-Report tracking
  last_zreport_date: DateOnlyNull;
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
  unit: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CarrierDirectoryTable {
  id: Generated<string>;
  name: string;
  mode: string;              // 'OCEAN' | 'AIR' | 'ROAD' | 'RAIL'
  scac_or_iata: string | null;
  country: string | null;
  region: string | null;
  website: string | null;
  source_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TradeInstitutionsTable {
  id: Generated<string>;
  name: string;
  acronym: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source_url: string | null;
  scraped_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TradeProceduresTable {
  id: Generated<string>;
  source_id: number | null;
  name: string;
  kind: string;                    // 'IMPORT' | 'EXPORT' | 'TRANSIT' | 'REGISTRATION'
  product_keywords: string | null;
  summary: string | null;
  has_detail: Generated<boolean>;
  source_url: string | null;
  scraped_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TradeProcedureStepsTable {
  id: Generated<string>;
  procedure_id: string;
  step_no: number;
  name: string;
  description: string | null;
  institution_id: string | null;
  duration_estimate: string | null;
  cost_estimate: string | null;
  required_documents: string[];    // real JSONB — node-postgres auto-parses to a native array
  is_online: Generated<boolean>;
  source_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TradeProcedurePrechecksTable {
  id: Generated<string>;
  procedure_id: string;
  question: string;
  help_text: string | null;
  options: { value: string; label: string }[];  // real JSONB — auto-parsed
  sort_order: Generated<number>;
}

export interface TradeWizardUsageCountersTable {
  tenant_id: string;
  period: string;                  // 'YYYY-MM'
  searches: Generated<number>;
}

export interface TradeWizardRunsTable {
  id: Generated<string>;
  tenant_id: string;
  procedure_id: string;
  answers: Record<string, string>; // real JSONB — auto-parsed
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface TradeWizardSearchesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  query: string | null;
  kind: string | null;
  results_count: Generated<number>;
  matched_procedure_id: string | null;
  created_at: Generated<Date>;
}

export interface ComplianceCheckLogTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  hs_code: string;
  hs_description: string | null;
  origin_country: string;
  total_checks: number;
  required_count: number;
  risk_level: string;
  created_at: Generated<Date>;
}

export interface WmaHsCodesTable {
  id: Generated<string>;
  hs_code_from: string;
  hs_code_to: string;
  hs_code_display: string;
  hs_description: string | null;
  sheet: 'A' | 'B';
  wma_class: string;
  act_description: string | null;
  schedule_ref: string | null;
  obligation_trigger: string;
  confidence: 'direct' | 'derived' | 'broad';
  notes: string | null;
  rigid_container_qty: string | null;
  other_container_qty: string | null;
  source_note: string | null;
  scraped_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IcdDirectoryTable {
  id: Generated<string>;
  operator_type: string;
  name: string;
  email: string | null;
  tel: string | null;
  address: string | null;
  region: string | null;
  license_no: string | null;
  license_start: DateOnlyNull;
  license_exp: DateOnlyNull;
  source_url: string | null;
  scraped_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ClearingAgentsRegistryTable {
  id: Generated<string>;
  name: string;
  email: string | null;
  license_no: string | null;
  region: string | null;
  address: string | null;
  tel: string | null;
  source_url: string | null;
  scraped_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EacExciseSchedulesTable {
  id: Generated<string>;
  category: string;
  item_description: string;
  tz_rate: string | null;
  ke_rate: string | null;
  ug_rate: string | null;
  rw_rate: string | null;
  bi_rate: string | null;
  source_url: string | null;
  scraped_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PortTariffItemsTable {
  id: Generated<string>;
  authority: string;
  clause_ref: string | null;
  category: string;
  subcategory: string | null;
  item_name: string;
  unit: string | null;
  cargo_type: string | null;
  container_size: string | null;
  rate_amount: string | null;
  rate_currency: Generated<string>;
  rate_type: Generated<string>;
  min_charge: string | null;
  free_period: string | null;
  source_document: string;
  source_page: string | null;
  notes: string | null;
  is_placeholder: Generated<boolean>;
  status: Generated<string>;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ClearosRateCardItemsTable {
  id: Generated<string>;
  tenant_id: string;
  card: string;
  category: string;
  code: string | null;
  charge_name: string;
  unit: string | null;
  rate_amount: Generated<string>;
  rate_currency: Generated<string>;
  /** Floor for per-CBM/per-kg rates (LCL, Air). NULL = no minimum applies —
   *  distinct from 0, which would be a real (zero) floor. */
  min_charge: string | null;
  notes: string | null;
  sort_order: Generated<number>;
  icd_operator_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface LandedCostSharesTable {
  id: Generated<string>;
  token: string;
  tenant_id: string;
  hs_code: string | null;
  description: string | null;
  customer_name: string | null;
  payload: any;
  view_count: Generated<number>;
  unlock_count: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  expires_at: Date | null;
}

export interface LandedCostShareLeadsTable {
  id: Generated<string>;
  share_id: string;
  tenant_id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  lead_id: string | null;
  created_at: Generated<Date>;
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

export interface SanctionsEntriesTable {
  id: Generated<string>;
  source: string;
  source_uid: string;
  entry_type: string;
  primary_name: string;
  programs: string | null;
  listed_on: Date | null;
  remarks: string | null;
  raw: unknown | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SanctionsAliasesTable {
  id: Generated<string>;
  entry_id: string;
  alias_name: string;
}

export interface SanctionsSyncRunsTable {
  id: Generated<string>;
  source: string;
  started_at: Generated<Date>;
  completed_at: Date | null;
  status: Generated<string>;
  entries_count: number | null;
  error: string | null;
}

export interface SanctionsScreeningsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: string;
  subject_id: string | null;
  screened_name: string;
  best_match_entry_id: string | null;
  best_match_name: string | null;
  best_match_score: number | null;
  status: Generated<string>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DangerousGoodsReferenceTable {
  id: Generated<string>;
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  air_transport_restriction: string | null;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface DgDeclarationsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  subject_id: string | null;
  transport_mode: string;
  reference_id: string | null;
  un_number: string;
  proper_shipping_name: string;
  class_or_division: string;
  subsidiary_risk: string | null;
  packing_group: string | null;
  packaging_type: string | null;
  number_of_packages: number | null;
  net_quantity: number | null;
  quantity_unit: string | null;
  air_transport_restriction: string | null;
  shipper_name: string;
  shipper_address: string | null;
  consignee_name: string;
  consignee_address: string | null;
  emergency_contact: string | null;
  additional_handling_info: string | null;
  status: Generated<string>;
  issued_by: string | null;
  issued_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OriginRulesTable {
  id: Generated<string>;
  agreement_code: string;
  hs_match: string;
  description: string;
  criteria_type: string;
  criteria_text: string;
  max_non_originating_pct: number | null;
  source_citation: string;
  created_at: Generated<Date>;
}

export interface CertificatesOfOriginTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  subject_id: string | null;
  agreement_code: string;
  hs_code: string;
  country_of_origin: string;
  matched_rule_id: string | null;
  eligibility_status: string;
  eligibility_basis: string | null;
  non_originating_value_pct: number | null;
  wholly_obtained_confirmed: boolean | null;
  exporter_name: string | null;
  exporter_address: string | null;
  consignee_name: string | null;
  consignee_address: string | null;
  goods_description: string | null;
  invoice_number: string | null;
  certificate_number: string | null;
  status: Generated<string>;
  issued_by: string | null;
  issued_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  doc_type: string;
  doc_number: string | null;
  subject_type: Generated<string>;
  subject_id: string | null;
  invoice_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  delivery_address: string | null;
  city: string | null;
  containers: Generated<unknown>;
  carrier_name: string | null;
  vessel_voyage: string | null;
  driver_name: string | null;
  vehicle_no: string | null;
  driver_contact: string | null;
  release_conditions: string | null;
  discrepancy_notes: string | null;
  valid_from: Date | null;
  valid_until: Date | null;
  delivery_date: Date | null;
  status: Generated<string>;
  issued_by: string | null;
  issued_at: Date | null;
  dispatched_at: Date | null;
  delivered_at: Date | null;
  used_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryDocumentLinesTable {
  id: Generated<string>;
  document_id: string;
  description: string;
  qty_ordered: Generated<number>;
  qty_delivered: Generated<number>;
  unit: string | null;
  condition: string | null;
  remarks: string | null;
  sort_order: Generated<number>;
}

export interface DepotEquipmentTable {
  id: Generated<string>;
  tenant_id: string;
  equipment_number: string;
  equipment_type: string;
  condition: Generated<string>;
  location: string | null;
  status: Generated<string>;
  owner_carrier: string | null;
  last_movement_at: Date | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EquipmentInterchangeReceiptsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: Generated<string>;
  subject_id: string | null;
  equipment_number: string;
  direction: string;
  party_name: string;
  condition_at_interchange: Generated<string>;
  damage_notes: string | null;
  seal_number: string | null;
  driver_name: string | null;
  vehicle_reg: string | null;
  signature_name: string | null;
  reference_number: string | null;
  occurred_at: Generated<Date>;
  created_by: string | null;
  created_at: Generated<Date>;
  release_document_id: string | null;
}

export interface HuduBIWidgetDefinitionsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  metric_key: string;
  chart_type: Generated<string>;
  filters: Generated<unknown>;
  sort_order: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HsClassificationEventsTable {
  id: Generated<string>;
  tenant_id: string;
  description: string;
  suggested: unknown | null;
  /** Null when suggestions were shown and none were taken. */
  accepted_code: string | null;
  source: Generated<string>;
  /** True when the accepted code was not the top suggestion — the
   *  correction signal the ranker learns from. */
  overrode_top: Generated<boolean>;
  record_id: string | null;
  shipment_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface TradeWizardOutcomesTable {
  id: Generated<string>;
  tenant_id: string;
  search_id: string | null;
  procedure_id: string;
  procedure_name: string | null;
  goal: string | null;
  predicted: unknown | null;
  outcome: Generated<string>;
  note: string | null;
  shipment_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface ComplianceOutcomesTable {
  id: Generated<string>;
  tenant_id: string;
  check_id: string | null;
  hs_code: string | null;
  origin_country: string | null;
  requirement: string;
  predicted: boolean;
  actual: string;
  shipment_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
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
  /** Where the consignment came from. NULL means not recorded — corridor
   *  reporting must exclude those rather than bucket them as unknown. */
  origin_country: string | null;
  loading_point: string | null;
  loading_point_type: 'SEA_PORT' | 'AIRPORT' | 'BORDER_POST' | null;
  shipment_mode: string | null;
  /** Incoterm derived from the plain-language questions, never typed. */
  price_basis: 'EXW' | 'FOB' | 'CFR' | 'CIF' | null;
  /** The whole calculation — inputs and result — so a saved estimate can be
   *  reopened and re-rendered rather than only summarised. See migration 166. */
  payload: unknown | null;
  customer_name: string | null;
  customer_email: string | null;
  destination: string | null;
  title: string | null;
  /** The calculation this one was amended from. */
  parent_id: string | null;
  version: Generated<number>;
  item_count: number | null;
  share_token: string | null;
  /** The shipment this estimate was produced for, when there was one.
   *  No FK: shipment_cases is partitioned on (id, created_at). */
  shipment_id: string | null;
}

export interface TransitRouteRatesTable {
  id: Generated<string>;
  tenant_id: string;
  destination: string;
  border_post: string | null;
  distance_km: Generated<number>;
  transport_20ft_usd: Generated<number>;
  transport_40ft_usd: Generated<number>;
  weighbridge_count: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PettiWalletsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  gl_account_id: string;
  currency: Generated<string>;
  status: Generated<string>;
  default_workflow_id: string | null;
  category_workflow_overrides: Generated<string>; // JSONB: { [category]: workflowId }
  approver_user_id: string | null;
  approver_backup_user_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface PettiWorkflowsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  requires_department_approval: Generated<boolean>;
  is_system: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PettiDepositsTable {
  id: Generated<string>;
  tenant_id: string;
  wallet_id: string;
  amount: number;
  method: Generated<string>;
  gateway_provider: string | null;
  gateway_tx_ref: string | null;
  reference: string | null;
  ref: string | null;
  note: string | null;
  journal_entry_id: string | null;
  recorded_by: string | null;
  created_at: Generated<Date>;
}

export interface PettiWithdrawalRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  wallet_id: string;
  amount: number;
  category: Generated<string>;
  purpose: string;
  status: Generated<string>;
  requested_by: string;
  requested_at: Generated<Date>;
  approved_by: string | null;
  approved_at: Date | null;
  rejection_reason: string | null;
  disbursed_by: string | null;
  disbursed_at: Date | null;
  finance_expense_id: string | null;
  journal_entry_id: string | null;
  workflow_id: string | null;
  payee_name: string | null;
  on_behalf_of_user_id: string | null;
  ref: string | null;
}

export interface PettiTransfersTable {
  id: Generated<string>;
  tenant_id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  note: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  ref: string | null;
}

export interface PettiCountersTable {
  tenant_id: string;
  counter_type: string;
  next_seq: Generated<number>;
}

export interface PettiFlagsTable {
  id: Generated<string>;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  wallet_id: string;
  reason: string;
  status: Generated<string>;
  raised_by: string;
  resolved_by: string | null;
  resolved_at: Date | null;
  resolution_note: string | null;
  created_at: Generated<Date>;
}

export interface ReferenceCountriesTable {
  code: string;
  code3: string;
  name: string;
  is_eac: Generated<boolean>;
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

export interface VehiclesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  plate_number: string | null;
  type: Generated<string>;
  driver_name: string | null;
  driver_phone: string | null;
  device_id: string;
  status: Generated<string>;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  ownership: Generated<string>;
  mileage_km: number | null;
  photo_url: string | null;
  fuel_type: string | null;
  group_name: string | null;
  purchase_vendor: string | null;
  purchase_date: DateOnlyNull;
  purchase_price: number | null;
  initial_odometer: number | null;
  financing_type: Generated<string>;
  in_service_date: DateOnlyNull;
  in_service_odometer: number | null;
  est_life_months: number | null;
  est_life_meter: number | null;
  est_resale_value: number | null;
  out_of_service_date: DateOnlyNull;
  out_of_service_odometer: number | null;
  lifecycle_notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VehicleIssuesTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  title: string;
  description: string | null;
  severity: Generated<string>;
  priority: Generated<string>;
  status: Generated<string>;
  reported_by: string | null;
  assigned_to: string | null;
  due_date: Date | null;
  due_odometer_km: number | null;
  odometer_km: number | null;
  resolved_odometer_km: number | null;
  source: Generated<string>;
  created_at: Generated<Date>;
  resolved_at: Date | null;
}

export interface VehicleExpensesTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  category: Generated<string>;
  description: string | null;
  amount: number;
  expense_date: DateOnlyGenerated;
  vendor_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  /** Fleet expense → customer invoice bridge, migration 260. */
  trip_id: string | null;
  billable: Generated<boolean>;
  invoice_id: string | null;
}

export interface VehicleMeterReadingsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  reading_km: number;
  source: Generated<string>;
  recorded_at: Generated<Date>;
  created_by: string | null;
}

export interface VehicleAssignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  driver_id: string;
  start_time: Date;
  end_time: Date | null;
  labels: string | null;
  comment: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VehicleIssueEventsTable {
  id: Generated<string>;
  tenant_id: string;
  issue_id: string;
  event_type: string;
  description: string;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface VehicleSensorSnapshotsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  snapshot_type: string;
  payload: any;
  recorded_at: Date;
  created_at: Generated<Date>;
}

export interface VehiclePositionsTable {
  id: Generated<string>;
  vehicle_id: string;
  tenant_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  battery_pct: number | null;
  ignition: string | null;
  recorded_at: Generated<Date>;
}

export interface VehicleGeofenceEventsTable {
  id: Generated<string>;
  geofence_id: string;
  vehicle_id: string;
  tenant_id: string;
  event_type: 'ENTER' | 'EXIT';
  latitude: number;
  longitude: number;
  occurred_at: Generated<Date>;
}

export interface DriversTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  phone: string | null;
  license_number: string | null;
  license_expiry: DateOnlyNull;
  employee_id: string | null;
  assigned_vehicle_id: string | null;
  status: Generated<string>;
  photo_url: string | null;
  avatar_url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface VehicleVendorsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  vendor_type: Generated<string>;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TripsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  driver_id: string | null;
  customer_id: string | null;
  origin: string | null;
  destination: string | null;
  scheduled_start: Date | null;
  scheduled_end: Date | null;
  actual_start: Date | null;
  actual_end: Date | null;
  status: Generated<string>;
  cargo_desc: string | null;
  cargo_type: string | null;
  cargo_weight_kg: number | null;
  cargo_temp_c: number | null;
  load_capacity_pct: number | null;
  distance_km: number | null;
  notes: string | null;
  shipment_id: string | null;
  job_type: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MaintenanceRecordsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  vendor_id: string | null;
  service_type: string;
  description: string | null;
  cost: number | null;
  odometer_km: number | null;
  service_date: DateOnlyGenerated;
  next_due_date: DateOnlyNull;
  next_due_odometer: number | null;
  status: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface PartsStockTable {
  id: Generated<string>;
  tenant_id: string;
  part_name: string;
  part_number: string | null;
  category: string | null;
  quantity: Generated<number>;
  unit_cost: number | null;
  reorder_level: Generated<number>;
  vendor_id: string | null;
  location_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WarehouseLocationsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  zone: string | null;
  capacity_units: number | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WarehouseDockAppointmentsTable {
  id: Generated<string>;
  tenant_id: string;
  dock_number: string;
  appointment_type: 'INBOUND' | 'OUTBOUND';
  vehicle_id: string | null;
  reference: string | null;
  scheduled_at: Date;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CargoManifestsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string | null;
  trip_id: string | null;
  name: string;
  container_length_cm: number;
  container_width_cm: number;
  container_height_cm: number;
  max_weight_kg: number;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CargoItemsTable {
  id: Generated<string>;
  tenant_id: string;
  manifest_id: string;
  label: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  weight_kg: number;
  quantity: Generated<number>;
  color: string | null;
  placements: Generated<string>;
  created_at: Generated<Date>;
}

export interface FuelLogsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  driver_id: string | null;
  liters: number;
  cost: number | null;
  odometer_km: number | null;
  station: string | null;
  vendor_id: string | null;
  logged_at: Generated<Date>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface VehicleDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string;
  doc_type: Generated<string>;
  doc_number: string | null;
  issued_date: DateOnlyNull;
  expiry_date: DateOnlyNull;
  file_url: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FleetRemindersTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  title: string;
  reminder_type: Generated<string>;
  due_date: DateOnly;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DriverMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  driver_id: string;
  trip_id: string | null;
  sender_type: 'OPS' | 'DRIVER';
  sender_id: string | null;
  message: string;
  created_at: Generated<Date>;
}

export interface FleetAlertsTable {
  id: Generated<string>;
  tenant_id: string;
  vehicle_id: string | null;
  alert_type: string;
  severity: Generated<string>;
  message: string;
  acknowledged: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface AccountingIntegrationsTable {
  id: Generated<string>;
  tenant_id: string;
  provider: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'TALLY';
  status: Generated<'CONNECTED' | 'DISCONNECTED' | 'ERROR'>;
  config: Generated<Record<string, any>>;
  last_sync_at: Date | null;
  /** Encrypted (encryptSecret), same convention as mail-oauth's tenant_settings tokens. */
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: Date | null;
  /** QuickBooks calls this realmId, Xero calls it tenantId — stored generically. */
  provider_org_id: string | null;
  last_error: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountingSyncLogsTable {
  id: Generated<string>;
  tenant_id: string;
  provider: string;
  entity_type: 'COA' | 'INVOICE' | 'BILL' | 'PAYMENT' | 'TEST_CONNECTION';
  entity_id: string;
  external_id: string | null;
  status: 'SUCCESS' | 'FAILED';
  error_message: string | null;
  synced_at: Generated<Date>;
}

export interface AccountingIntegrationEntityMapTable {
  id: Generated<string>;
  tenant_id: string;
  provider: string;
  local_type: 'customer' | 'supplier';
  local_id: string;
  external_id: string;
  created_at: Generated<Date>;
}

export interface EmailMessagesTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  folder: Generated<'inbox' | 'sent' | 'drafts' | 'spam' | 'trash'>;
  from_name: Generated<string>;
  from_email: Generated<string>;
  to_addresses: Generated<any>;
  cc_addresses: Generated<any>;
  subject: Generated<string>;
  body: Generated<string>;
  snippet: Generated<string>;
  read: Generated<boolean>;
  starred: Generated<boolean>;
  labels: Generated<any>;
  has_attachment: Generated<boolean>;
  outbox_id: string | null;
  created_at: Generated<Date>;
}

export interface EmailTemplatesTable {
  id:           Generated<string>;
  tenant_id:    string;
  template_key: string;
  category:     string; // 'transactional' | 'support' | 'account'
  subject:      string;
  body_html:    string;
  updated_by:   string | null;
  created_at:   Generated<Date>;
  updated_at:   Generated<Date>;
}

export interface EmailOutboxTable {
  id:              Generated<string>;
  tenant_id:       string;
  to_address:      string;
  cc_addresses:    any | null;
  from_name:       string | null;
  from_address:    string | null;
  subject:         string;
  body_html:       string;
  template_key:    string | null;
  source_app:      string | null;
  status:          Generated<'pending' | 'sending' | 'sent' | 'failed'>;
  attempts:        Generated<number>;
  max_attempts:    Generated<number>;
  last_error:      string | null;
  next_attempt_at: Generated<Date>;
  created_at:      Generated<Date>;
  sent_at:         Date | null;
  /** Daily shipment-report automation (migration 258) — storage_key of a
   *  generated PDF to attach; NULL for every other email in this queue. */
  attachment_storage_key: string | null;
  attachment_filename:    string | null;
}

export interface ShipmentReportSharesTable {
  id: Generated<string>;
  token: string;
  tenant_id: string;
  shipment_id: string;
  view_count: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface UserTotpTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  secret: string;
  enabled: Generated<boolean>;
  backup_codes: Generated<any>;
  enabled_at: Date | null;
  created_at: Generated<Date>;
}

/** WebAuthn passkeys (Ondi M2) — TOTP stays in UserTotpTable above, see
 *  359_ondi_credentials_passkey_only.sql's own comment on why this table
 *  narrowed to passkeys only rather than duplicating it. */
export interface OndiCredentialsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  label: string;
  passkey_credential_id: string;
  passkey_public_key: string;
  passkey_counter: Generated<number>;
  passkey_transports: string | null;
  last_used_at: Date | null;
  created_at: Generated<Date>;
}

/** Personal KYC submissions (Ondi M4) — see 361_ondi_kyc.sql. */
export interface OndiKycSubmissionsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  document_type: 'national_id' | 'passport' | 'drivers_license';
  document_storage_key: string;
  extracted_full_name: string | null;
  extracted_dob: string | null;
  extracted_document_number: string | null;
  extracted_nationality: string | null;
  extracted_expiry: string | null;
  mrz_raw: string | null;
  mrz_valid: boolean | null;
  ocr_confidence: string | null;
  status: Generated<'pending' | 'approved' | 'rejected'>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
}

/** Org identity — KYB + custom roles/groups + access requests (Ondi M5,
 *  migration 362). See that migration's own header for why these key
 *  directly off `tenants`, not the pre-existing `organizations` table
 *  (a different, cross-tenant customer-portal concept). */
export interface OndiOrgKybTable {
  id: Generated<string>;
  tenant_id: string;
  submitted_by: string;
  document_storage_key: string;
  extracted_company_name: string | null;
  extracted_registry_number: string | null;
  extracted_entity_type: string | null;
  extracted_status: string | null;
  extracted_incorporation_date: string | null;
  status: Generated<'pending' | 'verified' | 'rejected'>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
}

export interface OndiOrgRolesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  permissions: Generated<any>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface OndiOrgRoleMembersTable {
  id: Generated<string>;
  tenant_id: string;
  role_id: string;
  user_id: string;
  granted_by: string | null;
  created_at: Generated<Date>;
  // Just-in-Time-lite access (migration 364) — NULL means permanent, same
  // as every row before this column existed. A non-null value past its
  // date simply stops counting in hasOrgPermission() (org-rbac.ts); the
  // row is never auto-deleted, so it stays as a real record of who held
  // the permission and until when.
  expires_at: Date | null;
}

export interface OndiOrgAccessRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  role_id: string;
  reason: string | null;
  status: Generated<'pending' | 'approved' | 'denied'>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Generated<Date>;
  // Dual-control / break-glass (migration 365) — required_approvals=1 is the
  // pre-existing single-approval behavior, unchanged. break_glass=true
  // requests set required_approvals=2 and always carry expires_in_hours, so
  // the resulting grant (via migration 364's expires_at) is never permanent.
  break_glass: Generated<boolean>;
  required_approvals: Generated<number>;
  expires_in_hours: number | null;
}

/** One row per distinct approver's decision — see migration 365's header.
 *  UNIQUE(request_id, approver_id) is the actual dual-control enforcement. */
export interface OndiOrgAccessRequestApprovalsTable {
  id: Generated<string>;
  tenant_id: string;
  request_id: string;
  approver_id: string;
  decision: 'approve' | 'deny';
  reason: string | null;
  created_at: Generated<Date>;
}

/** OAuth 2.0 / OIDC provider (Ondi M6, migration 363) — platform-global,
 *  not tenant-scoped; see that migration's own header for why. */
export interface OndiOidcSigningKeysTable {
  id: Generated<string>;
  kid: string;
  public_key_pem: string;
  encrypted_private_key: string;
  algorithm: Generated<string>;
  enabled: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface OndiOauthClientsTable {
  id: Generated<string>;
  client_id: string;
  client_secret_hash: string | null;
  name: string;
  logo_url: string | null;
  redirect_uris: Generated<any>;
  first_party: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface OndiOauthConsentsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  client_id: string;
  scopes: Generated<any>;
  granted_at: Generated<Date>;
}

/** SHA-256 hash-chain audit log (Ondi M0/M3) — schema only until M3 adds a
 *  writer; see 358_ondi_identity_foundation.sql's own header comment. */
export interface OndiAuthEventsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string | null;
  event_type: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Generated<any>;
  prev_hash: string | null;
  event_hash: string;
  created_at: Generated<Date>;
}

export interface PaymentMethodsTable {
  id: Generated<string>;
  tenant_id: string;
  created_by: string;
  type: Generated<'card' | 'mobile_money' | 'bank'>;
  label: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface SubscriptionInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_number: string;
  plan_code: string;
  seats: number;
  currency: Generated<string>;
  amount: number;
  period_start: string;
  period_end: string;
  due_date: string;
  status: Generated<'due' | 'paid' | 'overdue' | 'cancelled'>;
  paid_at: Date | null;
  payment_method_id: string | null;
  tx_ref: string | null;
  created_at: Generated<Date>;
}

export interface InvoiceSequencesTable {
  tenant_id: string;
  doc_type: 'invoice' | 'quotation' | 'purchase_order' | 'project' | 'contract';
  prefix: Generated<string>;
  pad_length: Generated<number>;
  next_number: Generated<number>;
}

export interface PlatformSupportTicketsTable {
  id: Generated<string>;
  tenant_id: string;
  ref_number: string;
  created_by: string;
  subject: string;
  category: Generated<string>;
  priority: Generated<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>;
  status: Generated<'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Which app the report came from, so the bug queue can be triaged. */
  app: string | null;
  kind: Generated<string>;
  /** What the reporter was looking at. Read by a human; never an input. */
  context: unknown | null;
  record_id: string | null;
  resolution: string | null;
  resolved_at: Date | null;
}

export interface PlatformSupportAttachmentsTable {
  id: Generated<string>;
  ticket_id: string;
  tenant_id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  uploaded_by: string | null;
  created_at: Generated<Date>;
}

export interface PlatformSupportMessagesTable {
  id: Generated<string>;
  ticket_id: string;
  tenant_id: string;
  author_id: string;
  author_name: string;
  is_platform_staff: Generated<boolean>;
  content: string;
  created_at: Generated<Date>;
}

export interface AccountingMarketplaceRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  provider_id: string;
  provider_name: string;
  requested_by: string | null;
  status: Generated<'pending' | 'contacted' | 'completed' | 'declined'>;
  created_at: Generated<Date>;
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
  entity_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  entry_number: string;
  entry_date: DateOnly;
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
  entity_id: string | null;
  // Real reversal tracking (M0 of the FinOps tax build-out, migration 330)
  // — set on a reversal entry to the id of the entry it reverses, so
  // reverseBySource() can tell a reversal apart from a normal source-tagged
  // entry and never re-reverse its own reversal on a subsequent edit.
  reverses_entry_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountingEntitiesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  entity_code: string;
  country_code: string | null;
  currency: Generated<string>;
  tax_id: string | null;
  registered_address: string | null;
  active: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface IntercompanyTransactionsTable {
  id: Generated<string>;
  tenant_id: string;
  from_entity_id: string;
  to_entity_id: string;
  description: string;
  amount: number;
  currency: Generated<string>;
  from_account_code: string;
  to_account_code: string;
  ar_journal_entry_id: string | null;
  ap_journal_entry_id: string | null;
  status: Generated<string>;
  created_by: string | null;
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
  order_date: DateOnlyNull;
  expected_date: DateOnlyNull;
  currency: Generated<string>;
  exchange_rate: Generated<number>;
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
  tax_code_id: string | null;
  tax_amount: Generated<number>;
  line_total: Generated<number>;
  received_qty: Generated<number>;
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

export interface HrCompensationsTable {
  id: Generated<string>;
  tenant_id: string;
  /**
   * Migration 201 repointed this from hr_employments to users and this type was
   * not updated with it, so `tsc` kept accepting `employment_id` — a column the
   * database no longer has. The query would have failed at runtime; it never
   * did, only because hr_employments held no rows to trigger it.
   */
  user_id: string;
  effective_date: DateOnly;
  end_date: DateOnlyNull;
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

// HrWorkflow{Definitions,Stages,Cases,Tasks,Conditions}Table were dropped in
// migration 173 along with the tables behind them — a third workflow engine
// nothing routed to. HR automation now emits domain events into Workflow Studio.

export interface HrDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  /** The person the document is about. Was person_id -> hr_people (0 rows). */
  user_id: string | null;
  name: string;
  type: string;
  storage_key: string;
  status: Generated<string>;
  expiry_date: Date | null;
  approval_status: Generated<string>;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  category: Generated<string>;
  is_mandatory: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrContractsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  contract_type: 'PERMANENT' | 'FIXED_TERM' | 'PROBATION' | 'CASUAL' | 'INTERNSHIP';
  start_date: string;
  /**
   * NULL only for PERMANENT — a CHECK enforces it. A fixed-term contract with
   * no end date is precisely the record that expires without anyone noticing.
   */
  end_date: string | null;
  reference: string | null;
  document_id: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrEmergencyContactsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  phone: string;
  alt_phone: string | null;
  address: string | null;
  is_primary: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrDocumentTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  type: string;
  template_category: Generated<string>;
  country_code: string | null;
  body: string;
  placeholders: Generated<any>;
  version: Generated<number>;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrDocumentRequirementsTable {
  id: Generated<string>;
  tenant_id: string;
  designation: Generated<string>;
  document_type: string;
  is_required: Generated<boolean>;
  expiry_warning_days: Generated<number>;
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
  assigned_date: DateOnlyNull;
  returned_date: DateOnlyNull;
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
  due_date: DateOnlyNull;
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
  start_date: DateOnly;
  end_date: DateOnly;
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
  user_id: string;
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
  start_date: DateOnly;
  end_date: DateOnly;
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
  birthday: DateOnlyNull;
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
  source: Generated<string>;
  external_id: string | null;
  synced_at: Date | null;
}

export interface ContactSyncConnectionsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  provider: Generated<string>;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  external_account_email: string | null;
  last_synced_at: Date | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  contacts_synced_count: Generated<number>;
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
  issued_date: DateOnlyNull;
  expiry_date: DateOnlyNull;
  status:         Generated<string>;  // active | expiring | expired | revoked
  document_url:   string | null;
  external_ref:   string | null;
  auto_renew:     Generated<boolean>;
  last_synced_at: Date | null;
  metadata:       Generated<Record<string, any>>;
  customer_id:    string | null;
  reminder_90d_sent_at: Date | null;
  reminder_30d_sent_at: Date | null;
  non_renewal_risk:     string | null;
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
  customer_id:    string | null;
  license_catalog_id: string | null;
}

export interface ComplyLicenseCatalogTable {
  id:                   Generated<string>;
  code:                 string;
  sn:                   number;
  category:             string;
  description:          string;
  tier:                 string | null;
  principal_fee:        string | null; // NUMERIC comes back as string via pg
  principal_currency:   Generated<string>;
  subsidiary_fee:       string | null;
  subsidiary_currency:  Generated<string>;
  notes:                string | null;
  requirements:         Generated<string[]>;
  created_at:           Generated<Date>;
}

export interface CmsPagesTable {
  id:               Generated<string>;
  tenant_id:        string | null; // null = Hudumika platform page
  slug:             string;
  title:            string;
  content:          Generated<string>;
  status:           Generated<string>; // draft | published
  seo_description:  string | null;
  author_id:        string | null;
  created_at:       Generated<Date>;
  updated_at:       Generated<Date>;
}

export interface CmsPostsTable {
  id:          Generated<string>;
  tenant_id:   string;
  title:       string;
  content:     Generated<string>;
  status:      Generated<string>; // draft | published | trash
  author_id:   string | null;
  category:    string | null;
  tags:        string | null;
  created_at:  Generated<Date>;
  updated_at:  Generated<Date>;
}

export interface CmsCommentsTable {
  id:          Generated<string>;
  tenant_id:   string;
  post_id:     string | null;
  author:      string;
  email:       string | null;
  content:     string;
  status:      Generated<string>; // approved | pending | spam
  created_at:  Generated<Date>;
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
  due_date: DateOnlyNull;
  last_fulfilled_date: DateOnlyNull;
  linked_cert_id:       string | null;
  customer_id:          string | null;
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

export interface ComplyAgencyDirectoryTable {
  code:         string;
  name:         string;
  category:     string;
  agency_class: Generated<string>;
  website:      string | null;
  phone:        string | null;
  location:     string | null;
  obligations:  Generated<string[]>;
  turnaround:   string | null;
  portal_type:  Generated<string>; // api | portal | manual | legal_firm
  created_at:   Generated<Date>;
  updated_at:   Generated<Date>;
}

export interface ComplyRemindersTable {
  id:          Generated<string>;
  tenant_id:   string;
  title:       string;
  agency_code: string | null;
  remind_date: DateOnly;
  notes:       string | null;
  created_by:  string;
  created_at:  Generated<Date>;
}

export interface ComplyProfilesTable {
  tenant_id:              string;
  sector:                 string;
  sub_sector:              string | null;
  ownership_structure:    string | null;
  employee_band:          string | null;
  jurisdiction:           Generated<string>; // TZ | KE | UG | RW
  created_at:             Generated<Date>;
  updated_at:             Generated<Date>;
}

export interface ComplyObligationRulesTable {
  id:              Generated<string>;
  jurisdiction:    string;
  sector:          string | null; // null = applies to all sectors
  agency_code:     string;
  obligation_code: string;
  name:            string;
  frequency:       string;
  mandatory:       Generated<boolean>;
  description:     string | null;
  created_at:      Generated<Date>;
}

export interface ComplyLegalFirmsTable {
  id:                  Generated<string>;
  name:                string;
  initials:            string;
  color:                string;
  specialties:         Generated<string[]>;
  agencies_handled:    Generated<string[]>;
  location:            string | null;
  founded_year:        number | null;
  rating:              Generated<number>;
  review_count:        Generated<number>;
  starting_price_label: string | null;
  description:         string | null;
  verified:            Generated<boolean>;
  created_at:          Generated<Date>;
}

export interface ComplyLegalEngagementsTable {
  id:               Generated<string>;
  tenant_id:        string;
  firm_id:          string;
  application_id:   string | null;
  engagement_type:  string;
  agency_code:      string | null;
  brief:            string;
  status:           Generated<string>; // requested | quoted | instructed | in_progress | milestone_due | completed | cancelled
  quoted_price:     string | null;
  created_by:       string;
  customer_id:      string | null;
  created_at:       Generated<Date>;
  updated_at:       Generated<Date>;
}

export interface ComplyLegalMilestonesTable {
  id:             Generated<string>;
  engagement_id:  string;
  description:    string;
  amount:         string | null;
  status:         Generated<string>; // pending | paid | released
  created_at:     Generated<Date>;
  updated_at:     Generated<Date>;
}

export interface ComplyLegalMessagesTable {
  id:             Generated<string>;
  engagement_id:  string;
  sender_type:    string; // tenant | firm
  sender_id:      string;
  body:           string;
  created_at:     Generated<Date>;
}

export interface ComplyBrelaSearchHistoryTable {
  id:            Generated<string>;
  tenant_id:     string;
  searched_by:   string;
  object_type:   string;
  inc_number:    string | null;
  company_name:  string | null;
  is_live:       Generated<boolean>;
  result_count:  Generated<number>;
  // JSONB array — stored/read as a JSON string (same convention as this
  // file's other JSONB-array columns, e.g. shipment_cases.containers):
  // pg's parameter binding doesn't reliably round-trip a raw JS array into
  // jsonb (an empty array can come back as `{}`), so callers must
  // JSON.stringify() on insert and JSON.parse() on read.
  results:       Generated<string>;
  created_at:    Generated<Date>;
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
  share_token: string | null;
  entity_type: string | null;
  entity_id:   string | null;
  created_at:  Generated<Date>;
  updated_at:  Generated<Date>;
}

export interface CloudFileSharesTable {
  id:          Generated<string>;
  file_id:     string;
  person_name: string;
  role:        Generated<string>; // 'Viewer' | 'Editor'
  created_at:  Generated<Date>;
  // Real, checkable identity behind a share (migration 233) — null for
  // legacy/free-text-only shares, which stay display-only forever. Only
  // 'customer' | 'organization' are ever enforced by a route; a share with
  // no principal (including any principal_type='user') stays informational.
  principal_type: string | null;
  principal_id:   string | null;
}

export interface CloudFileCommentsTable {
  id:          Generated<string>;
  tenant_id:   string;
  file_id:     string;
  author_id:   string;
  author_name: string;
  content:     string;
  created_at:  Generated<Date>;
  updated_at:  Generated<Date>;
}

export interface CloudFileVersionsTable {
  id:               Generated<string>;
  tenant_id:        string;
  file_id:          string;
  storage_key:      string;
  size:             number | null;
  mime_type:        string | null;
  uploaded_by_id:   string | null;
  uploaded_by_name: Generated<string>;
  created_at:       Generated<Date>;
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

export interface WorkflowStudioAppsTable {
  id:             Generated<string>;
  tenant_id:      string;
  name:           string;
  description:    string | null;
  icon:           Generated<string>;
  color:          Generated<string>;
  status:         Generated<string>; // 'ACTIVE' | 'PAUSED' | 'DRAFT'
  trigger_event:  string;
  trigger_config: Generated<string>;
  nodes:          Generated<string>;
  edges:          Generated<string>;
  last_run_at:    Date | null;
  run_count:      Generated<number>;
  created_by:     string | null;
  /** Key of the code subscriber this workflow replaces once ACTIVE — see
   *  migration 165 and studio/supersession.ts. NULL for tenant-authored ones. */
  supersedes_subscriber: string | null;
  /** Same shape as workflows.triggers — scopes an automation to a freight
   *  mode / consignment type / customer / country, not just an event. */
  targeting:      Generated<string>;
  created_at:     Generated<Date>;
  updated_at:     Generated<Date>;
}

/** Human-written platform notices for the header pill — migration 177. */
export interface AnnouncementsTable {
  id:         Generated<string>;
  /** NULL = every workspace sees it. Never filter this with a bare equals. */
  tenant_id:  string | null;
  title:      string;
  body:       string | null;
  link:       string | null;
  badge:      Generated<string>;
  starts_at:  Generated<Date>;
  ends_at:    Date | null;
  active:     Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AnnouncementDismissalsTable {
  announcement_id: string;
  user_id:         string;
  dismissed_at:    Generated<Date>;
}

/** The assistant's transcript and its durable memory — migration 176. */
export interface AiConversationsTable {
  id:         Generated<string>;
  tenant_id:  string;
  /** Threads are per-person, not per-workspace. */
  user_id:    string;
  title:      string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AiMessagesTable {
  id:              Generated<string>;
  tenant_id:       string;
  conversation_id: string;
  role:            'user' | 'assistant';
  content:         string;
  /** What the assistant looked up to answer, so the answer can be audited. */
  tool_calls:      string | null;
  created_at:      Generated<Date>;
}

export interface AiMemoryTable {
  id:         Generated<string>;
  tenant_id:  string;
  /** NULL = the whole workspace remembers it; set = one person's own. */
  user_id:    string | null;
  content:    string;
  /** 'user' stated it outright; 'assistant' inferred it. Never conflated. */
  source:     Generated<'user' | 'assistant'>;
  source_conversation_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowStudioRunsTable {
  id:             Generated<string>;
  tenant_id:      string;
  workflow_id:    string;
  trigger_source: Generated<string>;
  status:         string; // 'SUCCESS' | 'RUNNING' | 'FAILED' | 'PARTIAL' | 'SIMULATED'
  payload:        Generated<string>;
  step_results:   Generated<string>;
  error_message:  string | null;
  duration_ms:    Generated<number>;
  /** The domain_events row that caused this run; NULL for manual/dry runs.
   *  BIGINT (domain_events.id is BIGSERIAL), surfaced as a string by node-pg.
   *  Unique per (workflow_id, domain_event_id) — see migrations 158/159. */
  domain_event_id: string | null;
  created_at:     Generated<Date>;
}

export interface OnsiteProjectsTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteDomainsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string | null;
  domain: string;
  registrar: string | null;
  nameservers: Generated<string>;
  registered_at: Date | null;
  expires_at: Date | null;
  auto_renew: Generated<boolean>;
  dns_status: Generated<string>;
  dns_checked_at: Date | null;
  ssl_status: Generated<string>;
  ssl_checked_at: Date | null;
  ssl_expires_at: Date | null;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteDnsZonesTable {
  id: Generated<string>;
  tenant_id: string;
  domain_id: string;
  provider: string | null;
  external_id: string | null;
  status: Generated<string>;
  last_synced_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteDnsRecordsTable {
  id: Generated<string>;
  tenant_id: string;
  zone_id: string;
  name: string;
  type: string;
  value: string;
  ttl: Generated<number>;
  priority: number | null;
  external_id: string | null;
  synced_at: Date | null;
  sync_status: Generated<string>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteSslCertificatesTable {
  id: Generated<string>;
  tenant_id: string;
  domain_id: string;
  provider: Generated<string>;
  issuer: string | null;
  subject: string | null;
  sans: Generated<string>;
  issued_at: Date | null;
  expires_at: Date | null;
  status: Generated<string>;
  last_checked_at: Date | null;
  last_error: string | null;
  acme_order_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteWebsitesTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string | null;
  domain_id: string | null;
  name: string;
  type: Generated<string>;
  status: Generated<string>;
  hosting_provider: string | null;
  hosting_id: string | null;
  url: string | null;
  last_health_at: Date | null;
  last_health_status: number | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteApplicationsTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string | null;
  domain_id: string | null;
  name: string;
  runtime: Generated<string>;
  repo_provider: string | null;
  repo_owner: string | null;
  repo_name: string | null;
  repo_url: string | null;
  /** Branch deployed when a deploy request does not name one (migration 210). */
  default_branch: Generated<string>;
  build_command: string | null;
  start_command: string | null;
  output_dir: string | null;
  port: number | null;
  auto_deploy: Generated<boolean>;
  status: Generated<string>;
  current_version: string | null;
  last_deployed_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteEnvironmentsTable {
  id: Generated<string>;
  tenant_id: string;
  application_id: string;
  name: string;
  branch: string | null;
  domain_id: string | null;
  status: Generated<string>;
  url: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteSecretsTable {
  id: Generated<string>;
  tenant_id: string;
  environment_id: string;
  key: string;
  value_cipher: string;
  is_secret: Generated<boolean>;
  created_by: string | null;
  updated_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteDeploymentsTable {
  id: Generated<string>;
  tenant_id: string;
  application_id: string;
  environment_id: string;
  trigger: Generated<string>;
  triggered_by: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  branch: string | null;
  tag: string | null;
  ci_provider: string | null;
  ci_pipeline_id: string | null;
  ci_build_url: string | null;
  status: Generated<string>;
  version: string | null;
  queued_at: Generated<Date>;
  started_at: Date | null;
  completed_at: Date | null;
  log_reference: string | null;
  error_message: string | null;
  created_at: Generated<Date>;
}

export interface OnsiteServersTable {
  id: Generated<string>;
  tenant_id: string;
  project_id: string | null;
  name: string;
  provider: Generated<string>;
  external_id: string | null;
  region: string | null;
  os: string | null;
  cpu_count: number | null;
  ram_mb: number | null;
  disk_gb: number | null;
  ip_address: string | null;
  ipv6_address: string | null;
  status: Generated<string>;
  last_checked_at: Date | null;
  cpu_percent: number | null;
  ram_percent: number | null;
  disk_percent: number | null;
  metrics_at: Date | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OnsiteProviderConnectionsTable {
  id: Generated<string>;
  tenant_id: string;
  provider: string;
  name: string;
  config_cipher: string;
  access_token_cipher: string | null;
  refresh_token_cipher: string | null;
  token_expires_at: Date | null;
  external_id: string | null;
  external_name: string | null;
  status: Generated<string>;
  last_verified_at: Date | null;
  error_message: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * One row per uptime probe (migration 211).
 *
 * Append-only. onsite_health_checks.uptime_30d is derived from these rather
 * than written by hand, so an availability figure always has samples behind it.
 */
export interface OnsiteHealthCheckResultsTable {
  id: Generated<string>;
  tenant_id: string;
  check_id: string;
  checked_at: Generated<Date>;
  ok: boolean;
  status_code: number | null;
  response_ms: number | null;
  error: string | null;
}

export interface OnsiteBackupsTable {
  id: Generated<string>;
  tenant_id: string;
  trigger: 'manual' | 'scheduled';
  status: Generated<string>; // 'completed' | 'failed'
  snapshot: unknown; // jsonb — see onsite-backup.service.ts's OnsiteConfigSnapshot
  size_bytes: number;
  error_message: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface OnsiteHealthChecksTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  url: string;
  method: Generated<string>;
  expected_status: Generated<number>;
  timeout_ms: Generated<number>;
  interval_s: Generated<number>;
  status: Generated<string>;
  last_checked_at: Date | null;
  last_response_ms: number | null;
  last_status_code: number | null;
  last_error: string | null;
  uptime_30d: number | null;
  application_id: string | null;
  domain_id: string | null;
  notify_on_fail: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * AgencyHost M1 — the relationship between an agency tenant and a client
 * tenant it manages. Deliberately no `tenant_id` column: this table spans
 * two tenants by design (agency_tenant_id, client_tenant_id), same shape as
 * OrganizationsTable's own reasoning for having none. See migration
 * 243_agency_managed_tenants.sql for why it carries no RLS policy either.
 */
export interface AgencyManagedTenantsTable {
  id: Generated<string>;
  agency_tenant_id: string;
  client_tenant_id: string;
  status: Generated<string>; // 'active' | 'detached'
  attached_at: Generated<Date>;
  detached_at: Date | null;
  created_by: string | null;
  detached_by: string | null;
  created_at: Generated<Date>;
}

/**
 * AgencyHost M8 — a real commission earned by referring_tenant_id when
 * referred_tenant_id made its first real payment. No RLS — platform-level,
 * dual-tenant, same precedent as AgencyManagedTenantsTable. payout_method/
 * payout_note stay null until a SUPER_ADMIN manually records an out-of-band
 * payout (bank transfer etc.) — there is no real disbursement provider
 * connected anywhere in this platform yet; see referral-payout.service.ts.
 */
export interface ReferralCommissionsTable {
  id: Generated<string>;
  referring_tenant_id: string;
  referred_tenant_id: string;
  amount: string; // numeric(14,2) — Kysely/pg return numeric as string
  currency: string;
  rate: string; // numeric(5,4)
  source_payment_ref: string | null;
  status: Generated<string>; // 'pending' | 'flagged' | 'approved' | 'paid' | 'rejected'
  flagged_reason: string | null;
  created_at: Generated<Date>;
  decided_at: Date | null;
  decided_by: string | null;
  paid_at: Date | null;
  payout_method: string | null;
  payout_note: string | null;
}

/**
 * AgencyHost M7 — a tenant's public listing in the agency directory.
 * `tenant_id` is UNIQUE (one profile per agency). No RLS, deliberately —
 * same reasoning as marketplace_apps: an approved row must be visible to a
 * caller with no tenant session at all. client_count is intentionally NOT a
 * column here — it's a live COUNT(*) against agency_managed_tenants
 * computed at read time in onsite-agency-directory.routes.ts, never stored.
 */
export interface OnsiteAgencyProfilesTable {
  id: Generated<string>;
  tenant_id: string;
  headline: string;
  description: string;
  service_tags: Generated<unknown>; // jsonb string[]
  portfolio_links: Generated<unknown>; // jsonb string[]
  pricing_tier: string; // 'budget' | 'standard' | 'premium'
  region: string | null;
  languages: Generated<unknown>; // jsonb string[]
  status: Generated<string>; // 'pending' | 'approved' | 'rejected'
  profile_views: Generated<number>;
  inquiries_count: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrClockSessionsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  date: DateOnly;
  clock_in_at: Date;
  clock_out_at: Date | null;
  project_name: string | null;
  status: Generated<string>;
  total_break_minutes: Generated<number>;
  worked_minutes: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrClockBreaksTable {
  id: Generated<string>;
  session_id: string;
  tenant_id: string;
  start_at: Date;
  end_at: Date | null;
  duration_minutes: number | null;
  created_at: Generated<Date>;
}

export interface UserPresenceTable {
  user_id: string;
  tenant_id: string;
  last_active_at: Generated<Date>;
}

export interface BlissCallsTable {
  id: Generated<string>;
  tenant_id: string;
  caller_id: string;
  callee_id: string;
  kind: Generated<string>;
  status: Generated<string>;
  started_at: Generated<Date>;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BlissMeetingsTable {
  id: Generated<string>;
  tenant_id: string;
  host_id: string;
  title: Generated<string>;
  join_code: string;
  kind: Generated<string>;
  status: Generated<string>;
  scheduled_at: Date | null;
  started_at: Date | null;
  ended_at: Date | null;
  locked: Generated<boolean>;
  password_hash: string | null;
  waiting_room_enabled: Generated<boolean>;
  chat_disabled: Generated<boolean>;
  screen_share_disabled: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BlissMeetingParticipantsTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  user_id: string;
  role: Generated<string>;
  joined_at: Generated<Date>;
  left_at: Date | null;
  duration_seconds: Generated<number>;
  camera_disabled: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface BlissMeetingWaitingRoomTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  user_id: string;
  user_name: string;
  status: Generated<string>;
  requested_at: Generated<Date>;
  decided_at: Date | null;
}

export interface BlissMeetingBreakoutRoomsTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  name: string;
  created_at: Generated<Date>;
  closed_at: Date | null;
}

export interface BlissMeetingBreakoutAssignmentsTable {
  id: Generated<string>;
  tenant_id: string;
  breakout_room_id: string;
  user_id: string;
  user_name: string;
  assigned_at: Generated<Date>;
}

export interface BlissMeetingSummariesTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  generated_by: string;
  summary_json: unknown;
  created_at: Generated<Date>;
}

export interface BlissMeetingPollsTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  question: string;
  options: any; // JSONB string[]
  created_by: string;
  created_by_name: string;
  created_at: Generated<Date>;
  closed_at: Date | null;
}

export interface BlissMeetingPollVotesTable {
  id: Generated<string>;
  tenant_id: string;
  poll_id: string;
  user_id: string;
  option_index: number;
  created_at: Generated<Date>;
}

export interface BlissMeetingQuestionsTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  user_id: string;
  user_name: string;
  text: string;
  answered: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface BlissMeetingQuestionUpvotesTable {
  id: Generated<string>;
  tenant_id: string;
  question_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface BlissMeetingTranscriptLinesTable {
  id: Generated<string>;
  tenant_id: string;
  meeting_id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: Generated<Date>;
}

export interface HrJobOpeningsTable {
  id: Generated<string>;
  tenant_id: string;
  title: string;
  department: string | null;
  location: string | null;
  employment_type: Generated<string>;
  status: Generated<string>;
  description: string | null;
  openings_count: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrInterviewsTable {
  id: Generated<string>;
  tenant_id: string;
  candidate_id: string;
  interviewer_id: string | null;
  scheduled_at: Date;
  mode: Generated<string>;
  status: Generated<string>;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrCandidatesTable {
  id: Generated<string>;
  tenant_id: string;
  job_opening_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: Generated<string>;
  rating: number | null;
  source: string | null;
  notes: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface HrTimesheetApprovalsTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  period_start: DateOnly;
  period_end: DateOnly;
  status: Generated<string>;
  total_worked_minutes: Generated<number>;
  session_count: Generated<number>;
  submitted_at: Generated<Date>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * Return DATE columns as the 'YYYY-MM-DD' strings they are.
 *
 * By default node-postgres parses OID 1082 (date) into a JS Date at LOCAL
 * midnight. Serialising that to JSON gives an instant in UTC, so on this
 * server (UTC+3) a start_date stored as 2026-01-15 reaches the client as
 * "2026-01-14T21:00:00.000Z" — a day early to anything reading the date part.
 * Verified: stored 2026-01-15, API returned 2026-01-14T21:00:00.000Z.
 *
 * A DATE has no time and no timezone, so materialising it as an instant was
 * always lossy; there is no correct offset to apply. Handing back the literal
 * text is the only lossless answer, and it fixes every date column at once
 * rather than one query at a time — leave dates, holidays, effective dates,
 * compensation dates. TIMESTAMPTZ (1184) is untouched: those really are
 * instants and Date is right for them.
 */
pg.types.setTypeParser(1082, (value: string) => value);

/*
 * The declared types for DATE columns, matching what the parser above actually
 * returns.
 *
 * They used to say `Date`, which stopped being true the moment that parser was
 * registered — and a wrong declaration on a runtime type change is worse than
 * no declaration, because it silences the compiler at exactly the sites that
 * now break. It cost two runtime crashes to learn: `expiry.getTime is not a
 * function` in the ComplyOS job, and 39 `as Date` casts across the services
 * asserting the same thing the compiler could no longer check.
 *
 * ColumnType, not a plain `string`, because Kysely uses these for writes too:
 * reads come back as 'YYYY-MM-DD', while inserts and updates still accept a
 * Date or a string, since Postgres does. Narrowing the write side would have
 * broken every call site that passes `new Date(...)`.
 */
export type DateOnly = ColumnType<string, Date | string, Date | string>;
export type DateOnlyNull = ColumnType<string | null, Date | string | null, Date | string | null>;
/** DATE with a database default — absent on insert. */
export type DateOnlyGenerated = ColumnType<string, Date | string | undefined, Date | string>;

// Phase 4 cutover (RLS enforcement project): the app's real day-to-day
// connection is the restricted, non-superuser, non-BYPASSRLS `hudumika_app`
// role (db/migrations/241_rls_restricted_roles.sql) — not the superuser
// DATABASE_URL, which now exists only as db/migrate.ts's migration
// credential (CREATE POLICY/ALTER TABLE/CREATE ROLE/GRANT all require it).
// This is the change that makes every RLS policy in the database load-bearing:
// until this flipped, the superuser connection bypassed RLS unconditionally
// regardless of policy, exactly as CLAUDE.md's tenant_id-filter rule assumed.
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL_APP,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool,
  }),
});

// Separate connection, separate Postgres role (hudumika_readonly, granted
// SELECT-only — see db/migrations/084_readonly_role.sql). Used exclusively
// by the Query Builder's raw-SQL mode: even if the application-layer
// statement/keyword checks in services/queryBuilder.service.ts were somehow
// bypassed, this connection cannot execute a write or DDL statement at all.
const readonlyPool = new pg.Pool({
  connectionString: env.DATABASE_URL_READONLY,
});

export const dbReadonly = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: readonlyPool,
  }),
});

// Separate connection, separate Postgres role (hudumika_platform, granted
// BYPASSRLS — see db/migrations/241_rls_restricted_roles.sql). A narrow,
// explicitly-audited exception for the small set of confirmed
// SUPER_ADMIN-gated / genuinely cross-tenant call sites (SuperAdmin
// console, tenant management & reports, platform settings, lens,
// reference data, the two pre-tenant lookups in middleware/auth.ts) that
// legitimately need to read/write across tenant boundaries. Never import
// this for anything handling ordinary tenant traffic — use `db` inside
// withTenant() instead, so RLS (once enforced) actually applies.
const platformPool = new pg.Pool({
  connectionString: env.DATABASE_URL_PLATFORM,
});

export const dbPlatform = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: platformPool,
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
