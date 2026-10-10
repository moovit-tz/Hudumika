export type AccountingSyncEntity = 'INVOICE' | 'BILL' | 'INVOICE_PAYMENT' | 'BILL_PAYMENT';
export type AccountingSyncState = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'RETRY' | 'RECONCILE' | 'FAILED';
export interface AccountingSyncTask {
 id: string; tenant_id: string; provider: 'QUICKBOOKS' | 'XERO'; provider_org_id: string;
 entity_type: AccountingSyncEntity; entity_id: string; status: AccountingSyncState; attempts: number;
 next_attempt_at: string; last_error: string | null; created_at: string; updated_at: string;
}

export interface AccountingSyncTaskPage { items: AccountingSyncTask[]; total: number; page: number; page_size: number; }
