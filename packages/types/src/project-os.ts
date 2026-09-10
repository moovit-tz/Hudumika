// ─── Hudumika Project OS Types ──────────────────────────────────────

export type ProjectIndustry =
  | 'construction'
  | 'engineering'
  | 'real_estate'
  | 'manufacturing'
  | 'mining'
  | 'energy'
  | 'agriculture'
  | 'transport'
  | 'public_sector'
  | 'ngo'
  | 'telecom'
  | 'it_software'
  | 'aerospace'
  | 'pharma'
  | 'professional_services'
  | 'general';

export type ProjectHealthStatus = 'green' | 'amber' | 'red' | 'critical';

export type ProjectType =
  | 'capital_expenditure'
  | 'customer_delivery'
  | 'internal'
  | 'r_and_d'
  | 'maintenance';

export type ProjectPortfolioStatus = 'active' | 'planning' | 'on_hold' | 'archived';
export type ProjectProgramStatus = 'active' | 'planning' | 'on_hold' | 'completed' | 'cancelled';
export type ProjectPhaseStatus = 'not_started' | 'in_progress' | 'under_review' | 'completed' | 'on_hold';
export type ProjectWorkPackageStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
export type ProjectDeliverableStatus = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

export interface ProjectPortfolio {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description?: string | null;
  owner_id?: string | null;
  target_roi?: number | null;
  allocated_budget: number;
  spent_budget: number;
  status: ProjectPortfolioStatus;
  strategic_alignment?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectProgram {
  id: string;
  tenant_id: string;
  portfolio_id?: string | null;
  name: string;
  code: string;
  description?: string | null;
  program_manager_id?: string | null;
  budget: number;
  target_benefits?: string[] | null;
  status: ProjectProgramStatus;
  start_date?: string | null;
  end_date?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPhase {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  code?: string | null;
  sequence_order: number;
  start_date?: string | null;
  end_date?: string | null;
  gate_review_date?: string | null;
  status: ProjectPhaseStatus;
  gate_approver_role?: string | null;
  gate_criteria?: Record<string, any> | null;
  gate_passed: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWorkPackage {
  id: string;
  tenant_id: string;
  project_id: string;
  phase_id?: string | null;
  phase_name?: string | null;
  parent_id?: string | null;
  wbs_code: string;
  name: string;
  description?: string | null;
  lead_id?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  planned_cost: number;
  actual_cost: number;
  earned_value: number;
  progress_pct: number;
  status: ProjectWorkPackageStatus;
  deliverables_summary?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDeliverable {
  id: string;
  tenant_id: string;
  project_id: string;
  phase_id?: string | null;
  work_package_id?: string | null;
  title: string;
  code?: string | null;
  description?: string | null;
  owner_id?: string | null;
  due_date?: string | null;
  acceptance_criteria?: string | null;
  status: ProjectDeliverableStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  sign_document_id?: string | null;
  sign_package_id?: string | null;
  contract_id?: string | null;
  attachments?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// ─── Financial Controls & EVM ───────────────────────────────────────

export interface ProjectCostCode {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  category: 'labor' | 'material' | 'equipment' | 'subcontract' | 'overhead' | 'other';
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProjectBudget {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  version: number;
  baseline_budget: number;
  revised_budget: number;
  contingency_reserve: number;
  management_reserve: number;
  currency: string;
  status: 'draft' | 'pending_approval' | 'active' | 'superseded';
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectBudgetLine {
  id: string;
  tenant_id: string;
  budget_id: string;
  project_id: string;
  work_package_id?: string | null;
  cost_code_id?: string | null;
  description: string;
  unit_of_measure?: string | null;
  planned_qty: number;
  planned_unit_rate: number;
  planned_amount: number;
  actual_qty: number;
  actual_amount: number;
  committed_amount: number;
  forecast_at_completion: number;
  variance: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectEvmMetrics {
  pv: number;          // Planned Value
  ev: number;          // Earned Value
  ac: number;          // Actual Cost
  bac: number;         // Budget at Completion
  cpi: number;         // Cost Performance Index = EV / AC
  spi: number;         // Schedule Performance Index = EV / PV
  cv: number;          // Cost Variance = EV - AC
  sv: number;          // Schedule Variance = EV - PV
  eac: number;         // Estimate at Completion = BAC / CPI (or AC + (BAC - EV))
  etc: number;         // Estimate to Complete = EAC - AC
  vac: number;         // Variance at Completion = BAC - EAC
  tcpi: number;        // To-Complete Performance Index = (BAC - EV) / (BAC - AC)
  progress_pct: number;
  planned_value?: number;
  earned_value?: number;
  actual_cost?: number;
  budget_at_completion?: number;
  cost_variance?: number;
  schedule_variance?: number;
  estimate_at_completion?: number;
  estimate_to_complete?: number;
  variance_at_completion?: number;
}

export interface ProjectEvmSnapshot {
  id: string;
  tenant_id: string;
  project_id: string;
  snapshot_date: string;
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cpi: number;
  spi: number;
  cv: number;
  sv: number;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number;
  notes?: string | null;
  created_at: string;
}

// ─── Governance, Risk, Issue & Change Management ─────────────────────

export type ProjectRiskImpact = 'negligible' | 'low' | 'medium' | 'high' | 'critical';
export type ProjectRiskProbability = 'unlikely' | 'possible' | 'likely' | 'almost_certain';
export type ProjectRiskStrategy = 'mitigate' | 'avoid' | 'transfer' | 'accept';
export type ProjectRiskStatus = 'open' | 'monitoring' | 'mitigated' | 'closed';

export interface ProjectRisk {
  id: string;
  tenant_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  category: 'technical' | 'commercial' | 'safety' | 'environmental' | 'legal' | 'operational' | 'schedule';
  probability: ProjectRiskProbability;
  impact: ProjectRiskImpact;
  score: number; // 1-25
  risk_score?: number; // alias
  financial_exposure: number;
  strategy: ProjectRiskStrategy;
  mitigation_plan?: string | null;
  contingency_plan?: string | null;
  owner_id?: string | null;
  status: ProjectRiskStatus;
  review_date?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ProjectIssueStatus = 'open' | 'investigating' | 'in_progress' | 'resolved' | 'closed';

export interface ProjectIssue {
  id: string;
  tenant_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  severity: ProjectIssueSeverity;
  status: ProjectIssueStatus;
  assigned_to?: string | null;
  impact_schedule_days: number;
  impact_cost: number;
  root_cause?: string | null;
  resolution?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectChangeRequestStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'implemented';

export interface ProjectChangeRequest {
  id: string;
  tenant_id: string;
  project_id: string;
  cr_number: string;
  title: string;
  reason: string;
  scope_impact?: string | null;
  cost_impact: number;
  schedule_impact_days: number;
  risk_impact?: string | null;
  status: ProjectChangeRequestStatus;
  requested_by?: string | null;
  evaluated_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  client_approval_required: boolean;
  client_approved_at?: string | null;
  attachments?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// ─── Multi-step Approval Engine ───────────────────────────────────────

export type ProjectApprovalStatus = 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
export type ProjectApprovalEntityType = 'change_request' | 'purchase_request' | 'purchase_order' | 'deliverable' | 'budget' | 'phase_gate' | 'claim';

export interface ProjectApproval {
  id: string;
  tenant_id: string;
  project_id?: string | null;
  entity_type: ProjectApprovalEntityType;
  target_entity_type?: string;
  entity_id: string;
  title: string;
  current_step: number;
  total_steps: number;
  status: ProjectApprovalStatus;
  requester_id: string;
  metadata?: Record<string, any> | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectApprovalStep {
  id: string;
  tenant_id: string;
  approval_id: string;
  step_order: number;
  step_name: string;
  required_role?: string | null;
  assigned_user_id?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  action_by?: string | null;
  action_at?: string | null;
  comments?: string | null;
  created_at: string;
}

// ─── Procurement, Requisitions & Supply Chain ────────────────────────

export type ProjectPurchaseRequestStatus = 'draft' | 'submitted' | 'approved' | 'in_procurement' | 'ordered' | 'received' | 'rejected' | 'converted_to_po';
export type ProjectRfqStatus = 'draft' | 'issued' | 'closed' | 'awarded' | 'cancelled';
export type ProjectPurchaseOrderStatus = 'draft' | 'issued' | 'partially_received' | 'received' | 'fulfilled' | 'invoiced' | 'closed' | 'cancelled';
export type ProjectGoodsReceiptStatus = 'pending_inspection' | 'accepted' | 'rejected' | 'partially_accepted';

export interface ProjectPurchaseRequest {
  id: string;
  tenant_id: string;
  project_id: string;
  work_package_id?: string | null;
  pr_number: string;
  title: string;
  justification?: string | null;
  estimated_cost: number;
  required_date?: string | null;
  status: ProjectPurchaseRequestStatus;
  requested_by: string;
  approved_by?: string | null;
  items?: Array<{
    item_code?: string;
    description: string;
    quantity: number;
    uom: string;
    estimated_rate: number;
    estimated_total: number;
    specifications?: string;
  }> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRfq {
  id: string;
  tenant_id: string;
  project_id: string;
  purchase_request_id?: string | null;
  rfq_number: string;
  title: string;
  scope_description?: string | null;
  issue_date?: string | null;
  closing_date?: string | null;
  status: ProjectRfqStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRfqSupplier {
  id: string;
  tenant_id: string;
  rfq_id: string;
  supplier_name: string;
  contact_email?: string | null;
  quoted_amount?: number | null;
  delivery_lead_time_days?: number | null;
  technical_compliance_score?: number | null;
  commercial_score?: number | null;
  bid_currency?: string | null;
  is_selected: boolean;
  notes?: string | null;
  created_at: string;
}

export interface ProjectPurchaseOrder {
  id: string;
  tenant_id: string;
  project_id: string;
  rfq_id?: string | null;
  purchase_request_id?: string | null;
  po_number: string;
  supplier_name: string;
  supplier_id?: string | null;
  total_amount: number;
  currency: string;
  issue_date: string;
  expected_delivery_date?: string | null;
  status: ProjectPurchaseOrderStatus;
  payment_terms?: string | null;
  incoterms?: string | null;
  delivery_location?: string | null;
  created_by: string;
  approved_by?: string | null;
  items?: Array<{
    item_code?: string;
    description: string;
    quantity: number;
    uom: string;
    unit_price: number;
    total_price: number;
    delivered_qty?: number;
  }> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectGoodsReceipt {
  id: string;
  tenant_id: string;
  po_id: string;
  project_id: string;
  grn_number: string;
  received_date: string;
  received_by: string;
  carrier_delivery_note_ref?: string | null;
  status: ProjectGoodsReceiptStatus;
  items_received?: Array<{
    item_code?: string;
    description: string;
    ordered_qty: number;
    received_qty: number;
    accepted_qty: number;
    rejected_qty: number;
    defect_reason?: string;
  }> | null;
  inspector_notes?: string | null;
  created_at: string;
}

// ─── Resource & Machinery Fleet Management ───────────────────────────

export type ProjectResourceType = 'personnel' | 'heavy_machinery' | 'equipment' | 'tool' | 'facility' | 'vehicle';
export type ProjectResourceStatus = 'available' | 'allocated' | 'maintenance' | 'decommissioned';

export interface ProjectResource {
  id: string;
  tenant_id: string;
  resource_type: ProjectResourceType;
  name: string;
  code?: string | null;
  make_model?: string | null;
  serial_number?: string | null;
  license_plate?: string | null;
  capacity_rating?: string | null;
  user_id?: string | null;
  cost_rate_hourly: number;
  cost_rate_daily: number;
  currency: string;
  telemetry_id?: string | null;
  last_maintenance_date?: string | null;
  next_maintenance_date?: string | null;
  status: ProjectResourceStatus;
  location?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectResourceAllocation {
  id: string;
  tenant_id: string;
  project_id: string;
  work_package_id?: string | null;
  resource_id: string;
  resource_name?: string | null;
  resource_type?: string | null;
  start_date: string;
  end_date: string;
  allocated_pct: number;
  hours_planned: number;
  hours_actual: number;
  operator_id?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Industry Pack Specific Data ──────────────────────────────────────

export interface ProjectIndustryData {
  id: string;
  tenant_id: string;
  project_id: string;
  industry: ProjectIndustry;
  data_type: string; // 'boq', 'rfi', 'site_diary', 'bom', 'logframe', 'sprint', etc.
  record_data: Record<string, any>;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// Extended Project Model with OS Attributes
export interface ProjectOSDetail {
  id: string;
  tenant_id: string;
  portfolio_id?: string | null;
  program_id?: string | null;
  portfolio_name?: string | null;
  program_name?: string | null;
  name: string;
  code?: string | null;
  description?: string | null;
  industry: ProjectIndustry;
  project_type?: string | null;
  health_status: ProjectHealthStatus;
  status: string;
  progress_pct: number;
  contract_value: number;
  baseline_budget: number;
  current_budget: number;
  actual_cost: number;
  earned_value: number;
  planned_value: number;
  currency: string;
  start_date?: string | null;
  end_date?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  actual_start?: string | null;
  actual_end?: string | null;
  location_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  client_id?: string | null;
  client_name?: string | null;
  project_manager_id?: string | null;
  project_manager_name?: string | null;
  evm: ProjectEvmMetrics;
  counts: {
    phases: number;
    work_packages: number;
    deliverables: number;
    open_risks: number;
    critical_issues: number;
    pending_approvals: number;
    active_pos: number;
    allocated_resources: number;
  };
}

export interface ProjectCommandCenterMetrics {
  total_portfolios: number;
  total_programs: number;
  total_projects: number;
  active_projects: number;
  total_contract_value: number;
  total_budget: number;
  total_spent: number;
  total_earned_value: number;
  portfolio_cpi: number;
  portfolio_spi: number;
  health_distribution: {
    green: number;
    amber: number;
    red: number;
    critical: number;
  };
  industry_distribution: Record<string, number>;
  active_rfis_and_claims: number;
  pending_approvals: number;
  heavy_machinery_utilization_pct: number;
}
