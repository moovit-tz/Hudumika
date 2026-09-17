import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Badge } from '../components/ui/badge.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import type { CmsRelease, CmsPage, CmsPost, CmsContentEntry } from '@hudumika/types';

export function CMSReleases() {
  const [releases, setReleases] = useState<CmsRelease[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRelease, setSelectedRelease] = useState<CmsRelease | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);

  const [form, setForm] = useState<{
    name: string;
    description: string;
    publish_at: string;
  }>({
    name: '',
    description: '',
    publish_at: '',
  });

  // Items for picker
  const [availablePages, setAvailablePages] = useState<CmsPage[]>([]);
  const [availablePosts, setAvailablePosts] = useState<CmsPost[]>([]);
  const [itemType, setItemType] = useState<'page' | 'post'>('page');
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  function load() {
    setLoading(true);
    apiFetch<CmsRelease[]>('/v1/cms/releases')
      .then(res => setReleases(res ?? []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function openReleaseDetail(release: CmsRelease) {
    try {
      const detailed = await apiFetch<CmsRelease>(`/v1/cms/releases/${release.id}`);
      setSelectedRelease(detailed);
    } catch (err: any) {
      showAlert(`Failed to load release details: ${err.message}`);
    }
  }

  async function handleCreateRelease() {
    if (!form.name.trim()) return showAlert('Release name is required.');

    try {
      await apiFetch('/v1/cms/releases', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : undefined,
        }),
      });
      showAlert('Content release created.');
      setCreateModalOpen(false);
      setForm({ name: '', description: '', publish_at: '' });
      load();
    } catch (err: any) {
      showAlert(`Failed to create release: ${err.message}`);
    }
  }

  async function handlePublishNow(release: CmsRelease) {
    if (release.item_count === 0) {
      return showAlert('Please add at least one page or post to this release before publishing.');
    }
    const confirmed = await showConfirm(
      `Publish all ${release.item_count} items in release "${release.name}" immediately? This will atomically push all changes live.`,
      { confirmLabel: 'Publish Release Now' }
    );
    if (!confirmed) return;

    setPublishing(release.id);
    try {
      await apiFetch(`/v1/cms/releases/${release.id}/publish`, { method: 'POST' });
      showAlert(`Release "${release.name}" published successfully! All items are now live.`);
      load();
      if (selectedRelease?.id === release.id) {
        openReleaseDetail(release);
      }
    } catch (err: any) {
      showAlert(`Failed to publish release: ${err.message}`);
    } finally {
      setPublishing(null);
    }
  }

  async function handleDeleteRelease(release: CmsRelease) {
    const confirmed = await showConfirm(`Delete release "${release.name}"? Content items will not be deleted, only unbundled.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/v1/cms/releases/${release.id}`, { method: 'DELETE' });
      showAlert('Release deleted.');
      if (selectedRelease?.id === release.id) setSelectedRelease(null);
      load();
    } catch (err: any) {
      showAlert(`Delete failed: ${err.message}`);
    }
  }

  async function openAddItem() {
    try {
      const [pages, posts] = await Promise.all([
        apiFetch<CmsPage[]>('/v1/cms/pages'),
        apiFetch<CmsPost[]>('/v1/cms/posts'),
      ]);
      setAvailablePages(pages ?? []);
      setAvailablePosts(posts ?? []);
      setSelectedItemId(pages?.[0]?.id || posts?.[0]?.id || '');
      setAddItemModalOpen(true);
    } catch (err: any) {
      showAlert(`Failed to load content items: ${err.message}`);
    }
  }

  async function handleAddItem() {
    if (!selectedRelease || !selectedItemId) return;
    try {
      await apiFetch(`/v1/cms/releases/${selectedRelease.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          resource_type: itemType,
          resource_id: selectedItemId,
          target_status: 'published',
        }),
      });
      showAlert('Item added to release.');
      setAddItemModalOpen(false);
      openReleaseDetail(selectedRelease);
      load();
    } catch (err: any) {
      showAlert(`Failed to add item: ${err.message}`);
    }
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedRelease) return;
    try {
      await apiFetch(`/v1/cms/releases/${selectedRelease.id}/items/${itemId}`, { method: 'DELETE' });
      showAlert('Item removed from release.');
      openReleaseDetail(selectedRelease);
      load();
    } catch (err: any) {
      showAlert(`Failed to remove item: ${err.message}`);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <PageHeader
        crumbs={[{ label: 'CMS', to: '/cms' }, { label: 'Releases' }]}
        title="Content Releases & Bundles"
        subtitle="Group multiple pages, posts, and entries to publish them atomically in a single coordinated deployment (§18 Content Releases)."
        actions={
          <button
            onClick={() => {
              setForm({ name: '', description: '', publish_at: '' });
              setCreateModalOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: 'var(--teal)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Icon name="package" size={16} />
            New Release
          </button>
        }
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Release List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {loading ? (
            <SectionLoading />
          ) : !releases || releases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
              <Icon name="package" size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px 0' }}>No Content Releases</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Bundle multiple articles, seasonal promo banners, and landing pages to launch them together.
              </p>
              <button
                onClick={() => setCreateModalOpen(true)}
                style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--teal)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                Create Release
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {releases.map(rel => (
                <div
                  key={rel.id}
                  onClick={() => openReleaseDetail(rel)}
                  style={{
                    background: 'var(--surface)',
                    border: selectedRelease?.id === rel.id ? '2px solid var(--teal)' : '1px solid var(--border)',
                    borderRadius: 14,
                    padding: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{rel.name}</h4>
                      <Badge variant={rel.status === 'published' ? 'success' : rel.status === 'scheduled' ? 'warning' : 'secondary'}>
                        {rel.status}
                      </Badge>
                    </div>

                    {rel.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
                        {rel.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      <span><strong>{rel.item_count}</strong> bundled items</span>
                      {rel.publish_at && <span>Scheduled: {new Date(rel.publish_at).toLocaleString()}</span>}
                      {rel.published_at && <span>Published: {new Date(rel.published_at).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openReleaseDetail(rel);
                      }}
                      style={{ fontSize: 12, color: 'var(--teal)', background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      View Items &rarr;
                    </button>

                    {rel.status !== 'published' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePublishNow(rel);
                        }}
                        disabled={publishing === rel.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: 'var(--teal)',
                          color: '#fff',
                          border: 'none',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="zap" size={12} />
                        {publishing === rel.id ? 'Publishing...' : 'Publish Release'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Release Detail Drawer */}
        {selectedRelease && (
          <div
            style={{
              width: 380,
              background: 'var(--surface)',
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{selectedRelease.name}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status: {selectedRelease.status}</span>
              </div>
              <button
                onClick={() => setSelectedRelease(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  Bundled Items ({selectedRelease.items?.length ?? 0})
                </span>
                {selectedRelease.status !== 'published' && (
                  <button
                    onClick={openAddItem}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: 'var(--teal-l)',
                      color: 'var(--teal)',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="plus" size={12} /> Add Item
                  </button>
                )}
              </div>

              {!selectedRelease.items || selectedRelease.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
                  No items in this release yet. Click "+ Add Item" to bundle pages or posts.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedRelease.items.map(it => (
                    <div
                      key={it.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{it.title || 'Untitled'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
                          <span style={{ textTransform: 'uppercase' }}>{it.resource_type}</span>
                          <span>&bull;</span>
                          <span>target: {it.target_status}</span>
                        </div>
                      </div>

                      {selectedRelease.status !== 'published' && (
                        <button
                          onClick={() => handleRemoveItem(it.id)}
                          style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                          title="Remove from release"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
              {selectedRelease.status !== 'published' && (
                <button
                  onClick={() => handlePublishNow(selectedRelease)}
                  disabled={publishing === selectedRelease.id}
                  style={{
                    flex: 1,
                    padding: '9px 16px',
                    borderRadius: 8,
                    background: 'var(--teal)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {publishing === selectedRelease.id ? 'Publishing...' : 'Publish Release Now'}
                </button>
              )}
              <button
                onClick={() => handleDeleteRelease(selectedRelease)}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: '#fff1f2',
                  border: '1px solid #fee2e2',
                  color: '#dc2626',
                  cursor: 'pointer',
                }}
                title="Delete release"
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Release Modal */}
      {createModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text)' }}>Create Content Release</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Release Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Q4 Product Launch & Black Friday"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Summary of campaigns and pages contained in this bundle..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Scheduled Publish Date (Optional)</label>
                <input
                  type="datetime-local"
                  value={form.publish_at}
                  onChange={e => setForm(f => ({ ...f, publish_at: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setCreateModalOpen(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRelease}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Create Release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item to Release Modal */}
      {addItemModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--text)' }}>Add Content to Release</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Content Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('page');
                      setSelectedItemId(availablePages[0]?.id || '');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      border: itemType === 'page' ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: itemType === 'page' ? 'var(--teal-l)' : 'var(--bg)',
                      color: itemType === 'page' ? 'var(--teal)' : 'var(--text)',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Page ({availablePages.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemType('post');
                      setSelectedItemId(availablePosts[0]?.id || '');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      border: itemType === 'post' ? '2px solid var(--teal)' : '1px solid var(--border)',
                      background: itemType === 'post' ? 'var(--teal-l)' : 'var(--bg)',
                      color: itemType === 'post' ? 'var(--teal)' : 'var(--text)',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Blog Post ({availablePosts.length})
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Select Item</label>
                <select
                  value={selectedItemId}
                  onChange={e => setSelectedItemId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }}
                >
                  {itemType === 'page'
                    ? availablePages.map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                      ))
                    : availablePosts.map(p => (
                        <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                      ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                onClick={() => setAddItemModalOpen(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddItem}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--teal)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Add to Bundle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
