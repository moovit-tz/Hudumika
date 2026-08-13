// ─── Hudumika Core Types ──────────────────────────────────────
// The primary unit of work is the ShipmentCase. Everything else
// orbits the case: documents, people, approvals, payments, comms.

// ── Shipment Types ───────────────────────────────────────────

export type ShipmentType = 'SEA_FCL' | 'SEA_LCL' | 'AIR' | 'ROAD' | 'RAIL' | 'BULK';

// ── 18 Clearance Stages ──────────────────────────────────────
// Every import case moves through these stages sequentially.
// Each transition triggers notifications and updates the journey bar.

export type ClearanceStage =
  | 'DOCS_RECEIVED'       // 1. Documents received from customer
  | 'VALIDATION'          // 2. Officer validates documents
  | 'PERMITS'             // 3. Permit applications (TMDA, TFDA, etc)
  | 'ENTRY_PREP'          // 4. Entry preparation for customs
  | 'TANCIS_REG'          // 5. TANCIS registration
  | 'ASSESSMENT'          // 6. Tax/duty assessment by TRA
  | 'TAX_PAYMENT'         // 7. Duty payment to TRA
  | 'DO_APPLICATION'      // 8. Delivery Order application
  | 'INSPECTION_BOOKING'  // 9. Inspection booking
  | 'INSPECTION'          // 10. Physical/document inspection
  | 'GOV_REMARKS'         // 11. Government remarks clearance
  | 'RELEASE'             // 12. Customs release order
  | 'ICD_PAYMENT'         // 13. ICD/storage payment
  | 'GATE_PASS'           // 14. Gate pass issuance
  | 'TRANSPORT'           // 15. Transport to customer
  | 'DELIVERY'            // 16. Delivered to customer
  | 'EMPTY_RETURN'        // 17. Empty container return
  | 'INVOICING'           // 18. Final invoicing
  | 'CLOSED';             // Terminal state

export const CLEARANCE_STAGES: ClearanceStage[] = [
  'DOCS_RECEIVED', 'VALIDATION', 'PERMITS', 'ENTRY_PREP',
  'TANCIS_REG', 'ASSESSMENT', 'TAX_PAYMENT', 'DO_APPLICATION',
  'INSPECTION_BOOKING', 'INSPECTION', 'GOV_REMARKS', 'RELEASE',
  'ICD_PAYMENT', 'GATE_PASS', 'TRANSPORT', 'DELIVERY',
  'EMPTY_RETURN', 'INVOICING', 'CLOSED',
];

export const STAGE_LABELS: Record<ClearanceStage, string> = {
  DOCS_RECEIVED: 'Docs Received',
  VALIDATION: 'Validation',
  PERMITS: 'Permit Applications',
  ENTRY_PREP: 'Entry Preparation',
  TANCIS_REG: 'TANCIS Registration',
  ASSESSMENT: 'Assessment & Payment',
  TAX_PAYMENT: 'Tax Payment',
  DO_APPLICATION: 'DO Application',
  INSPECTION_BOOKING: 'Inspection Booking',
  INSPECTION: 'Inspection',
  GOV_REMARKS: 'Gov Remarks',
  RELEASE: 'Release',
  ICD_PAYMENT: 'ICD Payment',
  GATE_PASS: 'Gate Pass',
  TRANSPORT: 'Transport & Delivery',
  DELIVERY: 'Delivered',
  EMPTY_RETURN: 'Empty Return',
  INVOICING: 'Invoicing',
  CLOSED: 'Closed',
};

// ── Customer-Facing Journey (simplified 6 milestones) ────────

export type CustomerMilestone =
  | 'docs_received'
  | 'customs_lodged'
  | 'duty_paid'
  | 'customs_released'
  | 'in_transit'
  | 'delivered';

export const CUSTOMER_MILESTONES: CustomerMilestone[] = [
  'docs_received', 'customs_lodged', 'duty_paid',
  'customs_released', 'in_transit', 'delivered',
];

export const MILESTONE_LABELS: Record<CustomerMilestone, string> = {
  docs_received: 'Docs Received',
  customs_lodged: 'Customs Lodged',
  duty_paid: 'Duty Paid',
  customs_released: 'Customs Released',
  in_transit: 'In Transit',
  delivered: 'Delivered',
};

// Maps internal 18-stage to customer-facing 6-milestone
export const STAGE_TO_MILESTONE: Record<ClearanceStage, CustomerMilestone> = {
  DOCS_RECEIVED: 'docs_received',
  VALIDATION: 'docs_received',
  PERMITS: 'docs_received',
  ENTRY_PREP: 'customs_lodged',
  TANCIS_REG: 'customs_lodged',
  ASSESSMENT: 'customs_lodged',
  TAX_PAYMENT: 'duty_paid',
  DO_APPLICATION: 'duty_paid',
  INSPECTION_BOOKING: 'customs_released',
  INSPECTION: 'customs_released',
  GOV_REMARKS: 'customs_released',
  RELEASE: 'customs_released',
  ICD_PAYMENT: 'customs_released',
  GATE_PASS: 'in_transit',
  TRANSPORT: 'in_transit',
  DELIVERY: 'delivered',
  EMPTY_RETURN: 'delivered',
  INVOICING: 'delivered',
  CLOSED: 'delivered',
};

// ── Container ────────────────────────────────────────────────

export interface Container {
  number: string;          // e.g. 'MSKU4521890'
  size: '20FT' | '40FT' | '40HC' | 'OTHER';
  seal_number?: string;
  weight_kg?: number;
}

// ── Stage History (append-only log) ──────────────────────────

export interface StageEvent {
  id: string;
  shipment_id: string;
  tenant_id: string;
  stage: ClearanceStage;
  entered_at: string;      // ISO 8601
  exited_at?: string;
  duration_h?: number;     // computed on exit
  actor_id: string;
  note?: string;
  blocker?: string;        // what stopped progress here
}

// ── Risk Flags ───────────────────────────────────────────────

export type RiskFlagType =
  | 'DEMURRAGE'
  | 'SLA_BREACH'
  | 'PENALTY'
  | 'MISSING_DOC'
  | 'OVERSPEND';

export type RiskSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RiskFlag {
  id: string;
  tenant_id: string;
  shipment_id: string;
  type: RiskFlagType;
  severity: RiskSeverity;
  message: string;
  deadline?: string;
  resolved: boolean;
  resolved_at?: string;
  created_at: string;
}

// ── Document ─────────────────────────────────────────────────

export type DocumentType =
  | 'BL'              // Bill of Lading (sea)
  | 'AWB'             // Air Waybill (air freight)
  | 'INVOICE'         // Commercial Invoice
  | 'PACKING_LIST'    // Packing List
  | 'PERMIT'          // Regulatory permit (TMDA, TFDA, etc.)
  | 'CERTIFICATE'     // Certificate of Origin, etc.
  | 'CUSTOMS_ENTRY'   // Customs entry form
  | 'DUTY_RECEIPT'    // TRA duty payment receipt
  | 'RELEASE_ORDER'   // Customs release order
  | 'DELIVERY_NOTE'   // Delivery confirmation
  // Customs assessment & payment phase
  | 'PRE_ASSESSMENT'       // TRA pre-assessment notice
  | 'FINAL_ASSESSMENT'     // TRA final assessment notice
  | 'TISS'                 // TISS (Tanzania Interbank Settlement System) instruction
  | 'PAYMENT_NOTE'         // Payment note / control number
  | 'TISS_PAYMENT_INVOICE' // TISS payment invoice / bank slip
  | 'TBS_CHARGES'          // TBS (Tanzania Bureau of Standards) charges — optional
  | 'COC'                  // Certificate of Conformity — optional
  | 'WHARFAGE'             // Wharfage charges — optional
  // Post-clearance / commercial phase (client-facing billing & container cycle)
  | 'CLIENT_INVOICE'          // Clearing/freight invoice issued to the customer
  | 'PAYMENT_RECEIPT'         // Customer payment receipt (proof of collection)
  | 'CONTAINER_DEPOSIT'       // Shipping-line container deposit paid
  | 'CONTAINER_RETURN'        // Empty container returned & deposit refunded
  | 'OTHER';

export type DocumentStatus = 'REQUIRED' | 'RECEIVED' | 'VERIFIED' | 'REJECTED' | 'MISSING';

export interface CaseDocument {
  id: string;
  tenant_id: string;
  shipment_id: string;
  type: DocumentType;
  filename: string;
  storage_key: string;      // MinIO object key
  status: DocumentStatus;
  uploaded_by?: string;      // user_id
  verified_at?: string;
  due_date?: string;
  notes?: string;
  created_at: string;
}

// ── Expense / Revenue Line ───────────────────────────────────

export type ExpenseCategory =
  | 'DUTY'          // Government duty
  | 'PORT'          // Port charges
  | 'INSPECTION'    // TASAC / other inspections
  | 'TRANSPORT'     // Haulage / transport
  | 'STORAGE'       // ICD / CFS storage
  | 'AGENCY'        // Agency & handling fee
  | 'CLEARANCE'     // Clearance service fee
  | 'OTHER';

export interface Expense {
  id: string;
  tenant_id: string;
  shipment_id: string;
  category: ExpenseCategory;
  label: string;             // 'Clearance Fee', 'TRA Duty', etc.
  amount_tzs: number;
  is_revenue: boolean;       // true = your fee; false = cost
  is_passthrough: boolean;   // true = collected & passed to govt
  recorded_by?: string;
  created_at: string;
}

// ── Message / Communication ──────────────────────────────────

export type MessageChannel = 'WHATSAPP' | 'EMAIL' | 'IN_APP' | 'SMS' | 'SYSTEM';
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export interface CaseMessage {
  id: string;
  tenant_id: string;
  shipment_id: string;
  author_id: string;
  author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER' | 'SYSTEM';
  channel: MessageChannel;
  direction: MessageDirection;
  content: string;
  created_at: string;
}

// ── The Core Entity: ShipmentCase ────────────────────────────

export interface ShipmentCase {
  id: string;
  tenant_id: string;
  ref_number: string;           // CLR-2025-XXXX
  customer_id: string;
  customer_name?: string;       // joined from customers table
  type: ShipmentType;
  goods_desc: string;
  hs_code?: string;             // EAC CET HS code
  containers: Container[];
  bl_number?: string;
  awb_number?: string;          // air only
  vessel: string;
  origin_port: string;
  dest_port: string;
  eta?: string;                 // ISO 8601
  // ClearanceStage literal for legacy/default-workflow shipments, or a
  // workflow_steps.id (UUID) for shipments governed by a tenant-defined
  // workflow — see workflow-resolver.service.ts.
  stage: string;
  workflow_id?: string | null;
  workflow_step_id?: string | null;
  consignment_type?: string;
  stage_history?: StageEvent[];
  documents?: CaseDocument[];
  expenses?: Expense[];
  messages?: CaseMessage[];
  // Lightweight counts (no full arrays) — populated by the grouped/kanban
  // listing endpoint instead of `documents`/`messages` above, which stay
  // list-populated only on the single-shipment detail fetch.
  document_count?: number;
  message_count?: number;
  // Custom-workflow position (only set when workflow_id is set) — lets
  // ProgressSegments/DetailPanel render a proportional progress bar without
  // fetching the full workflow; see listGroupedByCustomer's batched lookup.
  workflow_step_order?: number;
  workflow_step_count?: number;
  workflow_step_name?: string;
  risk_flags?: RiskFlag[];
  active_risk_types?: RiskFlagType[];
  assigned_to: string;          // officer user_id
  assigned_officer_name?: string;
  assigned_officer_avatar_url?: string | null;
  location_id?: string;
  location_name?: string;
  sla_deadline?: string;
  free_time_end?: string;       // demurrage trigger
  // ── TANCIS / TANESW Fields ──
  tancis_ref?: string;          // TANCIS reference number
  tansad_number?: string;       // TANSAD declaration number
  selectivity_channel?: 'GREEN' | 'YELLOW' | 'RED' | 'BLUE';
  declaration_id?: string;      // FK to declarations table
  co2_emissions_kg?: number | null;
  carbon_credits_saved?: number | null;
  created_at: string;
  updated_at: string;
}

// ── Location ─────────────────────────────────────────────────

export type LocationType = 'PORT' | 'AIRPORT' | 'ICD' | 'CFS' | 'BORDER' | 'WAREHOUSE' | 'OFFICE';

export interface Location {
  id: string;
  tenant_id: string;
  name: string;
  code: string;                 // e.g. 'DSM', 'JNIA', 'NMG'
  type: LocationType;
  city: string;
  country: string;
  created_at: string;
}

// ── Support Tickets & Multichannel ─────────────────────────────

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface SupportTicket {
  id: string;
  tenant_id: string;
  ref_number: string;
  customer_id: string;
  subject: string;
  description?: string;
  channel: MessageChannel;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  assigned_to?: string;
  tags?: any;
  created_at: string;
  updated_at: string;
  // relations
  customer_name?: string;
  assigned_officer_name?: string;
}

export interface SupportMessage {
  id: string;
  tenant_id: string;
  ticket_id: string;
  channel: MessageChannel;
  direction: MessageDirection;
  author_id: string;
  author_name: string;
  author_type: 'OFFICER' | 'CUSTOMER' | 'SYSTEM';
  content: string;
  external_ref?: string;
  created_at: string;
}

export type AssetType = 'BANK_ACCOUNT' | 'CREDIT_CARD' | 'INSURANCE_POLICY' | 'LOAN';

export interface CustomerAsset {
  id: string;
  tenant_id: string;
  customer_id: string;
  asset_type: AssetType;
  asset_ref: string;
  status: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseArticle {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}
