import { describe, expect, it } from 'vitest';
import { canCollectInvoicePayment } from './invoice-payment-actions.js';

describe('invoice payment actions', () => {
  it.each(['Draft', 'Paid', 'Credited', 'Void', 'Cancelled', 'DRAFT', 'unknown'])('does not collect against %s even with a stale positive balance', status => {
    expect(canCollectInvoicePayment(status, 100)).toBe(false);
  });
  it.each(['Unpaid', 'Partial', 'Overdue'])('allows collection against an issued %s invoice with a balance', status => {
    expect(canCollectInvoicePayment(status, 100)).toBe(true);
    for (const balance of [0, -1, NaN, Infinity]) expect(canCollectInvoicePayment(status, balance)).toBe(false);
  });
});
