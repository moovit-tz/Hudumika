export interface FinanceTaxPreparation {
  id: string; prepared_by: string; status: 'prepared' | 'approved' | 'rejected'; evidence_note: string;
  reviewed_by: string | null; review_note: string | null; created_at: string; current: boolean;
}
export interface FinanceTaxPreparationView {
  period: { id: string; jurisdiction: string; period_start: string; period_end: string; status: string };
  checks: string[]; diagnostics: { severity: 'blocking' | 'review'; message: string }[];
  summary: { currency: string; output_tax: number; recoverable_input: number; net_payable: number; ledger_difference: number };
  preparations: FinanceTaxPreparation[];
}
