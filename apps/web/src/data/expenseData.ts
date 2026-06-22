import { useSyncExternalStore } from 'react';

export interface Expense {
  id: string;
  name: string;
  amount: number;
  date: string;
  category: string;
  shipmentId: string;
  clientId: string;
  paymentMode: string;
  reference: string;
  note: string;
  isRevenue: boolean;
  attachmentUrl?: string;
}

let _expenses: Expense[] = [
  {
    id: 'exp-1',
    name: 'TPA Port Entry Charges',
    amount: 250000,
    date: new Date().toISOString().split('T')[0],
    category: 'PORT_CHARGES',
    shipmentId: 'CLR-2026-0001', 
    clientId: 'cust-001', // Timeline Company Limited
    paymentMode: 'Bank Transfer',
    reference: 'TPA-99182',
    note: 'Standard entry processing fees.',
    isRevenue: false,
  },
  {
    id: 'exp-2',
    name: 'Customs Processing Fee',
    amount: 150000,
    date: new Date().toISOString().split('T')[0],
    category: 'CUSTOMS_DUTY',
    shipmentId: 'CLR-2026-0002',
    clientId: '',
    paymentMode: 'Cash',
    reference: 'CUS-112',
    note: '',
    isRevenue: false,
  }
];

const _subs = new Set<() => void>();
function notify() { _subs.forEach(fn => fn()); }

export function getExpenses(): Expense[] { return _expenses; }

export function addExpense(exp: Omit<Expense, 'id'>) {
  const newExp = { ...exp, id: `exp-${Date.now()}` };
  _expenses = [newExp, ..._expenses];
  notify();
}

export function updateExpense(id: string, exp: Partial<Expense>) {
  _expenses = _expenses.map(e => e.id === id ? { ...e, ...exp } : e);
  notify();
}

export function deleteExpense(id: string) {
  _expenses = _expenses.filter(e => e.id !== id);
  notify();
}

export function subscribeExpenses(fn: () => void): () => void {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

export function useExpenses(): Expense[] {
  return useSyncExternalStore(subscribeExpenses, getExpenses);
}
