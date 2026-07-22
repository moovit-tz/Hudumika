import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';

const NONE = '__tenant__';

interface CustomerOption { id: string; name: string; category?: string; }

/** Fetches the tenant's real CRM clients once and caches them for the session — avoids every form re-fetching the full customer list. */
let cachedCustomers: CustomerOption[] | null = null;

function useCustomerOptions() {
  const [customers, setCustomers] = useState<CustomerOption[]>(cachedCustomers ?? []);
  const [loading, setLoading] = useState(!cachedCustomers);

  useEffect(() => {
    if (cachedCustomers) return;
    apiFetch('/v1/customers').then(res => {
      const list = Array.isArray(res) ? res : res.data || res.customers || [];
      cachedCustomers = list;
      setCustomers(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return { customers, loading };
}

/**
 * "Client / Entity" picker used across ComplyOS create forms — lets a tenant
 * optionally scope a certificate/application/obligation/engagement to a
 * specific CRM client (subsidiary/managed entity), matching the PRD's
 * multi-entity group-administrator model. Leaving it on "This business
 * (default)" means the compliance item belongs to the tenant itself.
 */
export function ComplyCustomerPicker({ value, onChange, label = 'Client / Entity' }: {
  value: string | null;
  onChange: (customerId: string | null) => void;
  label?: string;
}) {
  const { customers, loading } = useCustomerOptions();

  const options = [
    { value: NONE, label: 'This business (default)' },
    ...customers.map(c => ({ value: c.id, label: c.name, sublabel: c.category })),
  ];

  return (
    <div>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', marginBottom: 5 }}>{label}</label>
      <Combobox
        options={options}
        value={value ?? NONE}
        onChange={(v) => onChange(v === NONE ? null : v)}
        placeholder={loading ? 'Loading clients…' : 'This business (default)'}
        searchPlaceholder="Search CRM clients…"
        emptyText="No matching clients."
        disabled={loading}
      />
    </div>
  );
}
