import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { CmsNavItem } from '@hudumika/types';

const NONE = '__none__';

/**
 * §14 of the CMS master brief — the public site's header used to be
 * entirely hardcoded (brand, tagline, the raw page list, a Blog link if
 * posts existed). A real, admin-configurable menu: a top-level item can
 * hold child items for a simple one-level dropdown, and reordering is
 * up/down buttons (same reliability reasoning as the Block Editor's own
 * reordering — no drag-and-drop).
 */
export function CMSNavigation() {
  const [items, setItems] = useState<CmsNavItem[] | null>(null);
  const [form, setForm] = useState({ label: '', target: '', parent_id: NONE });
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch('/v1/cms/nav-items').then(setItems).catch(() => setItems([]));
  }
  useEffect(load, []);

  const topLevel = (items ?? []).filter(i => !i.parent_id);
  const childrenOf = (id: string) => (items ?? []).filter(i => i.parent_id === id);

  async function handleCreate() {
    if (!form.label.trim() || !form.target.trim()) return showAlert('Label and target are required.');
    setSaving(true);
    try {
      await apiFetch('/v1/cms/nav-items', {
        method: 'POST',
        body: JSON.stringify({ label: form.label, target: form.target, parent_id: form.parent_id === NONE ? null : form.parent_id }),
      });
      setForm({ label: '', target: '', parent_id: NONE });
      load();
    } catch (e: any) {
      showAlert(`Failed to add nav item: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    try {
      await apiFetch(`/v1/cms/nav-items/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
      load();
    } catch (e: any) {
      showAlert(`Failed to reorder: ${e.message}`);
    }
  }

  async function handleDelete(item: CmsNavItem) {
    const childCount = childrenOf(item.id).length;
    const msg = childCount > 0
      ? `Delete "${item.label}"? This also removes its ${childCount} dropdown item(s).`
      : `Delete "${item.label}"?`;
    if (!(await showConfirm(msg, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/nav-items/${item.id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showAlert(`Failed to delete: ${e.message}`);
    }
  }

  function Row({ item, isChild, siblingIdx, siblingCount }: { item: CmsNavItem; isChild: boolean; siblingIdx: number; siblingCount: number }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingLeft: isChild ? 40 : 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--mono)' }}>{item.target}</div>
        </div>
        <button onClick={() => handleMove(item.id, 'up')} disabled={siblingIdx === 0} title="Move up"
          style={{ background: 'none', border: 'none', cursor: siblingIdx === 0 ? 'default' : 'pointer', color: siblingIdx === 0 ? 'var(--border)' : 'var(--ink3)', display: 'flex' }}>
          <Icon name="arrowUp" size={14} />
        </button>
        <button onClick={() => handleMove(item.id, 'down')} disabled={siblingIdx === siblingCount - 1} title="Move down"
          style={{ background: 'none', border: 'none', cursor: siblingIdx === siblingCount - 1 ? 'default' : 'pointer', color: siblingIdx === siblingCount - 1 ? 'var(--border)' : 'var(--ink3)', display: 'flex' }}>
          <Icon name="arrowDown" size={14} />
        </button>
        <button onClick={() => handleDelete(item)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex' }}>
          <Icon name="trash2" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Navigation']}
        titlePlain="Site"
        titleEm="navigation"
        subtitle="What visitors see in your public site's header menu — add a top-level item, or nest one under another for a simple dropdown."
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', maxWidth: 640 }}>
        <div className="card" style={{ padding: '18px 20px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Add a menu item</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <input className="input-field" placeholder="Label — e.g. About" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            <input className="input-field" placeholder="Target — e.g. /about, https://…" value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} />
          </div>
          <Select value={form.parent_id} onValueChange={v => setForm(f => ({ ...f, parent_id: v }))}>
            <SelectTrigger className="input-field"><SelectValue placeholder="Top-level item" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Top-level item</SelectItem>
              {topLevel.map(i => <SelectItem key={i.id} value={i.id}>Nested under "{i.label}"</SelectItem>)}
            </SelectContent>
          </Select>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate} style={{ alignSelf: 'flex-start' }}>
            {saving ? 'Adding…' : 'Add item'}
          </button>
        </div>

        {items === null ? <SectionLoading /> : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 13 }}>
            No menu items yet — the public header falls back to your page list until you add some.
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            {topLevel.map((item, i) => (
              <React.Fragment key={item.id}>
                <Row item={item} isChild={false} siblingIdx={i} siblingCount={topLevel.length} />
                {childrenOf(item.id).map((child, ci, arr) => (
                  <Row key={child.id} item={child} isChild siblingIdx={ci} siblingCount={arr.length} />
                ))}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
