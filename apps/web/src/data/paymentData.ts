import { useSyncExternalStore } from 'react';

export interface Payment {
  id: string;
  invoiceId: string;
  clientId: string;
  amount: number;
  paymentMode: string;
  transactionId: string;
  date: string;
  note: string;
  currency: string;
  attachmentName?: string;
}

let payments: Payment[] = [
  {
    id: 'PAY-001',
    invoiceId: 'CLR-2026-0028 INV',
    clientId: 'Karibu Traders Ltd',
    amount: 1250000,
    paymentMode: 'Bank Transfer',
    transactionId: 'TRX-10928374',
    date: new Date().toISOString().split('T')[0],
    note: 'Initial deposit',
    currency: 'TZS',
  }
];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return payments;
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function usePayments() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function addPayment(p: Omit<Payment, 'id'>) {
  const id = `PAY-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  payments = [{ ...p, id }, ...payments];
  emit();
  return id;
}

export function deletePayment(id: string) {
  payments = payments.filter((p) => p.id !== id);
  emit();
}
