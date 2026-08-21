import React, { useRef } from 'react';
import { EntityPicker, type PickerItem } from './EntityPicker.js';
import { apiFetch } from '../lib/api.js';

export interface CustomerLeadDetails {
  kind: 'customer' | 'lead';
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

/**
 * "Who is this for" — search-as-you-type across real CRM records, both
 * onboarded `customers` and prospective `leads`, instead of a free-text
 * field nothing else in the platform can see. Typing a name that matches
 * neither creates a real `leads` row (a genuine CRM pipeline entity — see
 * Leads.tsx/leads.routes.ts) rather than forcing a full customer-onboarding
 * flow before a calculator estimate can even be prepared for a prospect.
 */
export function CustomerLeadPicker({
  value, onChange, placeholder, label, hint, source,
}: {
  value: PickerItem | null;
  onChange: (item: PickerItem | null, details: CustomerLeadDetails | null) => void;
  placeholder?: string;
  label?: string;
  hint?: string;
  /** Recorded as the lead's `source` when created here, e.g. "LCL Calculator". */
  source: string;
}) {
  const cacheRef = useRef<Map<string, CustomerLeadDetails>>(new Map());

  const search = async (q: string): Promise<PickerItem[]> => {
    // Real server-side search, not fetch-everything-and-filter-in-the-
    // browser — /v1/crm/search also logs every non-empty query into
    // crm_search_history (who searched what, from where), same "log every
    // real search" precedent comply_brela_search_history.sql already set
    // for BRELA lookups.
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    qs.set('source', source);
    const rows: any[] = await apiFetch(`/v1/crm/search?${qs.toString()}`).catch(() => []);

    return rows.map((r) => {
      const key = `${r.kind}:${r.id}`;
      cacheRef.current.set(key, { kind: r.kind, id: r.id, name: r.name, email: r.email, phone: r.phone });
      const sublabel = r.kind === 'lead'
        ? [r.contactName, 'Lead'].filter(Boolean).join(' · ')
        : [r.email, r.phone].filter(Boolean).join(' · ') || 'Customer';
      return { id: key, label: r.name, sublabel };
    });
  };

  const onCreate = async (name: string): Promise<PickerItem> => {
    // Only company/contact_name are required by POST /v1/leads — a single
    // typed name maps to both, the same minimal information the old
    // free-text field ever captured.
    const lead = await apiFetch('/v1/leads', {
      method: 'POST',
      body: JSON.stringify({ company: name, contact_name: name, source }),
    });
    const key = `lead:${lead.id}`;
    cacheRef.current.set(key, { kind: 'lead', id: lead.id, name: lead.company, email: lead.contact_email, phone: lead.contact_phone });
    return { id: key, label: lead.company, sublabel: 'Lead · just created' };
  };

  return (
    <EntityPicker
      value={value}
      onChange={item => onChange(item, item ? cacheRef.current.get(item.id) ?? null : null)}
      search={search}
      onCreate={onCreate}
      createLabel={q => `Add "${q}" as a new lead`}
      placeholder={placeholder || 'Search customers & leads…'}
      label={label}
      hint={hint}
    />
  );
}
