import { withTenant } from '../db/client.js';
import { encryptSecret, decryptSecret } from './onsite-secrets.service.js';
import { env } from '../config/env.js';

export type AccountingProvider = 'QUICKBOOKS' | 'XERO';

interface ProviderAdapter {
  key: AccountingProvider;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  extraAuthorizeParams?: Record<string, string>;
  /** Everything below needs a live access token + resolved org id, so it's
   *  built per-call rather than stored — the org id is only known once the
   *  OAuth callback (QuickBooks: query param; Xero: /connections lookup)
   *  has run once. */
  apiBase(orgId: string): string;
  authHeaders(accessToken: string, orgId: string): Record<string, string>;
  companyInfoPath(orgId: string): string;
  accountsPath(orgId: string): string;
  findContactQuery(orgId: string, name: string): { path: string; init?: RequestInit };
  createContactBody(name: string, email: string | null): unknown;
  createContactPath(orgId: string): string;
  parseContactId(json: any): string | null;
  createInvoicePath(orgId: string): string;
  createInvoiceBody(args: { contactExternalId: string; number: string; date: string; total: number; currency: string; description: string }): unknown;
  parseDocId(json: any): string | null;
  createBillPath(orgId: string): string;
  createBillBody(args: { contactExternalId: string; number: string; date: string; total: number; currency: string; description: string }): unknown;
  createPaymentPath(orgId: string): string;
  createPaymentBody(args: { docExternalId: string; amount: number; date: string; accountRef?: string }): unknown;
}

const QUICKBOOKS: ProviderAdapter = {
  key: 'QUICKBOOKS',
  authorizeUrl: 'https://appcenter.intuit.com/connect/oauth2',
  tokenUrl: 'https://oauth2.platform.intuit.com/oauth2/v1/tokens/bearer',
  scope: 'com.intuit.quickbooks.accounting',
  clientId: env.QUICKBOOKS_CLIENT_ID,
  clientSecret: env.QUICKBOOKS_CLIENT_SECRET,
  apiBase: (realmId) => `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`,
  authHeaders: (accessToken) => ({ Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json' }),
  companyInfoPath: (realmId) => `/companyinfo/${realmId}?minorversion=65`,
  accountsPath: () => `/query?query=${encodeURIComponent('SELECT * FROM Account MAXRESULTS 200')}&minorversion=65`,
  findContactQuery: (_orgId, name) => ({ path: `/query?query=${encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`)}&minorversion=65` }),
  createContactPath: () => `/customer?minorversion=65`,
  createContactBody: (name, email) => ({ DisplayName: name, ...(email ? { PrimaryEmailAddr: { Address: email } } : {}) }),
  parseContactId: (json) => json?.Customer?.Id ?? json?.QueryResponse?.Customer?.[0]?.Id ?? null,
  createInvoicePath: () => `/invoice?minorversion=65`,
  createInvoiceBody: ({ contactExternalId, total, description, currency }) => ({
    CurrencyRef: { value: currency },
    CustomerRef: { value: contactExternalId },
    Line: [{ Amount: total, DetailType: 'SalesItemLineDetail', Description: description, SalesItemLineDetail: {} }],
  }),
  parseDocId: (json) => json?.Invoice?.Id ?? json?.Bill?.Id ?? json?.Payment?.Id ?? null,
  createBillPath: () => `/bill?minorversion=65`,
  createBillBody: ({ contactExternalId, total, description }) => ({
    VendorRef: { value: contactExternalId },
    Line: [{ Amount: total, DetailType: 'AccountBasedExpenseLineDetail', Description: description, AccountBasedExpenseLineDetail: {} }],
  }),
  createPaymentPath: () => `/payment?minorversion=65`,
  createPaymentBody: ({ docExternalId, amount }) => ({
    TotalAmt: amount,
    Line: [{ Amount: amount, LinkedTxn: [{ TxnId: docExternalId, TxnType: 'Invoice' }] }],
  }),
};

const XERO: ProviderAdapter = {
  key: 'XERO',
  authorizeUrl: 'https://login.xero.com/identity/connect/authorize',
  tokenUrl: 'https://identity.xero.com/connect/token',
  scope: 'offline_access accounting.transactions accounting.contacts accounting.settings',
  clientId: env.XERO_CLIENT_ID,
  clientSecret: env.XERO_CLIENT_SECRET,
  apiBase: () => `https://api.xero.com/api.xro/2.0`,
  authHeaders: (accessToken, orgId) => ({ Authorization: `Bearer ${accessToken}`, 'xero-tenant-id': orgId, Accept: 'application/json', 'Content-Type': 'application/json' }),
  companyInfoPath: () => `/Organisation`,
  accountsPath: () => `/Accounts`,
  findContactQuery: (_orgId, name) => ({ path: `/Contacts?where=${encodeURIComponent(`Name=="${name.replace(/"/g, '\\"')}"`)}` }),
  createContactPath: () => `/Contacts`,
  createContactBody: (name, email) => ({ Contacts: [{ Name: name, ...(email ? { EmailAddress: email } : {}) }] }),
  parseContactId: (json) => json?.Contacts?.[0]?.ContactID ?? null,
  createInvoicePath: () => `/Invoices`,
  createInvoiceBody: ({ contactExternalId, number, date, total, description }) => ({
    Invoices: [{
      Type: 'ACCREC', Contact: { ContactID: contactExternalId }, Date: date, InvoiceNumber: number,
      LineItems: [{ Description: description, Quantity: 1, UnitAmount: total, AccountCode: '200' }],
      Status: 'AUTHORISED',
    }],
  }),
  parseDocId: (json) => json?.Invoices?.[0]?.InvoiceID ?? json?.Payments?.[0]?.PaymentID ?? null,
  createBillPath: () => `/Invoices`,
  createBillBody: ({ contactExternalId, number, date, total, description }) => ({
    Invoices: [{
      Type: 'ACCPAY', Contact: { ContactID: contactExternalId }, Date: date, InvoiceNumber: number,
      LineItems: [{ Description: description, Quantity: 1, UnitAmount: total, AccountCode: '400' }],
      Status: 'AUTHORISED',
    }],
  }),
  createPaymentPath: () => `/Payments`,
  createPaymentBody: ({ docExternalId, amount, date, accountRef }) => ({
    Payments: [{ Invoice: { InvoiceID: docExternalId }, Account: { Code: accountRef ?? '090' }, Date: date, Amount: amount }],
  }),
};

const ADAPTERS: Record<AccountingProvider, ProviderAdapter> = { QUICKBOOKS, XERO };

export function getAdapter(provider: AccountingProvider): ProviderAdapter {
  return ADAPTERS[provider];
}

export function isProviderConfigured(provider: AccountingProvider): boolean {
  const a = ADAPTERS[provider];
  return !!(a.clientId && a.clientSecret);
}

async function logSync(trx: any, tenantId: string, provider: string, entityType: 'COA' | 'INVOICE' | 'BILL' | 'PAYMENT' | 'TEST_CONNECTION', entityId: string, status: 'SUCCESS' | 'FAILED', externalId?: string | null, errorMessage?: string) {
  await trx.insertInto('accounting_sync_logs').values({
    tenant_id: tenantId, provider, entity_type: entityType, entity_id: entityId,
    external_id: externalId ?? null, status, error_message: errorMessage ?? null,
  }).execute();
}

export class AccountingIntegrationService {
  static async getIntegrations(tenantId: string) {
    return withTenant(tenantId, async (trx) => {
      const rows = await trx.selectFrom('accounting_integrations').selectAll().where('tenant_id', '=', tenantId).execute();
      const providers: AccountingProvider[] = ['QUICKBOOKS', 'XERO'];
      const result = providers.map(p => {
        const found = rows.find(r => r.provider === p);
        return {
          provider: p,
          status: found?.status ?? 'DISCONNECTED',
          last_sync_at: found?.last_sync_at ?? null,
          last_error: found?.last_error ?? null,
          provider_org_id: found?.provider_org_id ?? null,
          configured: isProviderConfigured(p),
        };
      });
      const logs = await trx.selectFrom('accounting_sync_logs').selectAll().where('tenant_id', '=', tenantId).orderBy('synced_at', 'desc').limit(20).execute();
      return { integrations: result, logs };
    });
  }

  static async disconnect(tenantId: string, provider: AccountingProvider) {
    return withTenant(tenantId, async (trx) => {
      await trx.deleteFrom('accounting_integrations').where('tenant_id', '=', tenantId).where('provider', '=', provider).execute();
      return { success: true };
    });
  }

  /** Returns a live access token, refreshing it first if it's expired or
   *  about to be — same proactive-refresh shape as calendar-external-sync.job.ts. */
  static async getValidAccessToken(trx: any, tenantId: string, provider: AccountingProvider): Promise<{ accessToken: string; orgId: string }> {
    const row = await trx.selectFrom('accounting_integrations').selectAll()
      .where('tenant_id', '=', tenantId).where('provider', '=', provider).executeTakeFirst();
    if (!row || row.status !== 'CONNECTED' || !row.refresh_token_enc || !row.provider_org_id) {
      throw new Error(`${provider} is not connected.`);
    }
    const adapter = getAdapter(provider);
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
    const needsRefresh = !row.access_token_enc || expiresAt - Date.now() < 5 * 60 * 1000;
    if (!needsRefresh) {
      return { accessToken: decryptSecret(row.access_token_enc as string), orgId: row.provider_org_id };
    }

    const refreshToken = decryptSecret(row.refresh_token_enc);
    const res = await fetch(adapter.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(provider === 'QUICKBOOKS' ? { Authorization: `Basic ${Buffer.from(`${adapter.clientId}:${adapter.clientSecret}`).toString('base64')}` } : {}),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: refreshToken,
        ...(provider === 'XERO' ? { client_id: adapter.clientId ?? '', client_secret: adapter.clientSecret ?? '' } : {}),
      }),
    });
    if (!res.ok) {
      const msg = `Token refresh failed (${res.status}) — reconnect ${provider}.`;
      await trx.updateTable('accounting_integrations').set({ status: 'ERROR', last_error: msg, updated_at: new Date() }).where('id', '=', row.id).execute();
      throw new Error(msg);
    }
    const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
    await trx.updateTable('accounting_integrations').set({
      access_token_enc: encryptSecret(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : row.refresh_token_enc,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      status: 'CONNECTED', last_error: null, updated_at: new Date(),
    }).where('id', '=', row.id).execute();

    return { accessToken: tokens.access_token, orgId: row.provider_org_id };
  }

  /** Calls the provider's real company-info/organisation endpoint — the
   *  cheapest possible proof a stored token is actually valid. Replaces a
   *  Connect flow that previously validated nothing at all. */
  static async testConnection(tenantId: string, provider: AccountingProvider) {
    return withTenant(tenantId, async (trx) => {
      const adapter = getAdapter(provider);
      try {
        const { accessToken, orgId } = await this.getValidAccessToken(trx, tenantId, provider);
        const res = await fetch(`${adapter.apiBase(orgId)}${adapter.companyInfoPath(orgId)}`, { headers: adapter.authHeaders(accessToken, orgId) });
        if (!res.ok) throw new Error(`${provider} responded ${res.status}`);
        const json = await res.json();
        await logSync(trx, tenantId, provider, 'TEST_CONNECTION', orgId, 'SUCCESS');
        return { success: true, company: json };
      } catch (err: any) {
        await logSync(trx, tenantId, provider, 'TEST_CONNECTION', tenantId, 'FAILED', null, err.message);
        throw err;
      }
    });
  }

  /** Reads the provider's REAL chart of accounts as a read-only mirror.
   *  Previously this inserted three hardcoded fake accounts directly into
   *  the tenant's live chart_of_accounts — that write is gone entirely. */
  static async syncCOA(tenantId: string, provider: AccountingProvider) {
    return withTenant(tenantId, async (trx) => {
      const adapter = getAdapter(provider);
      const row = await trx.selectFrom('accounting_integrations').select('id').where('tenant_id', '=', tenantId).where('provider', '=', provider).executeTakeFirst();
      try {
        const { accessToken, orgId } = await this.getValidAccessToken(trx, tenantId, provider);
        const res = await fetch(`${adapter.apiBase(orgId)}${adapter.accountsPath(orgId)}`, { headers: adapter.authHeaders(accessToken, orgId) });
        if (!res.ok) throw new Error(`${provider} responded ${res.status}`);
        const json = await res.json();
        const accounts = provider === 'QUICKBOOKS' ? (json?.QueryResponse?.Account ?? []) : (json?.Accounts ?? []);
        if (row) await trx.updateTable('accounting_integrations').set({ last_sync_at: new Date(), last_error: null }).where('id', '=', row.id).execute();
        await logSync(trx, tenantId, provider, 'COA', row?.id ?? tenantId, 'SUCCESS', `${accounts.length} accounts`);
        return { success: true, accounts };
      } catch (err: any) {
        if (row) await trx.updateTable('accounting_integrations').set({ last_error: err.message }).where('id', '=', row.id).execute();
        await logSync(trx, tenantId, provider, 'COA', row?.id ?? tenantId, 'FAILED', null, err.message);
        throw err;
      }
    });
  }

  /** Search-or-create the provider's contact for a local customer/supplier,
   *  caching the mapping so repeat syncs don't re-resolve it. QBO/Xero both
   *  require a resolved contact reference before a document can be created. */
  private static async resolveExternalContact(trx: any, tenantId: string, provider: AccountingProvider, accessToken: string, orgId: string, localType: 'customer' | 'supplier', localId: string, name: string, email: string | null): Promise<string> {
    const cached = await trx.selectFrom('accounting_integration_entity_map').select('external_id')
      .where('tenant_id', '=', tenantId).where('provider', '=', provider).where('local_type', '=', localType).where('local_id', '=', localId).executeTakeFirst();
    if (cached) return cached.external_id;

    const adapter = getAdapter(provider);
    const q = adapter.findContactQuery(orgId, name);
    const findRes = await fetch(`${adapter.apiBase(orgId)}${q.path}`, { headers: adapter.authHeaders(accessToken, orgId), ...q.init });
    let externalId: string | null = null;
    if (findRes.ok) {
      const findJson = await findRes.json();
      externalId = adapter.parseContactId(findJson);
    }
    if (!externalId) {
      const createRes = await fetch(`${adapter.apiBase(orgId)}${adapter.createContactPath(orgId)}`, {
        method: 'POST', headers: adapter.authHeaders(accessToken, orgId), body: JSON.stringify(adapter.createContactBody(name, email)),
      });
      if (!createRes.ok) throw new Error(`Could not create ${provider} contact for "${name}" (${createRes.status})`);
      const createJson = await createRes.json();
      externalId = adapter.parseContactId(createJson);
    }
    if (!externalId) throw new Error(`${provider} did not return a contact id for "${name}"`);

    await trx.insertInto('accounting_integration_entity_map').values({
      tenant_id: tenantId, provider, local_type: localType, local_id: localId, external_id: externalId,
    }).onConflict((oc: any) => oc.columns(['tenant_id', 'provider', 'local_type', 'local_id']).doNothing()).execute();
    return externalId;
  }

  static async syncInvoice(tenantId: string, invoiceId: string) {
    return withTenant(tenantId, async (trx) => {
      const connected = await trx.selectFrom('accounting_integrations').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'CONNECTED').execute();
      if (connected.length === 0) return;
      const invoice = await trx.selectFrom('sales_invoices').selectAll().where('id', '=', invoiceId).executeTakeFirst();
      if (!invoice) return;
      const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoiceId).execute();
      const total = lines.reduce((sum: number, l: any) => sum + Number(l.rate) * Number(l.qty) * (1 + Number(l.tax_pct ?? 0) / 100), 0);

      for (const integration of connected) {
        const provider = integration.provider as AccountingProvider;
        if (!(provider in ADAPTERS)) continue;
        const adapter = getAdapter(provider);
        try {
          const { accessToken, orgId } = await this.getValidAccessToken(trx, tenantId, provider);
          const contactExternalId = await this.resolveExternalContact(trx, tenantId, provider, accessToken, orgId, 'customer', invoice.customer_id ?? invoice.id, invoice.client_name ?? 'Customer', null);
          const res = await fetch(`${adapter.apiBase(orgId)}${adapter.createInvoicePath(orgId)}`, {
            method: 'POST', headers: adapter.authHeaders(accessToken, orgId),
            body: JSON.stringify(adapter.createInvoiceBody({
              contactExternalId, number: invoice.invoice_number, date: invoice.bill_date ? String(invoice.bill_date) : new Date().toISOString().slice(0, 10),
              total, currency: invoice.currency ?? 'TZS', description: `Invoice ${invoice.invoice_number}`,
            })),
          });
          if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${await res.text()}`);
          const json = await res.json();
          const externalId = adapter.parseDocId(json);
          await logSync(trx, tenantId, provider, 'INVOICE', invoiceId, 'SUCCESS', externalId);
        } catch (err: any) {
          await logSync(trx, tenantId, provider, 'INVOICE', invoiceId, 'FAILED', null, err.message);
        }
      }
    });
  }

  static async syncBill(tenantId: string, billId: string) {
    return withTenant(tenantId, async (trx) => {
      const connected = await trx.selectFrom('accounting_integrations').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'CONNECTED').execute();
      if (connected.length === 0) return;
      const bill = await trx.selectFrom('supplier_bills').selectAll().where('id', '=', billId).executeTakeFirst();
      if (!bill) return;

      for (const integration of connected) {
        const provider = integration.provider as AccountingProvider;
        if (!(provider in ADAPTERS)) continue;
        const adapter = getAdapter(provider);
        try {
          const { accessToken, orgId } = await this.getValidAccessToken(trx, tenantId, provider);
          const contactExternalId = await this.resolveExternalContact(trx, tenantId, provider, accessToken, orgId, 'supplier', bill.supplier_id ?? bill.id, bill.supplier_name ?? 'Supplier', null);
          const res = await fetch(`${adapter.apiBase(orgId)}${adapter.createBillPath(orgId)}`, {
            method: 'POST', headers: adapter.authHeaders(accessToken, orgId),
            body: JSON.stringify(adapter.createBillBody({
              contactExternalId, number: bill.bill_number, date: bill.bill_date ? String(bill.bill_date) : new Date().toISOString().slice(0, 10),
              total: Number(bill.total), currency: bill.currency ?? 'TZS', description: `Bill ${bill.bill_number}`,
            })),
          });
          if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${await res.text()}`);
          const json = await res.json();
          const externalId = adapter.parseDocId(json);
          await logSync(trx, tenantId, provider, 'BILL', billId, 'SUCCESS', externalId);
        } catch (err: any) {
          await logSync(trx, tenantId, provider, 'BILL', billId, 'FAILED', null, err.message);
        }
      }
    });
  }

  static async syncPayment(tenantId: string, paymentId: string, type: 'INVOICE' | 'BILL') {
    return withTenant(tenantId, async (trx) => {
      const connected = await trx.selectFrom('accounting_integrations').selectAll().where('tenant_id', '=', tenantId).where('status', '=', 'CONNECTED').execute();
      if (connected.length === 0) return;

      const paymentTable = type === 'INVOICE' ? 'invoice_payments' : 'bill_payments';
      const docIdColumn = type === 'INVOICE' ? 'invoice_id' : 'bill_id';
      const payment = await trx.selectFrom(paymentTable as any).selectAll().where('id', '=', paymentId).executeTakeFirst();
      if (!payment) return;
      const docId = (payment as any)[docIdColumn];

      for (const integration of connected) {
        const provider = integration.provider as AccountingProvider;
        if (!(provider in ADAPTERS)) continue;
        const adapter = getAdapter(provider);
        try {
          // The originating document must already have been synced (its
          // accounting_sync_logs row carries the provider's real doc id) —
          // a payment can't be linked to a document the provider never saw.
          const docSync = await trx.selectFrom('accounting_sync_logs').select('external_id')
            .where('tenant_id', '=', tenantId).where('provider', '=', provider)
            .where('entity_type', '=', type === 'INVOICE' ? 'INVOICE' : 'BILL')
            .where('entity_id', '=', docId).where('status', '=', 'SUCCESS')
            .orderBy('synced_at', 'desc').executeTakeFirst();
          if (!docSync?.external_id) throw new Error(`${type === 'INVOICE' ? 'Invoice' : 'Bill'} was never synced to ${provider} — sync it before its payment.`);

          const { accessToken, orgId } = await this.getValidAccessToken(trx, tenantId, provider);
          const res = await fetch(`${adapter.apiBase(orgId)}${adapter.createPaymentPath(orgId)}`, {
            method: 'POST', headers: adapter.authHeaders(accessToken, orgId),
            body: JSON.stringify(adapter.createPaymentBody({
              docExternalId: docSync.external_id, amount: Number((payment as any).amount),
              date: (payment as any).payment_date ? String((payment as any).payment_date) : new Date().toISOString().slice(0, 10),
            })),
          });
          if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${await res.text()}`);
          const json = await res.json();
          const externalId = adapter.parseDocId(json);
          await logSync(trx, tenantId, provider, 'PAYMENT', paymentId, 'SUCCESS', externalId);
        } catch (err: any) {
          await logSync(trx, tenantId, provider, 'PAYMENT', paymentId, 'FAILED', null, err.message);
        }
      }
    });
  }
}
