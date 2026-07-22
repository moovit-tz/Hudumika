// ── ComplyOS shared types ─────────────────────────────────────

import type { Customer } from './user.js';

export type CompCertStatus    = 'active' | 'expiring' | 'expired' | 'revoked';
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
  active_certs:     number;
  expiring_soon:    number;  // next 30 days
  pending_apps:     number;
  overdue:          number;
  health_score:     number;  // 0–100
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
