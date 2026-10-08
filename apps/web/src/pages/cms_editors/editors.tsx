import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { CheckboxRow } from '../../components/ui/list-item-row.js';
import { apiFetch } from '../../lib/api.js';
import { RichTextEditor } from '../../components/RichTextEditor.js';
import { RevisionHistory } from '../../components/RevisionHistory.js';
import { ActivityDialog } from '../../components/ActivityDialog.js';
import { CMSCollaborationDrawer } from '../../components/CMSCollaborationDrawer.js';
import { CMSTranslationModal } from '../../components/CMSTranslationModal.js';
import { CMSRequestApprovalModal } from '../../components/CMSRequestApprovalModal.js';
import { CMSAddToReleaseModal } from '../../components/CMSAddToReleaseModal.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';
import type { CmsSite, CmsWorkflowState, CmsPost, CmsPage } from '@hudumika/types';
import { showAlert } from '../../lib/alert.js';
import type { Post, Page } from './shared.js';
import { uid, now, toLocalInput, SUPPORTED_LOCALES, cmsPageToLocal, cmsPostToLocal, POST_FIELD_LABELS, PAGE_FIELD_LABELS, FL, useMediaPicker } from './shared.js';

/* ── Post Editor ── */
export function PostEditor({
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
          <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }} data-ui-native-button="">
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
              <button onClick={() => setShowComments(true)} className="btn btn-secondary btn-sm" title="Editorial collaboration & comments" data-ui-native-button="">
                <Icon name="messageSquare" size={13} /> Comments
              </button>
              <button onClick={() => setShowTranslate(true)} className="btn btn-secondary btn-sm" title="AI Machine Translation (Draft-only)" data-ui-native-button="">
                <Icon name="sparkle" size={13} /> Translate
              </button>
              <button onClick={() => setShowRequestApproval(true)} className="btn btn-secondary btn-sm" title="Submit for editorial approval" data-ui-native-button="">
                <Icon name="checkCircle" size={13} /> Request Review
              </button>
              <button onClick={() => setShowAddToRelease(true)} className="btn btn-secondary btn-sm" title="Bundle into release" data-ui-native-button="">
                <Icon name="package" size={13} /> Add to Release
              </button>
              <button onClick={() => setShowActivity(true)} className="btn btn-secondary btn-sm" title="Who did what" data-ui-native-button="">
                <Icon name="activity" size={13} /> Activity
              </button>
              <button onClick={() => setShowHistory(true)} className="btn btn-secondary btn-sm" title="Version history" data-ui-native-button="">
                <Icon name="clock" size={13} /> History
              </button>
              {tenantSlug && (
                <button onClick={handlePreview} className="btn btn-secondary btn-sm" data-ui-native-button="">
                  <Icon name="eye" size={13} /> Preview
                </button>
              )}
            </>
          )}
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm" data-ui-native-button="">Save Draft</button>
          {form.publish_at !== undefined && form.status === 'scheduled'
            ? <button onClick={() => handleSave('scheduled')} className="btn btn-primary btn-sm" data-ui-native-button="">Schedule</button>
            : <button onClick={() => set('status', 'scheduled')} className="btn btn-secondary btn-sm" data-ui-native-button="">Schedule…</button>}
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm" data-ui-native-button="">Publish</button>
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
          <FL label="Slug (leave blank to auto-generate)"><input value={form.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="auto" className="input-field" style={{ fontFamily: 'var(--font)', fontSize: 12.5 }} /></FL>
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
              <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiTagsLoading} onClick={handleAiTags} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }} data-ui-native-button="">
                <Icon name="sparkle" size={12} /> {aiTagsLoading ? 'Thinking…' : 'Suggest'}
              </button>
            </div>
          </FL>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>SEO &amp; sharing</div>
            <FL label="SEO description">
              <textarea value={form.seo_description || ''} onChange={e => set('seo_description', e.target.value)} placeholder="Shown in search results and social previews…" rows={2} maxLength={500}
                className="input-field" style={{ fontSize: 12, lineHeight: 1.5, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
              <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiSeoLoading} onClick={handleAiSeo} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }} data-ui-native-button="">
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
export function PageEditor({
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
          <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink3)', fontFamily: 'var(--font)' }} data-ui-native-button="">
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
              <button onClick={() => setShowComments(true)} className="btn btn-secondary btn-sm" title="Editorial collaboration & comments" data-ui-native-button="">
                <Icon name="messageSquare" size={13} /> Comments
              </button>
              <button onClick={() => setShowTranslate(true)} className="btn btn-secondary btn-sm" title="AI Machine Translation (Draft-only)" data-ui-native-button="">
                <Icon name="sparkle" size={13} /> Translate
              </button>
              <button onClick={() => setShowRequestApproval(true)} className="btn btn-secondary btn-sm" title="Submit for editorial approval" data-ui-native-button="">
                <Icon name="checkCircle" size={13} /> Request Review
              </button>
              <button onClick={() => setShowAddToRelease(true)} className="btn btn-secondary btn-sm" title="Bundle into release" data-ui-native-button="">
                <Icon name="package" size={13} /> Add to Release
              </button>
              <button onClick={() => setShowActivity(true)} className="btn btn-secondary btn-sm" title="Who did what" data-ui-native-button="">
                <Icon name="activity" size={13} /> Activity
              </button>
              <button onClick={() => setShowHistory(true)} className="btn btn-secondary btn-sm" title="Version history" data-ui-native-button="">
                <Icon name="clock" size={13} /> History
              </button>
              {tenantSlug && (
                <button onClick={handlePreview} className="btn btn-secondary btn-sm" data-ui-native-button="">
                  <Icon name="eye" size={13} /> Preview
                </button>
              )}
            </>
          )}
          <button onClick={() => handleSave('draft')} className="btn btn-secondary btn-sm" data-ui-native-button="">Save Draft</button>
          {form.status === 'scheduled'
            ? <button onClick={() => handleSave('scheduled')} className="btn btn-primary btn-sm" data-ui-native-button="">Schedule</button>
            : <button onClick={() => set('status', 'scheduled')} className="btn btn-secondary btn-sm" data-ui-native-button="">Schedule…</button>}
          <button onClick={() => handleSave('published')} className="btn btn-primary btn-sm" data-ui-native-button="">Publish</button>
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
          <FL label="Slug"><input value={form.slug || ''} onChange={e => set('slug', e.target.value)} placeholder="/page-slug" className="input-field" style={{ fontFamily: 'var(--font)', fontSize: 13 }} /></FL>
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
            <button type="button" className="btn btn-secondary btn-sm" disabled={!form.content?.trim() || aiSeoLoading} onClick={handleAiSeo} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }} data-ui-native-button="">
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
