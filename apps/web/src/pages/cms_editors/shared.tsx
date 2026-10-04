import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { showConfirm } from '../../lib/confirm.js';
import type { CmsPage, CmsPost, CmsComment, CmsMedia } from '@hudumika/types';

/* ── Types ── */
export interface Post {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft' | 'scheduled' | 'trash' | 'in_review' | 'approved' | 'archived';
  author: string; category: string; tags: string; publish_at: string | null;
  seo_description: string; canonical_url: string; noindex: boolean; og_image: string;
  site_id?: string | null; locale?: string; translation_group_id?: string | null;
  created_at: string; updated_at: string;
}
export interface Page {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft' | 'scheduled' | 'trash' | 'in_review' | 'approved' | 'archived';
  seo_description: string; publish_at: string | null;
  canonical_url: string; noindex: boolean; og_image: string;
  template: 'standard' | 'full-width' | 'landing';
  site_id?: string | null; locale?: string; translation_group_id?: string | null;
  author: string; created_at: string; updated_at: string;
}
export interface Comment {
  id: string; author: string; email: string; content: string;
  status: 'approved' | 'pending' | 'spam'; created_at: string;
}

export const PAGE_SIZE = 50;

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function now() { return new Date().toISOString(); }
export function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
export function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
/** For a <input type="datetime-local"> value — local time, no timezone suffix. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SUPPORTED_LOCALES = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'sw', name: 'Swahili (Kiswahili)', flag: '🇹🇿' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ar', name: 'Arabic', flag: '🇦🇪' },
];

/* ── API ↔ local shape mappers ── */
export function cmsPageToLocal(cp: CmsPage): Page {
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
export function cmsPostToLocal(cp: CmsPost): Post {
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
export function cmsCommentToLocal(cc: CmsComment): Comment {
  return { id: cc.id, author: cc.author, email: cc.email || '', content: cc.content, status: cc.status, created_at: cc.created_at };
}

/* ── Avatar ── */
export function Av({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
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
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'gray'}>{status.replace('_', ' ')}</Badge>;
}

/* ── Field label ── */
export function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

/* ── Selection checkbox (bulk-select) ── */
export function SelectBox({ checked, onToggle }: { checked: boolean; onToggle: (evt: React.MouseEvent) => void }) {
  return (
    <div onClick={onToggle} role="checkbox" aria-checked={checked} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(e as any); } }}
      style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'hsl(var(--primary))' : 'var(--border)'}`, background: checked ? 'hsl(var(--primary))' : 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {checked && <Icon name="check" size={10} color="hsl(var(--primary-foreground))" />}
    </div>
  );
}

/* ── Bulk action bar ── */
export function BulkBar({ count, onClear, actions }: { count: number; onClear: () => void; actions: { label: string; onClick: () => void; danger?: boolean }[] }) {
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
export function MediaPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (url: string) => void }) {
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

export function useMediaPicker() {
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

export const POST_FIELD_LABELS = { slug: 'Slug', title: 'Title', content: 'Content', status: 'Status', category: 'Category', tags: 'Tags', publish_at: 'Scheduled for' };
export const PAGE_FIELD_LABELS = { slug: 'Slug', title: 'Title', content: 'Content', status: 'Status', seo_description: 'SEO description', publish_at: 'Scheduled for' };
