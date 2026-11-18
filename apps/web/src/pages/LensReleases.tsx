import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
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

export function LensReleases() {
  const [releases, setReleases] = useState<LensRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    version: '',
    title: '',
    description: '',
    status: 'PLANNED' as LensReleaseStatus,
    git_tag: '',
    commit_sha: '',
    release_notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/releases')
      .then((res: any) => setReleases(Array.isArray(res) ? res : []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.version.trim() || !form.title.trim()) {
      setError('Version and Title are required');
      return;
    }
    setSubmitting(true);
    setError(null);
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
      setError(err?.message || 'Failed to create release');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: LensReleaseStatus) {
    try {
      await apiFetch(`/v1/lens/releases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err: any) {
      alert(err?.message || 'Failed to update release status');
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        title="Releases & Deployments"
        subtitle="Verified software versions, changelogs, and release integrity gates."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Releases' }]}
        actions={
          <Button variant="default" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Plan Release
          </Button>
        }
      />

      {loading ? (
        <SectionLoading />
      ) : releases.length === 0 ? (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No releases planned</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              Plan a version tag to group fixes, record verified test evidence, and generate audit-grade release notes.
            </p>
            <Button variant="default" onClick={() => setOpenModal(true)}>Plan First Release</Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {releases.map(r => (
            <div
              key={r.id}
              style={{
                background: 'var(--white)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: '20px',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <code style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{r.version}</code>
                  <Badge variant={STATUS_VARIANT[r.status] || 'gray'}>{r.status}</Badge>
                  {r.git_tag && (
                    <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
                      🏷️ {r.git_tag}
                    </span>
                  )}
                  {r.commit_sha && (
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink3)' }}>
                      {r.commit_sha.slice(0, 8)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.status === 'PLANNED' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'IN_PROGRESS')}>
                      Start Staging
                    </Button>
                  )}
                  {r.status === 'IN_PROGRESS' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'STAGED')}>
                      Mark Staged
                    </Button>
                  )}
                  {r.status === 'STAGED' && (
                    <Button size="sm" variant="default" onClick={() => updateStatus(r.id, 'RELEASED')}>
                      Publish Release
                    </Button>
                  )}
                </div>
              </div>

              <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>
                {r.title}
              </h4>
              {r.description && (
                <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  {r.description}
                </p>
              )}

              {r.release_notes && (
                <div
                  style={{
                    background: 'var(--surface-hover)',
                    borderRadius: 6,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--ink2)',
                  }}
                >
                  {r.release_notes}
                </div>
              )}

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--ink3)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Created {new Date(r.created_at).toLocaleDateString()}</span>
                {r.released_at && <span>Released on {new Date(r.released_at).toLocaleDateString()}</span>}
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
            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-light, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Version *
              </label>
              <input
                type="text"
                value={form.version}
                onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                placeholder="e.g. v2.4.0 or 2026.11.1"
                required
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
                Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. November Platform Hardening"
                required
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
                Git Tag (Optional)
              </label>
              <input
                type="text"
                value={form.git_tag}
                onChange={e => setForm(f => ({ ...f, git_tag: e.target.value }))}
                placeholder="e.g. release/v2.4.0"
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
                Release Notes / Changelog
              </label>
              <textarea
                value={form.release_notes}
                onChange={e => setForm(f => ({ ...f, release_notes: e.target.value }))}
                rows={4}
                placeholder="Summary of bug fixes, security patches, and verified improvements"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
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
