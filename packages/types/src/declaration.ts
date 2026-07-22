// ─── Hudumika Declaration / TANSAD Types ──────────────────────
// Models the TANESW import declaration structure, including
// TANSAD form data, items, notices, and tax assessments.

// ── Declaration Mode ─────────────────────────────────────────

export type DeclarationMode = 'NORMAL' | 'SIMPLIFIED' | 'PROVISIONAL' | 'COMPLEMENTARY';

// ── TANSAD Form Types ────────────────────────────────────────

export type TansadFormType = 'G' | 'EX' | 'TR';  // General, Export, Transit

// ── Customs Procedure Codes ──────────────────────────────────
// IM4 = home use, IM7 = warehousing, IM8 = transit, EX1 = export

export type CPCCode = 'IM4' | 'IM7' | 'IM8' | 'EX1' | 'EX2' | 'TR1' | string;

// ── Selectivity Channels (TRA risk assignment) ───────────────

export type SelectivityChannel = 'GREEN' | 'YELLOW' | 'RED' | 'BLUE';

export const SELECTIVITY_LABELS: Record<SelectivityChannel, string> = {
  GREEN: 'Direct Release',
  YELLOW: 'Documentary Check',
  RED: 'Physical Inspection',
  BLUE: 'Post-Clearance Audit',
};

export const SELECTIVITY_COLORS: Record<SelectivityChannel, string> = {
  GREEN: '#14693b',
  YELLOW: '#b57d0a',
  RED: '#bf3422',
  BLUE: '#1849a9',
};

// ── Declaration Notice Types (from TANESW UI) ────────────────

export type DeclarationNoticeType =
  | 'SELECTIVITY_RESULT'
  | 'ASSESSMENT_NOTICE'
  | 'RELEASE_NOTICE'
  | 'PAYMENT_NOTICE'
  | 'QUERY_NOTICE'          // IQS query from customs
  | 'AMENDMENT_NOTICE'
  | 'CANCELLATION_NOTICE';

export const NOTICE_TYPE_LABELS: Record<DeclarationNoticeType, string> = {
  SELECTIVITY_RESULT: 'Selectivity Result Notice',
  ASSESSMENT_NOTICE: 'Assessment Notice',
  RELEASE_NOTICE: 'Release Notice',
  PAYMENT_NOTICE: 'Payment Notice',
  QUERY_NOTICE: 'Customs Query (IQS)',
  AMENDMENT_NOTICE: 'Amendment Notice',
  CANCELLATION_NOTICE: 'Cancellation Notice',
};

// ── Declaration Status ───────────────────────────────────────

export type DeclarationStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'SAVED'
  | 'TRANSFERRED'
  | 'ACCEPTED'
  | 'ASSESSED'
  | 'PAID'
  | 'RELEASED'
  | 'AMENDED'
  | 'CANCELLED';

export const DECLARATION_STATUS_LABELS: Record<DeclarationStatus, string> = {
  DRAFT: 'Draft',
  VALIDATED: 'Validated',
  SAVED: 'Saved',
  TRANSFERRED: 'Transferred to TRA',
  ACCEPTED: 'Accepted by TRA',
  ASSESSED: 'Assessment Issued',
  PAID: 'Duty Paid',
  RELEASED: 'Released',
  AMENDED: 'Amended',
  CANCELLED: 'Cancelled',
};

// ── Tax Line Types (from Assessment Notice) ──────────────────

export type TaxType =
  | 'IMPORT_DUTY'
  | 'VAT'
  | 'RDL'              // Railway Development Levy
  | 'APA'              // Additional Port Charges
  | 'IDF'              // Import Declaration Fee (3.5% of CIF)
  | 'EXCISE'
  | 'WITHHOLDING'
  | 'OTHER';

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  IMPORT_DUTY: 'Import Duty',
  VAT: 'Value Added Tax (18%)',
  RDL: 'Railway Development Levy',
  APA: 'Additional Port Charges',
  IDF: 'Import Declaration Fee',
  EXCISE: 'Excise Duty',
  WITHHOLDING: 'Withholding Tax',
  OTHER: 'Other Charges',
};

// ── Declaration Entity ───────────────────────────────────────
// Maps to TANESW Declaration Registration (UI-CLRE-0102-036S)

export interface Declaration {
  id: string;
  shipment_id: string;
  tenant_id: string;

  // ── TANCIS Reference ──
  tancis_ref: string;                // e.g. "137644169-26-9900025"
  tansad_number?: string;            // e.g. "TZDA-26-1384924"
  declaration_mode: DeclarationMode;
  tansad_form_type: TansadFormType;
  clearing_office: string;
  reference_date: string;

  // ── General ──
  cl_plan?: string;
  total_packages: number;
  package_type?: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  ucr_number?: string;
  no_of_items: number;

  // ── Trade Operators / Country ──
  consignment_country: string;
  country_of_export: string;
  trading_country?: string;
  country_of_destination: string;
  exporter_tin?: string;
  exporter_name?: string;
  exporter_address?: string;
  importer_tin: string;
  importer_name: string;
  importer_address?: string;
  declarant_tin: string;
  declarant_name: string;
  declarant_address?: string;

  // ── Financial ──
  delivery_term?: string;           // Incoterm (FOB, CIF, etc.)
  delivery_place?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_invoice_value: number;
  invoice_currency: string;         // USD, EUR, GBP, CNY, etc.
  exchange_rate: number;            // e.g. 2602.70297 for USD/TZS
  payment_method?: string;
  payment_bank?: string;
  payment_bank_account?: string;
  security_distinction_type?: string;
  security_account_no?: string;
  nature_of_transaction?: string;

  // ── Valuation Note ──
  freight_amount: number;
  freight_currency: string;
  insurance_amount: number;
  insurance_currency: string;
  other_charges: number;
  other_charges_currency: string;
  deductions: number;
  deductions_currency: string;
  total_customs_value: number;      // CIF in TZS (calculated)
  self_assessment: boolean;

  // ── Transportation ──
  transport_mode?: string;
  identity_of_transport?: string;
  nationality_of_transport?: string;
  arrival_date?: string;
  crn?: string;                     // Cargo Reference Number
  bl_number?: string;
  vessel_name?: string;
  portal_of_bl?: string;
  shipment_place?: string;
  discharge_place?: string;
  discharge_date?: string;
  entry_office?: string;
  location_of_goods?: string;
  total_container_count?: number;
  warehouse?: string;
  previous_warehouse?: string;
  period_days?: number;
  cargo_receipt_ref?: string;

  // ── Status & Selectivity ──
  status: DeclarationStatus;
  selectivity_channel?: SelectivityChannel;

  // ── Timestamps ──
  declared_at?: string;
  assessed_at?: string;
  paid_at?: string;
  released_at?: string;
  created_at: string;
  updated_at: string;

  // ── Relations (joined) ──
  items?: DeclarationItem[];
  notices?: DeclarationNotice[];
}

// ── Declaration Item ─────────────────────────────────────────
// Maps to TANESW Item tab (Declaration Registration)

export interface DeclarationItem {
  id: string;
  declaration_id: string;
  item_number: number;

  // ── Classification ──
  hs_code: string;
  commodity_description?: string;
  marks_and_numbers_1?: string;
  marks_and_numbers_2?: string;
  country_of_origin: string;
  cpc_code: CPCCode;

  // ── Details ──
  preference_ref?: string;
  valuation_method?: string;
  brand_name?: string;
  purpose_of_submission?: string;
  preceding_tansad_no?: string;
  preceding_tansad_date?: string;
  preceding_item_no?: number;
  letter_ref_no?: string;
  vat_deferment_apply_no?: string;

  // ── Quantities & Values ──
  quantity: number;
  unit_of_measure: string;
  base_of_duty?: number;
  specific_code?: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  customs_value: number;
  statistical_value: number;
  is_vehicle: boolean;
  drawback_specific_code?: string;

  // ── Models (sub-items) ──
  models?: DeclarationItemModel[];

  created_at: string;
}

// ── Declaration Item Model ───────────────────────────────────
// Sub-detail within an item (Model tab in TANESW)

export interface DeclarationItemModel {
  id: string;
  item_id: string;
  model_number: number;
  standard_commodity?: string;
  model_specification?: string;
  component?: string;
  preceding_model_no?: string;
  quantity: number;
  unit_of_measure?: string;
  unit_price: number;
  invoice_price: number;
}

// ── Declaration Notice ───────────────────────────────────────
// Captures notifications received from TANESW (screenshot 1)

export interface DeclarationNotice {
  id: string;
  declaration_id: string;
  shipment_id: string;
  tenant_id: string;

  // ── Notice Identity ──
  notice_type: DeclarationNoticeType;
  notice_number: string;            // e.g. "TZDA-26-1379802"
  tancis_ref: string;
  importer_tin: string;
  notice_date: string;
  declare_date: string;

  // ── Assessment Data (when notice_type = ASSESSMENT_NOTICE) ──
  tax_lines?: TaxLine[];
  total_tax_amount?: number;

  // ── Selectivity Data (when notice_type = SELECTIVITY_RESULT) ──
  selectivity_channel?: SelectivityChannel;

  // ── Payment Data ──
  bill_number?: string;
  bill_date?: string;
  bill_tax_amount?: number;
  paid_amount?: number;
  payment_receipt?: string;

  // ── Query Data (when notice_type = QUERY_NOTICE) ──
  query_text?: string;
  response_deadline?: string;

  // ── Status ──
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by?: string;

  created_at: string;
}

// ── Tax Line (Assessment Notice breakdown) ───────────────────

export interface TaxLine {
  id: string;
  notice_id: string;
  tax_type: TaxType;
  hs_code?: string;
  duty_rate_code?: string;
  rate_percent: number;
  base_amount: number;
  tax_amount: number;
  mot?: number;                     // Mode of Transaction
}

// ── Attached Document (TANESW Attached File tab) ─────────────

export interface DeclarationAttachment {
  id: string;
  declaration_id: string;
  document_no: number;
  document_type: string;
  document_description?: string;
  filename?: string;
  storage_key?: string;
  item_number?: number;             // Links to specific item
  issuing_organization?: string;
  issue_date?: string;
  registration_date?: string;
  created_at: string;
}

// ── API Input Types ──────────────────────────────────────────

export interface CreateDeclarationInput {
  shipment_id: string;
  tancis_ref: string;
  declaration_mode: DeclarationMode;
  tansad_form_type: TansadFormType;
  clearing_office: string;
  reference_date: string;

  // General
  total_packages?: number;
  package_type?: string;
  gross_weight_kg?: number;
  net_weight_kg?: number;
  no_of_items?: number;

  // Trade operators
  consignment_country: string;
  country_of_export: string;
  country_of_destination: string;
  importer_tin: string;
  importer_name: string;
  declarant_tin: string;
  declarant_name: string;

  // Financial
  total_invoice_value?: number;
  invoice_currency?: string;
  exchange_rate?: number;

  // Valuation
  freight_amount?: number;
  insurance_amount?: number;
  other_charges?: number;
  deductions?: number;
  self_assessment?: boolean;
}

export interface CreateDeclarationItemInput {
  declaration_id: string;
  hs_code: string;
  country_of_origin: string;
  cpc_code: CPCCode;
  quantity: number;
  unit_of_measure: string;
  gross_weight_kg: number;
  net_weight_kg: number;
  customs_value: number;
  statistical_value?: number;
  is_vehicle?: boolean;
  brand_name?: string;
  commodity_description?: string;
}

export interface CreateDeclarationNoticeInput {
  declaration_id: string;
  shipment_id: string;
  notice_type: DeclarationNoticeType;
  notice_number: string;
  tancis_ref: string;
  importer_tin: string;
  notice_date: string;
  declare_date: string;
  selectivity_channel?: SelectivityChannel;
  total_tax_amount?: number;
  bill_number?: string;
  tax_lines?: Omit<TaxLine, 'id' | 'notice_id'>[];
}
