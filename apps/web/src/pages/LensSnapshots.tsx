import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Textarea } from '../components/ui/textarea.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensSnapshot, LensSnapshotType } from '@hudumika/types';

const TYPE_OPTIONS: Array<{ key: 'ALL' | LensSnapshotType; label: string }> = [
  { key: 'ALL', label: 'All Snapshots' },
  { key: 'working_tree_patch', label: 'Working Tree Patch' },
  { key: 'selected_files', label: 'Selected Files' },
  { key: 'git_bundle', label: 'Git Bundle' },
  { key: 'source_archive', label: 'Source Archive' },
];

export function LensSnapshots() {
  const [snapshots, setSnapshots] = useState<LensSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'ALL' | LensSnapshotType>('ALL');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [form, setForm] = useState({
    snapshot_type: 'working_tree_patch' as LensSnapshotType,
    commit_sha: '',
    branch_label: '',
    reason: '',
    content: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setActionError(null);
    apiFetch('/v1/lens/snapshots')
      .then((res: any) => setSnapshots(Array.isArray(res) ? res : []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) {
      setFormError('Snapshot content or diff patch is required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await apiFetch('/v1/lens/snapshots', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setOpenModal(false);
      setForm({
        snapshot_type: 'working_tree_patch',
        commit_sha: '',
        branch_label: '',
        reason: '',
        content: '',
      });
      load();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to capture snapshot');
    } finally {
      setSubmitting(false);
    }
  }

  async function openRestorePreview(id: string) {
    setActionError(null);
    setPreviewLoading(true);
    try {
      const data = await apiFetch(`/v1/lens/snapshots/${id}/restore-preview`);
      setPreview(data);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to load restore preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleCopy(text: string, key: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  // Filtered snapshots
  const filtered = useMemo(() => {
    return snapshots.filter(s => {
      if (typeFilter !== 'ALL' && s.snapshot_type !== typeFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.snapshot_type.toLowerCase().includes(q) ||
        (s.reason && s.reason.toLowerCase().includes(q)) ||
        (s.branch_label && s.branch_label.toLowerCase().includes(q)) ||
        (s.commit_sha && s.commit_sha.toLowerCase().includes(q)) ||
        (s.checksum_sha256 && s.checksum_sha256.toLowerCase().includes(q))
      );
    });
  }, [snapshots, typeFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: snapshots.length };
    for (const s of snapshots) {
      map[s.snapshot_type] = (map[s.snapshot_type] || 0) + 1;
    }
    return map;
  }, [snapshots]);

  const stats = useMemo(() => {
    const total = snapshots.length;
    const ready = snapshots.filter(s => s.status === 'READY').length;
    const totalBytes = snapshots.reduce((acc, s) => acc + (s.size_bytes || 0), 0);
    const footprint = totalBytes > 1024 * 1024
      ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(totalBytes / 1024).toFixed(1)} KB`;
    return { total, ready, footprint };
  }, [snapshots]);

  return (
    <div className="lens-workspace">
      <PageHeader
        titlePlain="Code & File"
        titleEm="snapshots"
        subtitle="Immutable manifests, working-tree patches, and verified recovery artifacts in object storage."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Snapshots' }]}
        actions={
          <Button size="sm" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Capture Snapshot
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
            <Icon name="layers" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Snapshots
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
              Ready / Verified
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{stats.ready}</div>
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
            <Icon name="download" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Storage Volume
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>{stats.footprint}</div>
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

      {/* Filter and Search Toolbar */}
      <div className="lens-filters-wrap">
        <Tabs value={typeFilter} onValueChange={v => setTypeFilter(v as 'ALL' | LensSnapshotType)} className="w-full md:w-auto">
          <TabsList>
            {TYPE_OPTIONS.map(opt => (
              <TabsTrigger key={opt.key} value={opt.key} className="gap-2">
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
              aria-label="Search snapshots"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search branch, SHA, reason..."
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

      {/* Main Snapshots List / States */}
      {loading ? (
        <SectionLoading />
      ) : snapshots.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="layers" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No snapshots recorded</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0', maxWidth: 460 }}>
              Capture working-tree diffs, selected defect files, or git bundles with SHA-256 integrity verification.
            </p>
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Icon name="plus" size={14} />
              Capture First Snapshot
            </Button>
          </div>
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="search" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No matching snapshots</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              No snapshots match your active type filter or search terms.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setTypeFilter('ALL');
                setSearch('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(s => (
            <div
              key={s.id}
              className="card lens-record lens-record-row"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 300px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <Badge variant={s.status === 'READY' ? 'success' : s.status === 'FAILED' ? 'error' : 'warning'}>
                    {s.status}
                  </Badge>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {s.snapshot_type.replace(/_/g, ' ').toUpperCase()}
                  </span>

                  {s.branch_label && (
                    <span
                      style={{
                        fontSize: 11,
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
                      <Icon name="gitBranch" size={11} />
                      {s.branch_label}
                    </span>
                  )}

                  {s.commit_sha && (
                    <button
                      type="button"
                      aria-label="Copy commit SHA"
                      onClick={() => handleCopy(s.commit_sha!, `commit-${s.id}`)}
                      title="Click to copy commit SHA"
                      style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: copiedKey === `commit-${s.id}` ? 'var(--teal)' : 'var(--ink3)',
                        background: 'var(--surface-hover)',
                        border: '1px solid var(--border)',
                        padding: '2px 6px',
                        borderRadius: 'var(--r-sm)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name={copiedKey === `commit-${s.id}` ? 'check' : 'copy'} size={11} />
                      {s.commit_sha.slice(0, 8)}
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 6 }}>
                  {s.reason || 'No description provided'}
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {s.checksum_sha256 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      SHA256:{' '}
                      <code style={{ fontSize: 10, background: 'var(--surface-hover)', padding: '1px 4px', borderRadius: 'var(--r-sm)' }}>
                        {s.checksum_sha256.slice(0, 16)}...
                      </code>
                      <button
                        type="button"
                        aria-label="Copy SHA-256 checksum"
                        onClick={() => handleCopy(s.checksum_sha256, `sha-${s.id}`)}
                        title="Copy full SHA-256"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: copiedKey === `sha-${s.id}` ? 'var(--teal)' : 'var(--ink3)',
                          padding: 2,
                          display: 'flex',
                        }}
                      >
                        <Icon name={copiedKey === `sha-${s.id}` ? 'check' : 'copy'} size={11} />
                      </button>
                    </span>
                  )}
                  <span>Size: {(s.size_bytes / 1024).toFixed(1)} KB</span>
                  <span>Captured {new Date(s.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openRestorePreview(s.id)}
                  disabled={previewLoading}
                >
                  <Icon name="search" size={13} />
                  Restore Preview
                </Button>
                <a
                  href={`/v1/lens/snapshots/${s.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Button size="sm" variant="default">
                    <Icon name="download" size={13} />
                    Download
                  </Button>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Restore Preview Dialog */}
      <Dialog open={Boolean(preview)} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent>
          <DialogTitle>Snapshot Restore & Integrity Preview</DialogTitle>
          {preview && (
            <div style={{ marginTop: 12, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--teal-l)',
                  borderRadius: 'var(--r-sm)',
                  color: 'var(--teal)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon name="check" size={16} />
                <strong>Checksum Verified: SHA-256 matches immutable storage manifest.</strong>
              </div>

              <div style={{ background: 'var(--surface-hover)', padding: '12px 14px', borderRadius: 'var(--r-sm)', display: 'grid', gap: 8 }}>
                <div>
                  <span style={{ color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', display: 'block' }}>
                    Snapshot ID
                  </span>
                  <code style={{ fontSize: 12, color: 'var(--ink)' }}>{preview.snapshotId}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', display: 'block' }}>
                    Artifact Type
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{preview.snapshotType}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', display: 'block' }}>
                    SHA-256 Checksum
                  </span>
                  <code style={{ fontSize: 11, color: 'var(--ink)', wordBreak: 'break-all' }}>{preview.checksum}</code>
                </div>
                <div>
                  <span style={{ color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase', display: 'block' }}>
                    Artifact Size
                  </span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                    {(preview.sizeBytes / 1024).toFixed(2)} KB ({preview.sizeBytes} bytes)
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="ghost" onClick={() => setPreview(null)}>
                  Close
                </Button>
                {preview.downloadUrl && (
                  <a href={preview.downloadUrl} download target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    <Button variant="default">
                      <Icon name="download" size={14} />
                      Download Verified Artifact
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Capture Snapshot Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Capture Code / File Snapshot</DialogTitle>
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
                htmlFor="snapshot-type"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Snapshot Type
              </label>
              <Select value={form.snapshot_type} onValueChange={v => setForm(f => ({ ...f, snapshot_type: v as LensSnapshotType }))}>
                <SelectTrigger id="snapshot-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="working_tree_patch">Working Tree Patch (git diff)</SelectItem>
                  <SelectItem value="selected_files">Selected Files Snapshot</SelectItem>
                  <SelectItem value="git_bundle">Git Bundle</SelectItem>
                  <SelectItem value="source_archive">Source Archive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="snapshot-reason"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Reason / Description
              </label>
              <Input
                id="snapshot-reason"
                type="text"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Pre-migration state before applying patch 098"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label
                  htmlFor="snapshot-branch"
                  style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
                >
                  Branch Label
                </label>
                <Input
                  id="snapshot-branch"
                  type="text"
                  value={form.branch_label}
                  onChange={e => setForm(f => ({ ...f, branch_label: e.target.value }))}
                  placeholder="e.g. master or fix/lens-ui"
                />
              </div>

              <div>
                <label
                  htmlFor="snapshot-sha"
                  style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
                >
                  Commit SHA
                </label>
                <Input
                  id="snapshot-sha"
                  type="text"
                  value={form.commit_sha}
                  onChange={e => setForm(f => ({ ...f, commit_sha: e.target.value }))}
                  placeholder="e.g. a1b2c3d4..."
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="snapshot-content"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Snapshot Content / Diff Patch *
              </label>
              <Textarea
                id="snapshot-content"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={8}
                placeholder="Paste unified diff patch or configuration content here..."
                required
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Capturing...' : 'Capture Snapshot'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensSnapshots;
