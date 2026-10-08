export interface FinanceExpenseReport {
  id: string; name: string; owner_id: string; status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';
  review_note: string | null; reviewed_by: string | null; reviewed_at: string | null;
  reimbursement_journal_id: string | null; payment_reference: string | null; created_at: string;
  items?: FinanceExpenseReportItem[];
}
export interface FinanceExpenseReportItem {
  customer_id?: string | null; supplier_id?: string | null; customer_name?: string | null; supplier_name?: string | null;
  id: string; name: string; category: string; amount: number; expense_date: string; expense_id: string | null;
}
