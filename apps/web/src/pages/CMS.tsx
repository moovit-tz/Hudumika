import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { CheckboxRow } from '../components/ui/list-item-row.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch, apiDownload } from '../lib/api.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import { RevisionHistory } from '../components/RevisionHistory.js';
import { ActivityDialog } from '../components/ActivityDialog.js';
import { CMSCollaborationDrawer } from '../components/CMSCollaborationDrawer.js';
import { CMSTranslationModal } from '../components/CMSTranslationModal.js';
import { CMSRequestApprovalModal } from '../components/CMSRequestApprovalModal.js';
import { CMSAddToReleaseModal } from '../components/CMSAddToReleaseModal.js';
import { useAuth } from '../hooks/useAuth.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import type { CmsPage, CmsPost, CmsComment, CmsSiteSettings, CmsMedia, CmsSite, CmsWorkflowState, CmsFontId, CmsRadiusPreset } from '@hudumika/types';
import { CMS_FONT_IDS, CMS_RADIUS_PRESETS } from '@hudumika/types';
import { CMS_FONT_LABELS, CMS_RADIUS_LABELS } from '../lib/cmsDesignTokens.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';
import './CMS.css';

/* ── Types ── */
interface Post {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft' | 'scheduled' | 'trash' | 'in_review' | 'approved' | 'archived';
  author: string; category: string; tags: string; publish_at: string | null;
  seo_description: string; canonical_url: string; noindex: boolean; og_image: string;
  site_id?: string | null; locale?: string; translation_group_id?: string | null;
  created_at: string; updated_at: string;
}
interface Page {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft' | 'scheduled' | 'trash' | 'in_review' | 'approved' | 'archived';
  seo_description: string; publish_at: string | null;
  canonical_url: string; noindex: boolean; og_image: string;
  template: 'standard' | 'full-width' | 'landing';
  site_id?: string | null; locale?: string; translation_group_id?: string | null;
  author: string; created_at: string; updated_at: string;
}
interface Comment {
  id: string; author: string; email: string; content: string;
  status: 'approved' | 'pending' | 'spam'; created_at: string;
}

const PAGE_SIZE = 50;

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toISOString(); }
function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
/** For a <input type="datetime-local"> value — local time, no timezone suffix. */
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

/* ── API ↔ local shape mappers ── */
function cmsPageToLocal(cp: CmsPage): Page {
  return {
    id: cp.id, title: cp.title, slug: cp.slug, content: cp.content,
    status: cp.status as any, seo_description: cp.seo_description || '',
    publish_at: cp.publish_at, canonical_url: cp.canonical_url || '',
    noindex: !!cp.noindex, og_image: cp.og_image || '',
    template: cp.template || 'standard',
    site_id: (cp as any).site_id || null,
    locale: (cp as any).locale || 'en',
    translation_group_id: (cp as any).translation_group_id || null,
    author: 'You', created_at: cp.created_at, updated_at: cp.updated_at,
  };
}
function cmsPostToLocal(cp: CmsPost): Post {
  return {
    id: cp.id, title: cp.title, slug: cp.slug, content: cp.content,
    status: cp.status as any, author: 'You', category: cp.category || '',
    tags: cp.tags || '', publish_at: cp.publish_at,
    seo_description: cp.seo_description || '', canonical_url: cp.canonical_url || '',
    noindex: !!cp.noindex, og_image: cp.og_image || '',
    site_id: (cp as any).site_id || null,
    locale: (cp as any).locale || 'en',
    translation_group_id: (cp as any).translation_group_id || null,
    created_at: cp.created_at, updated_at: cp.updated_at,
  };
}
function cmsCommentToLocal(cc: CmsComment): Comment {
  return { id: cc.id, author: cc.author, email: cc.email || '', content: cc.content, status: cc.status, created_at: cc.created_at };
}

/* ── Avatar ── */
function Av({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0, fontFamily: 'var(--font)' }}>
      {initials}
    </div>
  );
}

/* ── Status badge ── */
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  published: 'success', draft: 'warning', trash: 'error', scheduled: 'info',
  in_review: 'warning', approved: 'success', archived: 'gray',
  pending: 'warning', spam: 'error',
};
function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'gray'}>{status.replace('_', ' ')}</Badge>;
}

/* ── Field label ── */
function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/* ── Selection checkbox (bulk-select) ── */
function SelectBox({ checked, onToggle }: { checked: boolean; onToggle: (evt: React.MouseEvent) => void }) {
  return (
    <div onClick={onToggle} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(e as any); } }}
      style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--teal)' : 'var(--border)'}`, background: checked ? 'var(--teal)' : 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {checked && <Icon name="check" size={10} color="#fff" />}
    </div>
  );
}

/* ── Bulk action bar ── */
function BulkBar({ count, onClear, actions }: { count: number; onClear: () => void; actions: { label: string; onClick: () => void; danger?: boolean }[] }) {
  if (count === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 12, borderRadius: 'var(--r)', background: 'var(--teal-l)', border: '1px solid var(--teal)' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--teal-deep, var(--teal))' }}>{count} selected</span>
      {actions.map(a => (
        <button key={a.label} type="button" onClick={a.onClick} className="btn btn-secondary btn-sm" style={{ fontSize: 12, color: a.danger ? 'var(--red)' : undefined }}>
          {a.label}
        </button>
      ))}
      <button type="button" onClick={onClear} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink3)', fontSize: 12.5, cursor: 'pointer' }}>Clear</button>
    </div>
  );
}

/* ── Media picker ── */
function MediaPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (url: string) => void }) {
  const [items, setItems] = useState<CmsMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch('/v1/cms/media').then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const media: CmsMedia = await apiFetch('/v1/cms/media', { method: 'POST', body: form });
      setItems(prev => [media, ...prev]);
    } catch (e: any) {
      showAlert(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, evt: React.MouseEvent) {
    evt.stopPropagation();
    if (!(await showConfirm('Delete this image? Any content already using it will show a broken image.', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/media/${id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(m => m.id !== id));
    } catch (e: any) {
      showAlert(`Failed to delete: ${e.message}`);
    }
  }

  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', width: 'min(640px, 94vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Media Library</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink3)' }}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Upload image'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {loading ? <SectionLoading /> : items.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--ink3)', padding: 32, fontSize: 13 }}>No images yet — upload one above.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 10 }}>
              {items.map(m => (
                <div key={m.id} onClick={() => onSelect(m.url)} role="button" tabIndex={0}
                  style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', cursor: 'pointer', aspectRatio: '1', background: 'var(--bg)' }}>
                  <img src={m.url} alt={m.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <button type="button" onClick={e => handleDelete(m.id, e)} title="Delete"
                    style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useMediaPicker() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((url: string | null) => void) | null>(null);

  const pick = useCallback((): Promise<string | null> => {
    setOpen(true);
    return new Promise(resolve => { resolverRef.current = resolve; });
  }, []);
  const onSelect = useCallback((url: string) => { setOpen(false); resolverRef.current?.(url); resolverRef.current = null; }, []);
  const onClose = useCallback(() => { setOpen(false); resolverRef.current?.(null); resolverRef.current = null; }, []);

  const picker = <MediaPicker open={open} onClose={onClose} onSelect={onSelect} />;
  return { pick, picker };
}

/* ── Post Editor ── */
const POST_FIELD_LABELS = { slug: 'Slug', title: 'Title', content: 'Content', status: 'Status', category: 'Category', tags: 'Tags', publish_at: 'Scheduled for' };
const PAGE_FIELD_LABELS = { slug: 'Slug', title: 'Title', content: 'Content', status: 'Status', seo_description: 'SEO description', publish_at: 'Scheduled for' };

function PostEditor({
  post,
  sites,
  workflowStates,
  onSave,
  onCancel,
  tenantSlug,
}: {
  post: Partial<Post> | null;
  sites: CmsSite[];
  workflowStates: CmsWorkflowState[];
  onSave: (p: Post) => void;
  onCancel: () => void;
  tenantSlug?: string;
}) {
  const [form, setForm] = useState<Partial<Post>>(post || {
    title: '', slug: '', content: '', status: 'draft', author: 'Admin', category: '', tags: '',
    publish_at: null, seo_description: '', canonical_url: '', noindex: false, og_image: '',
    site_id: null, locale: 'en', translation_group_id: null,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showRequestApproval, setShowRequestApproval] = useState(false);
  const [showAddToRelease, setShowAddToRelease] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [contentView, setContentView] = useState<'edit' | 'preview'>('edit');

  const handlePreview = async () => {
    if (!form.id || !tenantSlug) return;
    try {
      const { token } = await apiFetch(`/v1/cms/posts/${form.id}/preview-token`);
      window.open(`/site/${tenantSlug}/blog/${form.slug}?preview=${encodeURIComponent(token)}`, '_blank', 'noopener');
    } catch (e: any) {
      showAlert(`Couldn't create a preview link: ${e.message}`);
    }
  };
  const set = (k: keyof Post, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setNoindex = (v: boolean) => setForm(f => ({ ...f, noindex: v }));
  const { pick, picker } = useMediaPicker();
  const isMobile = useIsMobile();

  const [aiSeoLoading, setAiSeoLoading] = useState(false);
  const [aiTagsLoading, setAiTagsLoading] = useState(false);
  const handleAiSeo = async () => {
    if (!form.content?.trim() || aiSeoLoading) return;
    setAiSeoLoading(true);
    try {
      const { result }: { result: string } = await apiFetch('/v1/cms/ai/summarize-seo', { method: 'POST', body: JSON.stringify({ text: form.content }) });
      set('seo_description', result);
    } catch (e: any) {
      showAlert(`Couldn't generate an SEO description: ${e.message}`);
    } finally {
      setAiSeoLoading(false);
    }
  };
  const handleAiTags = async () => {
    if (!form.content?.trim() || aiTagsLoading) return;
    setAiTagsLoading(true);
    try {
      const { tags }: { tags: string[] } = await apiFetch('/v1/cms/ai/suggest-tags', { method: 'POST', body: JSON.stringify({ title: form.title, text: form.content }) });
      set('tags', tags.join(', '));
    } catch (e: any) {
      showAlert(`Couldn't suggest tags: ${e.message}`);
    } finally {
      setAiTagsLoading(false);
    }
  };

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!form.id) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        await apiFetch(`/v1/cms/posts/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: form.title, slug: form.slug, content: form.content, category: form.category,
            tags: form.tags, seo_description: form.seo_description || null,
            canonical_url: form.canonical_url || null, noindex: form.noindex, og_image: form.og_image || null,
            site_id: form.site_id || null, locale: form.locale || 'en',
          }),
        });
        setAutosaveState('saved');
      } catch {
        setAutosaveState('idle');
      }
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [form.id, form.title, form.slug, form.content, form.category, form.tags, form.seo_description, form.canonical_url, form.noindex, form.og_image, form.site_id, form.locale]);

  const handleSave = (status: Post['status']) => {
    if (!form.title?.trim()) return showAlert('Title is required');
    if (status === 'scheduled' && !form.publish_at) return showAlert('Pick a date/time to schedule this for');
    const n = now();
    onSave({
      id: form.id || uid(), title: form.title!, slug: form.slug || '', content: form.content || '', status,
      author: form.author || 'Admin', category: form.category || 'General', tags: form.tags || '',
      publish_at: status === 'scheduled' ? form.publish_at ?? null : null,
      seo_description: form.seo_description || '', canonical_url: form.canonical_url || '', noindex: !!form.noindex, og_image: form.og_image || '',
      site_id: form.site_id || null, locale: form.locale || 'en', translation_group_id: form.translation_group_id || null,
      created_at: form.created_at || n, updated_at: n,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {picker}
      {/* Top action header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0, flexWrap: 'wrap', rowGap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>
            <Icon name="arrowLeft" size={14} /> Back to Posts
          </button>
          {form.id && autosaveState !== 'idle' && (
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{autosaveState === 'saving' ? 'Saving…' : 'Saved'}</span>
          )}
          {form.locale && form.locale !== 'en' && (
            <Badge variant="info">{form.locale.toUpperCase()}</Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {form.status === 'scheduled' && (
            <input type="datetime-local" value={toLocalInput(form.publish_at ?? null)}
              onChange={e => set('publish_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="input-field" style={{ fontSize: 12 }} />
          )}
          {form.id && (
            <>
              <button onClick={() => setShowComments(true)} className="btn btn-secondary btn-sm" title="Editorial collaboration & comments">
                <Icon name="messageSquare" size={13} /> Comments
              </button>
              <button onClick={() => setShowTranslate(true)} className="btn btn-secondary btn-sm" title="AI Machine Translation (Draft-only)">
                <Icon name="sparkle" size={13} /> Translate
              </button>
              <button onClick={() => setShowRequestApproval(true)} className="btn btn-secondary btn-sm" title="Submit for editorial approval">
                <Icon name="checkCircle" size={13} /> Request Review
              </button>
              <button onClick={() => setShowAddToRelease(true)} className="btn btn-secondary btn-sm" title="Bundle into release">
                <Icon name="package" size={13} /> Add to Release
              </button>
              <button onClick={() => setShowActivity(true)} className="btn btn-secondary btn-sm" title="Who did what">
                <Icon name="activity" size={13} /> Activity
              </button>
              <button onClick={() => setShowHistory(true)} className="btn btn-secondary btn-sm" title="Version history">
                <Icon name="clock" size={13} /> History
              </button>
              {tenantSlug && (
                <button onClick={handlePreview} className="btn btn-secondary btn-sm" title="Preview post">
                  <Icon name="eye" size={13} /> Preview
                </button>
              )}
            </>
          )}
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm">Save Draft</button>
          {form.publish_at !== undefined && form.status === 'scheduled'
            ? <button onClick={() => handleSave('scheduled')} className="btn btn-primary btn-sm">Schedule</button>
            : <button onClick={() => set('status', 'scheduled')} className="btn btn-secondary btn-sm">Schedule…</button>}
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm">Publish</button>
        </div>
      </div>

      {form.id && <ActivityDialog open={showActivity} onOpenChange={setShowActivity} entityType="post" entityId={form.id} />}
      {form.id && (
        <RevisionHistory open={showHistory} onOpenChange={setShowHistory} resourceType="post" resourceId={form.id}
          current={{ slug: form.slug, title: form.title, content: form.content, status: form.status, category: form.category, tags: form.tags, publish_at: form.publish_at }}
          fieldLabels={POST_FIELD_LABELS}
          onRestored={(restored: CmsPost) => setForm(cmsPostToLocal(restored))} />
      )}
      {form.id && (
        <CMSCollaborationDrawer
          open={showComments}
          onClose={() => setShowComments(false)}
          resourceType="post"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Post'}
        />
      )}
      {form.id && (
        <CMSTranslationModal
          open={showTranslate}
          onClose={() => setShowTranslate(false)}
          resourceType="post"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Post'}
          currentLocale={form.locale || 'en'}
          translationGroupId={form.translation_group_id || undefined}
          onTranslated={() => showAlert('AI draft translation created successfully.')}
        />
      )}
      {form.id && (
        <CMSRequestApprovalModal
          open={showRequestApproval}
          onClose={() => setShowRequestApproval(false)}
          resourceType="post"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Post'}
          onRequested={() => set('status', 'in_review')}
        />
      )}
      {form.id && (
        <CMSAddToReleaseModal
          open={showAddToRelease}
          onClose={() => setShowAddToRelease(false)}
          resourceType="post"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Post'}
        />
      )}

      {/* Editor & Sidebar layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', overflow: isMobile ? 'auto' : 'hidden' }}>
        <div style={{ padding: '24px 28px', overflowY: isMobile ? 'visible' : 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Add title"
            style={{ fontSize: 26, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', padding: '6px 0', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
          <FL label="Slug (leave blank to auto-generate)"><input value={form.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="auto" className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} /></FL>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Tabs value={contentView} onValueChange={v => setContentView(v as 'edit' | 'preview')} variant="segmented">
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {contentView === 'preview' ? (
            <div className="cms-preview-body" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', minHeight: 200 }} dangerouslySetInnerHTML={{ __html: form.content || '' }} />
          ) : (
            <RichTextEditor value={form.content || ''} onChange={html => set('content', html)} placeholder="Start writing…" onInsertImage={pick} />
          )}
        </div>

        <div style={{ borderLeft: isMobile ? 'none' : '1px solid var(--border)', borderTop: isMobile ? '1px solid var(--border)' : 'none', overflowY: isMobile ? 'visible' : 'auto', background: 'var(--bg)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FL label="Status & Workflow">
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {workflowStates.length > 0 ? (
                  workflowStates.map(ws => (
                    <SelectItem key={ws.slug} value={ws.slug}>
                      {ws.name}
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </FL>

          {sites.length > 1 && (
            <FL label="Site Channel">
              <Select value={form.site_id || 'all'} onValueChange={v => set('site_id', v === 'all' ? null : v)}>
                <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue placeholder="All Sites" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites (Global)</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FL>
          )}

          <FL label="Language / Locale">
            <Select value={form.locale || 'en'} onValueChange={v => set('locale', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FL>

          <FL label="Author"><input value={form.author || ''} onChange={e => set('author', e.target.value)} className="input-field" style={{ fontSize: 12 }} /></FL>
          <FL label="Category"><input value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="e.g. Updates" className="input-field" style={{ fontSize: 12 }} /></FL>
          <FL label="Tags">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={form.tags || ''} onChange={e => set('tags', e.target.value)} placeholder="comma, separated" className="input-field" style={{ fontSize: 12, flex: 1 }} />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiTagsLoading} title="Suggest tags with AI" onClick={handleAiTags} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="sparkle" size={12} /> {aiTagsLoading ? 'Thinking…' : 'Suggest'}
              </button>
            </div>
          </FL>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>SEO &amp; sharing</div>
            <FL label="SEO description">
              <textarea value={form.seo_description || ''} onChange={e => set('seo_description', e.target.value)} placeholder="Shown in search results and social previews…" rows={2} maxLength={500}
                className="input-field" style={{ fontSize: 12, lineHeight: 1.5, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiSeoLoading} title="Generate an SEO description with AI" onClick={handleAiSeo} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="sparkle" size={12} /> {aiSeoLoading ? 'Generating…' : 'Generate with AI'}
              </button>
            </FL>
            <FL label="Canonical URL (optional)"><input value={form.canonical_url || ''} onChange={e => set('canonical_url', e.target.value)} placeholder="https://…" className="input-field" style={{ fontSize: 12 }} /></FL>
            <FL label="Social share image (optional)"><input value={form.og_image || ''} onChange={e => set('og_image', e.target.value)} placeholder="https://…" className="input-field" style={{ fontSize: 12 }} /></FL>
            <CheckboxRow title="Hide from search engines" description="Adds a noindex tag — the post stays live but won't appear in search results."
              checked={!!form.noindex} onCheckedChange={setNoindex} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page Editor ── */
function PageEditor({
  page,
  sites,
  workflowStates,
  onSave,
  onCancel,
  tenantSlug,
}: {
  page: Partial<Page> | null;
  sites: CmsSite[];
  workflowStates: CmsWorkflowState[];
  onSave: (p: Page) => void;
  onCancel: () => void;
  tenantSlug?: string;
}) {
  const [form, setForm] = useState<Partial<Page>>(page || {
    title: '', slug: '', content: '', status: 'draft', template: 'standard', seo_description: '', author: 'Admin',
    publish_at: null, canonical_url: '', noindex: false, og_image: '',
    site_id: null, locale: 'en', translation_group_id: null,
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showTranslate, setShowTranslate] = useState(false);
  const [showRequestApproval, setShowRequestApproval] = useState(false);
  const [showAddToRelease, setShowAddToRelease] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const set = (k: keyof Page, v: any) => setForm(f => ({ ...f, [k]: v }));
  const setNoindex = (v: boolean) => setForm(f => ({ ...f, noindex: v }));
  const { pick, picker } = useMediaPicker();
  const [contentView, setContentView] = useState<'edit' | 'preview'>('edit');
  const isMobile = useIsMobile();

  const handlePreview = async () => {
    if (!form.id || !tenantSlug) return;
    try {
      const { token } = await apiFetch(`/v1/cms/pages/${form.id}/preview-token`);
      window.open(`/site/${tenantSlug}/${(form.slug || '').replace(/^\//, '')}?preview=${encodeURIComponent(token)}`, '_blank', 'noopener');
    } catch (e: any) {
      showAlert(`Couldn't create a preview link: ${e.message}`);
    }
  };

  const [aiSeoLoading, setAiSeoLoading] = useState(false);
  const handleAiSeo = async () => {
    if (!form.content?.trim() || aiSeoLoading) return;
    setAiSeoLoading(true);
    try {
      const { result }: { result: string } = await apiFetch('/v1/cms/ai/summarize-seo', { method: 'POST', body: JSON.stringify({ text: form.content }) });
      set('seo_description', result);
    } catch (e: any) {
      showAlert(`Couldn't generate an SEO description: ${e.message}`);
    } finally {
      setAiSeoLoading(false);
    }
  };

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!form.id) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      setAutosaveState('saving');
      try {
        await apiFetch(`/v1/cms/pages/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: form.title, content: form.content, seo_description: form.seo_description || null,
            canonical_url: form.canonical_url || null, noindex: form.noindex, og_image: form.og_image || null,
            site_id: form.site_id || null, locale: form.locale || 'en',
          }),
        });
        setAutosaveState('saved');
      } catch {
        setAutosaveState('idle');
      }
    }, 2000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [form.id, form.title, form.content, form.seo_description, form.canonical_url, form.noindex, form.og_image, form.site_id, form.locale]);

  const handleSave = (status: Page['status']) => {
    if (!form.title?.trim()) return showAlert('Title required');
    if (status === 'scheduled' && !form.publish_at) return showAlert('Pick a date/time to schedule this for');
    const n = now();
    onSave({
      id: form.id || uid(), title: form.title!, slug: form.slug || `/${form.title!.toLowerCase().replace(/\s+/g, '-')}`,
      content: form.content || '', status, template: form.template || 'standard', seo_description: form.seo_description || '',
      publish_at: status === 'scheduled' ? form.publish_at ?? null : null,
      canonical_url: form.canonical_url || '', noindex: !!form.noindex, og_image: form.og_image || '',
      site_id: form.site_id || null, locale: form.locale || 'en', translation_group_id: form.translation_group_id || null,
      author: form.author || 'Admin', created_at: form.created_at || n, updated_at: n,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {picker}
      {/* Top action header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0, flexWrap: 'wrap', rowGap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>
            <Icon name="arrowLeft" size={14} /> Back to Pages
          </button>
          {form.id && autosaveState !== 'idle' && (
            <span style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{autosaveState === 'saving' ? 'Saving…' : 'Saved'}</span>
          )}
          {form.locale && form.locale !== 'en' && (
            <Badge variant="info">{form.locale.toUpperCase()}</Badge>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {form.status === 'scheduled' && (
            <input type="datetime-local" value={toLocalInput(form.publish_at ?? null)}
              onChange={e => set('publish_at', e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="input-field" style={{ fontSize: 12 }} />
          )}
          {form.id && (
            <>
              <button onClick={() => setShowComments(true)} className="btn btn-secondary btn-sm" title="Editorial collaboration & comments">
                <Icon name="messageSquare" size={13} /> Comments
              </button>
              <button onClick={() => setShowTranslate(true)} className="btn btn-secondary btn-sm" title="AI Machine Translation (Draft-only)">
                <Icon name="sparkle" size={13} /> Translate
              </button>
              <button onClick={() => setShowRequestApproval(true)} className="btn btn-secondary btn-sm" title="Submit for editorial approval">
                <Icon name="checkCircle" size={13} /> Request Review
              </button>
              <button onClick={() => setShowAddToRelease(true)} className="btn btn-secondary btn-sm" title="Bundle into release">
                <Icon name="package" size={13} /> Add to Release
              </button>
              <button onClick={() => setShowActivity(true)} className="btn btn-secondary btn-sm" title="Who did what">
                <Icon name="activity" size={13} /> Activity
              </button>
              <button onClick={() => setShowHistory(true)} className="btn btn-secondary btn-sm" title="Version history">
                <Icon name="clock" size={13} /> History
              </button>
              {tenantSlug && (
                <button onClick={handlePreview} className="btn btn-secondary btn-sm" title="Preview page">
                  <Icon name="eye" size={13} /> Preview
                </button>
              )}
            </>
          )}
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm">Save Draft</button>
          {form.status === 'scheduled'
            ? <button onClick={() => handleSave('scheduled')} className="btn btn-primary btn-sm">Schedule</button>
            : <button onClick={() => set('status', 'scheduled')} className="btn btn-secondary btn-sm">Schedule…</button>}
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm">Publish</button>
        </div>
      </div>

      {form.id && <ActivityDialog open={showActivity} onOpenChange={setShowActivity} entityType="page" entityId={form.id} />}
      {form.id && (
        <RevisionHistory open={showHistory} onOpenChange={setShowHistory} resourceType="page" resourceId={form.id}
          current={{ slug: (form.slug || '').replace(/^\//, ''), title: form.title, content: form.content, status: form.status, seo_description: form.seo_description, publish_at: form.publish_at }}
          fieldLabels={PAGE_FIELD_LABELS}
          onRestored={(restored: CmsPage) => setForm(cmsPageToLocal(restored))} />
      )}
      {form.id && (
        <CMSCollaborationDrawer
          open={showComments}
          onClose={() => setShowComments(false)}
          resourceType="page"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Page'}
        />
      )}
      {form.id && (
        <CMSTranslationModal
          open={showTranslate}
          onClose={() => setShowTranslate(false)}
          resourceType="page"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Page'}
          currentLocale={form.locale || 'en'}
          translationGroupId={form.translation_group_id || undefined}
          onTranslated={() => showAlert('AI draft translation created successfully.')}
        />
      )}
      {form.id && (
        <CMSRequestApprovalModal
          open={showRequestApproval}
          onClose={() => setShowRequestApproval(false)}
          resourceType="page"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Page'}
          onRequested={() => set('status', 'in_review')}
        />
      )}
      {form.id && (
        <CMSAddToReleaseModal
          open={showAddToRelease}
          onClose={() => setShowAddToRelease(false)}
          resourceType="page"
          resourceId={form.id}
          resourceTitle={form.title || 'Untitled Page'}
        />
      )}

      {/* Editor & Sidebar layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', overflow: isMobile ? 'auto' : 'hidden' }}>
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: isMobile ? 'visible' : 'auto' }}>
          <input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Page Title"
            style={{ fontSize: 24, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', padding: '6px 0', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
          <FL label="Slug"><input value={form.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="/page-slug" className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></FL>
          <FL label="Template">
            <Select value={form.template || 'standard'} onValueChange={v => set('template', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard — header &amp; nav, normal width</SelectItem>
                <SelectItem value="full-width">Full width — header &amp; nav, edge-to-edge content</SelectItem>
                <SelectItem value="landing">Landing — no header or nav, edge-to-edge canvas</SelectItem>
              </SelectContent>
            </Select>
          </FL>
          <FL label="SEO description">
            <textarea value={form.seo_description || ''} onChange={e => set('seo_description', e.target.value)} placeholder="Shown in search results and social previews for this page…" rows={2} maxLength={500}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 11px', fontSize: 13, lineHeight: 1.5, resize: 'vertical', fontFamily: 'var(--font)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)' }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiSeoLoading} title="Generate an SEO description with AI" onClick={handleAiSeo} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Icon name="sparkle" size={12} /> {aiSeoLoading ? 'Generating…' : 'Generate with AI'}
            </button>
          </FL>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <FL label="Canonical URL (optional)"><input value={form.canonical_url || ''} onChange={e => set('canonical_url', e.target.value)} placeholder="https://…" className="input-field" style={{ fontSize: 13 }} /></FL>
            <FL label="Social share image (optional)"><input value={form.og_image || ''} onChange={e => set('og_image', e.target.value)} placeholder="https://…" className="input-field" style={{ fontSize: 13 }} /></FL>
          </div>
          <CheckboxRow title="Hide from search engines" description="Adds a noindex tag — the page stays live but won't appear in search results."
            checked={!!form.noindex} onCheckedChange={setNoindex} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Tabs value={contentView} onValueChange={v => setContentView(v as 'edit' | 'preview')} variant="segmented">
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {contentView === 'preview' ? (
            <div className="cms-preview-body" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '16px 18px', minHeight: 200 }} dangerouslySetInnerHTML={{ __html: form.content || '' }} />
          ) : (
            <RichTextEditor value={form.content || ''} onChange={html => set('content', html)} placeholder="Page content…" onInsertImage={pick} />
          )}
        </div>

        <div style={{ borderLeft: isMobile ? 'none' : '1px solid var(--border)', borderTop: isMobile ? '1px solid var(--border)' : 'none', overflowY: isMobile ? 'visible' : 'auto', background: 'var(--bg)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FL label="Status & Workflow">
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {workflowStates.length > 0 ? (
                  workflowStates.map(ws => (
                    <SelectItem key={ws.slug} value={ws.slug}>
                      {ws.name}
                    </SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </FL>

          {sites.length > 1 && (
            <FL label="Site Channel">
              <Select value={form.site_id || 'all'} onValueChange={v => set('site_id', v === 'all' ? null : v)}>
                <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue placeholder="All Sites" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sites (Global)</SelectItem>
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.slug})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FL>
          )}

          <FL label="Language / Locale">
            <Select value={form.locale || 'en'} onValueChange={v => set('locale', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FL>
        </div>
      </div>
    </div>
  );
}

/* ══ Main CMS component ══ */
export const CMS: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const view = (searchParams.get('v') || 'dashboard') as string;
  const goTo = (v: string) => navigate(`/cms?v=${v}`, { replace: true });

  const [sites, setSites] = useState<CmsSite[]>([]);
  const [workflowStates, setWorkflowStates] = useState<CmsWorkflowState[]>([]);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>('all');
  const [selectedLocaleFilter, setSelectedLocaleFilter] = useState<string>('all');

  const [posts,    setPosts]    = useState<Post[]>([]);
  const [pages,    setPages]    = useState<Page[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  // §33 — bulk view-count totals for the list tables below, one query per
  // resource type rather than N+1 per row.
  const [postViews, setPostViews] = useState<Record<string, number>>({});
  const [pageViews, setPageViews] = useState<Record<string, number>>({});
  const postIds = posts.map(p => p.id).filter(Boolean).join(',');
  const pageIds = pages.map(p => p.id).filter(Boolean).join(',');
  useEffect(() => {
    if (!postIds) { setPostViews({}); return; }
    apiFetch(`/v1/cms/analytics/post?ids=${postIds}`).then((r: { totals: Record<string, number> }) => setPostViews(r.totals)).catch(() => {});
  }, [postIds]);
  useEffect(() => {
    if (!pageIds) { setPageViews({}); return; }
    apiFetch(`/v1/cms/analytics/page?ids=${pageIds}`).then((r: { totals: Record<string, number> }) => setPageViews(r.totals)).catch(() => {});
  }, [pageIds]);
  const [siteSettings, setSiteSettings] = useState<CmsSiteSettings | null>(null);
  const [editPost, setEditPost] = useState<Partial<Post> | null>(null);
  const [editPage, setEditPage] = useState<Partial<Page> | null>(null);
  const [draftTitle, setDraftTitle]   = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [pFilter, setPFilter] = useState<'all'|'published'|'draft'|'scheduled'|'in_review'|'approved'|'trash'>('all');
  const [pagesFilter, setPagesFilter] = useState<'all'|'published'|'draft'|'scheduled'|'in_review'|'approved'|'trash'>('all');
  const [pSearch, setPSearch] = useState('');
  const [pSearchDebounced, setPSearchDebounced] = useState('');
  const [pagesSearch, setPagesSearch] = useState('');
  const [pagesSearchDebounced, setPagesSearchDebounced] = useState('');
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [pagesHasMore, setPagesHasMore] = useState(false);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [selectedComments, setSelectedComments] = useState<Set<string>>(new Set());

  // Modals for list view actions
  const [activeApprovalModal, setActiveApprovalModal] = useState<{ open: boolean; type: 'post'|'page'|'entry'; id: string; title: string } | null>(null);
  const [activeReleaseModal, setActiveReleaseModal] = useState<{ open: boolean; type: 'post'|'page'|'entry'; id: string; title: string } | null>(null);
  const [activeCommentsDrawer, setActiveCommentsDrawer] = useState<{ open: boolean; type: 'post'|'page'|'entry'; id: string; title: string } | null>(null);
  const [activeTranslateModal, setActiveTranslateModal] = useState<{ open: boolean; type: 'post'|'page'|'entry'; id: string; title: string; locale: string; group?: string } | null>(null);

  useEffect(() => { const t = setTimeout(() => setPSearchDebounced(pSearch.trim()), 300); return () => clearTimeout(t); }, [pSearch]);
  useEffect(() => { const t = setTimeout(() => setPagesSearchDebounced(pagesSearch.trim()), 300); return () => clearTimeout(t); }, [pagesSearch]);

  const loadSites = useCallback(() => {
    apiFetch<CmsSite[]>('/v1/cms/sites').then(setSites).catch(() => setSites([]));
  }, []);

  const loadWorkflowStates = useCallback(() => {
    apiFetch<CmsWorkflowState[]>('/v1/cms/workflows/states').then(setWorkflowStates).catch(() => setWorkflowStates([]));
  }, []);

  const loadPages = useCallback((opts: { search?: string; offset?: number; site_id?: string; locale?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.search) q.set('search', opts.search);
    if (opts.site_id && opts.site_id !== 'all') q.set('site_id', opts.site_id);
    if (opts.locale && opts.locale !== 'all') q.set('locale', opts.locale);
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(opts.offset ?? 0));
    return apiFetch(`/v1/cms/pages?${q}`).then((res: CmsPage[]) => {
      const mapped = res.map(cmsPageToLocal);
      setPages(prev => (opts.offset ? [...prev, ...mapped] : mapped));
      setPagesHasMore(res.length === PAGE_SIZE);
    }).catch(() => {});
  }, []);

  const loadPosts = useCallback((opts: { search?: string; offset?: number; site_id?: string; locale?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.search) q.set('search', opts.search);
    if (opts.site_id && opts.site_id !== 'all') q.set('site_id', opts.site_id);
    if (opts.locale && opts.locale !== 'all') q.set('locale', opts.locale);
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(opts.offset ?? 0));
    return apiFetch(`/v1/cms/posts?${q}`).then((res: CmsPost[]) => {
      const mapped = res.map(cmsPostToLocal);
      setPosts(prev => (opts.offset ? [...prev, ...mapped] : mapped));
      setPostsHasMore(res.length === PAGE_SIZE);
    }).catch(() => {});
  }, []);

  const loadComments = useCallback((opts: { offset?: number } = {}) => {
    const q = new URLSearchParams();
    q.set('limit', String(PAGE_SIZE));
    q.set('offset', String(opts.offset ?? 0));
    return apiFetch(`/v1/cms/comments?${q}`).then((res: CmsComment[]) => {
      const mapped = res.map(cmsCommentToLocal);
      setComments(prev => (opts.offset ? [...prev, ...mapped] : mapped));
      setCommentsHasMore(res.length === PAGE_SIZE);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadSites();
    loadWorkflowStates();
    loadComments();
    apiFetch('/v1/cms/site-settings').then(setSiteSettings).catch(() => {});
  }, []);

  useEffect(() => {
    loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    setSelectedPosts(new Set());
  }, [pSearchDebounced, selectedSiteFilter, selectedLocaleFilter, loadPosts]);

  useEffect(() => {
    loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    setSelectedPages(new Set());
  }, [pagesSearchDebounced, selectedSiteFilter, selectedLocaleFilter, loadPages]);

  /* Post ops */
  const savePost = async (p: Post) => {
    const isExisting = posts.some(x => x.id === p.id);
    const payload = {
      slug: p.slug || undefined, title: p.title, content: p.content, status: p.status,
      category: p.category, tags: p.tags, publish_at: p.publish_at,
      seo_description: p.seo_description || null, canonical_url: p.canonical_url || null,
      noindex: p.noindex, og_image: p.og_image || null,
      site_id: p.site_id || null, locale: p.locale || 'en',
    };
    try {
      const saved: CmsPost = isExisting
        ? await apiFetch(`/v1/cms/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch('/v1/cms/posts', { method: 'POST', body: JSON.stringify(payload) });
      const mapped = cmsPostToLocal(saved);
      setPosts(ps => ps.find(x => x.id === mapped.id) ? ps.map(x => x.id === mapped.id ? mapped : x) : [mapped, ...ps]);
    } catch (e: any) {
      showAlert(`Failed to save post: ${e.message}`);
      return;
    }
    setEditPost(null); goTo('posts');
  };

  const setPostStatus = async (id: string, status: Post['status']) => {
    try {
      const saved: CmsPost = await apiFetch(`/v1/cms/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const mapped = cmsPostToLocal(saved);
      setPosts(ps => ps.map(p => p.id === id ? mapped : p));
    } catch (e: any) {
      showAlert(`Failed to update post: ${e.message}`);
    }
  };
  const trashPost   = async (id: string) => { if ((await showConfirm('Move to trash?', { variant: 'warning', confirmLabel: 'Move to Trash' }))) setPostStatus(id, 'trash'); };
  const restorePost = (id: string) => setPostStatus(id, 'draft');
  const togglePub    = (id: string) => {
    const p = posts.find(x => x.id === id);
    if (p) setPostStatus(id, p.status === 'published' ? 'draft' : 'published');
  };
  const deletePostForever = async (id: string) => {
    if (!(await showConfirm('Permanently delete this post? This cannot be undone.', { confirmLabel: 'Delete permanently' }))) return;
    try {
      await apiFetch(`/v1/cms/posts/${id}`, { method: 'DELETE' });
      setPosts(ps => ps.filter(p => p.id !== id));
    } catch (e: any) {
      showAlert(`Failed to delete post: ${e.message}`);
    }
  };

  function toggleSelectPost(id: string, evt: React.MouseEvent) { evt.stopPropagation(); setSelectedPosts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function bulkPosts(status: Post['status']) {
    const ids = Array.from(selectedPosts);
    try {
      await apiFetch('/v1/cms/posts/bulk', { method: 'POST', body: JSON.stringify({ ids, status }) });
      setSelectedPosts(new Set());
      loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    } catch (e: any) { showAlert(`Bulk update failed: ${e.message}`); }
  }
  async function bulkDeletePostsForever() {
    const ids = Array.from(selectedPosts);
    if (!(await showConfirm(`Permanently delete ${ids.length} post(s)? This cannot be undone.`, { confirmLabel: 'Delete permanently' }))) return;
    try {
      await apiFetch('/v1/cms/posts/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      setSelectedPosts(new Set());
      loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    } catch (e: any) { showAlert(`Bulk delete failed: ${e.message}`); }
  }

  // §56-57 — real CSV export for Posts/Pages, reusing the same
  // cookie-authenticated blob-download helper contacts.routes.ts's own
  // export button already uses (apiDownload).
  async function handleExportPosts() {
    try { await apiDownload('/v1/cms/posts/export', `posts-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e: any) { showAlert(`Export failed: ${e.message}`); }
  }
  async function handleExportPages() {
    try { await apiDownload('/v1/cms/pages/export', `pages-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e: any) { showAlert(`Export failed: ${e.message}`); }
  }

  // §56-57 — a real WordPress WXR importer, scoped to posts (wp:post_type
  // === 'post'), matching the brief's own recommended starting point.
  const wpImportInputRef = useRef<HTMLInputElement>(null);
  const [importingWp, setImportingWp] = useState(false);
  async function handleWordPressFile(file: File) {
    setImportingWp(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result: { imported: number; skipped: number; errors: string[] } = await apiFetch('/v1/cms/import/wordpress', { method: 'POST', body: form });
      loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
      const errorNote = result.errors.length ? `\n\nFirst issues:\n${result.errors.slice(0, 5).join('\n')}` : '';
      showAlert(`Imported ${result.imported} post(s), skipped ${result.skipped}.${errorNote}`);
    } catch (e: any) {
      showAlert(`Import failed: ${e.message}`);
    } finally {
      setImportingWp(false);
    }
  }

  /* Quick draft */
  const saveDraft = async () => {
    if (!draftTitle.trim()) return showAlert('Title required');
    try {
      const saved: CmsPost = await apiFetch('/v1/cms/posts', {
        method: 'POST',
        body: JSON.stringify({
          title: draftTitle, content: draftContent, status: 'draft', category: 'General',
          site_id: selectedSiteFilter !== 'all' ? selectedSiteFilter : null,
          locale: selectedLocaleFilter !== 'all' ? selectedLocaleFilter : 'en',
        }),
      });
      setPosts(ps => [cmsPostToLocal(saved), ...ps]);
      setDraftTitle(''); setDraftContent('');
    } catch (e: any) {
      showAlert(`Failed to save draft: ${e.message}`);
    }
  };

  /* Page ops */
  const savePage = async (pg: Page) => {
    const isExisting = pages.some(x => x.id === pg.id);
    const payload = {
      slug: pg.slug.replace(/^\//, ''), title: pg.title, content: pg.content, status: pg.status,
      template: pg.template, seo_description: pg.seo_description || null, publish_at: pg.publish_at,
      canonical_url: pg.canonical_url || null, noindex: pg.noindex, og_image: pg.og_image || null,
      site_id: pg.site_id || null, locale: pg.locale || 'en',
    };
    try {
      const saved: CmsPage = isExisting
        ? await apiFetch(`/v1/cms/pages/${pg.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch('/v1/cms/pages', { method: 'POST', body: JSON.stringify(payload) });
      const mapped = cmsPageToLocal(saved);
      setPages(ps => ps.find(x => x.id === mapped.id) ? ps.map(x => x.id === mapped.id ? mapped : x) : [mapped, ...ps]);
    } catch (e: any) {
      showAlert(`Failed to save page: ${e.message}`);
      return;
    }
    setEditPage(null); goTo('pages');
  };
  const setPageStatus = async (id: string, status: Page['status']) => {
    try {
      const saved: CmsPage = await apiFetch(`/v1/cms/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const mapped = cmsPageToLocal(saved);
      setPages(ps => ps.map(p => p.id === id ? mapped : p));
    } catch (e: any) {
      showAlert(`Failed to update page: ${e.message}`);
    }
  };
  const trashPage   = async (id: string) => { if ((await showConfirm('Move to trash? It stays recoverable for 30 days.', { variant: 'warning', confirmLabel: 'Move to Trash' }))) setPageStatus(id, 'trash'); };
  const restorePage = (id: string) => setPageStatus(id, 'draft');
  const deletePageForever = async (id: string) => {
    if (!(await showConfirm('Permanently delete this page? This cannot be undone.', { confirmLabel: 'Delete permanently' }))) return;
    try {
      await apiFetch(`/v1/cms/pages/${id}`, { method: 'DELETE' });
      setPages(ps => ps.filter(p => p.id !== id));
    } catch (e: any) {
      showAlert(`Failed to delete page: ${e.message}`);
    }
  };
  function toggleSelectPage(id: string, evt: React.MouseEvent) { evt.stopPropagation(); setSelectedPages(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function bulkPages(status: Page['status']) {
    const ids = Array.from(selectedPages);
    try {
      await apiFetch('/v1/cms/pages/bulk', { method: 'POST', body: JSON.stringify({ ids, status }) });
      setSelectedPages(new Set());
      loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    } catch (e: any) { showAlert(`Bulk update failed: ${e.message}`); }
  }
  async function bulkDeletePagesForever() {
    const ids = Array.from(selectedPages);
    if (!(await showConfirm(`Permanently delete ${ids.length} page(s)? This cannot be undone.`, { confirmLabel: 'Delete permanently' }))) return;
    try {
      await apiFetch('/v1/cms/pages/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      setSelectedPages(new Set());
      loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
    } catch (e: any) { showAlert(`Bulk delete failed: ${e.message}`); }
  }

  /* Comment ops */
  const setCommentStatus = async (id: string, status: Comment['status']) => {
    try {
      await apiFetch(`/v1/cms/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setComments(cs => cs.map(c => c.id === id ? { ...c, status } : c));
    } catch (e: any) {
      showAlert(`Failed to update comment: ${e.message}`);
    }
  };
  const approveCmt = (id: string) => setCommentStatus(id, 'approved');
  const spamCmt    = (id: string) => setCommentStatus(id, 'spam');
  const deleteCmt  = async (id: string) => {
    if (!(await showConfirm('Delete?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/comments/${id}`, { method: 'DELETE' });
      setComments(cs => cs.filter(c => c.id !== id));
    } catch (e: any) {
      showAlert(`Failed to delete comment: ${e.message}`);
    }
  };
  function toggleSelectComment(id: string, evt: React.MouseEvent) { evt.stopPropagation(); setSelectedComments(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function bulkComments(status: Comment['status']) {
    const ids = Array.from(selectedComments);
    try {
      await apiFetch('/v1/cms/comments/bulk', { method: 'POST', body: JSON.stringify({ ids, status }) });
      setSelectedComments(new Set());
      loadComments();
    } catch (e: any) { showAlert(`Bulk update failed: ${e.message}`); }
  }
  async function bulkDeleteComments() {
    const ids = Array.from(selectedComments);
    if (!(await showConfirm(`Delete ${ids.length} comment(s)?`, { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch('/v1/cms/comments/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
      setSelectedComments(new Set());
      loadComments();
    } catch (e: any) { showAlert(`Bulk delete failed: ${e.message}`); }
  }

  /* Site settings */
  const saveSiteSettings = async (patch: Partial<CmsSiteSettings>) => {
    try {
      const saved = await apiFetch('/v1/cms/site-settings', { method: 'PUT', body: JSON.stringify(patch) });
      setSiteSettings(saved);
      return true;
    } catch (e: any) {
      showAlert(`Failed to save: ${e.message}`);
      return false;
    }
  };

  const pubCount  = posts.filter(p => p.status === 'published').length;
  const pending   = comments.filter(c => c.status === 'pending').length;

  const recentActivity = useMemo(() => {
    type Item = { key: string; icon: 'edit' | 'file' | 'message'; text: string; time: string };
    const items: Item[] = [
      ...posts.map(p => ({ key: `post-${p.id}`, icon: 'edit' as const, text: `Post "${p.title}" ${p.status === 'published' ? 'was published' : p.status === 'scheduled' ? 'was scheduled' : p.status === 'trash' ? 'was moved to trash' : 'was saved as a draft'}`, time: p.updated_at })),
      ...pages.map(p => ({ key: `page-${p.id}`, icon: 'file' as const, text: `Page "${p.title}" ${p.status === 'published' ? 'was published' : p.status === 'scheduled' ? 'was scheduled' : 'was saved as a draft'}`, time: p.updated_at })),
      ...comments.map(c => ({ key: `cmt-${c.id}`, icon: 'message' as const, text: `Comment from ${c.author} is ${c.status}`, time: c.created_at })),
    ];
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
  }, [posts, pages, comments]);

  const recentPages = useMemo(() => [...pages].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 7), [pages]);

  /* Post editor full-screen overlay */
  if (view === 'post-editor') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)' }}>
        <PostEditor
          post={editPost}
          sites={sites}
          workflowStates={workflowStates}
          onSave={savePost}
          onCancel={() => { setEditPost(null); goTo('posts'); }}
          tenantSlug={siteSettings?.tenantSlug}
        />
      </div>
    );
  }
  if (view === 'page-editor') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)' }}>
        <PageEditor
          page={editPage}
          sites={sites}
          workflowStates={workflowStates}
          onSave={savePage}
          onCancel={() => { setEditPage(null); goTo('pages'); }}
          tenantSlug={siteSettings?.tenantSlug}
        />
      </div>
    );
  }

  const PAGE_TITLES: Record<string, string> = { dashboard: 'CMS Dashboard', posts: 'Posts', pages: 'Pages', comments: 'Comments', customize: 'Customize' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Dashboard']}
        titlePlain="Content"
        titleEm="dashboard"
        subtitle="What is published, drafted, under review, and scheduled."
      />

      {/* Top page header */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', rowGap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font)' }}>{PAGE_TITLES[view] || 'CMS'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{pubCount} published · {pages.length} pages · {pending > 0 ? `${pending} pending comments` : 'no pending comments'}</div>
          </div>

          {/* Enterprise Site & Locale Filter Pills in Header */}
          {(view === 'posts' || view === 'pages') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              {sites.length > 1 && (
                <Select value={selectedSiteFilter} onValueChange={setSelectedSiteFilter}>
                  <SelectTrigger className="input-field" style={{ fontSize: 12, height: 32, minWidth: 130 }}>
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
                  <SelectValue placeholder="All Languages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">🌍 All Locales</SelectItem>
                  {SUPPORTED_LOCALES.map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.flag} {l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {view === 'posts' && (
            <>
              <input ref={wpImportInputRef} type="file" accept=".xml,text/xml,application/xml" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleWordPressFile(f); e.target.value = ''; }} />
              <button onClick={() => wpImportInputRef.current?.click()} disabled={importingWp} className="btn btn-secondary btn-sm" title="Import posts from a WordPress export (.xml)">
                <Icon name="upload" size={13} /> {importingWp ? 'Importing…' : 'Import from WordPress'}
              </button>
              <button onClick={handleExportPosts} className="btn btn-secondary btn-sm" title="Export all posts as CSV">
                <Icon name="download" size={13} /> Export CSV
              </button>
              <button onClick={() => { setEditPost(null); goTo('post-editor'); }} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={13} /> Add New Post
              </button>
            </>
          )}
          {view === 'pages' && (
            <>
              <button onClick={handleExportPages} className="btn btn-secondary btn-sm" title="Export all pages as CSV">
                <Icon name="download" size={13} /> Export CSV
              </button>
              <button onClick={() => { setEditPage({}); goTo('page-editor'); }} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={13} /> Add New Page
              </button>
            </>
          )}
        </div>
      </div>

      {/* Shared Modals for quick actions */}
      {activeApprovalModal && (
        <CMSRequestApprovalModal
          open={activeApprovalModal.open}
          onClose={() => setActiveApprovalModal(null)}
          resourceType={activeApprovalModal.type}
          resourceId={activeApprovalModal.id}
          resourceTitle={activeApprovalModal.title}
          onRequested={() => {
            loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
            loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
          }}
        />
      )}
      {activeReleaseModal && (
        <CMSAddToReleaseModal
          open={activeReleaseModal.open}
          onClose={() => setActiveReleaseModal(null)}
          resourceType={activeReleaseModal.type}
          resourceId={activeReleaseModal.id}
          resourceTitle={activeReleaseModal.title}
        />
      )}
      {activeCommentsDrawer && (
        <CMSCollaborationDrawer
          open={activeCommentsDrawer.open}
          onClose={() => setActiveCommentsDrawer(null)}
          resourceType={activeCommentsDrawer.type}
          resourceId={activeCommentsDrawer.id}
          resourceTitle={activeCommentsDrawer.title}
        />
      )}
      {activeTranslateModal && (
        <CMSTranslationModal
          open={activeTranslateModal.open}
          onClose={() => setActiveTranslateModal(null)}
          resourceType={activeTranslateModal.type}
          resourceId={activeTranslateModal.id}
          resourceTitle={activeTranslateModal.title}
          currentLocale={activeTranslateModal.locale}
          translationGroupId={activeTranslateModal.group}
          onTranslated={() => {
            showAlert('AI draft translation created.');
            loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
            loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter });
          }}
        />
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ══ DASHBOARD ══ */}
        {view === 'dashboard' && (
          <div>
            <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '22px 28px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', marginBottom: 20, fontFamily: 'var(--font)' }}>Welcome to CMS Dashboard!</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Get Started</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14, lineHeight: 1.5 }}>You can customise your site from here.</div>
                  <button onClick={() => goTo('customize')} className="btn btn-primary btn-sm">Customize Site</button>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Next Steps</div>
                  {[
                    { icon: 'edit' as const, label: 'Write a blog post', fn: () => { setEditPost(null); goTo('post-editor'); } },
                    { icon: 'file' as const, label: 'Add an about page', fn: () => { setEditPage({ title: 'About Us', slug: '/about', content: '', status: 'draft', seo_description: '', author: 'Admin' }); goTo('page-editor'); } },
                    {
                      icon: 'eye' as const, label: 'View your site',
                      fn: () => { if (siteSettings?.tenantSlug) window.open(`/site/${siteSettings.tenantSlug}`, '_blank', 'noopener'); },
                    },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontWeight: 500, padding: 'var(--ds-btn-py-sm) 0', fontFamily: 'var(--font)', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name={item.icon} size={13} /> {item.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>At a Glance</div>
                  {[
                    { icon: 'edit' as const,    label: 'Posts',    count: posts.filter(p => p.status !== 'trash').length, fn: () => goTo('posts') },
                    { icon: 'file' as const,    label: 'Pages',    count: pages.length, fn: () => goTo('pages') },
                    { icon: 'message' as const, label: 'Comments', count: comments.length, fn: () => goTo('comments') },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 500, padding: 'var(--ds-btn-py-sm) 0', fontFamily: 'var(--font)', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name={item.icon} size={13} style={{ color: 'var(--teal)' } as React.CSSProperties} />
                      <span style={{ color: 'var(--teal)', fontWeight: 700, minWidth: 22 }}>{item.count}</span>
                      {item.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Editorial Tools</div>
                  {[
                    { icon: 'globe' as const,       label: 'Multisite Management', fn: () => navigate('/cms/sites') },
                    { icon: 'checkCircle' as const, label: 'Review Queue & Approvals', fn: () => navigate('/cms/approvals') },
                    { icon: 'package' as const,     label: 'Content Releases & Bundles', fn: () => navigate('/cms/releases') },
                    { icon: 'gitBranch' as const,   label: 'Workflow Lifecycle States', fn: () => navigate('/cms/workflow') },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, padding: 'var(--ds-btn-py-sm) 0', fontFamily: 'var(--font)', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name={item.icon} size={13} /> {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3-card grid */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 300px', gap: 18, padding: 20 }}>

              {/* Quick Draft */}
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="edit" size={14} /> Quick Draft
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FL label="Title"><input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Title" className="input-field" style={{ fontSize: 13 }} /></FL>
                  <FL label="Content">
                    <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)} placeholder="What's on your mind?!" rows={6}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '9px 11px', fontSize: 13, lineHeight: 1.6, resize: 'none', fontFamily: 'var(--font)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)' }} />
                  </FL>
                  <button onClick={saveDraft} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>Save Draft</button>
                </div>
                {posts.filter(p => p.status === 'draft').length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Drafts</div>
                    {posts.filter(p => p.status === 'draft').slice(0, 3).map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => { setEditPost(p); goTo('post-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{p.title}</button>
                        <span style={{ fontSize: 10.5, color: 'var(--ink3)', flexShrink: 0 }}>{fmtDate(p.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Pages */}
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                  <Icon name="file" size={14} /> Recent Pages
                </div>
                {recentPages.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No pages yet — create one from the Pages tab.</div>}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {recentPages.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--bg)' }}>
                        <td style={{ padding: '7px 0', fontSize: 12.5, color: 'var(--ink)', fontWeight: 500 }}>{p.title}</td>
                        <td style={{ padding: '7px 0' }}><StatusBadge status={p.status} /></td>
                        <td style={{ padding: '7px 0', fontSize: 11.5, textAlign: 'right', color: 'var(--ink3)' }}>{fmtDate(p.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Activities */}
              <div className="card" style={{ padding: '20px 22px', overflowY: 'auto' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="clock" size={14} /> Recent Activity</div>
                {recentActivity.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Nothing yet — activity shows up here as you create posts and pages.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {recentActivity.map((act, i) => (
                    <div key={act.key} style={{ display: 'flex', gap: 11, paddingBottom: 14, borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border)' : 'none', marginBottom: i < recentActivity.length - 1 ? 14 : 0 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--teal-l)', color: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={act.icon} size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{act.text}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{ago(act.time)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ POSTS ══ */}
        {view === 'posts' && (
          <div style={{ padding: '18px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', rowGap: 10 }}>
              <Tabs value={pFilter} onValueChange={v => setPFilter(v as typeof pFilter)} variant="segmented">
                <TabsList>
                  {(['all', 'published', 'in_review', 'scheduled', 'draft', 'trash'] as const).map(f => {
                    const cnt = f === 'all' ? posts.filter(p => p.status !== 'trash').length : posts.filter(p => p.status === f).length;
                    return (
                      <TabsTrigger key={f} value={f}>
                        {f === 'in_review' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)} ({cnt})
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Search…" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '7px 12px 7px 30px', fontSize: 13, outline: 'none', fontFamily: 'var(--font)', width: 200, background: 'var(--white)' }} />
              </div>
            </div>

            <BulkBar count={selectedPosts.size} onClear={() => setSelectedPosts(new Set())} actions={[
              { label: 'Publish', onClick: () => bulkPosts('published') },
              { label: 'Draft', onClick: () => bulkPosts('draft') },
              { label: 'Trash', onClick: () => bulkPosts('trash') },
              ...(pFilter === 'trash' ? [{ label: 'Delete permanently', onClick: bulkDeletePostsForever, danger: true }] : []),
            ]} />

            <div className="card" style={{ padding: 0 }}>
              <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['', 'Title', 'Author', 'Category', 'Locale', 'Status', 'Views', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Actions' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posts
                    .filter(p => pFilter === 'all' ? p.status !== 'trash' : p.status === pFilter)
                    .map((post, i, arr) => (
                    <tr key={post.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 16px', width: 34 }}><SelectBox checked={selectedPosts.has(post.id)} onToggle={e => toggleSelectPost(post.id, e)} /></td>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)', maxWidth: 260 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {post.status !== 'trash' && <button onClick={() => { setEditPost(post); goTo('post-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 600 }}>Edit</button>}
                          {post.status === 'published' && siteSettings?.tenantSlug && (
                            <a href={`/site/${siteSettings.tenantSlug}/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>View</a>
                          )}
                          {post.status !== 'trash' && <button onClick={() => togglePub(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)', padding: 0 }}>{post.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
                          {post.status === 'trash'
                            ? <>
                                <button onClick={() => restorePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font)', padding: 0 }}>Restore</button>
                                <button onClick={() => deletePostForever(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Delete permanently</button>
                              </>
                            : <button onClick={() => trashPost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Trash</button>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{post.author}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{post.category || '—'}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>
                        <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                          {post.locale?.toUpperCase() || 'EN'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <StatusBadge status={post.status} />
                        {post.status === 'scheduled' && post.publish_at && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 3 }}>{fmtDate(post.publish_at)}</div>}
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{(postViews[post.id] ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(post.updated_at)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        {post.status !== 'trash' && (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => setActiveCommentsDrawer({ open: true, type: 'post', id: post.id, title: post.title })}
                              className="btn btn-secondary btn-sm"
                              title="Comments"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="messageSquare" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveTranslateModal({ open: true, type: 'post', id: post.id, title: post.title, locale: post.locale || 'en', group: post.translation_group_id || undefined })}
                              className="btn btn-secondary btn-sm"
                              title="Translate with AI"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="sparkle" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveApprovalModal({ open: true, type: 'post', id: post.id, title: post.title })}
                              className="btn btn-secondary btn-sm"
                              title="Request Approval"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="checkCircle" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveReleaseModal({ open: true, type: 'post', id: post.id, title: post.title })}
                              className="btn btn-secondary btn-sm"
                              title="Add to Release"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="package" size={12} />
                            </button>
                            <button onClick={() => { setEditPost(post); goTo('post-editor'); }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="edit" size={11} /> Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {posts.filter(p => pFilter === 'all' ? p.status !== 'trash' : p.status === pFilter).length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No posts found.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
              {postsHasMore && (
                <div style={{ padding: 14, textAlign: 'center' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPosts({ search: pSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter, offset: posts.length })}>Load more</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ PAGES ══ */}
        {view === 'pages' && (
          <div style={{ padding: '18px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', rowGap: 10 }}>
              <Tabs value={pagesFilter} onValueChange={v => setPagesFilter(v as typeof pagesFilter)} variant="segmented">
                <TabsList>
                  {(['all', 'published', 'in_review', 'scheduled', 'draft', 'trash'] as const).map(f => {
                    const cnt = f === 'all' ? pages.filter(p => p.status !== 'trash').length : pages.filter(p => p.status === f).length;
                    return (
                      <TabsTrigger key={f} value={f}>
                        {f === 'in_review' ? 'In Review' : f.charAt(0).toUpperCase() + f.slice(1)} ({cnt})
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input value={pagesSearch} onChange={e => setPagesSearch(e.target.value)} placeholder="Search…" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '7px 12px 7px 30px', fontSize: 13, outline: 'none', fontFamily: 'var(--font)', width: 200, background: 'var(--white)' }} />
              </div>
            </div>
            <BulkBar count={selectedPages.size} onClear={() => setSelectedPages(new Set())} actions={[
              { label: 'Publish', onClick: () => bulkPages('published') },
              { label: 'Draft', onClick: () => bulkPages('draft') },
              { label: 'Trash', onClick: () => bulkPages('trash') },
              ...(pagesFilter === 'trash' ? [{ label: 'Delete permanently', onClick: bulkDeletePagesForever, danger: true }] : []),
            ]} />
            <div className="card" style={{ padding: 0 }}>
              <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['', 'Title', 'Slug', 'Locale', 'Author', 'Status', 'Views', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Actions' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages
                    .filter(pg => pagesFilter === 'all' ? pg.status !== 'trash' : pg.status === pagesFilter)
                    .map((pg, i, arr) => (
                    <tr key={pg.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 16px', width: 34 }}><SelectBox checked={selectedPages.has(pg.id)} onToggle={e => toggleSelectPage(pg.id, e)} /></td>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                        {pg.title}
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {pg.status !== 'trash' && <button onClick={() => { setEditPage(pg); goTo('page-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 600 }}>Edit</button>}
                          {pg.status === 'published' && siteSettings?.tenantSlug && (
                            <a href={`/site/${siteSettings.tenantSlug}/${pg.slug.replace(/^\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>View</a>
                          )}
                          {pg.status === 'trash'
                            ? <>
                                <button onClick={() => restorePage(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font)', padding: 0 }}>Restore</button>
                                <button onClick={() => deletePageForever(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Delete permanently</button>
                              </>
                            : <button onClick={() => trashPage(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Trash</button>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px', fontFamily: 'var(--mono)', color: 'var(--ink3)', fontSize: 12 }}>{pg.slug}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>
                        <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>
                          {pg.locale?.toUpperCase() || 'EN'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{pg.author}</td>
                      <td style={{ padding: '11px 16px' }}>
                        <StatusBadge status={pg.status} />
                        {pg.status === 'scheduled' && pg.publish_at && <div style={{ fontSize: 10.5, color: 'var(--ink3)', marginTop: 3 }}>{fmtDate(pg.publish_at)}</div>}
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{(pageViews[pg.id] ?? 0).toLocaleString()}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(pg.created_at)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        {pg.status !== 'trash' && (
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => setActiveCommentsDrawer({ open: true, type: 'page', id: pg.id, title: pg.title })}
                              className="btn btn-secondary btn-sm"
                              title="Comments"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="messageSquare" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveTranslateModal({ open: true, type: 'page', id: pg.id, title: pg.title, locale: pg.locale || 'en', group: pg.translation_group_id || undefined })}
                              className="btn btn-secondary btn-sm"
                              title="Translate with AI"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="sparkle" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveApprovalModal({ open: true, type: 'page', id: pg.id, title: pg.title })}
                              className="btn btn-secondary btn-sm"
                              title="Request Approval"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="checkCircle" size={12} />
                            </button>
                            <button
                              onClick={() => setActiveReleaseModal({ open: true, type: 'page', id: pg.id, title: pg.title })}
                              className="btn btn-secondary btn-sm"
                              title="Add to Release"
                              style={{ padding: '4px 7px' }}
                            >
                              <Icon name="package" size={12} />
                            </button>
                            <button onClick={() => { setEditPage(pg); goTo('page-editor'); }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="edit" size={11} /> Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {pages.filter(pg => pagesFilter === 'all' ? pg.status !== 'trash' : pg.status === pagesFilter).length === 0 && (
                    <tr><td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No pages found.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
              {pagesHasMore && (
                <div style={{ padding: 14, textAlign: 'center' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadPages({ search: pagesSearchDebounced, site_id: selectedSiteFilter, locale: selectedLocaleFilter, offset: pages.length })}>Load more</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ COMMENTS ══ */}
        {view === 'comments' && (
          <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <BulkBar count={selectedComments.size} onClear={() => setSelectedComments(new Set())} actions={[
              { label: 'Approve', onClick: () => bulkComments('approved') },
              { label: 'Mark spam', onClick: () => bulkComments('spam') },
              { label: 'Delete', onClick: bulkDeleteComments, danger: true },
            ]} />
            {comments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
                No comments yet — visitor comments will appear here.
              </div>
            )}
            {comments.map(c => (
              <div key={c.id} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 14, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: c.status === 'pending' ? 'var(--gold)' : c.status === 'spam' ? 'var(--red)' : 'var(--teal)' }}>
                <SelectBox checked={selectedComments.has(c.id)} onToggle={e => toggleSelectComment(c.id, e)} />
                <Av initials={c.author.split(' ').map(w => w[0]).join('').slice(0, 2)} color={c.status === 'approved' ? 'var(--teal)' : c.status === 'spam' ? 'var(--red)' : 'var(--gold)'} size={40} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)' }}>{c.author}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{c.email}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 10 }}>{c.content}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {c.status !== 'approved' && <button onClick={() => approveCmt(c.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 12, color: 'var(--green)' }}>Approve</button>}
                    {c.status !== 'spam'     && <button onClick={() => spamCmt(c.id)}    className="btn btn-secondary btn-sm" style={{ fontSize: 12, color: 'var(--gold)' }}>Mark Spam</button>}
                    <button onClick={() => deleteCmt(c.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 12, color: 'var(--red)' }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
            {commentsHasMore && (
              <div style={{ textAlign: 'center' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadComments({ offset: comments.length })}>Load more</button>
              </div>
            )}
          </div>
        )}

        {/* ══ CUSTOMIZE ══ */}
        {view === 'customize' && (
          <CustomizeView settings={siteSettings} onSave={saveSiteSettings} />
        )}

      </div>
    </div>
  );
};

/* ── Customize: Site Identity + Appearance ── */
function CustomizeView({ settings, onSave }: { settings: CmsSiteSettings | null; onSave: (patch: Partial<CmsSiteSettings>) => Promise<boolean> }) {
  const [form, setForm] = useState<CmsSiteSettings | null>(settings);
  const [saving, setSaving] = useState<'identity' | 'appearance' | null>(null);
  const [savedFlash, setSavedFlash] = useState<'identity' | 'appearance' | null>(null);
  const { pick, picker } = useMediaPicker();

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (!form) return <SectionLoading />;
  const set = (k: keyof CmsSiteSettings, v: string) => setForm(f => f ? { ...f, [k]: v } : f);
  // §10 — typed separately from the generic string setter above, since
  // headingFont/bodyFont/radius are real bounded unions, not plain strings.
  const setToken = (k: 'headingFont' | 'bodyFont', v: CmsFontId) => setForm(f => f ? { ...f, [k]: v } : f);
  const setRadius = (v: CmsRadiusPreset) => setForm(f => f ? { ...f, radius: v } : f);

  async function handleSave(section: 'identity' | 'appearance', patch: Partial<CmsSiteSettings>) {
    setSaving(section);
    const ok = await onSave(patch);
    setSaving(null);
    if (ok) { setSavedFlash(section); setTimeout(() => setSavedFlash(null), 2000); }
  }

  async function pickInto(field: 'logoUrl' | 'faviconUrl') {
    const url = await pick();
    if (url) set(field, url);
  }

  return (
    <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
      {picker}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="star" size={17} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Site Identity</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Shown on your public site at /site/{form.tenantSlug || '…'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Site Title"><input value={form.siteTitle} onChange={e => set('siteTitle', e.target.value)} className="input-field" placeholder="Your company name" /></FL>
          <FL label="Tagline"><input value={form.tagline} onChange={e => set('tagline', e.target.value)} className="input-field" placeholder="A short description" /></FL>
          <FL label="Logo">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} className="input-field" placeholder="https://…" style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickInto('logoUrl')}>Choose from library</button>
            </div>
          </FL>
          <FL label="Favicon">
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.faviconUrl} onChange={e => set('faviconUrl', e.target.value)} className="input-field" placeholder="https://…" style={{ flex: 1 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => pickInto('faviconUrl')}>Choose from library</button>
            </div>
          </FL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSave('identity', { siteTitle: form.siteTitle, tagline: form.tagline, logoUrl: form.logoUrl, faviconUrl: form.faviconUrl })}
              disabled={saving === 'identity'}
              className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
            >
              {saving === 'identity' ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'identity' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="edit" size={17} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Appearance</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Accent colour, fonts and corner style for your public site</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Accent Colour">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.accentColor} onChange={e => set('accentColor', e.target.value)} style={{ width: 44, height: 34, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: 2, cursor: 'pointer' }} />
              <input value={form.accentColor} onChange={e => set('accentColor', e.target.value)} className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 12, maxWidth: 120 }} />
            </div>
          </FL>
          {/* §10 — design tokens: a bounded, real font/radius picker, not a
              free-text font URL or raw CSS value a tenant could type in. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FL label="Heading Font">
              <Select value={form.headingFont} onValueChange={(v: string) => setToken('headingFont', v as CmsFontId)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CMS_FONT_IDS.map(id => <SelectItem key={id} value={id}>{CMS_FONT_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FL>
            <FL label="Body Font">
              <Select value={form.bodyFont} onValueChange={(v: string) => setToken('bodyFont', v as CmsFontId)}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CMS_FONT_IDS.map(id => <SelectItem key={id} value={id}>{CMS_FONT_LABELS[id]}</SelectItem>)}
                </SelectContent>
              </Select>
            </FL>
          </div>
          <FL label="Corner Style">
            <Select value={form.radius} onValueChange={(v: string) => setRadius(v as CmsRadiusPreset)}>
              <SelectTrigger className="input-field" style={{ maxWidth: 180 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {CMS_RADIUS_PRESETS.map(id => <SelectItem key={id} value={id}>{CMS_RADIUS_LABELS[id]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSave('appearance', { accentColor: form.accentColor, headingFont: form.headingFont, bodyFont: form.bodyFont, radius: form.radius })}
              disabled={saving === 'appearance'}
              className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
            >
              {saving === 'appearance' ? 'Saving…' : 'Save'}
            </button>
            {savedFlash === 'appearance' && <span style={{ fontSize: 12, color: 'var(--green)' }}>Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
