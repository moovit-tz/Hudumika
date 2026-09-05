// ─── FinanceExpenseCategories.tsx — FinOps · Expenses · Categories ───────
// Moved out of the generic tenant Settings page (was Settings ▸ Finance ▸
// Expenses Categories, key 'expenses-categories') — the categories an admin
// adds here are the actual, live category options a real expense form
// offers (FinanceExpenseNew.tsx merges them in alongside its own built-in
// list), so managing them belongs beside the expenses they describe, not on
// a generic settings page several clicks away from where they're used.
// Storage is unchanged on purpose: still tenant_settings.settings
// ['expenses-categories'].categories via the same PATCH /v1/settings this
// page always used, so FinanceExpenseNew.tsx's read path needed no changes
// at all — this is a frontend relocation, not a new data model.
import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';

interface Category { id: string; name: string; color: string }

export const FinanceExpenseCategories: React.FC = () => {
  const [cats, setCats] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563eb');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((res: any) => setCats(res?.settings?.['expenses-categories']?.categories ?? []))
      .catch(() => setCats([]))
      .finally(() => setLoaded(true));
  }, []);

  async function persist(next: Category[]) {
    setCats(next);
    setSaving(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'expenses-categories': { categories: next } }) });
    } catch { /* keeps the optimistic local state either way — same as the settings page this replaced */ }
    setSaving(false);
  }

  function doAdd() {
    if (!newName.trim()) return;
    persist([...cats, { id: Date.now().toString(), name: newName.trim(), color: newColor }]);
    setNewName('');
    setAdding(false);
  }

  return (
    <div style={{ padding: '0 0 32px' }}>
      <PageHeader
        crumbs={['FinOps', 'Expenses']}
        titlePlain="Expense"
        titleEm="categories"
        subtitle="Custom categories, offered alongside the built-in ones whenever your team records an expense."
      />

      <SectionCard
        title="Categories"
        action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Add category</button>}
      >
        {!loaded ? (
          <SectionLoading />
        ) : cats.length === 0 && !adding ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
            No custom categories yet — the built-in set (Port Charges, Customs Duty, Freight, …) already covers most expenses.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {cats.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                <button type="button" title={`Remove ${c.name}`} disabled={saving}
                  onClick={() => persist(cats.filter(x => x.id !== c.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', padding: 2 }}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
            {adding && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" title="Pick category colour" value={newColor} onChange={e => setNewColor(e.target.value)}
                  style={{ width: 32, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} />
                <input className="input-field" placeholder="Category name" autoFocus value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doAdd(); if (e.key === 'Escape') setAdding(false); }}
                  style={{ width: 180 }} />
                <button type="button" className="btn btn-primary btn-sm" onClick={doAdd}>Add</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default FinanceExpenseCategories;
