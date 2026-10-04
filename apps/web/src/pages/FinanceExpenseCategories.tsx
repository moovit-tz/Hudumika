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
import { ColorSwatchPicker } from '../components/ui/color-swatch-picker.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { QueryState } from '../components/ui/DataTable.js';

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
        action={<Button type="button" size="sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add category</Button>}
      >
        {!loaded ? (
          <SectionLoading />
        ) : cats.length === 0 && !adding ? (
          <QueryState
            empty
            emptyIcon="tag"
            emptyTitle="No custom categories"
            emptyMessage="The built-in categories already cover common expenses. Add one when your reporting needs a more specific classification."
            emptyAction={{ label: 'Add category', onClick: () => setAdding(true) }}
          ><span /></QueryState>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {cats.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px 7px 12px', borderRadius: 'var(--badge-radius)', border: '1px solid var(--border)', background: 'var(--white)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: c.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${c.name}`} disabled={saving}
                  onClick={() => persist(cats.filter(x => x.id !== c.id))}
                  className="min-h-6 w-6 text-muted-foreground">
                  <Icon name="x" size={12} />
                </Button>
              </div>
            ))}
            {adding && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ColorSwatchPicker value={newColor} onChange={setNewColor} />
                <Input placeholder="Category name" autoFocus value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doAdd(); if (e.key === 'Escape') setAdding(false); }}
                  className="w-45" />
                <Button type="button" size="sm" onClick={doAdd}>Add</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(false); setNewName(''); }}>Cancel</Button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default FinanceExpenseCategories;
