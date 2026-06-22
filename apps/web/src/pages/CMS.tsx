import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';

/* ── Types ── */
interface Post {
  id: string; title: string; content: string;
  status: 'published' | 'draft' | 'trash';
  author: string; category: string; tags: string;
  created_at: string; updated_at: string;
}
interface Page {
  id: string; title: string; slug: string; content: string;
  status: 'published' | 'draft'; author: string; created_at: string;
}
interface Comment {
  id: string; author: string; email: string; content: string;
  status: 'approved' | 'pending' | 'spam'; created_at: string;
}
interface Activity { id: string; user: string; initials: string; color: string; action: string; time: string; }

/* ── Storage helpers ── */
const LS = { posts: 'clearos_cms_posts', pages: 'clearos_cms_pages', comments: 'clearos_cms_comments', activity: 'clearos_cms_activity' };
function loadLS<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function saveLS(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

/* ── Seed data ── */
const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - 86400000 * n).toISOString();
const SEED_POSTS: Post[] = [
  { id: uid(), title: 'Company Updates Q2 2026', content: 'This quarter we expanded our customs clearance network across East Africa…', status: 'published', author: 'Admin', category: 'Updates', tags: 'company,news', created_at: daysAgo(3), updated_at: daysAgo(3) },
  { id: uid(), title: 'New Feature: TANCIS Integration', content: 'We are pleased to announce full TANCIS/TANESW integration for all declarations…', status: 'published', author: 'Editor', category: 'Features', tags: 'tancis,customs', created_at: daysAgo(7), updated_at: daysAgo(6) },
  { id: uid(), title: 'Maintenance Notice – June 2026', content: 'Scheduled maintenance window from 02:00 to 04:00 EAT…', status: 'published', author: 'Admin', category: 'Notices', tags: 'maintenance', created_at: daysAgo(10), updated_at: daysAgo(10) },
  { id: uid(), title: 'Draft: Port Procedures Guide', content: 'Step-by-step guide for clearing cargo at Dar es Salaam port…', status: 'draft', author: 'Editor', category: 'Guides', tags: 'port', created_at: daysAgo(1), updated_at: daysAgo(1) },
  { id: uid(), title: 'Agent Network Expansion', content: 'Moovit ClearOS now has clearing agents at all 6 major TZ ports…', status: 'published', author: 'Admin', category: 'Updates', tags: 'network', created_at: daysAgo(14), updated_at: daysAgo(14) },
];
const SEED_PAGES: Page[] = [
  { id: uid(), title: 'Home', slug: '/', content: 'Welcome to Moovit ClearOS.', status: 'published', author: 'Admin', created_at: daysAgo(30) },
  { id: uid(), title: 'About Us', slug: '/about', content: 'Moovit ClearOS is built by logistics professionals.', status: 'published', author: 'Admin', created_at: daysAgo(25) },
  { id: uid(), title: 'Services', slug: '/services', content: 'End-to-end customs clearance and freight forwarding.', status: 'published', author: 'Admin', created_at: daysAgo(20) },
  { id: uid(), title: 'Contact', slug: '/contact', content: 'Reach us at info@moovit.co.tz', status: 'published', author: 'Admin', created_at: daysAgo(15) },
];
const SEED_COMMENTS: Comment[] = [
  { id: uid(), author: 'Keith Jensen', email: 'k.jensen@email.com', content: 'Great article, very helpful for understanding the TANCIS process!', status: 'approved', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: uid(), author: 'Harry Simpson', email: 'h.simpson@email.com', content: 'When will the Tanga port integration be available?', status: 'pending', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: uid(), author: 'Stephanie Moore', email: 's.moore@email.com', content: 'This is exactly what we needed for our import operations.', status: 'approved', created_at: new Date(Date.now() - 10800000).toISOString() },
];
const SEED_ACTIVITY: Activity[] = [
  { id: uid(), user: 'Keith Jensen',   initials: 'KJ', color: '#9333ea', action: 'posted a comment.', time: new Date(Date.now() - 7200000).toISOString() },
  { id: uid(), user: 'Harry Simpson',  initials: 'HS', color: '#f59e0b', action: 'posted a comment.', time: new Date(Date.now() - 7200000).toISOString() },
  { id: uid(), user: 'Stephanie Moore',initials: 'SM', color: 'var(--teal)', action: 'edited a post.',    time: new Date(Date.now() - 10800000).toISOString() },
  { id: uid(), user: 'Timothy Moreno', initials: 'TM', color: '#ec4899', action: 'added a new post.', time: new Date(Date.now() - 10800000).toISOString() },
];
const PAGE_VIEWS = [
  { page: '/', views: 2879 }, { page: '/subscription/index.html', views: 2094 },
  { page: '/general/index.html', views: 1634 }, { page: '/crypto/index.html', views: 1497 },
  { page: '/invest/index.html', views: 1349 }, { page: '/subscription/profile.html', views: 984 },
  { page: '/general/index-crypto.html', views: 879 },
];

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
    if (!form.title?.trim()) return alert('Title is required');
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
          <textarea value={form.content || ''} onChange={e => set('content', e.target.value)} placeholder="Start writing…" rows={22}
            style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 14, fontSize: 14, lineHeight: 1.75, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' }} />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg)', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FL label="Status">
            <select value={form.status} onChange={e => set('status', e.target.value)} className="input-field" style={{ fontSize: 12 }}>
              <option value="draft">Draft</option><option value="published">Published</option>
            </select>
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
    if (!form.title?.trim()) return alert('Title required');
    const n = now();
    onSave({ id: form.id || uid(), title: form.title!, slug: form.slug || `/${form.title!.toLowerCase().replace(/\s+/g, '-')}`, content: form.content || '', status, author: form.author || 'Admin', created_at: form.created_at || n });
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
        <textarea value={form.content || ''} onChange={e => set('content', e.target.value)} placeholder="Page content…" rows={16}
          style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 14, fontSize: 14, lineHeight: 1.75, outline: 'none', resize: 'vertical', fontFamily: 'var(--font)', color: 'var(--ink)', background: 'var(--white)' }} />
      </div>
    </div>
  );
}

/* ══ Main CMS component ══ */
export const CMS: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = (searchParams.get('v') || 'dashboard') as string;
  const goTo = (v: string) => navigate(`/cms?v=${v}`, { replace: true });

  const [posts,    setPosts]    = useState<Post[]>(() => loadLS(LS.posts, SEED_POSTS));
  const [pages,    setPages]    = useState<Page[]>(() => loadLS(LS.pages, SEED_PAGES));
  const [comments, setComments] = useState<Comment[]>(() => loadLS(LS.comments, SEED_COMMENTS));
  const [activity, setActivity] = useState<Activity[]>(() => loadLS(LS.activity, SEED_ACTIVITY));
  const [editPost, setEditPost] = useState<Partial<Post> | null>(null);
  const [editPage, setEditPage] = useState<Partial<Page> | null>(null);
  const [draftTitle, setDraftTitle]   = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [pFilter, setPFilter] = useState<'all'|'published'|'draft'|'trash'>('all');
  const [pSearch, setPSearch] = useState('');
  const [period, setPeriod] = useState('30 Days');

  useEffect(() => saveLS(LS.posts, posts), [posts]);
  useEffect(() => saveLS(LS.pages, pages), [pages]);
  useEffect(() => saveLS(LS.comments, comments), [comments]);
  useEffect(() => saveLS(LS.activity, activity), [activity]);

  const pushActivity = useCallback((action: string, user = 'Admin') => {
    const colors = ['#0d7a6b','#0550ae','#9333ea','#ec4899','#f59e0b'];
    const initials = user.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    setActivity(a => [{ id: uid(), user, initials, color: colors[user.charCodeAt(0) % colors.length], action, time: now() }, ...a].slice(0, 20));
  }, []);

  /* Post ops */
  const savePost = (p: Post) => {
    setPosts(ps => ps.find(x => x.id === p.id) ? ps.map(x => x.id === p.id ? p : x) : [p, ...ps]);
    pushActivity(p.status === 'published' ? 'published a post.' : 'saved a draft.');
    setEditPost(null); goTo('posts');
  };
  const trashPost   = (id: string) => { if (!confirm('Move to trash?')) return; setPosts(ps => ps.map(p => p.id === id ? { ...p, status: 'trash' } : p)); };
  const restorePost = (id: string) => setPosts(ps => ps.map(p => p.id === id ? { ...p, status: 'draft' } : p));
  const togglePub   = (id: string) => setPosts(ps => ps.map(p => { if (p.id !== id) return p; const s = p.status === 'published' ? 'draft' : 'published'; pushActivity(s === 'published' ? 'published a post.' : 'unpublished a post.'); return { ...p, status: s, updated_at: now() }; }));

  /* Quick draft */
  const saveDraft = () => {
    if (!draftTitle.trim()) return alert('Title required');
    const n = now();
    setPosts(ps => [{ id: uid(), title: draftTitle, content: draftContent, status: 'draft', author: 'Admin', category: 'General', tags: '', created_at: n, updated_at: n }, ...ps]);
    pushActivity('saved a quick draft.'); setDraftTitle(''); setDraftContent('');
  };

  /* Page ops */
  const savePage = (pg: Page) => {
    setPages(ps => ps.find(x => x.id === pg.id) ? ps.map(x => x.id === pg.id ? pg : x) : [pg, ...ps]);
    pushActivity('saved a page.'); setEditPage(null); goTo('pages');
  };

  /* Comment ops */
  const approveCmt = (id: string) => setComments(cs => cs.map(c => c.id === id ? { ...c, status: 'approved' } : c));
  const spamCmt    = (id: string) => setComments(cs => cs.map(c => c.id === id ? { ...c, status: 'spam' } : c));
  const deleteCmt  = (id: string) => { if (!confirm('Delete?')) return; setComments(cs => cs.filter(c => c.id !== id)); };

  /* Stats */
  const pubCount  = posts.filter(p => p.status === 'published').length;
  const pending   = comments.filter(c => c.status === 'pending').length;

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
                    { icon: 'edit' as const,  label: 'Write a blog post',  fn: () => { setEditPost(null); goTo('post-editor'); } },
                    { icon: 'file' as const,  label: 'Add an about page',  fn: () => { setEditPage({ title: 'About Us', slug: '/about', content: '', status: 'draft', author: 'Admin' }); goTo('page-editor'); } },
                    { icon: 'eye' as const,   label: 'View your site',     fn: () => {} },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--teal)', fontWeight: 500, padding: '5px 0', fontFamily: 'var(--font)', width: '100%' }}>
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
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 500, padding: '5px 0', fontFamily: 'var(--font)', width: '100%' }}>
                      <Icon name={item.icon} size={13} style={{ color: 'var(--teal)' } as React.CSSProperties} />
                      <span style={{ color: 'var(--teal)', fontWeight: 700, minWidth: 22 }}>{item.count}</span>
                      {item.label}
                    </button>
                  ))}
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>More Actions</div>
                  {[
                    { icon: 'grid' as const,           label: 'Manage widgets or menu', fn: () => goTo('customize') },
                    { icon: 'message' as const,        label: 'Turn comments off or on', fn: () => goTo('comments') },
                    { icon: 'moreHorizontal' as const, label: 'More about getting started', fn: () => {} },
                  ].map(item => (
                    <button key={item.label} onClick={item.fn} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, padding: '5px 0', fontFamily: 'var(--font)', width: '100%' }}>
                      <Icon name={item.icon} size={13} /> {item.label}
                    </button>
                  ))}
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
                        <button onClick={() => { setEditPost(p); goTo('post-editor'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--teal)', fontFamily: 'var(--font)', padding: 0, fontWeight: 500 }}>{p.title}</button>
                        <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{fmtDate(p.updated_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Page views */}
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="activity" size={14} /> Viewed pages by users</div>
                  <div style={{ position: 'relative' }}>
                    <select value={period} onChange={e => setPeriod(e.target.value)} className="input-field" style={{ fontSize: 12, paddingRight: 24, cursor: 'pointer' }}>
                      {['7 Days', '30 Days', '90 Days'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '5px 0', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Page</th>
                      <th style={{ textAlign: 'right', padding: '5px 0', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAGE_VIEWS.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--bg)' }}>
                        <td style={{ padding: '7px 0', fontSize: 12.5, color: 'var(--teal)', fontFamily: 'var(--mono)', fontWeight: 500 }}>{row.page}</td>
                        <td style={{ padding: '7px 0', fontSize: 13, fontWeight: 700, textAlign: 'right', color: 'var(--ink)' }}>{row.views.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Activities */}
              <div className="card" style={{ padding: '20px 22px', overflowY: 'auto' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="clock" size={14} /> Recent Activities</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {activity.map((act, i) => (
                    <div key={act.id} style={{ display: 'flex', gap: 11, paddingBottom: 14, borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none', marginBottom: i < activity.length - 1 ? 14 : 0 }}>
                      <Av initials={act.initials} color={act.color} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{act.user} <span style={{ fontWeight: 400, color: 'var(--ink2)' }}>{act.action}</span></div>
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
                    <button key={f} onClick={() => setPFilter(f)} style={{ padding: '5px 13px', border: 'none', borderRadius: 5, background: pFilter === f ? 'var(--teal)' : 'var(--bg)', color: pFilter === f ? '#fff' : 'var(--ink3)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.1s' }}>
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
                          <button onClick={() => { if (confirm('Delete page?')) setPages(ps => ps.filter(p => p.id !== pg.id)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font)', padding: 0 }}>Delete</button>
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
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ COMMENTS ══ */}
        {view === 'comments' && (
          <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)', background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)' }}>No comments yet.</div>}
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
                    {c.status !== 'approved' && <button onClick={() => approveCmt(c.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 11.5, color: 'var(--green)' }}>Approve</button>}
                    {c.status !== 'spam'     && <button onClick={() => spamCmt(c.id)}    className="btn btn-secondary btn-sm" style={{ fontSize: 11.5, color: 'var(--gold)' }}>Mark Spam</button>}
                    <button onClick={() => deleteCmt(c.id)} className="btn btn-secondary btn-sm" style={{ fontSize: 11.5, color: 'var(--red)' }}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ CUSTOMIZE ══ */}
        {view === 'customize' && (
          <div style={{ padding: '18px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 860 }}>
              {[
                { title: 'Site Identity',       desc: 'Logo, site title, tagline and favicon.',   icon: 'star' as const },
                { title: 'Colors & Typography', desc: 'Brand colours and font preferences.',       icon: 'edit' as const },
                { title: 'Header & Footer',     desc: 'Customise navigation and footer layout.',   icon: 'layers' as const },
                { title: 'Menus',               desc: 'Create and manage navigation menus.',       icon: 'list' as const },
                { title: 'Widgets',             desc: 'Add widgets to sidebars and areas.',        icon: 'grid' as const },
                { title: 'Homepage Settings',   desc: 'Control what is shown on your homepage.',   icon: 'home' as const },
              ].map(({ title, desc, icon }) => (
                <div key={title} className="card" style={{ padding: 20, display: 'flex', gap: 14, cursor: 'pointer', transition: 'box-shadow 0.12s' }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-lg)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                  <div style={{ width: 40, height: 40, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--teal)' }}>
                    <Icon name={icon} size={20} strokeWidth={1.75} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--navy)', marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', lineHeight: 1.45 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
