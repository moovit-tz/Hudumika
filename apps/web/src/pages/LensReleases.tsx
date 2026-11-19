import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensRelease, LensReleaseStatus } from '@hudumika/types';

const STATUS_VARIANT: Record<LensReleaseStatus, 'success' | 'brand' | 'warning' | 'gray' | 'error'> = {
  RELEASED: 'success',
  STAGED: 'brand',
  IN_PROGRESS: 'warning',
  PLANNED: 'gray',
  CANCELLED: 'error',
};

const STATUS_OPTIONS: Array<{ key: 'ALL' | LensReleaseStatus; label: string; dotColor?: string }> = [
  { key: 'ALL', label: 'All Releases' },
  { key: 'PLANNED', label: 'Planned', dotColor: 'var(--ink3)' },
  { key: 'IN_PROGRESS', label: 'In Progress', dotColor: 'var(--gold)' },
  { key: 'STAGED', label: 'Staged', dotColor: 'var(--teal)' },
  { key: 'RELEASED', label: 'Released', dotColor: 'var(--green)' },
  { key: 'CANCELLED', label: 'Cancelled', dotColor: 'var(--red)' },
];

export function LensReleases() {
  const [releases, setReleases] = useState<LensRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | LensReleaseStatus>('ALL');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const [form, setForm] = useState({
    version: '',
    title: '',
    description: '',
    status: 'PLANNED' as LensReleaseStatus,
    git_tag: '',
    commit_sha: '',
    release_notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setActionError(null);
    apiFetch('/v1/lens/releases')
      .then((res: any) => setReleases(Array.isArray(res) ? res : []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.version.trim() || !form.title.trim()) {
      setFormError('Version and Title are required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch('/v1/lens/releases', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setOpenModal(false);
      setForm({
        version: '',
        title: '',
        description: '',
        status: 'PLANNED',
        git_tag: '',
        commit_sha: '',
        release_notes: '',
      });
      load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create release');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: LensReleaseStatus) {
    setActionError(null);
    try {
      await apiFetch(`/v1/lens/releases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update release status');
    }
  }

  function handleCopy(text: string, id: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedSha(id);
    setTimeout(() => setCopiedSha(null), 2000);
  }

  // Filtered releases
  const filtered = useMemo(() => {
    return releases.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.version.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.git_tag && r.git_tag.toLowerCase().includes(q)) ||
        (r.commit_sha && r.commit_sha.toLowerCase().includes(q))
      );
    });
  }, [releases, statusFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: releases.length };
    for (const r of releases) {
      map[r.status] = (map[r.status] || 0) + 1;
    }
    return map;
  }, [releases]);

  const stats = useMemo(() => {
    const total = releases.length;
    const active = releases.filter(r => r.status === 'IN_PROGRESS' || r.status === 'STAGED').length;
    const published = releases.filter(r => r.status === 'RELEASED').length;
    return { total, active, published };
  }, [releases]);

  return (
    <div className="lens-workspace">
      <PageHeader
        titlePlain="Releases &"
        titleEm="deployments"
        subtitle="Verified software versions, changelogs, and release integrity gates."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Releases' }]}
        actions={
          <Button size="sm" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Plan Release
          </Button>
        }
      />

      {/* Summary Metrics Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          width: '100%',
        }}
      >
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink2)',
            }}
          >
            <Icon name="box2" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Releases
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{stats.total}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'var(--teal-l)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--teal)',
            }}
          >
            <Icon name="refresh" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Staged / In Progress
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>{stats.active}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--r-sm)',
              background: 'var(--green-l)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--green)',
            }}
          >
            <Icon name="check" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Published Releases
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{stats.published}</div>
          </div>
        </div>
      </div>

      {/* Action Error Banner */}
      {actionError && (
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--red-l)',
            color: 'var(--red)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{actionError}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Dismiss error"
            onClick={() => setActionError(null)}
            style={{ color: 'var(--red)', height: 'auto', padding: 4 }}
          >
            <Icon name="x" size={14} />
          </Button>
        </div>
      )}

      {/* Controls & Filter Toolbar */}
      <div className="lens-filters-wrap">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as 'ALL' | LensReleaseStatus)} className="w-full md:w-auto">
          <TabsList>
            {STATUS_OPTIONS.map(opt => (
              <TabsTrigger key={opt.key} value={opt.key} className="gap-2">
                {opt.dotColor && (
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: opt.dotColor }}
                  />
                )}
                <span>{opt.label}</span>
                <Badge variant="gray">{counts[opt.key] || 0}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="lens-search-wrap">
          <div style={{ position: 'relative', width: '100%' }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink3)',
                pointerEvents: 'none',
                display: 'flex',
                zIndex: 1,
              }}
            >
              <Icon name="search" size={14} />
            </span>
            <Input
              type="search"
              aria-label="Search releases"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search version, tag, SHA..."
              style={{ paddingLeft: 30, paddingRight: search ? 30 : 12 }}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink3)',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Release List / States */}
      {loading ? (
        <SectionLoading />
      ) : releases.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="box2" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No releases planned</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0', maxWidth: 460 }}>
              Plan a version tag to group fixes, record verified test evidence, and generate audit-grade release notes.
            </p>
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Icon name="plus" size={14} />
              Plan First Release
            </Button>
          </div>
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="search" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No matching releases</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              No releases match your search or active status filters.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setStatusFilter('ALL');
                setSearch('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(r => (
            <div
              key={r.id}
              className="card lens-record"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: r.status === 'RELEASED' ? '1px solid rgba(16, 185, 129, 0.3)' : undefined,
              }}
            >
              {/* Header Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <code
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--ink)',
                      background: 'var(--surface-hover)',
                      padding: '3px 8px',
                      borderRadius: 'var(--r-sm)',
                    }}
                  >
                    {r.version}
                  </code>
                  <Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge>

                  {r.git_tag && (
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--ink2)',
                        background: 'var(--bg)',
                        padding: '2px 8px',
                        borderRadius: 'var(--r-sm)',
                        border: '1px solid var(--border)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="gitBranch" size={12} />
                      {r.git_tag}
                    </span>
                  )}

                  {r.commit_sha && (
                    <button
                      type="button"
                      aria-label="Copy commit SHA"
                      onClick={() => handleCopy(r.commit_sha!, r.id)}
                      title="Click to copy commit SHA"
                      style={{
                        fontSize: 12,
                        fontFamily: 'monospace',
                        color: copiedSha === r.id ? 'var(--teal)' : 'var(--ink3)',
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        padding: '2px 8px',
                        borderRadius: 'var(--r-sm)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name={copiedSha === r.id ? 'check' : 'copy'} size={11} />
                      {r.commit_sha.slice(0, 8)}
                    </button>
                  )}
                </div>

                {/* Workflow Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {r.status === 'PLANNED' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'IN_PROGRESS')}>
                      <Icon name="refresh" size={14} />
                      Start Staging
                    </Button>
                  )}
                  {r.status === 'IN_PROGRESS' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'STAGED')}>
                      <Icon name="check" size={14} />
                      Mark Staged
                    </Button>
                  )}
                  {r.status === 'STAGED' && (
                    <Button size="sm" variant="default" onClick={() => updateStatus(r.id, 'RELEASED')}>
                      <Icon name="upload" size={14} />
                      Publish Release
                    </Button>
                  )}
                </div>
              </div>

              {/* Title & Description */}
              <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>
                {r.title}
              </h4>
              {r.description && (
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                  {r.description}
                </p>
              )}

              {/* Release Notes / Changelog */}
              {r.release_notes && (
                <div
                  style={{
                    width: '100%',
                    background: 'var(--surface-hover)',
                    borderRadius: 'var(--r-sm)',
                    padding: '10px 14px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--ink2)',
                    lineHeight: 1.5,
                    border: '1px solid var(--border)',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Changelog & Notes
                  </div>
                  {r.release_notes}
                </div>
              )}

              {/* Metadata Footer */}
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--ink3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  width: '100%',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <span>Created {new Date(r.created_at).toLocaleDateString()}</span>
                {r.released_at && (
                  <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                    ✓ Released on {new Date(r.released_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Release Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Plan Version Release</DialogTitle>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {formError && (
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--red-l)',
                  color: 'var(--red)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                }}
              >
                {formError}
              </div>
            )}
            <div>
              <label
                htmlFor="release-version"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Version *
              </label>
              <Input
                id="release-version"
                type="text"
                value={form.version}
                onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="e.g. v2.4.0 or 2026.11.1"
                required
              />
            </div>
            <div>
              <label
                htmlFor="release-title"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Title *
              </label>
              <Input
                id="release-title"
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. November Platform Hardening"
                required
              />
            </div>
            <div>
              <label
                htmlFor="release-tag"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Git Tag (Optional)
              </label>
              <Input
                id="release-tag"
                type="text"
                value={form.git_tag}
                onChange={e => setForm(f => ({ ...f, git_tag: e.target.value }))}
                placeholder="e.g. release/v2.4.0"
              />
            </div>
            <div>
              <label
                htmlFor="release-notes"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Release Notes / Changelog
              </label>
              <Textarea
                id="release-notes"
                value={form.release_notes}
                onChange={e => setForm(f => ({ ...f, release_notes: e.target.value }))}
                rows={4}
                placeholder="Summary of bug fixes, security patches, and verified improvements"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Planning...' : 'Plan Release'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensReleases;
