import React, { useCallback } from 'react';
import { EntityPicker, type PickerItem } from './EntityPicker.js';
import { apiFetch } from '../lib/api.js';

type PartyType = 'PERSON' | 'ORGANIZATION';
type Props = {
  type: PartyType;
  value: PickerItem | null;
  onChange: (value: PickerItem | null) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  allowCreate?: boolean;
  /** For organizations created inline: a customer (default) or a supplier record. */
  createAs?: 'customer' | 'supplier';
  defaultVisibility?: 'PRIVATE' | 'TENANT';
};

/** Canonical cross-app person/organization picker. Applications store the
 * returned Party id and their own relationship metadata; they never copy the
 * person's identity into another app-specific address book. */
export function PartyPicker({ type, value, onChange, label, hint, disabled, allowCreate = false, createAs, defaultVisibility = 'TENANT' }: Props) {
  const search = useCallback(async (query: string): Promise<PickerItem[]> => {
    const res = await apiFetch(`/v1/parties?type=${type}&q=${encodeURIComponent(query)}&limit=25`);
    return (res.data ?? []).map((p: any) => ({ id: p.id, label: p.display_name, sublabel: [p.is_customer ? 'Customer' : null, p.is_supplier ? 'Supplier' : null, p.visibility === 'TENANT' ? null : p.visibility.toLowerCase().replace('_', ' ')].filter(Boolean).join(' · ') || undefined }));
  }, [type]);

  const create = useCallback(async (name: string): Promise<PickerItem> => {
    const parts = name.trim().split(/\s+/);
    const payload = type === 'PERSON'
      ? { type, first_name: parts.shift(), last_name: parts.join(' ') || undefined, visibility: defaultVisibility }
      : { type, legal_name: name.trim(), visibility: defaultVisibility, ...(createAs ? { role: createAs } : {}) };
    const row = await apiFetch('/v1/parties', { method: 'POST', body: JSON.stringify(payload) });
    return { id: row.id, label: row.display_name };
  }, [type, defaultVisibility, createAs]);

  return <EntityPicker value={value} onChange={onChange} search={search}
    onCreate={allowCreate ? create : undefined}
    createLabel={q => `Create ${type === 'PERSON' ? 'person' : 'organization'} “${q}”`}
    placeholder={`Search ${type === 'PERSON' ? 'people' : 'organizations'}…`}
    label={label} hint={hint} disabled={disabled} />;
}

export function PersonPicker(props: Omit<Props, 'type'>) { return <PartyPicker {...props} type="PERSON" />; }
export function OrganizationPicker(props: Omit<Props, 'type'>) { return <PartyPicker {...props} type="ORGANIZATION" />; }
