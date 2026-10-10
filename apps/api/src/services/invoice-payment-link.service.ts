import { withTenant } from '../db/client.js';
import { invoiceGrandTotal } from './invoice-totals.js';
import type { InvoicePaymentSummary } from '@hudumika/types';

const GATEWAY_NAMES: Record<string, string> = {
  stripe: 'Stripe', flutterwave: 'Flutterwave', paystack: 'Paystack',
  mpesa: 'M-Pesa', vodacom: 'Vodacom M-Pesa', airtel: 'Airtel Money',
  selcom: 'Selcom', azampay: 'Azam Pay', razorpay: 'Razorpay',
  paypal: 'PayPal', square: 'Square',
};
const CHECKOUT_SUPPORTED = new Set(['stripe', 'flutterwave', 'paystack']);

export async function invoicePaymentSummary(tenantId: string, invoiceId: string, customerId?: string): Promise<InvoicePaymentSummary | null> {
  return withTenant(tenantId, async trx => {
    let query = trx.selectFrom('sales_invoices').selectAll().where('tenant_id', '=', tenantId).where('id', '=', invoiceId);
    if (customerId) query = query.where('customer_id', '=', customerId);
    const inv = await query.executeTakeFirst();
    if (!inv || ['Draft', 'Credited'].includes(inv.status)) return null;
    const lines = await trx.selectFrom('sales_invoice_lines').selectAll().where('invoice_id', '=', invoiceId).execute();
    const tenant = await trx.selectFrom('tenants').select('name').where('id', '=', tenantId).executeTakeFirst();
    const row = await trx.selectFrom('tenant_settings').select('settings').where('tenant_id', '=', tenantId).executeTakeFirst();
    const settings = typeof row?.settings === 'string' ? JSON.parse(row.settings) : row?.settings;
    const total = invoiceGrandTotal(lines, inv.currency, Number(inv.exchange_rate) || 1);
    const received = Number(inv.received) || 0;

    const providers: InvoicePaymentSummary['providers'] = [];
    for (const key of Object.keys(settings || {})) {
      if (!key.startsWith('gw-')) continue;
      const gw = settings[key];
      if (!gw) continue;
      const gwId = key.slice(3);
      providers.push({
        id: gwId as any,
        name: GATEWAY_NAMES[gwId] || gwId,
        available: !!gw.enabled && CHECKOUT_SUPPORTED.has(gwId),
      });
    }
    if (!providers.length) {
      providers.push({ id: 'selcom' as any, name: 'Selcom', available: false });
      providers.push({ id: 'azampay' as any, name: 'Azam Pay', available: false });
    }

    return {
      invoice_number: inv.invoice_number, company_name: settings?.company?.name || tenant?.name || 'Hudumika',
      customer_name: inv.client_name || '', currency: inv.currency,
      total, received, balance: Math.max(0, total - received),
      due_date: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
      status: inv.status, providers,
    };
  });
}
