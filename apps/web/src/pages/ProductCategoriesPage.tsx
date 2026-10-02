import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Icon } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../components/ui/dialog.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';

interface ProductCategory {
  id: string;
  name: string;
  slug: string | null;
  parent_id: string | null;
  image_url: string | null;
  description: string | null;
  is_featured: boolean;
  status: 'active' | 'inactive' | 'draft';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CatForm {
  name: string;
  slug: string;
  parent_id: string;
  image_url: string;
  description: string;
  is_featured: boolean;
  status: 'active' | 'inactive' | 'draft';
  sort_order: number;
}

const BLANK: CatForm = { name: '', slug: '', parent_id: '', image_url: '', description: '', is_featured: false, status: 'active', sort_order: 0 };

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function CatModal({ initial, categories, onSave, onClose }: {
  initial?: ProductCategory;
  categories: ProductCategory[];
  onSave: (f: CatForm) => Promise<void>;
  onClose: () => void;
}) {
  const [f, setF] = useState<CatForm>(() => initial ? {
    name: initial.name,
    slug: initial.slug ?? '',
    parent_id: initial.parent_id ?? '',
    image_url: initial.image_url ?? '',
    description: initial.description ?? '',
    is_featured: initial.is_featured,
    status: initial.status,
    sort_order: initial.sort_order,
  } : { ...BLANK });
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CatForm>(k: K, v: CatForm[K]) {
    setF(p => {
      const next = { ...p, [k]: v };
      if (k === 'name' && !initial) next.slug = slugify(String(v));
      return next;
    });
  }

  async function submit() {
    if (!f.name.trim()) { showAlert('Category name is required.'); return; }
    setSaving(true);
    try { await onSave(f); onClose(); }
    catch (err: any) { showAlert(err.message || 'Failed to save category.'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: 13, outline: 'none', background: 'var(--white)', boxSizing: 'border-box', color: 'var(--ink)', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 };

  const parents = categories.filter(c => c.id !== initial?.id);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lbl}>Name *</label>
              <input type="text" title="Category name" value={f.name} onChange={e => set('name', e.target.value)} style={inp} placeholder="e.g. Electronics" />
            </div>
            <div>
              <label style={lbl}>URL Slug</label>
              <input type="text" title="URL slug" value={f.slug} onChange={e => set('slug', slugify(e.target.value))} style={inp} placeholder="e.g. electronics" />
            </div>
            <div>
              <label style={lbl}>Parent Category</label>
              <Select value={f.parent_id || '__none__'} onValueChange={v => set('parent_id', v === '__none__' ? '' : v)}>
                <SelectTrigger aria-label="Parent category" style={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top-level)</SelectItem>
                  {parents.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label style={lbl}>Image URL</label>
              <input type="url" title="Image URL" value={f.image_url} onChange={e => set('image_url', e.target.value)} style={inp} placeholder="https://…" />
            </div>
            <div>
              <label style={lbl}>Description</label>
              <textarea title="Description" value={f.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Status</label>
                <Select value={f.status} onValueChange={v => set('status', v as CatForm['status'])}>
                  <SelectTrigger aria-label="Status" style={inp}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={lbl}>Sort Order</label>
                <input type="number" title="Sort order" value={f.sort_order} min={0} onChange={e => set('sort_order', parseInt(e.target.value) || 0)} style={inp} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={f.is_featured} onChange={e => set('is_featured', e.target.checked)} />
              Featured category (shown prominently in storefront)
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Update Category' : 'Add Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ProductCategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const [cats, setCats] = useState<ProductCategory[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProductCategory | 'new' | null>(null);

  function load() {
    setLoading(true);
    apiFetch('/v1/products/categories')
      .then((res: any) => {
        setCats(Array.isArray(res) ? res : (res.data ?? []));
        setProductCounts(res.product_counts ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave(f: CatForm) {
    const body = {
      name: f.name,
      slug: f.slug || undefined,
      parent_id: f.parent_id || null,
      image_url: f.image_url || null,
      description: f.description || null,
      is_featured: f.is_featured,
      status: f.status,
      sort_order: f.sort_order,
    };
    if (editing === 'new') {
      const created: ProductCategory = await apiFetch('/v1/products/categories', { method: 'POST', body: JSON.stringify(body) });
      setCats(prev => [...prev, created]);
    } else {
      const updated: ProductCategory = await apiFetch(`/v1/products/categories/${(editing as ProductCategory).id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setCats(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
  }

  async function handleDelete(cat: ProductCategory) {
    if (!(await showConfirm(`Delete category "${cat.name}"? Products in this category will become uncategorised.`, { confirmLabel: 'Delete', variant: 'danger' }))) return;
    await apiFetch(`/v1/products/categories/${cat.id}`, { method: 'DELETE' });
    setCats(prev => prev.filter(c => c.id !== cat.id));
  }

  const topLevel = cats.filter(c => !c.parent_id);
  const childMap: Record<string, ProductCategory[]> = {};
  for (const c of cats) {
    if (c.parent_id) {
      if (!childMap[c.parent_id]) childMap[c.parent_id] = [];
      childMap[c.parent_id].push(c);
    }
  }

  function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, { bg: string; color: string }> = {
      active:   { bg: 'var(--green-l)',  color: 'var(--green)'  },
      inactive: { bg: 'var(--bg)',       color: 'var(--ink3)'   },
      draft:    { bg: 'var(--gold-l)',   color: 'var(--gold)'   },
    };
    const c = cfg[status] ?? cfg.inactive;
    return <span style={{ padding: '2px 8px', borderRadius: 'var(--r)', fontSize: 11, fontWeight: 700, background: c.bg, color: c.color }}>{status}</span>;
  }

  function CatRow({ cat, depth = 0 }: { cat: ProductCategory; depth?: number }) {
    const children = childMap[cat.id] ?? [];
    return (<>
      <tr style={{ borderBottom: '1px solid var(--border)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}>
        <td style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: depth * 20 }}>
            {cat.image_url ? (
              <img src={cat.image_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="tag" size={16} color="var(--ink3)" />
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {cat.name}
                {cat.is_featured && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold)', background: 'var(--gold-l)', padding: '1px 6px', borderRadius: 'var(--r-sm)' }}>FEATURED</span>}
              </div>
              {cat.slug && <div style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>{cat.slug}</div>}
            </div>
          </div>
        </td>
        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink3)' }}>{cat.description || '—'}</td>
        <td style={{ padding: '10px 14px' }}><StatusBadge status={cat.status} /></td>
        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink3)', textAlign: 'center' }}>{productCounts[cat.name] ?? 0}</td>
        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink3)', textAlign: 'center' }}>{children.length}</td>
        <td style={{ padding: '10px 10px' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            <button type="button" title="Edit" onClick={() => setEditing(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', padding: 5, borderRadius: 'var(--r-sm)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Icon name="edit" size={14} />
            </button>
            <button type="button" title="Delete" onClick={() => handleDelete(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 5, borderRadius: 'var(--r-sm)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-l)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </td>
      </tr>
      {children.map(child => <CatRow key={child.id} cat={child} depth={depth + 1} />)}
    </>);
  }

  return (
    <div style={{ padding: '0 0 40px' }}>
      {editing !== null && (
        <CatModal
          initial={editing === 'new' ? undefined : editing}
          categories={cats}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <PageHeader
        crumbs={['FINANCE', 'PRODUCTS & SERVICES', 'CATEGORIES']}
        titlePlain="Product"
        titleEm="categories"
        subtitle="Organise your product catalog into a hierarchy of categories."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => navigate('/finance/products')} className="btn btn-secondary btn-sm">
              <Icon name="arrowLeft" size={13} /> Back to Catalog
            </button>
            <Button onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} /> New Category
            </Button>
          </div>
        }
      />

      <SectionCard padded={false}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>
        ) : cats.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Icon name="tag" size={44} color="var(--border)" /></div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No categories yet</div>
            <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Create categories to organise your product catalog.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Category', 'Description', 'Status', 'Products', 'Subcategories', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Products' || h === 'Subcategories' ? 'center' : 'left', fontWeight: 700, color: 'var(--ink2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topLevel.map(c => <CatRow key={c.id} cat={c} />)}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
};
