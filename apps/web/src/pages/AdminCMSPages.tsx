import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import type { CmsPage } from '@hudumika/types';

function PageHdr({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
        <p style={{ fontSize: 13, color: 'var(--ink3)', margin: '4px 0 0' }}>{sub}</p>
      </div>
      {action}
    </div>
  );
}

const PUBLIC_ROUTES = new Set(['privacy', 'terms']); // slugs Hudumika's own routed pages actually read

export function AdminCMSPages() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    apiFetch('/v1/cms/platform-admin/pages')
      .then(res => { setPages(res); setError(null); })
      .catch((e: any) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  async function handleSave(page: CmsPage) {
    try {
      setSaving(true);
      const updated = await apiFetch(`/v1/cms/platform-admin/pages/${page.slug}`, {
        method: 'PUT',
        body: JSON.stringify({ title: page.title, content: page.content, status: page.status, seo_description: page.seo_description }),
      });
      setPages(ps => ps.map(p => p.slug === updated.slug ? updated : p));
      setEditing(null);
    } catch (e: any) {
      alert(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!slug || !newTitle.trim()) return;
    try {
      setSaving(true);
      const created = await apiFetch(`/v1/cms/platform-admin/pages/${slug}`, {
        method: 'PUT',
        body: JSON.stringify({ title: newTitle.trim(), content: '<p></p>', status: 'draft' }),
      });
      setPages(ps => [...ps, created].sort((a, b) => a.slug.localeCompare(b.slug)));
      setCreating(false);
      setNewSlug('');
      setNewTitle('');
      setEditing(created);
    } catch (e: any) {
      alert(`Failed to create: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHdr
        title="CMS Pages"
        sub="Hudumika's own public pages — Privacy, Terms, and any others you add"
        action={
          <button onClick={() => setCreating(true)} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
            <Icon name="plus" size={13} />New Page
          </button>
        }
      />

      {error && <div className="card" style={{ padding: 16, marginBottom: 16, color: 'var(--red)' }}>Failed to load pages: {error}</div>}
      {loading && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {pages.map(page => (
          <div key={page.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{page.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'monospace' }}>/{page.slug}</div>
              </div>
              <span className={`badge ${page.status === 'published' ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: 10.5 }}>
                {page.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
            {PUBLIC_ROUTES.has(page.slug) && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 12 }}>
                Live at <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>/{page.slug}</a>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginBottom: 14 }}>
              Updated {new Date(page.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <button onClick={() => setEditing(page)} className="btn btn-secondary btn-sm" style={{ gap: 5 }}>
              <Icon name="edit" size={12} />Edit
            </button>
          </div>
        ))}
      </div>

      {/* New page modal */}
      {creating && (
        <div className="modal-overlay" onClick={() => setCreating(false)}>
          <div className="card" style={{ width: 420, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>New Platform Page</span>
              <button onClick={() => setCreating(false)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" placeholder="e.g. About Us" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Slug</label>
              <input value={newSlug} onChange={e => setNewSlug(e.target.value)} className="input-field" placeholder="about-us" />
              <p style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 6 }}>
                Only /privacy and /terms are wired to an actual routed page today — other slugs are stored and editable, but need a route added to render them publicly.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreating(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !newSlug.trim() || !newTitle.trim()} className="btn btn-primary btn-sm">
                {saving ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="card" style={{ width: 680, maxWidth: '95vw', padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Edit — {editing.title}</span>
              <button onClick={() => setEditing(null)} className="dp-close"><Icon name="close" size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Title</label>
                <input
                  value={editing.title}
                  onChange={e => setEditing(p => p ? { ...p, title: e.target.value } : p)}
                  className="input-field"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Status</label>
                <select
                  value={editing.status}
                  onChange={e => setEditing(p => p ? { ...p, status: e.target.value as CmsPage['status'] } : p)}
                  className="input-field"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>SEO Description</label>
              <input
                value={editing.seo_description ?? ''}
                onChange={e => setEditing(p => p ? { ...p, seo_description: e.target.value } : p)}
                className="input-field"
                placeholder="Shown in search results and link previews"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Content</label>
              <RichTextEditor
                value={editing.content}
                onChange={html => setEditing(p => p ? { ...p, content: html } : p)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditing(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={() => editing && handleSave(editing)} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
