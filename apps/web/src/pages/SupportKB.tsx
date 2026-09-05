import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { apiFetch } from '../lib/api.js';
import './SupportKB.css';
import { Combobox } from '../components/ui/combobox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';

interface KbCategory { id: string; name: string; description: string | null }
interface KbArticle {
  id: string; title: string; content: string; status: string | null;
  views: number; category_id: string | null; category_name: string | null;
}

export const SupportKB: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'articles' | 'categories'>('articles');
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewArticle, setShowNewArticle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');

  function reload() {
    Promise.all([
      apiFetch('/v1/support/kb/articles'),
      apiFetch('/v1/support/kb/categories'),
    ]).then(([a, c]) => { setArticles(a); setCategories(c); }).finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  async function createArticle() {
    if (!newTitle.trim()) return;
    await apiFetch('/v1/support/kb/articles', {
      method: 'POST',
      body: JSON.stringify({ title: newTitle, content: newContent, category_id: newCategoryId || undefined }),
    });
    setNewTitle(''); setNewContent(''); setNewCategoryId('');
    setShowNewArticle(false);
    reload();
  }

  return (
    <div className="skb-page">
      <PageHeader
        crumbs={['Support', 'Knowledge Base']}
        titlePlain="Knowledge"
        titleEm="Base"
        actions={
          <button className="skb-new-btn" onClick={() => setShowNewArticle(true)}>
            New Article
          </button>
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} variant="segmented">
        <TabsList>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'articles' ? (
        <div className="skb-table-card">
          <div className="skb-table-wrap">
            <table className="skb-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Views</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {articles.map(a => (
                  <tr key={a.id}>
                    <td className="skb-td-title">{a.title}</td>
                    <td className="skb-td-muted">{a.category_name ?? '—'}</td>
                    <td className="skb-td-muted">{a.views}</td>
                    <td>
                      <span className={`skb-status${a.status === 'Published' ? ' skb-status--published' : ''}`}>
                        {a.status ?? 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
                {articles.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)' }}>No articles yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="skb-table-card">
          <div className="skb-table-wrap">
            <table className="skb-table">
              <thead>
                <tr><th>Name</th><th>Description</th></tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td className="skb-td-title">{c.name}</td>
                    <td className="skb-td-muted">{c.description ?? '—'}</td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)' }}>No categories yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewArticle && (
        <div className="modal-overlay" onClick={() => setShowNewArticle(false)}>
          <div className="card" style={{ width: 480, padding: 28 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 18 }}>New Article</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="input-field" style={{ width: '100%' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Category</label>
              <Combobox
                options={[{ value: '', label: '— None —' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                value={newCategoryId} onChange={setNewCategoryId}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', display: 'block', marginBottom: 5 }}>Content</label>
              <textarea value={newContent} onChange={e => setNewContent(e.target.value)} className="input-field" rows={6} style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewArticle(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button onClick={createArticle} className="btn btn-primary btn-sm" disabled={!newTitle.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
