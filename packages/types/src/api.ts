// ─── Hudumika API Request/Response Types ──────────────────────

import type {
  ShipmentType,
  ShipmentCase,
  RiskFlagType,
  ExpenseCategory,
  Container,
} from './core.js';
import type { Customer } from './user.js';

// ── Pagination ───────────────────────────────────────────────
// Cursor-based pagination only. Never offset.

export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;          // last item id for next page
  has_more: boolean;
  total?: number;           // optional total count
}

// ── Shipment List Query ──────────────────────────────────────

export interface ShipmentListQuery {
  cursor?: string;
  limit?: number;           // default 50, max 200
  group_by?: 'customer' | 'stage' | 'location';
  customer_id?: string;
  stage?: string; // ClearanceStage literal, or a workflow_steps.id for custom-workflow shipments
  assigned_to?: string;     // officer user_id
  location_id?: string;
  risk?: 'demurrage' | 'sla' | 'penalty';
  type?: ShipmentType;
  search?: string;          // full-text: BL, ref, goods
  sort?: 'urgency' | 'created' | 'eta' | 'days';
  date_from?: string;       // ISO 8601
  date_to?: string;
}

// ── Grouped Shipment Response ────────────────────────────────

export interface CustomerShipmentGroup {
  customer: Pick<Customer, 'id' | 'name' | 'avatar_initials' | 'avatar_color'>;
  shipment_count: number;
  urgent_count: number;
  action_count: number;
  locations: string[];
  shipments: ShipmentCase[];
}

// ── Create Shipment Input ────────────────────────────────────

export interface CreateShipmentInput {
  customer_id: string;
  type: ShipmentType;
  goods_desc: string;
  hs_code?: string;
  containers: Container[];
  bl_number?: string;
  awb_number?: string;
  vessel: string;
  origin_port: string;
  dest_port: string;
  eta?: string;
  assigned_to: string;
  location_id?: string;
  free_time_end?: string;
}

// ── Advance Stage Input ──────────────────────────────────────

export interface AdvanceStageInput {
  note?: string;
  blocker?: string;
}

// ── Create Customer Input ────────────────────────────────────

export interface CreateCustomerInput {
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  phone_wa?: string;
  phone_wechat?: string;
  category?: 'enterprise' | 'sme' | 'individual';
  preferred_channel?: 'WHATSAPP' | 'EMAIL' | 'WECHAT';
  tax_id?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  send_invite?: boolean;
}

// ── Record Expense Input ─────────────────────────────────────

export interface RecordExpenseInput {
  category: ExpenseCategory;
  label: string;
  amount_tzs: number;
  is_revenue?: boolean;
  is_passthrough?: boolean;
}

// ── Shipment P&L ─────────────────────────────────────────────

export interface ShipmentPnL {
  revenue: number;           // clearance + transport + agency fees
  expenses: number;          // inspection + haulage + labour
  passthrough: number;       // duties + port charges (not yours)
  gross_margin: number;      // revenue - expenses
  margin_pct: number;        // gross_margin / revenue * 100
  accruing: number;          // storage/demurrage accumulating now
  status: 'OPEN' | 'INVOICED' | 'PAID';
}

// ── KPI Response (Command Center) ────────────────────────────

export interface KPIResponse {
  active_cases: number;
  demurrage_risk: number;     // free_time_end < 48h
  sla_breached: number;
  delivered_today: number;
  penalty_exposure_tzs: number;
  on_time_rate_pct: number;   // last 30 days
  cases_this_month: number;
  total_cases?: number;
  customer_count?: number;
  awaiting_docs?: number;
  invoices_pending?: number;
  duty_payments_tzs?: number;
  total_co2_emissions_kg?: number;
  total_carbon_credits_saved?: number;
}

// ── Carbon Portfolio (ESG / sustainability reporting) ─────────
// Internal emissions-avoidance estimate rolled up across shipments —
// NOT a registry-issued, tradeable carbon credit (no Gold Standard/Verra
// verification). See co2.service.ts for the per-shipment GLEC calculation.

export interface CarbonModeBreakdown {
  mode: string;
  co2_kg: number;
  credits: number;
  shipment_count: number;
}

export interface CarbonCustomerBreakdown {
  customer_id: string;
  customer_name: string;
  co2_kg: number;
  credits: number;
  shipment_count: number;
}

export interface CarbonMonthBreakdown {
  month: string; // YYYY-MM
  co2_kg: number;
  credits: number;
  shipment_count: number;
}

export interface CarbonPortfolioResponse {
  total_co2_kg: number;
  total_credits: number;
  calculated_shipment_count: number;
  uncalculated_shipment_count: number;
  avg_co2_per_shipment_kg: number;
  by_mode: CarbonModeBreakdown[];
  by_customer: CarbonCustomerBreakdown[];
  by_month: CarbonMonthBreakdown[];
}

// ── Customer Analytics ───────────────────────────────────────

export interface CustomerAnalytics {
  total_shipments: number;
  active_shipments: number;
  avg_clearance_days: number;
  total_duty_paid: number;    // TZS, all time
  total_revenue: number;      // your revenue from this customer
  outstanding_invoices: number;
  outstanding_amount: number; // TZS owed to you
  avg_payment_days: number;
  penalty_incidents: number;
  most_imported: string[];    // top 3 goods categories
  common_origins: string[];   // top 3 origin countries
}

// ── Bottleneck Analysis ──────────────────────────────────────

export interface StageBottleneck {
  stage: string; // ClearanceStage literal, or a workflow_steps.id for custom-workflow shipments — stable key, never render this directly
  stage_label: string; // human-readable — the ClearanceStage literal title-cased, or the workflow step's real name
  avg_hours: number;
  p90_hours: number;
  case_count: number;
  sla_breaches: number;
}

// ── Officer Performance ──────────────────────────────────────

export interface OfficerPerformance {
  user_id: string;
  name: string;
  cases_closed: number;
  avg_days: number;
  penalties_caused: number;
  active_cases: number;
}

// ── WebSocket Events ─────────────────────────────────────────

export type ServerEvent =
  | { type: 'case.status_changed'; caseId: string; stage: string }
  | { type: 'case.update_posted'; caseId: string; message: string }
  | { type: 'case.document_uploaded'; caseId: string; documentId: string }
  | { type: 'case.risk_changed'; caseId: string; riskType: RiskFlagType; severity: string }
  | { type: 'invoice.finalised'; caseId: string; invoiceId: string }
  | { type: 'notification.new'; count: number }
  // ── Declaration Events ──
  | { type: 'declaration.notice_received'; declarationId: string; noticeType: string }
  | { type: 'declaration.status_changed'; declarationId: string; status: string }
  | { type: 'declaration.selectivity_result'; declarationId: string; channel: string }
  // ── Tracking Events ──
  | { type: 'vehicle.position_updated'; vehicleId: string; latitude: number; longitude: number };

// ── Declaration List Query ───────────────────────────────────

export interface DeclarationListQuery {
  cursor?: string;
  limit?: number;
  shipment_id?: string;
  status?: string;
  selectivity_channel?: string;
  date_from?: string;
  date_to?: string;
  search?: string;            // tancis_ref, tansad_number, importer name
}

// ── Declaration Notice List Query ────────────────────────────

export interface DeclarationNoticeListQuery {
  cursor?: string;
  limit?: number;
  declaration_id?: string;
  notice_type?: string;
  date_from?: string;
  date_to?: string;
  acknowledged?: boolean;
}

