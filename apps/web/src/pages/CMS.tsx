import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { RichTextEditor } from '../components/RichTextEditor.js';
import { useAuth } from '../hooks/useAuth.js';
import type { CmsPage, CmsPost, CmsComment, CmsSiteSettings } from '@hudumika/types';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { PageHeader } from '../components/PageHeader.js';

/* ── Types ── */
interface Post {
  id: string; title: string; content: string;
  status: 'published' | 'draft' | 'trash';
  author: string; category: string; tags: string;
  created_at: string; updated_at: string;
}
interface Page {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft'; author: string; created_at: string; updated_at: string;
}
interface Comment {
  id: string; author: string; email: string; content: string;
  status: 'approved' | 'pending' | 'spam'; created_at: string;
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function now() { return new Date().toISOString(); }
function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

/* ── API ↔ local shape mappers ── */
// Posts, Pages, and Comments are all real and tenant-scoped (see
// cms.service.ts / cms.routes.ts) — loaded from the API, not localStorage.
function cmsPageToLocal(cp: CmsPage): Page {
  return { id: cp.id, title: cp.title, slug: cp.slug, content: cp.content, status: cp.status, author: 'You', created_at: cp.created_at, updated_at: cp.updated_at };
}
function cmsPostToLocal(cp: CmsPost): Post {
  return { id: cp.id, title: cp.title, content: cp.content, status: cp.status, author: 'You', category: cp.category || '', tags: cp.tags || '', created_at: cp.created_at, updated_at: cp.updated_at };
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
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    published: { bg: 'var(--green-l, rgba(5,150,105,0.1))', color: 'var(--green, #059669)' },
    draft:     { bg: 'rgba(245,158,11,0.1)', color: 'var(--gold)' },
    trash:     { bg: 'rgba(239,68,68,0.1)', color: 'var(--red)' },
    approved:  { bg: 'var(--green-l, rgba(5,150,105,0.1))', color: 'var(--green, #059669)' },
    pending:   { bg: 'rgba(245,158,11,0.1)', color: 'var(--gold)' },
    spam:      { bg: 'rgba(239,68,68,0.1)', color: 'var(--red)' },
  };
  const s = map[status] || { bg: 'var(--bg)', color: 'var(--ink3)' };
  return (
    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {status}
    </span>
  );
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

/* ── Post Editor ── */
function PostEditor({ post, onSave, onCancel }: { post: Partial<Post> | null; onSave: (p: Post) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<Post>>(post || { title: '', content: '', status: 'draft', author: 'Admin', category: '', tags: '' });
  const set = (k: keyof Post, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = (status: Post['status']) => {
    if (!form.title?.trim()) return showAlert('Title is required');
    const n = now();
    onSave({ id: form.id || uid(), title: form.title!, content: form.content || '', status, author: form.author || 'Admin', category: form.category || 'General', tags: form.tags || '', created_at: form.created_at || n, updated_at: n });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>
          <Icon name="arrowLeft" size={14} /> Back to Posts
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm">Save Draft</button>
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm">Publish</button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 260px', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Add title"
            style={{ fontSize: 26, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', padding: '6px 0', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
          <RichTextEditor value={form.content || ''} onChange={html => set('content', html)} placeholder="Start writing…" />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FL label="Status">
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="input-field" style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </FL>
          <FL label="Author"><input value={form.author || ''} onChange={e => set('author', e.target.value)} className="input-field" style={{ fontSize: 12 }} /></FL>
          <FL label="Category"><input value={form.category || ''} onChange={e => set('category', e.target.value)} placeholder="e.g. Updates" className="input-field" style={{ fontSize: 12 }} /></FL>
          <FL label="Tags"><input value={form.tags || ''} onChange={e => set('tags', e.target.value)} placeholder="comma, separated" className="input-field" style={{ fontSize: 12 }} /></FL>
        </div>
      </div>
    </div>
  );
}

/* ── Page Editor ── */
function PageEditor({ page, onSave, onCancel }: { page: Partial<Page> | null; onSave: (p: Page) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<Page>>(page || { title: '', slug: '', content: '', status: 'draft', author: 'Admin' });
  const set = (k: keyof Page, v: string) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = (status: Page['status']) => {
    if (!form.title?.trim()) return showAlert('Title required');
    const n = now();
    onSave({ id: form.id || uid(), title: form.title!, slug: form.slug || `/${form.title!.toLowerCase().replace(/\s+/g, '-')}`, content: form.content || '', status, author: form.author || 'Admin', created_at: form.created_at || n, updated_at: n });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }}>
          <Icon name="arrowLeft" size={14} /> Back to Pages
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm">Save Draft</button>
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm">Publish</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="Page Title"
          style={{ fontSize: 24, fontWeight: 700, border: 'none', borderBottom: '2px solid var(--border)', padding: '6px 0', outline: 'none', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--ink)', width: '100%' }} />
        <FL label="Slug"><input value={form.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="/page-slug" className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 13 }} /></FL>
        <RichTextEditor value={form.content || ''} onChange={html => set('content', html)} placeholder="Page content…" />
      </div>
    </div>
  );
}

/* ══ Main CMS component ══ */
export const CMS: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const view = (searchParams.get('v') || 'dashboard') as string;
  const goTo = (v: string) => navigate(`/cms?v=${v}`, { replace: true });

  const [posts,    setPosts]    = useState<Post[]>([]);
  const [pages,    setPages]    = useState<Page[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [siteSettings, setSiteSettings] = useState<CmsSiteSettings | null>(null);
  const [editPost, setEditPost] = useState<Partial<Post> | null>(null);
  const [editPage, setEditPage] = useState<Partial<Page> | null>(null);
  const [draftTitle, setDraftTitle]   = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [pFilter, setPFilter] = useState<'all'|'published'|'draft'|'trash'>('all');
  const [pSearch, setPSearch] = useState('');

  useEffect(() => {
    apiFetch('/v1/cms/pages').then((res: CmsPage[]) => setPages(res.map(cmsPageToLocal))).catch(() => {});
    apiFetch('/v1/cms/posts').then((res: CmsPost[]) => setPosts(res.map(cmsPostToLocal))).catch(() => {});
    apiFetch('/v1/cms/comments').then((res: CmsComment[]) => setComments(res.map(cmsCommentToLocal))).catch(() => {});
    apiFetch('/v1/cms/site-settings').then(setSiteSettings).catch(() => {});
  }, []);

  /* Post ops — real, DB-backed via /v1/cms/posts */
  const savePost = async (p: Post) => {
    const isExisting = posts.some(x => x.id === p.id);
    const payload = { title: p.title, content: p.content, status: p.status, category: p.category, tags: p.tags };
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

  /* Quick draft — real, creates an actual draft post */
  const saveDraft = async () => {
    if (!draftTitle.trim()) return showAlert('Title required');
    try {
      const saved: CmsPost = await apiFetch('/v1/cms/posts', {
        method: 'POST',
        body: JSON.stringify({ title: draftTitle, content: draftContent, status: 'draft', category: 'General' }),
      });
      setPosts(ps => [cmsPostToLocal(saved), ...ps]);
      setDraftTitle(''); setDraftContent('');
    } catch (e: any) {
      showAlert(`Failed to save draft: ${e.message}`);
    }
  };

  /* Page ops — real, DB-backed via /v1/cms/pages */
  const savePage = async (pg: Page) => {
    const isExisting = pages.some(x => x.id === pg.id);
    const payload = { slug: pg.slug.replace(/^\//, ''), title: pg.title, content: pg.content, status: pg.status };
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
  const deletePage = async (id: string) => {
    if (!(await showConfirm('Delete page?', { confirmLabel: 'Delete' }))) return;
    try {
      await apiFetch(`/v1/cms/pages/${id}`, { method: 'DELETE' });
      setPages(ps => ps.filter(p => p.id !== id));
    } catch (e: any) {
      showAlert(`Failed to delete page: ${e.message}`);
    }
  };

  /* Comment ops — real, DB-backed via /v1/cms/comments */
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

  /* Site settings — real, DB-backed via /v1/cms/site-settings */
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

  /* Stats */
  const pubCount  = posts.filter(p => p.status === 'published').length;
  const pending   = comments.filter(c => c.status === 'pending').length;

  /* Derived, real activity feed — no fabricated names, just what actually happened */
  const recentActivity = useMemo(() => {
    type Item = { key: string; icon: 'edit' | 'file' | 'message'; text: string; time: string };
    const items: Item[] = [
      ...posts.map(p => ({ key: `post-${p.id}`, icon: 'edit' as const, text: `Post "${p.title}" ${p.status === 'published' ? 'was published' : p.status === 'trash' ? 'was moved to trash' : 'was saved as a draft'}`, time: p.updated_at })),
      ...pages.map(p => ({ key: `page-${p.id}`, icon: 'file' as const, text: `Page "${p.title}" ${p.status === 'published' ? 'was published' : 'was saved as a draft'}`, time: p.updated_at })),
      ...comments.map(c => ({ key: `cmt-${c.id}`, icon: 'message' as const, text: `Comment from ${c.author} is ${c.status}`, time: c.created_at })),
    ];
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);
  }, [posts, pages, comments]);

  const recentPages = useMemo(() => [...pages].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 7), [pages]);

  /* ── Post editor full-screen overlay ── */
  if (view === 'post-editor') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)' }}>
        <PostEditor post={editPost} onSave={savePost} onCancel={() => { setEditPost(null); goTo('posts'); }} />
      </div>
    );
  }
  if (view === 'page-editor') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--white)' }}>
        <PageEditor page={editPage} onSave={savePage} onCancel={() => { setEditPage(null); goTo('pages'); }} />
      </div>
    );
  }

  /* ── Page header ── */
  const PAGE_TITLES: Record<string, string> = { dashboard: 'CMS Dashboard', posts: 'Posts', pages: 'Pages', comments: 'Comments', customize: 'Customize' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={['CMS', 'Dashboard']}
        titlePlain="Content"
        titleEm="dashboard"
        subtitle="What is published, drafted and scheduled."
      />

      {/* ── Top page header ── */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--font)' }}>{PAGE_TITLES[view] || 'CMS'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{pubCount} published · {pages.length} pages · {pending > 0 ? `${pending} comment${pending > 1 ? 's' : ''} pending` : 'no pending comments'}</div>
        </div>
        {view === 'posts' && (
          <button onClick={() => { setEditPost(null); goTo('post-editor'); }} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} /> Add New Post
          </button>
        )}
        {view === 'pages' && (
          <button onClick={() => { setEditPage({}); goTo('page-editor'); }} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={13} /> Add New Page
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ══ DASHBOARD ══ */}
        {view === 'dashboard' && (
          <div>
            {/* Welcome banner */}
            <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '22px 28px' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', marginBottom: 20, fontFamily: 'var(--font)' }}>Welcome to CMS Dashboard!</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>Get Started</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 14, lineHeight: 1.5 }}>You can customise your site from here.</div>
                  <button onClick={() => goTo('customize')} className="btn btn-primary btn-sm">Customize Site</button>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>Next Steps</div>
                  {[
                    { icon: 'edit' as const, label: 'Write a blog post', fn: () => { setEditPost(null); goTo('post-editor'); } },
                    { icon: 'file' as const, label: 'Add an about page', fn: () => { setEditPage({ title: 'About Us', slug: '/about', content: '', status: 'draft', author: 'Admin' }); goTo('page-editor'); } },
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>More Actions</div>
                  {[
                    { icon: 'grid' as const,    label: 'Site Identity & Appearance', fn: () => goTo('customize') },
                    { icon: 'message' as const, label: 'Moderate comments',          fn: () => goTo('comments') },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, padding: 'var(--ds-btn-py-sm) 0', fontFamily: 'var(--font)', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name={item.icon} size={13} /> {item.label}
                    </button>
                  ))}
                  {user?.role === 'SUPER_ADMIN' && (
                    <button onClick={() => navigate('/admin/cms-pages')} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, padding: 'var(--ds-btn-py-sm) 0', fontFamily: 'var(--font)', width: '100%', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      <Icon name="shield" size={13} /> Manage Hudumika's own pages (Privacy, Terms, ...)
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 3-card grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 18, padding: 20 }}>

              {/* Quick Draft */}
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon name="edit" size={14} /> Quick Draft
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <FL label="Title"><input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Title" className="input-field" style={{ fontSize: 13 }} /></FL>
                  <FL label="Content">
                    <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)} placeholder="What's on your mind?!" rows={6}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 11px', fontSize: 13, lineHeight: 1.6, resize: 'none', fontFamily: 'var(--font)', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box', background: 'var(--white)' }} />
                  </FL>
                  <button onClick={saveDraft} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>Save Draft</button>
                </div>
                {posts.filter(p => p.status === 'draft').length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent Drafts</div>
                    {posts.filter(p => p.status === 'draft').slice(0, 3).map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <button onClick={() => { setEditPost(p); goTo('post-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 500 }}>{p.title}</button>
                        <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{fmtDate(p.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Pages — real data, no fabricated traffic numbers */}
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

              {/* Recent Activities — derived from real posts/pages/comments */}
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
            {/* Filter tabs + search */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'published', 'draft', 'trash'] as const).map(f => {
                  const cnt = f === 'all' ? posts.filter(p => p.status !== 'trash').length : posts.filter(p => p.status === f).length;
                  return (
                    <button key={f} onClick={() => setPFilter(f)} style={{ padding: 'var(--ds-btn-py-sm) 13px', border: 'none', borderRadius: 'var(--r-sm)', background: pFilter === f ? 'var(--teal)' : 'var(--bg)', color: pFilter === f ? '#fff' : 'var(--ink3)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.1s', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}>
                      {f.charAt(0).toUpperCase() + f.slice(1)} ({cnt})
                    </button>
                  );
                })}
              </div>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="Search…" style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '7px 12px 7px 30px', fontSize: 13, outline: 'none', fontFamily: 'var(--font)', width: 200, background: 'var(--white)' }} />
              </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['Title', 'Author', 'Category', 'Status', 'Date', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {posts
                    .filter(p => pFilter === 'all' ? p.status !== 'trash' : p.status === pFilter)
                    .filter(p => !pSearch || p.title.toLowerCase().includes(pSearch.toLowerCase()))
                    .map((post, i, arr) => (
                    <tr key={post.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)', maxWidth: 300 }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.title}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          {post.status !== 'trash' && <button onClick={() => { setEditPost(post); goTo('post-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 600 }}>Edit</button>}
                          {post.status !== 'trash' && <button onClick={() => togglePub(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ink3)', fontFamily: 'var(--font)', padding: 0 }}>{post.status === 'published' ? 'Unpublish' : 'Publish'}</button>}
                          {post.status === 'trash'
                            ? <button onClick={() => restorePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--green)', fontFamily: 'var(--font)', padding: 0 }}>Restore</button>
                            : <button onClick={() => trashPost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Trash</button>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{post.author}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{post.category || '—'}</td>
                      <td style={{ padding: '11px 16px' }}><StatusBadge status={post.status} /></td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(post.updated_at)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        {post.status !== 'trash' && (
                          <button onClick={() => { setEditPost(post); goTo('post-editor'); }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="edit" size={11} /> Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {posts.filter(p => pFilter === 'all' ? p.status !== 'trash' : p.status === pFilter).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No posts found.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ PAGES ══ */}
        {view === 'pages' && (
          <div style={{ padding: '18px 24px' }}>
            <div className="card" style={{ padding: 0 }}>
              <div className="rtbl-wrap">
              <table className="rtbl" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                    {['Title', 'Slug', 'Author', 'Status', 'Date', ''].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pages.map((pg, i) => (
                    <tr key={pg.id} style={{ borderBottom: i < pages.length - 1 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--ink)' }}>
                        {pg.title}
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <button onClick={() => { setEditPage(pg); goTo('page-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 600 }}>Edit</button>
                          <button onClick={() => deletePage(pg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Delete</button>
                        </div>
                      </td>
                      <td style={{ padding: '11px 16px', fontFamily: 'var(--mono)', color: 'var(--ink3)', fontSize: 12 }}>{pg.slug}</td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)' }}>{pg.author}</td>
                      <td style={{ padding: '11px 16px' }}><StatusBadge status={pg.status} /></td>
                      <td style={{ padding: '11px 16px', color: 'var(--ink3)', fontSize: 12 }}>{fmtDate(pg.created_at)}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        <button onClick={() => { setEditPage(pg); goTo('page-editor'); }} className="btn btn-secondary btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="edit" size={11} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pages.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--ink3)' }}>No pages yet.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ COMMENTS ══ */}
        {view === 'comments' && (
          <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.length === 0 && (
              <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)' }}>
                No comments yet — there's no visitor-facing comment form on your site yet, so this fills up once one exists.
              </div>
            )}
            {comments.map(c => (
              <div key={c.id} className="card" style={{ padding: '16px 20px', display: 'flex', gap: 14, borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: c.status === 'pending' ? 'var(--gold)' : c.status === 'spam' ? 'var(--red)' : 'var(--teal)' }}>
                <Av initials={c.author.split(' ').map(w => w[0]).join('').slice(0, 2)} color={c.status === 'approved' ? '#0d7a6b' : c.status === 'spam' ? '#dc2626' : '#d97706'} size={40} />
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

/* ── Customize: Site Identity + Appearance (real, PUT /v1/cms/site-settings) ── */
function CustomizeView({ settings, onSave }: { settings: CmsSiteSettings | null; onSave: (patch: Partial<CmsSiteSettings>) => Promise<boolean> }) {
  const [form, setForm] = useState<CmsSiteSettings | null>(settings);
  const [saving, setSaving] = useState<'identity' | 'appearance' | null>(null);
  const [savedFlash, setSavedFlash] = useState<'identity' | 'appearance' | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings]);

  if (!form) return <div style={{ padding: '18px 24px', color: 'var(--ink3)', fontSize: 13 }}>Loading…</div>;
  const set = (k: keyof CmsSiteSettings, v: string) => setForm(f => f ? { ...f, [k]: v } : f);

  async function handleSave(section: 'identity' | 'appearance', patch: Partial<CmsSiteSettings>) {
    setSaving(section);
    const ok = await onSave(patch);
    setSaving(null);
    if (ok) { setSavedFlash(section); setTimeout(() => setSavedFlash(null), 2000); }
  }

  return (
    <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
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
          <FL label="Logo URL"><input value={form.logoUrl} onChange={e => set('logoUrl', e.target.value)} className="input-field" placeholder="https://…" /></FL>
          <FL label="Favicon URL"><input value={form.faviconUrl} onChange={e => set('faviconUrl', e.target.value)} className="input-field" placeholder="https://…" /></FL>
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
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="edit" size={17} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>Appearance</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Accent colour for your public site</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FL label="Accent Colour">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={form.accentColor} onChange={e => set('accentColor', e.target.value)} style={{ width: 44, height: 34, border: '1px solid var(--border)', borderRadius: 6, padding: 2, cursor: 'pointer' }} />
              <input value={form.accentColor} onChange={e => set('accentColor', e.target.value)} className="input-field" style={{ fontFamily: 'var(--mono)', fontSize: 12, maxWidth: 120 }} />
            </div>
          </FL>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => handleSave('appearance', { accentColor: form.accentColor })}
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
