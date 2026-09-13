import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface LeadDup { id: string; company: string; contact_name: string; value: number; created_at: string }
interface CustomerDup { id: string; name: string; email?: string; created_at: string }

function fmtValue(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(v);
}

function DupGroup<T extends { id: string; created_at: string }>({
  items, renderLabel, renderSub, onMerge,
}: {
  items: T[]; renderLabel: (item: T) => string; renderSub: (item: T) => string; onMerge: (primaryId: string, duplicateIds: string[]) => void;
}) {
  const [primaryId, setPrimaryId] = useState(items[0]?.id);

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => (
        <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'var(--r-sm)', background: primaryId === item.id ? 'var(--teal-l)' : 'var(--bg)', cursor: 'pointer' }}>
          <input type="radio" checked={primaryId === item.id} onChange={() => setPrimaryId(item.id)} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{renderLabel(item)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{renderSub(item)}</div>
          </div>
          {primaryId === item.id && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--teal-d)', textTransform: 'uppercase' }}>Keep</span>}
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button" className="btn btn-primary btn-sm"
          onClick={() => onMerge(primaryId!, items.filter(i => i.id !== primaryId).map(i => i.id))}
        >
          Merge into selected
        </button>
      </div>
    </div>
  );
}

export function CrmDuplicates() {
  const [tab, setTab] = useState<'leads' | 'customers'>('leads');
  const [leadGroups, setLeadGroups] = useState<{ leads: LeadDup[] }[] | null>(null);
  const [customerGroups, setCustomerGroups] = useState<{ customers: CustomerDup[] }[] | null>(null);

  const load = useCallback(() => {
    apiFetch('/v1/leads/duplicates').then(setLeadGroups).catch(() => setLeadGroups([]));
    apiFetch('/v1/customers/duplicates').then(setCustomerGroups).catch(() => setCustomerGroups([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function mergeLeads(primaryId: string, duplicateIds: string[]) {
    if (!(await showConfirm(`Merge ${duplicateIds.length} lead(s) into the selected one? This can't be undone.`, { confirmLabel: 'Merge' }))) return;
    try {
      await apiFetch('/v1/leads/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); }
  }

  async function mergeCustomers(primaryId: string, duplicateIds: string[]) {
    if (!(await showConfirm(`Merge ${duplicateIds.length} customer(s) into the selected one? Their shipments and invoices move to the survivor.`, { confirmLabel: 'Merge' }))) return;
    try {
      await apiFetch('/v1/customers/merge', { method: 'POST', body: JSON.stringify({ primary_id: primaryId, duplicate_ids: duplicateIds }) });
      load();
    } catch (err: any) { showAlert(err.message || 'Merge failed'); }
  }

  const tabs: { key: 'leads' | 'customers'; label: string; count: number }[] = [
    { key: 'leads', label: 'Leads', count: leadGroups?.length ?? 0 },
    { key: 'customers', label: 'Customers', count: customerGroups?.length ?? 0 },
  ];

  return (
    <div style={{ padding: '20px 0 40px' }}>
      <PageHeader crumbs={['CRM']} titlePlain="Find" titleEm="duplicates" subtitle="Fuzzy company-name matches — pick which record survives, the rest merge into it." />

      <div style={{ display: 'flex', gap: 8, margin: '18px 0 20px' }}>
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={t.key === tab ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            {t.label} {t.count > 0 && `(${t.count})`}
          </button>
        ))}
      </div>

      {tab === 'leads' && (
        leadGroups === null ? (
          <div style={{ color: 'var(--ink3)', padding: 40, textAlign: 'center' }}>Scanning for duplicate leads…</div>
        ) : leadGroups.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink3)', padding: 40, justifyContent: 'center' }}>
            <Icon name="checkCircle" size={16} color="var(--green)" /> No duplicate leads found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leadGroups.map((g, i) => (
              <DupGroup key={i} items={g.leads} onMerge={mergeLeads}
                renderLabel={l => l.company} renderSub={l => `${l.contact_name} · ${fmtValue(l.value)}`} />
            ))}
          </div>
        )
      )}

      {tab === 'customers' && (
        customerGroups === null ? (
          <div style={{ color: 'var(--ink3)', padding: 40, textAlign: 'center' }}>Scanning for duplicate customers…</div>
        ) : customerGroups.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink3)', padding: 40, justifyContent: 'center' }}>
            <Icon name="checkCircle" size={16} color="var(--green)" /> No duplicate customers found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {customerGroups.map((g, i) => (
              <DupGroup key={i} items={g.customers} onMerge={mergeCustomers}
                renderLabel={c => c.name} renderSub={c => c.email || 'No email on file'} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
