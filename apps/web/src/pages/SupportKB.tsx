import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Tip } from '../components/ui/tooltip.js';
import { Icon } from '../components/Icon.js';
import { Combobox } from '../components/ui/combobox.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';

interface KbCategory {
  id: string;
  name: string;
  description: string | null;
  articleCount?: number;
}

interface KbArticle {
  id: string;
  title: string;
  content: string;
  status: string | null;
  views: number;
  category_id: string | null;
  category_name: string | null;
  created_at?: string;
  updated_at?: string;
}

export const SupportKB: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'articles' | 'categories' | 'ai-grounding'>('articles');
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // New/Edit Article Modal
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('Published');
  const [saving, setSaving] = useState(false);

  // Preview Article Modal
  const [previewArticle, setPreviewArticle] = useState<KbArticle | null>(null);

  // New Category Modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/support/kb/articles'),
      apiFetch('/v1/support/kb/categories'),
    ])
      .then(([a, c]: any) => {
        setArticles(Array.isArray(a) ? a : []);
        setCategories(Array.isArray(c) ? c : []);
      })
      .catch(() => {
        setArticles([]);
        setCategories([]);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  // A search result linking here (?id=<article>) should open straight to
  // that article's preview once it's loaded, not land on the plain list.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || articles.length === 0) return;
    const match = articles.find(a => a.id === id);
    if (match) setPreviewArticle(match);
    setSearchParams(prev => { prev.delete('id'); return prev; }, { replace: true });
  }, [searchParams, articles]);

  const totalViews = useMemo(() => articles.reduce((sum, a) => sum + (a.views || 0), 0), [articles]);
  const publishedCount = useMemo(() => articles.filter(a => a.status === 'Published').length, [articles]);

  const filteredArticles = useMemo(() => {
    return articles.filter(a => {
      const matchesSearch = a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.content.toLowerCase().includes(search.toLowerCase()) ||
        (a.category_name && a.category_name.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = categoryFilter === 'ALL' || a.category_id === categoryFilter;
      const matchesStatus = statusFilter === 'ALL' || (a.status || 'Draft') === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [articles, search, categoryFilter, statusFilter]);

  function openCreateModal() {
    setEditingArticleId(null);
    setTitle('');
    setContent('');
    setCategoryId('');
    setStatus('Published');
    setShowArticleModal(true);
  }

  function openEditModal(a: KbArticle) {
    setEditingArticleId(a.id);
    setTitle(a.title);
    setContent(a.content);
    setCategoryId(a.category_id || '');
    setStatus(a.status || 'Published');
    setShowArticleModal(true);
  }

  async function saveArticle() {
    if (!title.trim()) {
      showAlert('Article title is required.');
      return;
    }
    setSaving(true);
    try {
      if (editingArticleId) {
        await apiFetch(`/v1/support/kb/articles/${editingArticleId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, content, category_id: categoryId || undefined, status }),
        });
        showAlert('Knowledge base article updated!');
      } else {
        await apiFetch('/v1/support/kb/articles', {
          method: 'POST',
          body: JSON.stringify({ title, content, category_id: categoryId || undefined, status }),
        });
        showAlert('New knowledge base article published!');
      }
      setShowArticleModal(false);
      reload();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to save article.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteArticle(id: string) {
    if (!window.confirm('Are you sure you want to delete this article?')) return;
    try {
      await apiFetch(`/v1/support/kb/articles/${id}`, { method: 'DELETE' });
      showAlert('Article deleted.');
      reload();
    } catch (err: any) {
      showAlert(err?.message || 'Could not delete article.');
    }
  }

  async function createCategory() {
    if (!catName.trim()) {
      showAlert('Category name is required.');
      return;
    }
    setSavingCat(true);
    try {
      await apiFetch('/v1/support/kb/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, description: catDesc }),
      });
      showAlert('Category created!');
      setCatName('');
      setCatDesc('');
      setShowCategoryModal(false);
      reload();
    } catch (err: any) {
      showAlert(err?.message || 'Failed to create category.');
    } finally {
      setSavingCat(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, padding: '20px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      
      {/* Top Banner Header */}
      <PageHeader
        crumbs={['Bliss', 'Knowledge Base']}
        titlePlain="Knowledge"
        titleEm="Base & Help Hub"
        subtitle="Public customer documentation, self-service help center, FAQ library, and AI assistant grounding docs."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(true)}>
              <Icon name="folder" size={14} /> New Category
            </Button>
            <Button variant="default" size="sm" onClick={openCreateModal}>
              <Icon name="plus" size={14} /> New Article
            </Button>
          </div>
        }
      />

      {/* Top Summary Metrics Ribbon */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
            <Icon name="fileText" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{articles.length} Articles</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
              <strong style={{ color: 'var(--green)' }}>{publishedCount} Published</strong> • {articles.length - publishedCount} Drafts
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
            <Icon name="eye" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{totalViews.toLocaleString()}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Total Article Reader Views</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--purple-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)' }}>
            <Icon name="folder" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{categories.length} Categories</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Topic Classifications</div>
          </div>
        </div>

        <div style={{ background: 'var(--white)', padding: 16, borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
            <Icon name="sparkle" size={22} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
              AI RAG Vector Index
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
              100% Synced to Bliss AI Bot
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)}>
        <TabsList style={{ background: 'var(--white)', border: '1px solid var(--border)' }}>
          <TabsTrigger value="articles">
            <Icon name="fileText" size={14} style={{ marginRight: 6 }} /> Help Articles ({filteredArticles.length})
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Icon name="folder" size={14} style={{ marginRight: 6 }} /> Topic Categories ({categories.length})
          </TabsTrigger>
          <TabsTrigger value="ai-grounding">
            <Icon name="sparkle" size={14} style={{ marginRight: 6 }} /> AI Bot Knowledge Grounding
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <SectionLoading />
      ) : activeTab === 'articles' ? (
        <SectionCard title="Knowledge Base Articles Directory">
          {/* Controls Bar */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--ink3)' }} />
                <input
                  className="input-field"
                  style={{ paddingLeft: 30, fontSize: 12.5 }}
                  placeholder="Search articles by title, category or content..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div style={{ width: 160 }}>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div style={{ width: 140 }}>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="Published">🟢 Published</SelectItem>
                    <SelectItem value="Draft">⚪ Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* View Mode Switcher */}
            <div style={{ display: 'flex', background: 'var(--bg)', padding: 3, borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r)',
                  border: 'none',
                  background: viewMode === 'table' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--ink)' : 'var(--ink3)',
                  fontWeight: viewMode === 'table' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  boxShadow: viewMode === 'table' ? 'var(--elev)' : 'none'
                }}
              >
                <Icon name="list" size={13} /> Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--r)',
                  border: 'none',
                  background: viewMode === 'cards' ? 'var(--white)' : 'transparent',
                  color: viewMode === 'cards' ? 'var(--ink)' : 'var(--ink3)',
                  fontWeight: viewMode === 'cards' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 12,
                  boxShadow: viewMode === 'cards' ? 'var(--elev)' : 'none'
                }}
              >
                <Icon name="grid" size={13} /> Cards View
              </button>
            </div>
          </div>

          {filteredArticles.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>
              No help articles found matching the selected search criteria.
            </div>
          ) : viewMode === 'table' ? (
            /* TABLE VIEW */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)', textAlign: 'left' }}>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Article Title</th>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Views</th>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArticles.map(a => (
                    <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{a.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                          {a.content || 'No content preview.'}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant="brand">{a.category_name || 'General'}</Badge>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 600 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="eye" size={13} color="var(--ink3)" /> {a.views}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Badge variant={a.status === 'Published' ? 'success' : 'gray'}>
                          {a.status || 'Draft'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Tip label="Preview Article">
                            <Button variant="outline" size="sm" onClick={() => setPreviewArticle(a)}>
                              <Icon name="eye" size={13} />
                            </Button>
                          </Tip>
                          <Tip label="Edit Article">
                            <Button variant="outline" size="sm" onClick={() => openEditModal(a)}>
                              <Icon name="edit" size={13} />
                            </Button>
                          </Tip>
                          <Tip label="Delete Article">
                            <Button variant="ghost" size="sm" onClick={() => deleteArticle(a.id)}>
                              <Icon name="trash" size={13} style={{ color: 'var(--red)' }} />
                            </Button>
                          </Tip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* GRID CARDS VIEW */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
              {filteredArticles.map(a => (
                <div key={a.id} style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 16, boxShadow: 'var(--elev)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Badge variant="brand">{a.category_name || 'General'}</Badge>
                    <Badge variant={a.status === 'Published' ? 'success' : 'gray'}>
                      {a.status || 'Draft'}
                    </Badge>
                  </div>

                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', lineHeight: 1.45 }}>
                      {a.content || 'No content preview.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ink3)' }}>
                      <Icon name="eye" size={13} /> {a.views} views
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="outline" size="sm" onClick={() => setPreviewArticle(a)}>Preview</Button>
                      <Button variant="default" size="sm" onClick={() => openEditModal(a)}>Edit</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      ) : activeTab === 'categories' ? (
        <SectionCard title="Topic Categories & Hierarchy">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {categories.map(c => (
              <div key={c.id} style={{ background: 'var(--white)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', padding: 16, boxShadow: 'var(--elev)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                  <Icon name="folder" size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{c.description || 'No category description.'}</div>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div style={{ gridColumn: '1 / -1', padding: 32, textAlign: 'center', color: 'var(--ink3)' }}>
                No categories created yet. Click "New Category" above to create one.
              </div>
            )}
          </div>
        </SectionCard>
      ) : (
        /* TAB 3: AI Support Grounding Docs */
        <SectionCard title="Bliss AI Assistant Knowledge Vector Index">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'linear-gradient(135deg, var(--purple-l) 0%, var(--teal-l) 100%)', borderRadius: 'var(--r-lg)', border: '1px solid var(--purple)', padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--purple-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--purple)' }}>
                  <Icon name="sparkle" size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Bliss AI RAG Grounding Active</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                    All published articles are automatically vectorized and indexed into vector embeddings for the AI customer bot.
                  </div>
                </div>
              </div>
              <Button variant="default" size="sm" onClick={() => showAlert('Re-indexing all KB articles for Bliss AI Bot...')}>
                <Icon name="refresh" size={14} /> Re-index Knowledge Base
              </Button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* CREATE / EDIT ARTICLE MODAL */}
      {showArticleModal && (
        <Dialog open onOpenChange={o => { if (!o) setShowArticleModal(false); }}>
          <DialogContent hideClose className="w-full max-w-135 p-0 gap-0 overflow-hidden">
            <DialogHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', textAlign: 'left' }}>
              <DialogTitle style={{ fontSize: 16 }}>
                {editingArticleId ? 'Edit Article' : 'Publish New Knowledge Article'}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowArticleModal(false)} style={{ padding: 4 }}>
                <Icon name="x" size={16} />
              </Button>
            </DialogHeader>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>ARTICLE TITLE</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. How to Submit Port Customs Declarations"
                  className="input-field"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>CATEGORY</label>
                  <Combobox
                    options={[{ value: '', label: '— Uncategorized —' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
                    value={categoryId}
                    onChange={setCategoryId}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>STATUS</label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Published">🟢 Published (Live)</SelectItem>
                      <SelectItem value="Draft">⚪ Draft (Internal)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>ARTICLE BODY CONTENT</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Write clear, step-by-step instructions for customers or agents..."
                  className="input-field"
                  rows={8}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <Button variant="outline" size="sm" onClick={() => setShowArticleModal(false)}>Cancel</Button>
                <Button variant="default" size="sm" onClick={saveArticle} disabled={saving}>
                  <Icon name="checkCircle" size={14} /> {saving ? 'Saving…' : editingArticleId ? 'Save Changes' : 'Publish Article'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* CREATE CATEGORY MODAL */}
      {showCategoryModal && (
        <Dialog open onOpenChange={o => { if (!o) setShowCategoryModal(false); }}>
          <DialogContent hideClose className="w-full max-w-110 p-0 gap-0 overflow-hidden">
            <DialogHeader style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)', textAlign: 'left' }}>
              <DialogTitle style={{ fontSize: 16 }}>Create Topic Category</DialogTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCategoryModal(false)} style={{ padding: 4 }}>
                <Icon name="x" size={16} />
              </Button>
            </DialogHeader>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>CATEGORY NAME</label>
                <input
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="e.g. Customs & Declarations"
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>DESCRIPTION</label>
                <input
                  value={catDesc}
                  onChange={e => setCatDesc(e.target.value)}
                  placeholder="e.g. Help docs for TRA clearance, manifests and HS codes"
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
                <Button variant="default" size="sm" onClick={createCategory} disabled={savingCat}>
                  <Icon name="folder" size={14} /> {savingCat ? 'Creating…' : 'Save Category'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PREVIEW ARTICLE MODAL */}
      {previewArticle && (
        <Dialog open onOpenChange={o => { if (!o) setPreviewArticle(null); }}>
          <DialogContent hideClose className="w-full max-w-150 p-0 gap-0 overflow-hidden">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge variant="brand">{previewArticle.category_name || 'General'}</Badge>
                <Badge variant={previewArticle.status === 'Published' ? 'success' : 'gray'}>{previewArticle.status || 'Draft'}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPreviewArticle(null)} style={{ padding: 4 }}>
                <Icon name="x" size={16} />
              </Button>
            </div>

            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', maxHeight: '70vh' }}>
              <DialogTitle style={{ fontSize: 20 }}>{previewArticle.title}</DialogTitle>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                Views: <strong>{previewArticle.views}</strong> • Last Updated: <strong>{previewArticle.updated_at ? new Date(previewArticle.updated_at).toLocaleString() : 'Recently'}</strong>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' }}>
                {previewArticle.content || 'No article body content.'}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
};
