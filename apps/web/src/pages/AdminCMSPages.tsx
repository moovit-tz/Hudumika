import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { Banner } from '../components/ui/alert.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import type { CmsPage } from '@hudumika/types';
import { showAlert } from '../lib/alert.js';
import { PageHeader } from '../components/PageHeader.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionCard } from '../components/SectionCard.js';

function PageHdr({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="sa-page-hdr" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 20, marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
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
      showAlert(`Failed to save: ${e.message}`);
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
        method: 'POST',
        body: JSON.stringify({ title: newTitle, content: '', status: 'draft' }),
      });
      setPages(ps => [created, ...ps]);
      setCreating(false);
      setNewSlug('');
      setNewTitle('');
      setEditing(created);
    } catch (e: any) {
      showAlert(`Failed to create: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(slug: string) {
    if (!window.confirm(`Delete page "${slug}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/v1/cms/platform-admin/pages/${slug}`, { method: 'DELETE' });
      setPages(ps => ps.filter(p => p.slug !== slug));
      if (editing?.slug === slug) setEditing(null);
    } catch (e: any) {
      showAlert(`Failed to delete: ${e.message}`);
    }
  }

  return (
    <div>
      <PageHeader
        crumbs={['Admin', 'CMS Pages']}
        titlePlain="Content"
        titleEm="pages"
        subtitle="Public pages, their slugs and publish state."
      />
      <PageHdr
        title="CMS Pages"
        sub="Manage legal terms, privacy policies, and public content pages across the platform."
        action={
          <button type="button" className="btn btn-primary btn-sm sa-btn-gap-md" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} /> Add Page
          </button>
        }
      />

      {error && <Banner variant="error" className="mb-4">{error}</Banner>}

      {creating && (
        <div style={{ marginBottom: 20 }}>
        <SectionCard title="Create New Page">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Page title (e.g. Terms of Service)"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="input-field"
              style={{ flex: 1, minWidth: 200 }}
            />
            <input
              type="text"
              placeholder="URL slug (e.g. terms)"
              value={newSlug}
              onChange={e => setNewSlug(e.target.value)}
              className="input-field"
              style={{ width: 180 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={handleCreate}>
              {saving ? 'Creating…' : 'Create & Edit'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </SectionCard>
        </div>
      )}

      {editing ? (
        <SectionCard
          collapsible={false}
          title={`Editing: ${editing.title}`}
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Select value={editing.status} onValueChange={v => setEditing({ ...editing, status: v as any })}>
                <SelectTrigger style={{ width: 120, minHeight: 'var(--ctl-h-sm)' }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => handleSave(editing)}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Close</button>
            </div>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--ink2)' }}>Page Title</label>
            <input
              type="text"
              value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })}
              className="input-field"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--ink2)' }}>SEO Meta Description</label>
            <input
              type="text"
              value={editing.seo_description ?? ''}
              onChange={e => setEditing({ ...editing, seo_description: e.target.value })}
              placeholder="Short summary for search engines…"
              className="input-field"
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--ink2)' }}>Page Content</label>
            <RichTextEditor value={editing.content} onChange={html => setEditing({ ...editing, content: html })} placeholder="Write page content here…" />
          </div>
        </SectionCard>
      ) : (
        <SectionCard padded={false}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink2)' }}>Title</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink2)' }}>Slug</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink2)' }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink2)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>Loading pages…</td></tr>
              ) : pages.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)' }}>No CMS pages found.</td></tr>
              ) : (
                pages.map(page => (
                  <tr key={page.slug} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{page.title}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink3)' }}>
                      /{page.slug} {PUBLIC_ROUTES.has(page.slug) && <span style={{ color: 'var(--teal)', fontWeight: 700 }}>(public)</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: page.status === 'published' ? 'var(--green-l)' : 'var(--bg)',
                        color: page.status === 'published' ? 'var(--green)' : 'var(--ink3)',
                      }}>
                        {page.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-secondary btn-xs" onClick={() => setEditing(page)}>Edit</button>
                        {!PUBLIC_ROUTES.has(page.slug) && (
                          <button type="button" className="btn btn-secondary btn-xs" style={{ color: 'var(--red)' }} onClick={() => handleDelete(page.slug)}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}
