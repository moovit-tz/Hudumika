import { it, expect } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createTestTenant } from './helpers.js';
import { withTenant } from '../db/client.js';
import { renderInvoicePdf } from '../services/invoice-pdf.service.js';

it('keeps trillion-sized invoice amounts above subsequent totals and terms', async () => {
  const tenant = await createTestTenant();
  try {
    const id = await withTenant(tenant.tenantId, async trx => {
      const invoice = await trx.insertInto('sales_invoices').values({
        tenant_id: tenant.tenantId, invoice_number: 'INV-LARGE-LAYOUT',
        currency: 'TZS', client_name: 'Layout customer', payment_terms: 'Payment within 30 days',
      } as any).returning('id').executeTakeFirstOrThrow();
      await trx.insertInto('sales_invoice_lines').values({
        invoice_id: invoice.id, name: 'Casual Labor — Loading', unit: 'hour',
        qty: 1, rate: 6000000000000, tax_pct: 18, currency: 'TZS', line_group: 'other',
      } as any).execute();
      return invoice.id;
    });
    const pdf = await getDocument({ data: new Uint8Array(await renderInvoicePdf(tenant.tenantId, id)), useSystemFonts: true }).promise;
    try {
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1);
      const items = (await page.getTextContent()).items.filter(item => 'str' in item) as Array<{ str: string; transform: number[]; height: number }>;
      const label = (name: string) => items.find(item => item.str === name)!;
      for (const [upper, lower] of [['Subtotal', 'Tax'], ['Tax', 'Grand Total'], ['Grand Total', 'Balance Due'], ['Balance Due', 'TERMS']]) {
        expect(label(upper)).toBeDefined();
        expect(label(upper).transform[5] - label(lower).transform[5]).toBeGreaterThan(label(lower).height);
      }
      const text = items.map(item => item.str).join(' ').replace(/\s/g, '');
      expect(text).toContain('7,080,000,000,000.00');
      const subtotalY = label('Subtotal').transform[5];
      const amountHeaderY = label('AMOUNT').transform[5];
      const lineNumbers = items.filter(item => /\d/.test(item.str) && item.transform[5] < amountHeaderY && item.transform[5] > subtotalY);
      expect(lineNumbers.length).toBeGreaterThan(0);
      expect(Math.min(...lineNumbers.map(item => item.transform[5])) - subtotalY).toBeGreaterThan(10);
    } finally { await pdf.destroy(); }
  } finally { await tenant.cleanup(); }
}, 60000);
