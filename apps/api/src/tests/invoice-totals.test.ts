import { it, expect } from 'vitest';
import { invoiceGrandTotal, invoiceNetAndTax } from '../services/invoice-totals.js';
it('converted net and tax reconcile to gross with per-line FX rounding', () => {
 const lines=Array.from({length:20},()=>({qty:1,rate:0.03,tax_pct:18,currency:'USD'}));
 const gross=invoiceGrandTotal(lines,'TZS',2500);
 const parts=invoiceNetAndTax(lines,'TZS',2500);
 expect(gross).toBe(2000);expect(parts.net).toBe(1500);expect(parts.tax).toBe(500);
 expect(parts.net+parts.tax).toBe(gross);
});
it('matching and unspecified line currencies do not apply exchange rates', () => {
 const lines=[{qty:2,rate:100,tax_pct:18,currency:'USD'},{qty:1,rate:50,tax_pct:0}];
 const gross=invoiceGrandTotal(lines,'USD',2500);const parts=invoiceNetAndTax(lines,'USD',2500);
 expect(gross).toBe(286);expect(parts.net+parts.tax).toBe(gross);
});

