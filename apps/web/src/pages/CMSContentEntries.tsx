import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { PageHeader } from '../components/PageHeader.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import { BlockEditor, type ComponentOption } from '../components/BlockEditor.js';
import { BlockPreview } from '../components/BlockPreview.js';
import { RevisionHistory } from '../components/RevisionHistory.js';
import { ActivityDialog } from '../components/ActivityDialog.js';
import { CMSCollaborationDrawer } from '../components/CMSCollaborationDrawer.js';
import { CMSTranslationModal } from '../components/CMSTranslationModal.js';
import { CMSRequestApprovalModal } from '../components/CMSRequestApprovalModal.js';
import { CMSAddToReleaseModal } from '../components/CMSAddToReleaseModal.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { showPrompt } from '../lib/prompt.js';
import type { CmsContentModel, CmsContentEntry, CmsContentField, CmsBlock, CmsComponent, CmsSavedFilter, CmsSite, CmsWorkflowState } from '@hudumika/types';

const PAGE_SIZE = 50;
const ENTRY_FIELD_LABELS = { slug: 'Slug', title: 'Title', status: 'Status', data: 'Fields', seo_description: 'SEO description', publish_at: 'Scheduled for' };
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  published: 'success', draft: 'warning', trash: 'error', scheduled: 'info',
  in_review: 'warning', approved: 'success', archived: 'gray',
};
function StatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANT[status] ?? 'gray';
  const label = status.replace(/_/g, ' ');
  return <Badge variant={v}>{label}</Badge>;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sw', name: 'Swahili (Kiswahili)', flag: '🇹🇿' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ar', name: 'Arabic', flag: '🇦🇪' },
];

function SelectBox({ checked, onToggle }: { checked: boolean; onToggle: (evt: React.MouseEvent) => void }) {
  return (
    <div onClick={onToggle} role="checkbox" aria-checked={checked} tabIndex={0}
      style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--teal)' : 'var(--border)'}`, background: checked ? 'var(--teal)' : 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {checked && <Icon name="check" size={10} color="#fff" />}
    </div>
  );
}

/** One field's editing control */
function FieldInput({ field, value, onChange, components, componentBlocks, relationOptions, forms, experiments }: {
  field: CmsContentField; value: unknown; onChange: (v: unknown) => void; components?: ComponentOption[]; componentBlocks?: Record<string, CmsBlock[]>;
  relationOptions?: Record<string, { id: string; title: string }[]>;
  forms?: { key: string; name: string }[];
  experiments?: { key: string; name: string }[];
}) {
  const common = { className: 'input-field', style: { fontSize: 13 } as React.CSSProperties };
  switch (field.field_type) {
    case 'textarea':
      return <textarea {...common} rows={4} value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} style={{ ...common.style, width: '100%', resize: 'vertical' }} />;
    case 'richtext':
      return <RichTextEditor value={(value as string) ?? ''} onChange={onChange} placeholder={field.label} />;
    case 'blocks':
      return <BlockEditor value={Array.isArray(value) ? value as CmsBlock[] : []} onChange={onChange} components={components} componentBlocks={componentBlocks} forms={forms} experiments={experiments} />;
    case 'number':
      return <input {...common} type="number" value={(value as number) ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'boolean':
      return <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {field.label}</label>;
    case 'date':
      return <input {...common} type="date" value={value ? String(value).slice(0, 10) : ''} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case 'datetime':
      return <input {...common} type="datetime-local" value={toLocalInput((value as string) ?? null)} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case 'email':
      return <input {...common} type="email" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'url':
      return <input {...common} type="url" placeholder="https://…" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'select': {
      const options = Array.isArray((field.config as any)?.options) ? (field.config as any).options as string[] : [];
      return (
        <Select value={(value as string) || undefined} onValueChange={onChange}>
          <SelectTrigger className="input-field"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    case 'tags':
      return <input {...common} placeholder="comma, separated" value={Array.isArray(value) ? value.join(', ') : ((value as string) ?? '')} onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} />;
    case 'image':
      return <input {...common} placeholder="Image URL" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'relation': {
      const opts = relationOptions?.[field.id] ?? [];
      return (
        <Select value={(value as string) || undefined} onValueChange={onChange}>
          <SelectTrigger className="input-field"><SelectValue placeholder={opts.length ? 'Choose…' : 'No entries yet in the related model'} /></SelectTrigger>
          <SelectContent>{opts.map(o => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    case 'coordinates': {
      const v = (value as { lat?: unknown; lng?: unknown }) ?? {};
      const setLat = (s: string) => onChange({ lat: s, lng: v.lng ?? '' });
      const setLng = (s: string) => onChange({ lat: v.lat ?? '', lng: s });
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <input {...common} type="number" step="any" placeholder="Latitude" value={v.lat === undefined || v.lat === null ? '' : String(v.lat)} onChange={e => setLat(e.target.value)} />
          <input {...common} type="number" step="any" placeholder="Longitude" value={v.lng === undefined || v.lng === null ? '' : String(v.lng)} onChange={e => setLng(e.target.value)} />
        </div>
      );
    }
    case 'color':
      return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test((value as string) || '') ? (value as string) : '#000000'}
            onChange={e => onChange(e.target.value)} style={{ width: 40, height: 34, padding: 2, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }} />
          <input {...common} placeholder="#4F46E5" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} style={{ ...common.style, flex: 1, fontFamily: 'var(--mono)' }} />
        </div>
      );
    case 'phone':
      return <input {...common} type="tel" placeholder="+255 700 000 000" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'currency': {
      const v = (value as { amount?: unknown; currency?: unknown }) ?? {};
      const setAmount = (s: string) => onChange({ amount: s, currency: v.currency ?? '' });
      const setCurrency = (s: string) => onChange({ amount: v.amount ?? '', currency: s.toUpperCase() });
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <input {...common} type="number" step="any" placeholder="Amount" style={{ ...common.style, flex: 2 }} value={v.amount === undefined || v.amount === null ? '' : String(v.amount)} onChange={e => setAmount(e.target.value)} />
          <input {...common} placeholder="USD" maxLength={3} style={{ ...common.style, flex: 1, fontFamily: 'var(--mono)', textTransform: 'uppercase' }} value={(v.currency as string) ?? ''} onChange={e => setCurrency(e.target.value)} />
        </div>
      );
    }
    case 'repeatable': {
      const items: unknown[] = Array.isArray(value) ? value : [];
      const itemType = ((field.config as any)?.itemType ?? 'text') as 'text' | 'number' | 'url' | 'email';
      const inputType = itemType === 'number' ? 'number' : itemType === 'email' ? 'email' : itemType === 'url' ? 'url' : 'text';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input {...common} type={inputType} style={{ ...common.style, flex: 1 }}
                placeholder={itemType === 'url' ? 'https://…' : itemType}
                value={item === undefined || item === null ? '' : String(item)}
                onChange={e => { const next = [...items]; next[idx] = e.target.value; onChange(next); }} />
              <button type="button" onClick={() => onChange(items.filter((_, i2) => i2 !== idx))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)', display: 'flex', flexShrink: 0 }}>
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, ''])}>
            <Icon name="plus" size={12} /> Add
          </button>
        </div>
      );
    }
    case 'computed':
      return (
        <div className="input-field" style={{ ...common.style, background: 'var(--bg)', color: value === undefined || value === null ? 'var(--ink3)' : 'var(--ink2)', display: 'flex', alignItems: 'center' }}>
          {value === undefined || value === null ? '(will be calculated on save)' : String(value)}
        </div>
      );
    case 'text':
    default:
      return <input {...common} value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} />;
  }
}

/** Content Manager for one model */
export function CMSContentEntries() {
  const { modelId } = useParams<{ modelId: string }>();
  const navigate = useNavigate();
  const [model, setModel] = useState<CmsContentModel | null>(null);
  const [entries, setEntries] = useState<CmsContentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'scheduled' | 'in_review' | 'approved' | 'trash'>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'card'>('table');
  const [savedFilters, setSavedFilters] = useState<CmsSavedFilter[]>([]);
  // §33 — bulk view-count totals, one query rather than N+1 per row.
  const [entryViews, setEntryViews] = useState<Record<string, number>>({});
  const entryIds = entries.map(e => e.id).filter(Boolean).join(',');
  useEffect(() => {
    if (!entryIds) { setEntryViews({}); return; }
    apiFetch(`/v1/cms/analytics/entry?ids=${entryIds}`).then((r: { totals: Record<string, number> }) => setEntryViews(r.totals)).catch(() => {});
  }, [entryIds]);

  const [sites, setSites] = useState<CmsSite[]>([]);
  const [workflowStates, setWorkflowStates] = useState<CmsWorkflowState[]>([]);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [selectedLocaleFilter, setSelectedLocaleFilter] = useState<string>('all');

  // Action modals
  const [activeApprovalModal, setActiveApprovalModal] = useState<{ open: boolean; id: string; title: string } | null>(null);
  const [activeReleaseModal, setActiveReleaseModal] = useState<{ open: boolean; id: string; title: string } | null>(null);
  const [activeCommentsDrawer, setActiveCommentsDrawer] = useState<{ open: boolean; id: string; title: string } | null>(null);
  const [activeTranslateModal, setActiveTranslateModal] = useState<{ open: boolean; id: string; title: string; locale: string; group?: string } | null>(null);

  useEffect(() => { apiFetch(`/v1/cms/content-models/${modelId}`).then(setModel).catch(() => setModel(null)); }, [modelId]);
  useEffect(() => { apiFetch('/v1/cms/site-settings').then((s: { tenantSlug?: string }) => setTenantSlug(s.tenantSlug ?? null)).catch(() => {}); }, []);
  useEffect(() => { apiFetch<CmsSite[]>('/v1/cms/sites').then(setSites).catch(() => setSites([])); }, []);
  useEffect(() => { apiFetch<CmsWorkflowState[]>('/v1/cms/workflows/states').then(setWorkflowStates).catch(() => setWorkflowStates([])); }, []);
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  function loadSavedFilters() {
    if (!modelId) return;
    apiFetch(`/v1/cms/content-models/${modelId}/saved-filters`).then(setSavedFilters).catch(() => setSavedFilters([]));
  }
  useEffect(loadSavedFilters, [modelId]);

  async function handleSaveFilter() {
    const name = await showPrompt('Name this filter — anyone with access to this model will see it in the list.', { title: 'Save filter', placeholder: 'e.g. My drafts' });
    if (!name) return;
    try {
      await apiFetch(`/v1/cms/content-models/${modelId}/saved-filters`, {
        method: 'POST',
        body: JSON.stringify({ name, status: filter === 'all' ? null : filter, search: debounced || null }),
      });
      loadSavedFilters();
    } catch (e: any) {
      showAlert(`Failed to save filter: ${e.message}`);
    }
  }
  // §56-57 — real CSV export of this model's own entries, every field
  // flattened into its own column.
  async function handleExportEntries() {
    if (!modelId) return;
    try { await apiDownload(`/v1/cms/content-models/${modelId}/entries/export`, `entries-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e: any) { showAlert(`Export failed: ${e.message}`); }
  }
  function applySavedFilter(f: CmsSavedFilter) {
    setFilter((f.status as any) || 'all');
    setSearch(f.search || '');
  }
  async function handleDeleteSavedFilter(f: CmsSavedFilter, ev: React.MouseEvent) {
    ev.stopPropagation();
    if (!(await showConfirm(`Remove the saved filter "${f.name}"?`, { confirmLabel: 'Remove' }))) return;
    try {
      await apiFetch(`/v1/cms/saved-filters/${f.id}`, { method: 'DELETE' });
      loadSavedFilters();
    } catch (e: any) {
      showAlert(`Failed to remove filter: ${e.message}`);
    }
  }

  const load = useCallback((offset = 0) => {
    if (!modelId) return;
    setLoading(true);
    const q = new URLSearchParams();
    if (debounced) q.set('search', debounced);
    if (filter !== 'all') q.set('status', filter);
    if (selectedSiteFilter !== 'all') q.set('site_id', selectedSiteFilter);
    if (selectedLocaleFilter !== 'all') q.set('locale', selectedLocaleFilter);
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(offset));
    apiFetch(`/v1/cms/content-models/${modelId}/entries?${q}`)
      .then((res: CmsContentEntry[]) => { setEntries(prev => offset ? [...prev, ...res] : res); setHasMore(res.length === PAGE_SIZE); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [modelId, debounced, filter, selectedSiteFilter, selectedLocaleFilter]);

  useEffect(() => { load(0); setSelected(new Set()); }, [load]);

  function toggleSelect(id: string, evt: React.MouseEvent) { evt.stopPropagation(); setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function bulkStatus(status: string) {
    try {
      await apiFetch('/v1/cms/content-entries/bulk', { method: 'POST', body: JSON.stringify({ ids: Array.from(selected), status }) });
      setSelected(new Set()); load(0);
    } catch (e: any) { showAlert(`Bulk update failed: ${e.message}`); }
  }
  async function bulkDelete() {
    if (!(await showConfirm(`Delete ${selected.size} ${model?.name_plural.toLowerCase() ?? 'entries'}?`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch('/v1/cms/content-entries/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: Array.from(selected) }) });
      setSelected(new Set()); load(0);
    } catch (e: any) { showAlert(`Bulk delete failed: ${e.message}`); }
  }

  if (!model) return <SectionLoading />;

  if (editingId !== null) {
    return (
      <EntryEditor
        model={model}
        sites={sites}
        workflowStates={workflowStates}
        entryId={editingId === 'new' ? null : editingId}
        onDone={() => { setEditingId(null); load(0); }}
        tenantSlug={tenantSlug}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Content Models', model.name_plural]}
        titlePlain={model.name_plural}
        titleEm="entries"
        subtitle={<>Managed by the fields defined on this model. <Link to={`/cms/models/${model.id}`}>Edit fields →</Link></>}
        actions={<button className="btn btn-primary btn-sm" onClick={() => setEditingId('new')}><Icon name="plus" size={13} /> New {model.name.toLowerCase()}</button>}
      />

      <div style={{ padding: '14px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <Tabs value={filter} onValueChange={v => setFilter(v as any)} variant="segmented">
            <TabsList>
              {(['all', 'published', 'in_review', 'scheduled', 'draft', 'trash'] as const).map(f => (
                <TabsTrigger key={f} value={f}>
                  {f === 'in_review' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {sites.length > 1 && (
              <Select value={selectedSiteFilter} onValueChange={setSelectedSiteFilter}>
                <SelectTrigger className="input-field" style={{ fontSize: 12, height: 32, minWidth: 120 }}>
                  <SelectValue placeholder="All Sites" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌐 All Sites</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={selectedLocaleFilter} onValueChange={setSelectedLocaleFilter}>
              <SelectTrigger className="input-field" style={{ fontSize: 12, height: 32, minWidth: 120 }}>
                <SelectValue placeholder="All Locales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🌍 All Locales</SelectItem>
                {SUPPORTED_LOCALES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div style={{ position: 'relative' }}>
              <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '7px 12px 7px 30px', fontSize: 13, outline: 'none', width: 170, background: 'var(--white)' }} />
            </div>
            <button className="btn btn-secondary btn-sm" title="Save this status + search as a named filter" onClick={handleSaveFilter} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="bookmark" size={13} /> Save filter
            </button>
            <button className="btn btn-secondary btn-sm" title="Export all entries as CSV" onClick={handleExportEntries} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Icon name="download" size={13} /> Export CSV
            </button>
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <button title="Table view" onClick={() => setView('table')}
                style={{ padding: '7px 9px', background: view === 'table' ? 'var(--teal-l, var(--bg))' : 'var(--white)', color: view === 'table' ? 'var(--teal)' : 'var(--ink3)', border: 'none', cursor: 'pointer', display: 'flex' }}>
                <Icon name="list" size={14} />
              </button>
              <button title="Card view" onClick={() => setView('card')}
                style={{ padding: '7px 9px', background: view === 'card' ? 'var(--teal-l, var(--bg))' : 'var(--white)', color: view === 'card' ? 'var(--teal)' : 'var(--ink3)', border: 'none', cursor: 'pointer', display: 'flex', borderLeft: '1px solid var(--border)' }}>
                <Icon name="grid" size={14} />
              </button>
            </div>
          </div>
        </div>

        {savedFilters.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {savedFilters.map(f => (
              <button key={f.id} onClick={() => applySavedFilter(f)} title={`Status: ${f.status || 'all'}${f.search ? ` · Search: ${f.search}` : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 6px 5px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink2)', cursor: 'pointer' }}>
                {f.name}
                <span onClick={ev => handleDeleteSavedFilter(f, ev)} style={{ display: 'flex', color: 'var(--ink3)', padding: 2 }}><Icon name="x" size={10} /></span>
              </button>
            ))}
          </div>
        )}

        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 12, borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal)' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{selected.size} selected</span>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkStatus('published')}>Publish</button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkStatus('draft')}>Draft</button>
            <button className="btn btn-secondary btn-sm" onClick={() => bulkStatus('trash')}>Trash</button>
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--red)' }} onClick={bulkDelete}>Delete</button>
            <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12.5, cursor: 'pointer' }}>Clear</button>
          </div>
        )}
      </div>

      {/* Shared action modals */}
      {activeApprovalModal && (
        <CMSRequestApprovalModal
          open={activeApprovalModal.open}
          onClose={() => setActiveApprovalModal(null)}
          resourceType="entry"
          resourceId={activeApprovalModal.id}
          resourceTitle={activeApprovalModal.title}
          onRequested={() => load(0)}
        />
      )}
      {activeReleaseModal && (
        <CMSAddToReleaseModal
          open={activeReleaseModal.open}
          onClose={() => setActiveReleaseModal(null)}
          resourceType="entry"
          resourceId={activeReleaseModal.id}
          resourceTitle={activeReleaseModal.title}
        />
      )}
      {activeCommentsDrawer && (
        <CMSCollaborationDrawer
          open={activeCommentsDrawer.open}
          onClose={() => setActiveCommentsDrawer(null)}
          resourceType="entry"
          resourceId={activeCommentsDrawer.id}
          resourceTitle={activeCommentsDrawer.title}
        />
      )}
      {activeTranslateModal && (
        <CMSTranslationModal
          open={activeTranslateModal.open}
          onClose={() => setActiveTranslateModal(null)}
          resourceType="entry"
          resourceId={activeTranslateModal.id}
          resourceTitle={activeTranslateModal.title}
          currentLocale={activeTranslateModal.locale}
          translationGroupId={activeTranslateModal.group}
          onTranslated={() => {
            showAlert('AI draft translation created.');
            load(0);
          }}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 18px' }}>
        {view === 'table' ? (
          <div className="card" style={{ padding: 0 }}>
            <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['', 'Title', 'Locale', 'Status', 'Views', 'Updated', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Actions' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e.id} onClick={() => setEditingId(e.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg)')} onMouseLeave={ev => (ev.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 16px', width: 34 }}><SelectBox checked={selected.has(e.id)} onToggle={ev => toggleSelect(e.id, ev)} /></td>
                      <td style={{ padding: '11px 16px', fontWeight: 600 }}>{e.title}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>
                        <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                          {((e as any).locale || 'EN').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <StatusBadge status={e.status} />
                        {e.status === 'scheduled' && e.publish_at && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 3 }}>{fmtDate(e.publish_at)}</div>}
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{(entryViews[e.id] ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(e.updated_at)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }} onClick={ev => ev.stopPropagation()}>
                          <button
                            onClick={() => setActiveCommentsDrawer({ open: true, id: e.id, title: e.title })}
                            className="btn btn-secondary btn-sm"
                            title="Comments"
                            style={{ padding: '4px 7px' }}
                          >
                            <Icon name="messageSquare" size={12} />
                          </button>
                          <button
                            onClick={() => setActiveTranslateModal({ open: true, id: e.id, title: e.title, locale: (e as any).locale || 'en', group: (e as any).translation_group_id })}
                            className="btn btn-secondary btn-sm"
                            title="Translate with AI"
                            style={{ padding: '4px 7px' }}
                          >
                            <Icon name="sparkle" size={12} />
                          </button>
                          <button
                            onClick={() => setActiveApprovalModal({ open: true, id: e.id, title: e.title })}
                            className="btn btn-secondary btn-sm"
                            title="Request Approval"
                            style={{ padding: '4px 7px' }}
                          >
                            <Icon name="checkCircle" size={12} />
                          </button>
                          <button
                            onClick={() => setActiveReleaseModal({ open: true, id: e.id, title: e.title })}
                            className="btn btn-secondary btn-sm"
                            title="Add to Release"
                            style={{ padding: '4px 7px' }}
                          >
                            <Icon name="package" size={12} />
                          </button>
                          {e.status === 'published' && tenantSlug && model && (
                            <a href={`/site/${tenantSlug}/m/${model.key}/${e.slug}`} target="_blank" rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="eye" size={11} /> View
                            </a>
                          )}
                          <button onClick={() => setEditingId(e.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}><Icon name="edit" size={11} /> Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && !loading && (
                    <tr><td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No {model.name_plural.toLowerCase()} found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {hasMore && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn btn-secondary btn-sm" onClick={() => load(entries.length)}>Load more</button></div>}
          </div>
        ) : (
          <>
            {entries.length === 0 && !loading ? (
              <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No {model.name_plural.toLowerCase()} found.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
                {entries.map(e => (
                  <div key={e.id} className="card" onClick={() => setEditingId(e.id)}
                    style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{e.title}</div>
                      <div onClick={ev => ev.stopPropagation()}><SelectBox checked={selected.has(e.id)} onToggle={ev => toggleSelect(e.id, ev)} /></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge status={e.status} />
                      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{fmtDate(e.updated_at)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }} onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => setActiveCommentsDrawer({ open: true, id: e.id, title: e.title })} className="btn btn-secondary btn-sm" title="Comments" style={{ padding: '4px 7px' }}><Icon name="messageSquare" size={12} /></button>
                      <button onClick={() => setActiveApprovalModal({ open: true, id: e.id, title: e.title })} className="btn btn-secondary btn-sm" title="Request Approval" style={{ padding: '4px 7px' }}><Icon name="checkCircle" size={12} /></button>
                      <button onClick={() => setEditingId(e.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 11, flex: 1 }}><Icon name="edit" size={11} /> Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasMore && <div style={{ padding: 14, textAlign: 'center' }}><button className="btn btn-secondary btn-sm" onClick={() => load(entries.length)}>Load more</button></div>}
          </>
        )}
      </div>
    </div>
  );
}

function EntryEditor({
  model,
  sites,
  workflowStates,
  entryId,
  onDone,
  tenantSlug,
}: {
  model: CmsContentModel;
  sites: CmsSite[];
  workflowStates: CmsWorkflowState[];
  entryId: string | null;
  onDone: () => void;
  tenantSlug?: string | null;
}) {
  const [entry, setEntry] = useState<{
    title: string;
    slug: string;
    status: string;
    data: Record<string, unknown>;
    seo_description: string;
    publish_at: string | null;
    site_id?: string | null;
    locale?: string;
    translation_group_id?: string | null;
  } | null>(
    entryId ? null : { title: '', slug: '', status: 'draft', data: {}, seo_description: '', publish_at: null, site_id: null, locale: 'en', translation_group_id: null },
  );
  const [saving, setSaving] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showRequestApproval, setShowRequestApproval] = useState(false);
  const [showAddToRelease, setShowAddToRelease] = useState(false);

  const handlePreview = async () => {
    if (!entryId || !tenantSlug || !entry) return;
    try {
      const { token } = await apiFetch(`/v1/cms/content-entries/${entryId}/preview-token`);
      window.open(`/site/${tenantSlug}/m/${model.key}/${entry.slug}?preview=${encodeURIComponent(token)}`, '_blank', 'noopener');
    } catch (e: any) {
      showAlert(`Couldn't create a preview link: ${e.message}`);
    }
  };
  const [components, setComponents] = useState<CmsComponent[]>([]);
  const [forms, setForms] = useState<{ key: string; name: string }[]>([]);
  const [experiments, setExperiments] = useState<{ key: string; name: string }[]>([]);
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (!entryId) return;
    apiFetch(`/v1/cms/content-entries/${entryId}`).then((e: CmsContentEntry) =>
      setEntry({
        title: e.title,
        slug: e.slug,
        status: e.status,
        data: e.data,
        seo_description: e.seo_description || '',
        publish_at: e.publish_at,
        site_id: (e as any).site_id || null,
        locale: (e as any).locale || 'en',
        translation_group_id: (e as any).translation_group_id || null,
      }));
  }, [entryId]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!entryId || !entry) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        await apiFetch(`/v1/cms/content-entries/${entryId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: entry.title,
            slug: entry.slug || undefined,
            data: entry.data,
            seo_description: entry.seo_description || null,
            site_id: entry.site_id || null,
            locale: entry.locale || 'en',
          }),
        });
        setAutosaveState('saved');
      } catch {
        setAutosaveState('idle');
      }
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [entryId, entry?.title, entry?.slug, entry?.data, entry?.seo_description, entry?.site_id, entry?.locale]);

  useEffect(() => { apiFetch('/v1/cms/components').then(setComponents).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/v1/cms/forms').then((fs: { key: string; name: string }[]) => setForms(fs)).catch(() => {}); }, []);
  useEffect(() => { apiFetch('/v1/cms/experiments').then((xs: { key: string; name: string }[]) => setExperiments(xs)).catch(() => {}); }, []);
  const componentOptions: ComponentOption[] = components.map(c => ({ id: c.id, name: c.name }));
  const componentBlocksMap: Record<string, CmsBlock[]> = Object.fromEntries(components.map(c => [c.id, c.blocks]));

  const [relationOptions, setRelationOptions] = useState<Record<string, { id: string; title: string }[]>>({});
  useEffect(() => {
    const relationFields = (model.fields ?? []).filter(f => f.field_type === 'relation');
    if (!relationFields.length) { setRelationOptions({}); return; }
    Promise.all(relationFields.map(async f => {
      const targetModelId = (f.config as any)?.targetModelId;
      if (!targetModelId) return [f.id, []] as const;
      try {
        const res: CmsContentEntry[] = await apiFetch(`/v1/cms/content-models/${targetModelId}/entries?limit=200`);
        return [f.id, res.filter(e => e.status !== 'trash').map(e => ({ id: e.id, title: e.title }))] as const;
      } catch {
        return [f.id, []] as const;
      }
    })).then(pairs => setRelationOptions(Object.fromEntries(pairs)));
  }, [model.id]);

  if (!entry) return <SectionLoading />;
  const fields = model.fields ?? [];

  async function save(status: string) {
    if (!entry!.title.trim()) return showAlert('Title is required.');
    if (status === 'scheduled' && !entry!.publish_at) return showAlert('Pick a date/time to schedule this for.');
    setSaving(true);
    const payload = {
      title: entry!.title,
      slug: entry!.slug || undefined,
      status,
      data: entry!.data,
      seo_description: entry!.seo_description || null,
      publish_at: status === 'scheduled' ? entry!.publish_at : null,
      site_id: entry!.site_id || null,
      locale: entry!.locale || 'en',
    };
    try {
      if (entryId) await apiFetch(`/v1/cms/content-entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch(`/v1/cms/content-models/${model.id}/entries`, { method: 'POST', body: JSON.stringify(payload) });
      onDone();
    } catch (e: any) {
      showAlert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap', rowGap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)' }}>
            <Icon name="arrowLeft" size={14} /> Back to {model.name_plural}
          </button>
          {entryId && autosaveState !== 'idle' && (
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{autosaveState === 'saving' ? 'Saving…' : 'Saved'}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {entry.status === 'scheduled' && (
            <input type="datetime-local" value={toLocalInput(entry.publish_at)} onChange={e => setEntry(f => f && ({ ...f, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null }))} className="input-field" style={{ fontSize: 12 }} />
          )}
          {entryId && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowComments(true)} title="Comments">
                <Icon name="messageSquare" size={13} /> Comments
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowTranslate(true)} title="Translate (AI)">
                <Icon name="sparkle" size={13} /> Translate
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRequestApproval(true)} title="Request Approval">
                <Icon name="checkCircle" size={13} /> Request Review
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddToRelease(true)} title="Add to Release">
                <Icon name="package" size={13} /> Add to Release
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowActivity(true)} title="Who did what">
                <Icon name="activity" size={13} /> Activity
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowHistory(true)} title="Version history">
                <Icon name="clock" size={13} /> History
              </button>
              {tenantSlug && (
                <button className="btn btn-secondary btn-sm" onClick={handlePreview} title="Preview entry">
                  <Icon name="eye" size={13} /> Preview
                </button>
              )}
            </>
          )}
          <button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => save('draft')}>Save draft</button>
          {entry.status === 'scheduled'
            ? <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => save('scheduled')}>Schedule</button>
            : <button className="btn btn-secondary btn-sm" onClick={() => setEntry(f => f && ({ ...f, status: 'scheduled' }))}>Schedule…</button>}
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => save('published')}>Publish</button>
        </div>
      </div>

      {entryId && <ActivityDialog open={showActivity} onOpenChange={setShowActivity} entityType="entry" entityId={entryId} />}
      {entryId && (
        <RevisionHistory open={showHistory} onOpenChange={setShowHistory} resourceType="entry" resourceId={entryId}
          current={{ slug: entry.slug, title: entry.title, status: entry.status, data: entry.data, seo_description: entry.seo_description, publish_at: entry.publish_at }}
          fieldLabels={ENTRY_FIELD_LABELS}
          onRestored={(restored: CmsContentEntry) => setEntry({
            title: restored.title, slug: restored.slug, status: restored.status, data: restored.data,
            seo_description: restored.seo_description || '', publish_at: restored.publish_at,
            site_id: (restored as any).site_id, locale: (restored as any).locale, translation_group_id: (restored as any).translation_group_id,
          })} />
      )}
      {entryId && (
        <CMSCollaborationDrawer
          open={showComments}
          onClose={() => setShowComments(false)}
          resourceType="entry"
          resourceId={entryId}
          resourceTitle={entry.title || 'Untitled Entry'}
        />
      )}
      {entryId && (
        <CMSTranslationModal
          open={showTranslate}
          onClose={() => setShowTranslate(false)}
          resourceType="entry"
          resourceId={entryId}
          resourceTitle={entry.title || 'Untitled Entry'}
          currentLocale={entry.locale || 'en'}
          translationGroupId={entry.translation_group_id || undefined}
          onTranslated={() => showAlert('AI draft translation created.')}
        />
      )}
      {entryId && (
        <CMSRequestApprovalModal
          open={showRequestApproval}
          onClose={() => setShowRequestApproval(false)}
          resourceType="entry"
          resourceId={entryId}
          resourceTitle={entry.title || 'Untitled Entry'}
          onRequested={() => setEntry(f => f && ({ ...f, status: 'in_review' }))}
        />
      )}
      {entryId && (
        <CMSAddToReleaseModal
          open={showAddToRelease}
          onClose={() => setShowAddToRelease(false)}
          resourceType="entry"
          resourceId={entryId}
          resourceTitle={entry.title || 'Untitled Entry'}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', maxWidth: 740, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input value={entry.title} onChange={e => setEntry(f => f && ({ ...f, title: e.target.value }))} placeholder="Title"
          style={{ fontSize: 24, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', padding: '6px 0', outline: 'none', background: 'transparent', width: '100%' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Slug</label>
            <input className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} value={entry.slug} placeholder="auto" onChange={e => setEntry(f => f && ({ ...f, slug: e.target.value }))} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Locale</label>
            <Select value={entry.locale || 'en'} onValueChange={v => setEntry(f => f && ({ ...f, locale: v }))}>
              <SelectTrigger className="input-field" style={{ fontSize: 12.5 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {sites.length > 1 && (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>Site Channel</label>
            <Select value={entry.site_id || 'all'} onValueChange={v => setEntry(f => f && ({ ...f, site_id: v === 'all' ? null : v }))}>
              <SelectTrigger className="input-field" style={{ fontSize: 12.5 }}><SelectValue placeholder="All Sites" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sites (Global)</SelectItem>
                {sites.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.slug})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {fields.map(field => {
          const isBlocks = field.field_type === 'blocks';
          const inPreview = isBlocks && previewing[field.id];
          const blockValue = Array.isArray(entry.data[field.key]) ? entry.data[field.key] as CmsBlock[] : [];
          return (
            <div key={field.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>
                  {field.label}{field.required && ' *'}
                </label>
                {isBlocks && (
                  <Tabs value={inPreview ? 'preview' : 'edit'} onValueChange={v => setPreviewing(p => ({ ...p, [field.id]: v === 'preview' }))} variant="segmented">
                    <TabsList>
                      <TabsTrigger value="edit">Edit</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </div>
              {inPreview ? (
                blockValue.length
                  ? <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px' }}><BlockPreview blocks={blockValue} components={componentBlocksMap} tenantSlug={tenantSlug ?? undefined} /></div>
                  : <div className="block-preview-empty">Nothing to preview yet — add a block first.</div>
              ) : (
                <FieldInput field={field} value={entry.data[field.key]} components={componentOptions} componentBlocks={componentBlocksMap} relationOptions={relationOptions} forms={forms} experiments={experiments} onChange={v => setEntry(f => f && ({ ...f, data: { ...f.data, [field.key]: v } }))} />
              )}
              {field.help_text && <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>{field.help_text}</div>}
            </div>
          );
        })}
        {fields.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink3)' }}>This model has no fields yet — <Link to={`/cms/models/${model.id}`}>add some</Link> to capture more than a title.</div>
        )}

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 6 }}>SEO description</label>
          <textarea className="input-field" rows={2} value={entry.seo_description} onChange={e => setEntry(f => f && ({ ...f, seo_description: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
        </div>
      </div>
    </div>
  );
}
