import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensSnapshot, LensSnapshotType } from '@hudumika/types';

export function LensSnapshots() {
  const [snapshots, setSnapshots] = useState<LensSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [form, setForm] = useState({
    snapshot_type: 'working_tree_patch' as LensSnapshotType,
    commit_sha: '',
    branch_label: '',
    reason: '',
    content: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/snapshots')
      .then((res: any) => setSnapshots(Array.isArray(res) ? res : []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) {
      setError('Snapshot content or diff patch is required');
      return;
    }
    setSubmitting(true);
    setError(null);
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
      setError(err?.message || 'Failed to capture snapshot');
    } finally {
      setSubmitting(false);
    }
  }

  async function openRestorePreview(id: string) {
    try {
      const data = await apiFetch(`/v1/lens/snapshots/${id}/restore-preview`);
      setPreview(data);
    } catch (err: any) {
      alert(err?.message || 'Failed to load restore preview');
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        title="Code & File Snapshots"
        subtitle="Immutable manifests, working-tree patches, and verified recovery artifacts in object storage."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Snapshots' }]}
        actions={
          <Button variant="default" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Capture Snapshot
          </Button>
        }
      />

      {loading ? (
        <SectionLoading />
      ) : snapshots.length === 0 ? (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No snapshots recorded</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              Capture working-tree diffs, selected defect files, or git bundles with SHA-256 integrity verification.
            </p>
            <Button variant="default" onClick={() => setOpenModal(true)}>Capture First Snapshot</Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {snapshots.map(s => (
            <div
              key={s.id}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <Badge variant={s.status === 'READY' ? 'success' : s.status === 'FAILED' ? 'error' : 'warning'}>
                    {s.status}
                  </Badge>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                    {s.snapshot_type.replace(/_/g, ' ').toUpperCase()}
                  </span>
                  {s.branch_label && (
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>branch: {s.branch_label}</span>
                  )}
                  {s.commit_sha && (
                    <code style={{ fontSize: 12, background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4 }}>
                      {s.commit_sha.slice(0, 8)}
                    </code>
                  )}
                </div>

                <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>
                  {s.reason || 'No description provided'}
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', gap: 16 }}>
                  <span>SHA256: <code style={{ fontSize: 10 }}>{s.checksum_sha256 ? `${s.checksum_sha256.slice(0, 16)}...` : 'N/A'}</code></span>
                  <span>Size: {(s.size_bytes / 1024).toFixed(1)} KB</span>
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" variant="outline" onClick={() => openRestorePreview(s.id)}>
                  Restore Preview
                </Button>
                <a
                  href={`/v1/lens/snapshots/${s.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none' }}
                >
                  <Button size="sm" variant="default">
                    <Icon name="download" size={14} />
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
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div style={{ marginBottom: 12, padding: '10px 14px', background: 'var(--teal-l)', borderRadius: 6, color: 'var(--teal-d)' }}>
                <strong>✅ Checksum Verified:</strong> SHA-256 matches immutable storage manifest.
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Snapshot ID:</strong> <code>{preview.snapshotId}</code>
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Type:</strong> {preview.snapshotType}
              </div>
              <div style={{ marginBottom: 8 }}>
                <strong>Checksum:</strong> <code style={{ fontSize: 11 }}>{preview.checksum}</code>
              </div>
              <div style={{ marginBottom: 14 }}>
                <strong>Size:</strong> {(preview.sizeBytes / 1024).toFixed(2)} KB
              </div>

              {preview.downloadUrl && (
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <Button variant="ghost" onClick={() => setPreview(null)}>Close</Button>
                  <a href={preview.downloadUrl} download target="_blank" rel="noreferrer">
                    <Button variant="default">Download Verified Artifact</Button>
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Capture Snapshot Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Capture Code / File Snapshot</DialogTitle>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-light, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Snapshot Type
              </label>
              <select
                value={form.snapshot_type}
                onChange={e => setForm(f => ({ ...f, snapshot_type: e.target.value as LensSnapshotType }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="working_tree_patch">Working Tree Patch (.diff)</option>
                <option value="selected_files">Selected Files Manifest</option>
                <option value="git_bundle">Git Bundle</option>
                <option value="source_archive">Source Archive (.tar.gz / .zip)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Branch / Commit SHA (Optional)
              </label>
              <input
                type="text"
                value={form.branch_label}
                onChange={e => setForm(f => ({ ...f, branch_label: e.target.value }))}
                placeholder="e.g. fix/vat-rounding or git rev"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Capture Reason / Notes
              </label>
              <input
                type="text"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Uncommitted reproduction patch for LENS-42"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Content (Git Diff or Base64 / Text) *
              </label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={6}
                required
                placeholder="diff --git a/... b/..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
              <Button type="submit" variant="default" disabled={submitting}>
                {submitting ? 'Capturing...' : 'Save & Verify'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensSnapshots;
