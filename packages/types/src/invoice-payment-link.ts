export interface InvoicePaymentLink { path: string }
export interface InvoicePaymentSummary {
 invoice_number: string; company_name: string; customer_name: string; currency: string;
 total: number; received: number; balance: number; due_date: string | null; status: string;
 providers: { id: string; name: string; available: boolean }[];
}
