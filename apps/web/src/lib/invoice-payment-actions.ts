export function canCollectInvoicePayment(status: string, balance: number): boolean {
  return ['Unpaid', 'Partial', 'Overdue'].includes(status)
    && Number.isFinite(balance) && balance > 0;
}
