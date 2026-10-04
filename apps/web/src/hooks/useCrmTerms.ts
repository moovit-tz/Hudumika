import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

export type CrmTermKey = 'lead' | 'leads' | 'deal' | 'deals' | 'customer' | 'customers' | 'contact' | 'contacts' | 'pipeline';

export interface CrmTerm {
  singular: string;
  plural: string;
  overridden: boolean;
}

export type CrmTermMap = Record<CrmTermKey, CrmTerm>;

const FALLBACK: CrmTermMap = {
  lead:      { singular: 'Lead',      plural: 'Leads',      overridden: false },
  leads:     { singular: 'Lead',      plural: 'Leads',      overridden: false },
  deal:      { singular: 'Deal',      plural: 'Deals',      overridden: false },
  deals:     { singular: 'Deal',      plural: 'Deals',      overridden: false },
  customer:  { singular: 'Customer',  plural: 'Customers',  overridden: false },
  customers: { singular: 'Customer',  plural: 'Customers',  overridden: false },
  contact:   { singular: 'Contact',   plural: 'Contacts',   overridden: false },
  contacts:  { singular: 'Contact',   plural: 'Contacts',   overridden: false },
  pipeline:  { singular: 'Pipeline',  plural: 'Pipelines',  overridden: false },
};

let cache: CrmTermMap | null = null;
const listeners: Set<() => void> = new Set();

function notify() { listeners.forEach(fn => fn()); }

export function invalidateCrmTerms() {
  cache = null;
  notify();
}

export async function fetchCrmTerms(): Promise<CrmTermMap> {
  if (cache) return cache;
  try {
    const data = await apiFetch('/v1/crm/terminology');
    cache = { ...FALLBACK, ...(data as Partial<CrmTermMap>) };
    return cache;
  } catch {
    return FALLBACK;
  }
}

export function useCrmTerms(): CrmTermMap {
  const [terms, setTerms] = useState<CrmTermMap>(cache ?? FALLBACK);

  useEffect(() => {
    let alive = true;
    fetchCrmTerms().then(t => { if (alive) setTerms(t); });
    const refresh = () => { fetchCrmTerms().then(t => { if (alive) setTerms(t); }); };
    listeners.add(refresh);
    return () => { alive = false; listeners.delete(refresh); };
  }, []);

  return terms;
}
