// ── ComplyOS shared types ─────────────────────────────────────

import type { Customer } from './user.js';

export type CompCertStatus    = 'active' | 'expiring' | 'expired' | 'revoked' | 'unknown';
export type CompAppStatus     = 'draft' | 'submitted' | 'review' | 'issued' | 'rejected' | 'pending';
export type CompObligStatus   = 'active' | 'pending' | 'expired' | 'not-started';
export type CompRenewalStatus = 'pending_review' | 'approved' | 'submitted' | 'issued' | 'failed' | 'cancelled';
export type AgencyClass       = 'gov' | 'tax' | 'social' | 'reg' | 'fin';

export interface CompCertificate {
  id:              string;
  cert_number:     string;
  name:            string;
  agency_code:     string;
  agency_name:     string;
  agency_class:    AgencyClass;
  issued_date:     string | null;
  expiry_date:     string | null;
  status:          CompCertStatus;
  document_url:    string | null;
  external_ref:    string | null;
  auto_renew:      boolean;
  last_synced_at:  string | null;
  metadata:        Record<string, unknown>;
  customer_id:     string | null;
  customer_name:   string | null;
  // Two-stage expiry reminder tracking — set once each stage has actually
  // been sent, so the daily job never double-sends the same stage.
  reminder_90d_sent_at: string | null;
  reminder_30d_sent_at: string | null;
  // What happens operationally if this permit isn't renewed in time — shown
  // in the Vault detail view and included in expiry reminder notifications.
  non_renewal_risk:     string | null;
  created_at:      string;
  updated_at:      string;
}

export interface CompApplication {
  id:             string;
  app_number:     string;
  cert_type:      string;
  agency_code:    string;
  status:         CompAppStatus;
  submitted_at:   string | null;
  created_at:     string;
  updated_at:     string;
  created_by:     string;
  agency_ref:     string | null;
  notes:          string | null;
  linked_cert_id: string | null;
  metadata:       Record<string, unknown>;
  customer_id:    string | null;
  customer_name:  string | null;
  license_catalog_id: string | null;
  // Migration 423 — the same real Sign engine hr_offers/contracts already
  // use for a signable document, applied to a compliance declaration.
  sign_envelope_id: string | null;
  envelope_status:  string | null;
}

export interface CompObligation {
  id:                   string;
  obligation_code:      string;
  agency_code:          string;
  agency_class:         AgencyClass;
  name:                 string;
  frequency:            string;
  mandatory:            boolean;
  status:               CompObligStatus;
  due_date:             string | null;
  last_fulfilled_date:  string | null;
  linked_cert_id:       string | null;
  customer_id:          string | null;
  customer_name:        string | null;
}

export interface CompRenewal {
  id:           string;
  cert_id:      string;
  cert_name:    string;     // joined from comply_certificates
  agency_code:  string;
  status:       CompRenewalStatus;
  trigger:      'automatic' | 'manual';
  triggered_at: string;
  approved_by:  string | null;
  approved_by_name: string | null; // joined from users
  approved_at:  string | null;
  submitted_at: string | null;
  completed_at: string | null;
  notes:        string | null;
}

export interface CompAgencySync {
  id:              string;
  agency_code:     string;
  synced_at:       string;
  status:          'success' | 'failed' | 'partial';
  records_updated: number;
  error:           string | null;
}

export interface CompDashboardStats {
  tracked_certs:    number;
  unknown_validity_certs: number;
  active_certs:     number;
  expiring_soon:    number;  // next 30 days
  pending_apps:     number;
  overdue:          number;
  health_score:     number;  // 0–100, or -1 = assessment incomplete (no certificates recorded)
  pending_renewals: number;
  upcoming_deadlines: {
    cert_id:      string;
    cert_name:    string;
    agency_code:  string;
    expiry_date:  string;
    days_left:    number;
  }[];
  recent_syncs: Pick<CompAgencySync, 'agency_code' | 'synced_at' | 'status'>[];
}

export interface CreateApplicationInput {
  cert_type:   string;
  agency_code: string;
  notes?:      string;
  customer_id?: string | null;
  license_catalog_id?: string | null;
  metadata?:   Record<string, unknown>;
}

// ── Business Licence Catalogue ────────────────────────────────

export interface CompLicenseCatalogEntry {
  id:                  string;
  code:                string;
  sn:                  number;
  category:            string;
  description:         string;
  tier:                string | null;
  principal_fee:       number | null;
  principal_currency:  string;
  subsidiary_fee:      number | null;
  subsidiary_currency: string;
  notes:               string | null;
  requirements:        string[];
}

export interface UpdateApplicationInput {
  status:     CompAppStatus;
  agency_ref?: string;
  notes?:      string;
  customer_id?: string | null;
}

export type PortalType = 'api' | 'portal' | 'manual' | 'legal_firm';

export interface CompAgencyDirectoryEntry {
  code:         string;
  name:         string;
  category:     string;
  agency_class: AgencyClass;
  website:      string | null;
  phone:        string | null;
  location:     string | null;
  obligations:  string[];
  turnaround:   string | null;
  portal_type:  PortalType;
}

export interface CompCalendarEvent {
  source:      'obligation' | 'certificate' | 'renewal' | 'reminder';
  source_id:   string;
  date:        string; // YYYY-MM-DD
  title:       string;
  agency_code: string | null;
  severity:    'green' | 'blue' | 'amber' | 'red';
}

export interface CreateCertificateInput {
  cert_number:  string;
  name:         string;
  agency_code:  string;
  agency_name:  string;
  issued_date?: string | null;
  expiry_date?: string | null;
  document_url?: string | null;
  external_ref?: string | null;
  metadata?:     Record<string, unknown>;
  customer_id?:  string | null;
  non_renewal_risk?: string | null;
}

export interface ImportBrelaCompanyInput {
  reg_number:            string;
  name:                  string;
  entity_type?:          string | null;
  status?:               string | null;
  incorporation_date?:   string | null;
  registered_office?:    string | null;
  tin?:                  string | null; // may be the "Not available..." live-search placeholder — API only persists real-looking values
}

export interface ImportBrelaCompanyResult {
  customer:    Customer;
  certificate: CompCertificate;
}

export interface UpdateCertificateInput {
  name?:         string;
  issued_date?:  string | null;
  expiry_date?:  string | null;
  document_url?: string | null;
  auto_renew?:   boolean;
  status?:       CompCertStatus;
  customer_id?:  string | null;
  non_renewal_risk?: string | null;
}

export interface CreateReminderInput {
  title:        string;
  agency_code?: string;
  remind_date:  string;
  notes?:       string;
}

export interface CompReminder {
  id:          string;
  title:       string;
  agency_code: string | null;
  remind_date: string;
  notes:       string | null;
  created_at:  string;
}

// ── BRELA Search History ─────────────────────────────────────

export interface CompBrelaSearchResultSnapshot {
  reg_number: string;
  name: string;
  status: string;
  type: string;
  registered_office: string;
}

export interface CompBrelaSearchHistoryEntry {
  id:            string;
  searched_by:   string;
  searched_by_name: string | null;
  object_type:   string;
  inc_number:    string | null;
  company_name:  string | null;
  is_live:       boolean;
  result_count:  number;
  results:       CompBrelaSearchResultSnapshot[];
  created_at:    string;
}

// ── AI Obligation Scan ───────────────────────────────────────

export interface CompProfile {
  sector:              string;
  sub_sector:          string | null;
  ownership_structure: string | null;
  employee_band:       string | null;
  jurisdiction:        string;
}

export interface ObligationScanInput {
  sector:              string;
  sub_sector?:         string;
  ownership_structure?: string;
  employee_band?:      string;
}

export interface ObligationScanResult {
  profile:          CompProfile;
  obligations_created: number;
  obligations_matched: number;
}

// ── Legal Firm Marketplace ────────────────────────────────────

export type LegalEngagementStatus =
  | 'requested' | 'quoted' | 'instructed' | 'in_progress'
  | 'milestone_due' | 'completed' | 'cancelled';
export type LegalMilestoneStatus = 'pending' | 'paid' | 'released';

export interface CompLegalFirm {
  id:                   string;
  name:                 string;
  initials:             string;
  color:                string;
  specialties:          string[];
  agencies_handled:     string[];
  location:             string | null;
  founded_year:         number | null;
  rating:               number;
  review_count:         number;
  starting_price_label: string | null;
  description:          string | null;
  verified:             boolean;
}

export interface CompLegalMilestone {
  id:            string;
  engagement_id: string;
  description:   string;
  amount:        string | null;
  status:        LegalMilestoneStatus;
  created_at:    string;
}

export interface CompLegalMessage {
  id:            string;
  engagement_id: string;
  sender_type:   'tenant' | 'firm';
  sender_id:     string;
  body:          string;
  created_at:    string;
}

export interface CompLegalEngagement {
  id:              string;
  firm_id:         string;
  firm_name:       string; // joined
  application_id:  string | null;
  engagement_type: string;
  agency_code:     string | null;
  brief:           string;
  status:          LegalEngagementStatus;
  quoted_price:    string | null;
  created_by:      string;
  customer_id:     string | null;
  customer_name:   string | null;
  created_at:      string;
  updated_at:      string;
  milestones:      CompLegalMilestone[];
  messages:        CompLegalMessage[];
}

export interface CreateEngagementInput {
  firm_id:         string;
  engagement_type: string;
  agency_code?:    string;
  application_id?: string;
  brief:           string;
  customer_id?:    string;
}

// ── Phase F: Canonical Permit Engine ─────────────────────────

export type RequirementFrequency = 'once' | 'annual' | 'semi_annual' | 'quarterly' | 'monthly' | 'on_demand';
export type RequirementReviewState = 'draft' | 'under_review' | 'reviewed' | 'published' | 'superseded' | 'withdrawn';
export type HolderType = 'entity' | 'site' | 'product' | 'asset' | 'activity';
export type AssuranceLevel = 'verified' | 'self_declared' | 'unverified' | 'expired_verification';
export type LifecycleCycleType = 'application' | 'renewal' | 'amendment' | 'cancellation' | 'surrender' | 'transfer';
export type LifecycleCycleStatus = 'draft' | 'pending_documents' | 'pending_review' | 'submitted' | 'under_authority_review' | 'approved' | 'issued' | 'rejected' | 'cancelled' | 'failed';
export type FeeType = 'application' | 'renewal' | 'late_penalty' | 'annual' | 'inspection' | 'other';
export type EvidenceType = 'document' | 'receipt' | 'photo' | 'screenshot' | 'certificate' | 'correspondence' | 'other';
export type CoverageLevel = 'comprehensive' | 'substantial' | 'partial' | 'minimal' | 'stub';

export interface RequirementDefinition {
  id:               string;
  code:             string;
  jurisdiction:     string;
  name:             string;
  description:      string | null;
  legal_instrument: string | null;
  source_url:       string | null;
  industry_key:     string | null;
  activity_type:    string | null;
  holder_type:      HolderType | null;
  agency_code:      string | null;
  frequency:        RequirementFrequency;
  mandatory:        boolean;
  required_evidence: unknown[];
  applicability:     Record<string, unknown>;
  dependencies:      string[];
  exemptions:        unknown[];
  version:           number;
  effective_from:    string;
  effective_to:      string | null;
  review_state:      RequirementReviewState;
  reviewed_by:       string | null;
  reviewed_at:       string | null;
  review_notes:      string | null;
  created_at:        string;
  updated_at:        string;
}

export interface FeeDefinition {
  id:                 string;
  requirement_def_id: string;
  fee_type:           FeeType;
  name:               string;
  currency:           string;
  amount:             number | null;
  formula:            string | null;
  formula_inputs:     Record<string, unknown>;
  grace_days:         number | null;
  cap_amount:         number | null;
  effective_from:     string;
  effective_to:       string | null;
  source_reference:   string | null;
  created_at:         string;
}

export interface LifecycleCycle {
  id:                 string;
  cert_id:            string | null;
  requirement_def_id: string | null;
  cycle_type:         LifecycleCycleType;
  status:             LifecycleCycleStatus;
  owner_id:           string | null;
  delegate_id:        string | null;
  entity_id:          string | null;
  site_id:            string | null;
  jurisdiction:       string;
  agency_code:        string | null;
  prerequisites:      unknown[];
  deadline:           string | null;
  budget_estimate:    number | null;
  budget_currency:    string | null;
  actual_cost:        number | null;
  submission_ref:     string | null;
  submission_date:    string | null;
  authority_ref:      string | null;
  outcome_date:       string | null;
  outcome_notes:      string | null;
  metadata:           Record<string, unknown>;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface LifecycleEvidence {
  id:            string;
  cycle_id:      string;
  file_id:       string | null;
  file_name:     string;
  file_url:      string | null;
  evidence_type: EvidenceType;
  description:   string | null;
  uploaded_by:   string | null;
  created_at:    string;
}

export interface JurisdictionPack {
  id:                string;
  jurisdiction:      string;
  name:              string;
  country_code:      string;
  subnational_code:  string | null;
  coverage_level:    CoverageLevel;
  last_reviewed:     string | null;
  reviewed_by:       string | null;
  source_notes:      string | null;
  requirement_count: number;
  missing_areas:     string[];
  created_at:        string;
  updated_at:        string;
}

export interface CreateRequirementDefInput {
  code:              string;
  jurisdiction?:     string;
  name:              string;
  description?:      string;
  legal_instrument?: string;
  source_url?:       string;
  industry_key?:     string;
  activity_type?:    string;
  holder_type?:      HolderType;
  agency_code?:      string;
  frequency?:        RequirementFrequency;
  mandatory?:        boolean;
  required_evidence?: unknown[];
  applicability?:     Record<string, unknown>;
  dependencies?:      string[];
  exemptions?:        unknown[];
  effective_from?:    string;
  effective_to?:      string;
}

export interface CreateLifecycleCycleInput {
  cert_id?:            string;
  requirement_def_id?: string;
  cycle_type:          LifecycleCycleType;
  owner_id?:           string;
  delegate_id?:        string;
  entity_id?:          string;
  site_id?:            string;
  jurisdiction?:       string;
  agency_code?:        string;
  prerequisites?:      unknown[];
  deadline?:           string;
  budget_estimate?:    number;
  budget_currency?:    string;
}

export interface UpdateLifecycleCycleInput {
  status?:          LifecycleCycleStatus;
  delegate_id?:     string | null;
  submission_ref?:  string;
  submission_date?: string;
  authority_ref?:   string;
  outcome_date?:    string;
  outcome_notes?:   string;
  actual_cost?:     number;
  metadata?:        Record<string, unknown>;
}

export interface AddLifecycleEvidenceInput {
  file_id?:       string;
  file_name:      string;
  file_url?:      string;
  evidence_type?: EvidenceType;
  description?:   string;
}

// ── Phase G: Cross-App Permit Capture & Checks ───────────────

export type CandidateClassification = 'pending' | 'permit' | 'renewal' | 'not_permit' | 'needs_review' | 'duplicate';
export type CandidateStatus = 'pending' | 'scanning' | 'classified' | 'under_review' | 'registered' | 'dismissed' | 'duplicate' | 'failed';
export type ClassifierType = 'manual' | 'ocr' | 'ai' | 'rule';
export type CheckType = 'status' | 'clearance' | 'pre_activity' | 'audit';
export type CheckResult = 'valid' | 'expired' | 'expiring' | 'missing' | 'revoked' | 'suspended' | 'pending' | 'unknown' | 'not_applicable';
export type CheckFreshness = 'live' | 'cached' | 'stale' | 'unavailable';
export type ImpactAction = 'block' | 'require_review' | 'warn' | 'log_only' | 'none';
export type AppIntakePath = 'upload' | 'import' | 'scan' | 'api_sync' | 'manual' | 'none' | 'not_applicable';
export type AppCheckPath = 'pre_activity' | 'clearance' | 'status' | 'audit' | 'none' | 'not_applicable';
export type AppCoverageStatus = 'implemented' | 'planned' | 'not_applicable' | 'excluded';

export interface PermitCandidate {
  id:                    string;
  source_app:            string;
  source_record_type:    string | null;
  source_record_id:      string | null;
  source_attachment_id:  string | null;
  source_file_name:      string;
  source_file_url:       string | null;
  source_version:        number;
  classification:        CandidateClassification;
  confidence:            number | null;
  classifier_type:       ClassifierType | null;
  holder_claim:          string | null;
  issuer_claim:          string | null;
  jurisdiction_claim:    string | null;
  permit_number_claim:   string | null;
  expiry_claim:          string | null;
  issued_claim:          string | null;
  captured_by:           string | null;
  reviewed_by:           string | null;
  reviewed_at:           string | null;
  review_notes:          string | null;
  status:                CandidateStatus;
  linked_cert_id:        string | null;
  linked_cycle_id:       string | null;
  metadata:              Record<string, unknown>;
  created_at:            string;
  updated_at:            string;
}

export interface PermitCheckResult {
  id:                    string;
  requesting_app:        string;
  requesting_record_type: string | null;
  requesting_record_id:  string | null;
  check_type:            CheckType;
  entity_id:             string | null;
  site_id:               string | null;
  jurisdiction:          string;
  requirement_code:      string | null;
  cert_id:               string | null;
  result:                CheckResult;
  reasons:               string[];
  assurance_level:       string;
  rules_version:         number | null;
  freshness:             CheckFreshness;
  impact_action:         ImpactAction;
  impact_notes:          string | null;
  checked_at:            string;
  checked_by:            string | null;
  expires_at:            string | null;
}

export interface AppCoverage {
  id:               string;
  app_id:           string;
  intake_path:      AppIntakePath;
  check_path:       AppCheckPath;
  coverage_status:  AppCoverageStatus;
  evidence_notes:   string | null;
  last_verified:    string | null;
  verified_by:      string | null;
  created_at:       string;
  updated_at:       string;
}

export interface CapturePermitInput {
  source_app:           string;
  source_record_type?:  string;
  source_record_id?:    string;
  source_attachment_id?: string;
  source_file_name:     string;
  source_file_url?:     string;
  holder_claim?:        string;
  issuer_claim?:        string;
  jurisdiction_claim?:  string;
  permit_number_claim?: string;
  expiry_claim?:        string;
  issued_claim?:        string;
}

export interface ClassifyCandidateInput {
  classification:       CandidateClassification;
  confidence?:          number;
  classifier_type:      ClassifierType;
  holder_claim?:        string;
  issuer_claim?:        string;
  jurisdiction_claim?:  string;
  permit_number_claim?: string;
  expiry_claim?:        string;
  issued_claim?:        string;
  review_notes?:        string;
}

export interface RegisterCandidateInput {
  linked_cert_id?:  string;
  linked_cycle_id?: string;
  review_notes?:    string;
}

export interface PerformCheckInput {
  requesting_app:         string;
  requesting_record_type?: string;
  requesting_record_id?:  string;
  check_type?:            CheckType;
  entity_id?:             string;
  site_id?:               string;
  jurisdiction?:          string;
  requirement_code?:      string;
  cert_id?:               string;
}

// ── Phase H: Industry workflow types ────────────────────────────

export type WorkflowDefCategory =
  | 'operational' | 'regulatory' | 'financial' | 'quality'
  | 'procurement' | 'logistics' | 'hr' | 'sales' | 'production';
export type WorkflowDefStatus = 'draft' | 'published' | 'deprecated';
export type MatrixStatus =
  | 'demonstrated' | 'implemented' | 'planned'
  | 'unsupported' | 'excluded' | 'not_applicable';
export type WorkflowInstanceStatus = 'active' | 'paused' | 'disabled' | 'draft';
export type WorkflowTxnStatus =
  | 'pending' | 'in_progress' | 'completed'
  | 'failed' | 'skipped' | 'cancelled';

export interface WorkflowDefinition {
  id:               string;
  industry_key:     string;
  app_id:           string;
  workflow_code:    string;
  name:             string;
  description:      string | null;
  category:         WorkflowDefCategory;
  steps:            unknown[];
  required_apps:    string[];
  required_permits: string[];
  config_schema:    Record<string, unknown>;
  status:           WorkflowDefStatus;
  created_at:       string;
  updated_at:       string;
}

export interface IndustryAppMatrix {
  id:               string;
  industry_key:     string;
  app_id:           string;
  status:           MatrixStatus;
  workflow_count:   number;
  evidence_notes:   string | null;
  last_verified:    string | null;
  verified_by:      string | null;
  created_at:       string;
  updated_at:       string;
}

export interface TenantWorkflowInstance {
  id:               string;
  tenant_id:        string;
  workflow_def_id:  string | null;
  industry_key:     string;
  app_id:           string;
  workflow_code:    string;
  name:             string;
  status:           WorkflowInstanceStatus;
  config:           Record<string, unknown>;
  entity_id:        string | null;
  site_id:          string | null;
  created_by:       string | null;
  created_at:       string;
  updated_at:       string;
}

export interface WorkflowTransaction {
  id:                     string;
  tenant_id:              string;
  workflow_instance_id:   string;
  step_code:              string;
  step_name:              string;
  source_app:             string;
  target_app:             string | null;
  status:                 WorkflowTxnStatus;
  input_data:             Record<string, unknown>;
  output_data:            Record<string, unknown>;
  source_record_type:     string | null;
  source_record_id:       string | null;
  target_record_type:     string | null;
  target_record_id:       string | null;
  started_at:             string | null;
  completed_at:           string | null;
  executed_by:            string | null;
  error_message:          string | null;
  created_at:             string;
}

export interface CreateWorkflowDefInput {
  industry_key:     string;
  app_id:           string;
  workflow_code:    string;
  name:             string;
  description?:     string;
  category?:        string;
  steps?:           unknown[];
  required_apps?:   string[];
  required_permits?: string[];
  config_schema?:   Record<string, unknown>;
}

export interface CreateWorkflowInstanceInput {
  workflow_def_id?: string;
  industry_key:    string;
  app_id:          string;
  workflow_code:   string;
  name:            string;
  config?:         Record<string, unknown>;
  entity_id?:      string;
  site_id?:        string;
}

export interface RecordTransactionInput {
  workflow_instance_id: string;
  step_code:            string;
  step_name:            string;
  source_app:           string;
  target_app?:          string;
  status?:              string;
  input_data?:          Record<string, unknown>;
  output_data?:         Record<string, unknown>;
  source_record_type?:  string;
  source_record_id?:    string;
  target_record_type?:  string;
  target_record_id?:    string;
}

// ── Phase I: Launch planner types ───────────────────────────────

export type LaunchCaseStatus =
  | 'intake' | 'planning' | 'in_progress' | 'blocked'
  | 'ready' | 'launched' | 'cancelled';
export type LaunchSiteType =
  | 'office' | 'warehouse' | 'factory' | 'retail'
  | 'branch' | 'depot' | 'clinic' | 'lab' | 'other';
export type LaunchProductType =
  | 'product' | 'service' | 'activity' | 'import'
  | 'export' | 'manufacturing' | 'other';
export type PlanItemCategory =
  | 'permit' | 'registration' | 'inspection' | 'document'
  | 'certification' | 'fee' | 'prerequisite' | 'other';
export type PlanItemStatus =
  | 'pending' | 'in_progress' | 'submitted' | 'approved'
  | 'completed' | 'blocked' | 'exempted' | 'not_applicable' | 'failed';
export type SnapshotType = 'auto' | 'manual' | 'approval' | 'change';

export interface LaunchCase {
  id:                 string;
  tenant_id:          string;
  entity_id:          string | null;
  title:              string;
  description:        string | null;
  status:             LaunchCaseStatus;
  industries:         string[];
  jurisdictions:      string[];
  target_date:        string | null;
  actual_launch_date: string | null;
  overall_readiness:  number;
  created_by:         string | null;
  approved_by:        string | null;
  approved_at:        string | null;
  metadata:           Record<string, unknown>;
  created_at:         string;
  updated_at:         string;
}

export interface LaunchCaseSite {
  id:              string;
  tenant_id:       string;
  launch_case_id:  string;
  site_id:         string | null;
  site_name:       string;
  site_type:       LaunchSiteType;
  jurisdiction:    string;
  address:         string | null;
  metadata:        Record<string, unknown>;
  created_at:      string;
}

export interface LaunchCaseProduct {
  id:              string;
  tenant_id:       string;
  launch_case_id:  string;
  product_name:    string;
  product_type:    LaunchProductType;
  hs_code:         string | null;
  industry_key:    string | null;
  jurisdiction:    string;
  requires_permits: boolean;
  metadata:        Record<string, unknown>;
  created_at:      string;
}

export interface LaunchPlanItem {
  id:                    string;
  tenant_id:             string;
  launch_case_id:        string;
  requirement_def_id:    string | null;
  title:                 string;
  description:           string | null;
  category:              PlanItemCategory;
  status:                PlanItemStatus;
  priority:              number;
  jurisdiction:          string;
  authority:             string | null;
  legal_basis:           string | null;
  estimated_cost:        number | null;
  actual_cost:           number | null;
  currency:              string;
  estimated_days:        number | null;
  deadline:              string | null;
  started_at:            string | null;
  completed_at:          string | null;
  owner_user_id:         string | null;
  linked_cert_id:        string | null;
  linked_cycle_id:       string | null;
  linked_task_id:        string | null;
  dependency_ids:        string[];
  evidence_notes:        string | null;
  exemption_reason:      string | null;
  exemption_approved_by: string | null;
  metadata:              Record<string, unknown>;
  created_at:            string;
  updated_at:            string;
}

export interface LaunchPlanSnapshot {
  id:              string;
  tenant_id:       string;
  launch_case_id:  string;
  snapshot_type:   SnapshotType;
  label:           string | null;
  readiness_score: number | null;
  item_count:      number;
  completed_count: number;
  blocked_count:   number;
  snapshot_data:   unknown[];
  created_by:      string | null;
  created_at:      string;
}

export interface CreateLaunchCaseInput {
  title:           string;
  description?:    string;
  entity_id?:      string;
  industries?:     string[];
  jurisdictions?:  string[];
  target_date?:    string;
}

export interface AddLaunchSiteInput {
  site_name:       string;
  site_type?:      string;
  jurisdiction?:   string;
  address?:        string;
  site_id?:        string;
}

export interface AddLaunchProductInput {
  product_name:    string;
  product_type?:   string;
  hs_code?:        string;
  industry_key?:   string;
  jurisdiction?:   string;
  requires_permits?: boolean;
}

export interface AddPlanItemInput {
  title:              string;
  description?:       string;
  category?:          string;
  priority?:          number;
  jurisdiction?:      string;
  authority?:         string;
  legal_basis?:       string;
  estimated_cost?:    number;
  currency?:          string;
  estimated_days?:    number;
  deadline?:          string;
  owner_user_id?:     string;
  requirement_def_id?: string;
  linked_cert_id?:    string;
  linked_cycle_id?:   string;
  dependency_ids?:    string[];
}

export interface ReadinessResult {
  score:     number;
  total:     number;
  completed: number;
  blocked:   number;
  pending:   number;
}

// ── Phase J: Consultant delegation types ───────────────────────

export type PortfolioClientType = 'workspace' | 'external' | 'prospect';
export type PortfolioStatus = 'active' | 'onboarding' | 'suspended' | 'terminated' | 'prospect';
export type MandateStatus = 'pending' | 'active' | 'suspended' | 'expired' | 'revoked' | 'terminated';
export type MandateDocScope = 'mandate_only' | 'entity_scoped' | 'full_history';
export type MandateHistoryScope = 'mandate_period' | 'current_status' | 'full_history';
export type MandateStaffRole = 'lead' | 'handler' | 'reviewer' | 'viewer' | 'billing';
export type MandateStaffStatus = 'active' | 'suspended' | 'removed';
export type EngagementType = 'retainer' | 'project' | 'ad_hoc' | 'renewal_cycle';
export type EngagementStatus = 'draft' | 'active' | 'completed' | 'cancelled' | 'on_hold';
export type BillingType = 'fixed' | 'hourly' | 'per_item' | 'retainer_monthly';

export interface ProviderClientPortfolio {
  id:                  string;
  provider_tenant_id:  string;
  client_tenant_id:    string | null;
  client_name:         string;
  client_type:         PortfolioClientType;
  status:              PortfolioStatus;
  contact_name:        string | null;
  contact_email:       string | null;
  contact_phone:       string | null;
  industry_key:        string | null;
  jurisdictions:       string[];
  onboarded_at:        string | null;
  terminated_at:       string | null;
  termination_reason:  string | null;
  metadata:            Record<string, unknown>;
  created_by:          string | null;
  created_at:          string;
  updated_at:          string;
}

export interface DelegationMandate {
  id:                  string;
  owner_tenant_id:     string;
  provider_tenant_id:  string;
  portfolio_id:        string | null;
  mandate_code:        string;
  title:               string;
  purpose:             string | null;
  status:              MandateStatus;
  scope_entities:      string[];
  scope_permits:       string[];
  scope_apps:          string[];
  allowed_actions:     string[];
  document_scope:      MandateDocScope;
  history_scope:       MandateHistoryScope;
  effective_from:      string;
  effective_to:        string | null;
  auto_renew:          boolean;
  authorized_by:       string | null;
  authorized_at:       string | null;
  revoked_by:          string | null;
  revoked_at:          string | null;
  revocation_reason:   string | null;
  metadata:            Record<string, unknown>;
  created_by:          string | null;
  created_at:          string;
  updated_at:          string;
}

export interface MandateStaffAssignment {
  id:                  string;
  mandate_id:          string;
  provider_tenant_id:  string;
  user_id:             string;
  role_in_mandate:     MandateStaffRole;
  granted_actions:     string[];
  status:              MandateStaffStatus;
  granted_by:          string | null;
  granted_at:          string;
  removed_at:          string | null;
  removed_by:          string | null;
  created_at:          string;
}

export interface DelegationAuditEntry {
  id:                  string;
  mandate_id:          string;
  owner_tenant_id:     string;
  provider_tenant_id:  string;
  actor_user_id:       string;
  on_behalf_of_tenant: string;
  action_type:         string;
  action_detail:       string | null;
  target_record_type:  string | null;
  target_record_id:    string | null;
  app_id:              string | null;
  ip_address:          string | null;
  metadata:            Record<string, unknown>;
  created_at:          string;
}

export interface ProviderEngagement {
  id:                  string;
  provider_tenant_id:  string;
  portfolio_id:        string;
  mandate_id:          string | null;
  title:               string;
  engagement_type:     EngagementType;
  status:              EngagementStatus;
  fee_amount:          number | null;
  fee_currency:        string;
  billing_type:        BillingType;
  started_at:          string | null;
  completed_at:        string | null;
  notes:               string | null;
  created_by:          string | null;
  created_at:          string;
  updated_at:          string;
}

export interface CreatePortfolioInput {
  client_tenant_id?:   string;
  client_name:         string;
  client_type?:        string;
  contact_name?:       string;
  contact_email?:      string;
  contact_phone?:      string;
  industry_key?:       string;
  jurisdictions?:      string[];
}

export interface CreateMandateInput {
  provider_tenant_id:  string;
  mandate_code:        string;
  title:               string;
  purpose?:            string;
  portfolio_id?:       string;
  scope_entities?:     string[];
  scope_permits?:      string[];
  scope_apps?:         string[];
  allowed_actions?:    string[];
  document_scope?:     MandateDocScope;
  history_scope?:      MandateHistoryScope;
  effective_from?:     string;
  effective_to?:       string;
  auto_renew?:         boolean;
}

export interface AssignStaffInput {
  user_id:             string;
  role_in_mandate?:    MandateStaffRole;
  granted_actions?:    string[];
}

export interface CreateEngagementDelegationInput {
  portfolio_id:        string;
  mandate_id?:         string;
  title:               string;
  engagement_type?:    EngagementType;
  fee_amount?:         number;
  fee_currency?:       string;
  billing_type?:       BillingType;
  notes?:              string;
}

export interface MandateAccessResult {
  allowed:     boolean;
  mandate_id:  string | null;
  reason:      string;
}

// ── Renewal Finance ─────────────────────────────────────────────

export type CostLineCategory =
  | 'authority_application' | 'authority_renewal' | 'inspection'
  | 'late_penalty' | 'agent_fee' | 'translation' | 'document'
  | 'travel' | 'platform_charge' | 'other';
export type CostLinePayeeType = 'authority' | 'agent' | 'provider' | 'other';
export type CostLineSourceType = 'fee_definition' | 'authority_assessment' | 'agent_quotation' | 'manual_estimate' | 'invoice' | 'other';
export type BudgetStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'superseded';
export type AllocationType = 'bill' | 'expense' | 'payment' | 'refund' | 'credit' | 'reversal';
export type AllocationRecordType = 'supplier_bill' | 'finance_expense' | 'bill_payment' | 'invoice_payment';

export interface RenewalCostLine {
  id:                 string;
  cycle_id:           string;
  cert_id:            string | null;
  entity_id:          string | null;
  site_id:            string | null;
  category:           CostLineCategory;
  description:        string;
  payee_type:         CostLinePayeeType | null;
  payee_name:         string | null;
  currency:           string;
  quantity:           number;
  unit_price:         number;
  tax_amount:         number;
  total_amount:       number;
  due_date:           string | null;
  source_type:        CostLineSourceType | null;
  source_ref:         string | null;
  assessment_date:    string | null;
  assessment_version: number;
  notes:              string | null;
  created_by:         string | null;
  created_at:         string;
  updated_at:         string;
}

export interface RenewalBudget {
  id:                string;
  cycle_id:          string;
  version:           number;
  currency:          string;
  approved_amount:   number;
  allocated_lines:   unknown[];
  reason:            string | null;
  status:            BudgetStatus;
  requested_by:      string | null;
  requested_at:      string;
  approved_by:       string | null;
  approved_at:       string | null;
  rejection_reason:  string | null;
  metadata:          Record<string, unknown>;
  created_at:        string;
}

export interface RenewalAllocation {
  bill_id?: string;
  id:                  string;
  cost_line_id:        string;
  cycle_id:            string;
  allocation_type:     AllocationType;
  finance_record_type: AllocationRecordType;
  finance_record_id:   string;
  currency:            string;
  amount:              number;
  allocation_date:     string;
  reconciled:          boolean;
  reconciled_by:       string | null;
  reconciled_at:       string | null;
  notes:               string | null;
  created_by:          string | null;
  created_at:          string;
}

export interface RenewalForecast {
  id:               string;
  tenant_id:        string;
  snapshot_date:    string;
  currency:         string;
  forecast_30d:     number;
  forecast_90d:     number;
  forecast_365d:    number;
  net_paid_ytd:     number;
  open_commitments: number;
  approved_budget:  number;
  unpriced_count:   number;
  coverage_pct:     number | null;
  created_at:       string;
}

export interface RenewalFinanceOverview {
  net_paid_ytd:       number;
  approved_budget:    number;
  open_commitments:   number;
  due_payables:       number;
  overdue_payables:   number;
  forecast_30d:       number;
  forecast_90d:       number;
  forecast_365d:      number;
  budget_variance:    number;
  unpriced_count:     number;
  currency:           string;
}

export interface RenewalCycleCostSummary {
  entity_id?: string | null;
  site_id?: string | null;
  cost_line_count?: number;
  open_commitments?: number;
  cycle_id:           string;
  cert_id:            string | null;
  cert_name:          string | null;
  cert_number:        string | null;
  agency_code:        string | null;
  entity_name:        string | null;
  site_name:          string | null;
  jurisdiction:       string;
  cycle_status:       string;
  expiry_date:        string | null;
  currency:           string;
  estimated_cost:     number;
  approved_budget:    number;
  committed:          number;
  net_paid:           number;
  remaining_forecast: number;
  variance:           number;
  payee:              string | null;
  has_evidence:       boolean;
}

export interface CreateCostLineInput {
  cycle_id:           string;
  cert_id?:           string;
  entity_id?:         string;
  site_id?:           string;
  category:           CostLineCategory;
  description:        string;
  payee_type?:        CostLinePayeeType;
  payee_name?:        string;
  currency?:          string;
  quantity?:          number;
  unit_price:         number;
  tax_amount?:        number;
  due_date?:          string;
  source_type?:       CostLineSourceType;
  source_ref?:        string;
  assessment_date?:   string;
  notes?:             string;
}

export interface CreateBudgetInput {
  cycle_id:           string;
  currency?:          string;
  approved_amount:    number;
  allocated_lines?:   unknown[];
  reason?:            string;
}

export interface ApproveBudgetInput {
  approved:           boolean;
  rejection_reason?:  string;
}

export interface CreateAllocationInput {
  cost_line_id:        string;
  cycle_id:            string;
  allocation_type:     AllocationType;
  finance_record_type: AllocationRecordType;
  finance_record_id:   string;
  currency?:           string;
  amount:              number;
  allocation_date?:    string;
  notes?:              string;
}

// ── Phase K: Marketplace types ─────────────────────────────────

export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'suspended' | 'archived';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'expired' | 'rejected';
export type EnquiryUrgency = 'low' | 'normal' | 'high' | 'urgent';
export type EnquiryStatus = 'open' | 'responded' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'superseded' | 'withdrawn';
export type AssignmentStatus = 'pending' | 'in_progress' | 'under_review' | 'completed' | 'cancelled' | 'reassigned' | 'disputed';
export type AssignmentPriority = 'low' | 'normal' | 'high' | 'urgent';
export type MilestoneEvidenceType = 'document' | 'screenshot' | 'receipt' | 'certificate' | 'correspondence' | 'other';
export type MilestoneStatus = 'pending' | 'submitted' | 'accepted' | 'rejected' | 'waived';
export type DisputeStatus = 'open' | 'under_review' | 'mediation' | 'resolved' | 'escalated' | 'closed';

export interface MarketplaceListing {
  id:                    string;
  provider_tenant_id:    string;
  display_name:          string;
  tagline:               string | null;
  description:           string | null;
  services:              string[];
  jurisdictions:         string[];
  industries:            string[];
  status:                ListingStatus;
  verification_status:   VerificationStatus;
  verification_evidence: Record<string, unknown>;
  verified_at:           string | null;
  verified_by:           string | null;
  avg_rating:            number | null;
  review_count:          number;
  min_fee:               number | null;
  max_fee:               number | null;
  fee_currency:          string;
  contact_email:         string | null;
  contact_phone:         string | null;
  website_url:           string | null;
  metadata:              Record<string, unknown>;
  created_at:            string;
  updated_at:            string;
}

export interface MarketplaceEnquiry {
  id:                    string;
  client_tenant_id:      string;
  provider_tenant_id:    string;
  listing_id:            string | null;
  subject:               string;
  brief:                 string | null;
  services_requested:    string[];
  jurisdictions:         string[];
  urgency:               EnquiryUrgency;
  status:                EnquiryStatus;
  budget_min:            number | null;
  budget_max:            number | null;
  budget_currency:       string;
  responded_at:          string | null;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
}

export interface MarketplaceQuotation {
  id:                    string;
  enquiry_id:            string | null;
  provider_tenant_id:    string;
  client_tenant_id:      string;
  quote_number:          string;
  scope_description:     string;
  line_items:            unknown[];
  authority_fees:        number;
  professional_fees:     number;
  platform_charges:      number;
  variable_services:     number;
  total_amount:          number;
  currency:              string;
  valid_until:           string | null;
  status:                QuotationStatus;
  accepted_at:           string | null;
  accepted_by:           string | null;
  rejection_reason:      string | null;
  metadata:              Record<string, unknown>;
  created_at:            string;
  updated_at:            string;
}

export interface MarketplaceAssignment {
  id:                    string;
  provider_tenant_id:    string;
  client_tenant_id:      string;
  engagement_id:         string | null;
  mandate_id:            string | null;
  quotation_id:          string | null;
  title:                 string;
  description:           string | null;
  assigned_to:           string | null;
  status:                AssignmentStatus;
  priority:              AssignmentPriority;
  started_at:            string | null;
  due_date:              string | null;
  completed_at:          string | null;
  reassigned_from:       string | null;
  reassigned_at:         string | null;
  cancellation_reason:   string | null;
  created_at:            string;
  updated_at:            string;
}

export interface MarketplaceMilestone {
  id:                    string;
  assignment_id:         string;
  provider_tenant_id:    string;
  title:                 string;
  description:           string | null;
  evidence_type:         MilestoneEvidenceType;
  evidence_url:          string | null;
  evidence_file_id:      string | null;
  status:                MilestoneStatus;
  submitted_at:          string | null;
  reviewed_by:           string | null;
  reviewed_at:           string | null;
  review_notes:          string | null;
  created_at:            string;
}

export interface MarketplaceDispute {
  id:                    string;
  assignment_id:         string;
  raised_by_tenant:      string;
  against_tenant:        string;
  reason:                string;
  details:               string | null;
  status:                DisputeStatus;
  resolution:            string | null;
  resolved_by:           string | null;
  resolved_at:           string | null;
  created_at:            string;
  updated_at:            string;
}

// ── Phase L: Enterprise metrics types ─────────────────────────

export type PlatformMetricType = 'daily' | 'weekly' | 'monthly';
export type TenantMetricType = 'daily' | 'weekly' | 'monthly';
export type ResourceEnforcement = 'soft' | 'hard';
export type OverageAction = 'warn' | 'block' | 'throttle' | 'notify';
export type DurableJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';
export type BulkOperationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial' | 'cancelled';
export type BulkOperationType = 'import' | 'export' | 'sync' | 'migration' | 'cleanup';

export interface PlatformMetricSnapshot {
  id:                      string;
  snapshot_date:           string;
  metric_type:             PlatformMetricType;
  total_tenants:           number;
  active_tenants:          number;
  total_users:             number;
  active_users_7d:         number;
  total_permits:           number;
  permits_expiring_30d:    number;
  total_subscriptions:     number;
  paid_subscriptions:      number;
  mrr_amount:              number;
  provider_count:          number;
  marketplace_engagements: number;
  support_tickets_open:    number;
  queue_depth:             number;
  infrastructure:          Record<string, unknown>;
  computed_at:             string;
  created_at:              string;
}

export interface TenantMetricSnapshot {
  id:                      string;
  tenant_id:               string;
  snapshot_date:           string;
  metric_type:             TenantMetricType;
  user_count:              number;
  entity_count:            number;
  site_count:              number;
  permit_count:            number;
  permits_active:          number;
  permits_expiring:        number;
  permits_expired:         number;
  compliance_score:        number | null;
  total_cost_ytd:          number;
  renewal_work_pending:    number;
  blockers:                number;
  app_usage:               Record<string, unknown>;
  computed_at:             string;
  created_at:              string;
}

export interface TenantResourceLimit {
  id:                      string;
  tenant_id:               string;
  resource_type:           string;
  max_allowed:             number;
  current_usage:           number;
  enforcement:             ResourceEnforcement;
  overage_action:          OverageAction;
  last_checked_at:         string | null;
  created_at:              string;
  updated_at:              string;
}

export interface DurableJob {
  id:                      string;
  tenant_id:               string | null;
  job_type:                string;
  job_key:                 string | null;
  payload:                 Record<string, unknown>;
  status:                  DurableJobStatus;
  priority:                number;
  max_retries:             number;
  retry_count:             number;
  error_message:           string | null;
  result:                  Record<string, unknown> | null;
  scheduled_at:            string;
  started_at:              string | null;
  completed_at:            string | null;
  expires_at:              string | null;
  created_by:              string;
  created_at:              string;
  updated_at:              string;
}

export interface BulkOperation {
  id:                      string;
  tenant_id:               string;
  operation_type:          BulkOperationType;
  source_type:             string | null;
  target_type:             string | null;
  total_records:           number;
  processed_records:       number;
  failed_records:          number;
  status:                  BulkOperationStatus;
  file_url:                string | null;
  result_url:              string | null;
  error_summary:           Record<string, unknown> | null;
  started_at:              string | null;
  completed_at:            string | null;
  created_by:              string;
  created_at:              string;
  updated_at:              string;
}

export interface ResourceCheckResult {
  allowed:                 boolean;
  limit:                   number;
  usage:                   number;
  enforcement:             string;
}

export interface SetResourceLimitInput {
  resource_type:           string;
  max_allowed:             number;
  enforcement?:            ResourceEnforcement;
  overage_action?:         OverageAction;
}

export interface EnqueueJobInput {
  job_type:                string;
  job_key?:                string;
  payload?:                Record<string, unknown>;
  priority?:               number;
  max_retries?:            number;
  scheduled_at?:           string;
  expires_at?:             string;
}

export interface CreateBulkOperationInput {
  operation_type:          string;
  source_type?:            string;
  target_type?:            string;
  total_records:           number;
  file_url?:               string;
}

export interface RenewalFinanceRecordOption {
  id: string;
  type: 'supplier_bill' | 'bill_payment';
  label: string;
  currency: string;
  amount: number;
  available: number;
  bill_id: string;
}


export interface TausiLicenseRecord {
  name: string;
  license_number: string;
  lga: string;
  issued_date: string | null;
  expiry_date: string | null;
  status: string;
  cost: number | null;
}
export interface SaveTausiLicensesInput {
  licenses: TausiLicenseRecord[];
  source: 'tab_capture' | 'document_upload';
  taxpayer?: {name?: string; tin?: string};
  customer_id?: string | null;
}
export interface SaveTausiLicensesResult {
  created: number;
  skipped: number;
  certificate_ids: string[];
}
