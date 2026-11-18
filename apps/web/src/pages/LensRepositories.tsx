import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensRepository } from '@hudumika/types';

export function LensRepositories() {
  const [repos, setRepos] = useState<LensRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ provider: 'github', full_name: '', default_branch: 'master', clone_url: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/repositories')
      .then((res: any) => setRepos(Array.isArray(res) ? res : []))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setError('Repository full name is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/v1/lens/repositories', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setOpenModal(false);
      setForm({ provider: 'github', full_name: '', default_branch: 'master', clone_url: '' });
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to add repository');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-layout">
      <PageHeader
        title="Source Repositories"
        subtitle="Connected version control repositories for commit references, pull requests, and snapshots."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Repositories' }]}
        actions={
          <Button variant="default" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Connect Repository
          </Button>
        }
      />

      {loading ? (
        <SectionLoading />
      ) : repos.length === 0 ? (
        <SectionCard>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🐙</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No repositories connected</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              Connect your GitHub or GitLab repositories to bind commit SHAs, snapshots, and pull request events to Lens items.
            </p>
            <Button variant="default" onClick={() => setOpenModal(true)}>Connect Repository</Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {repos.map(r => (
            <div
              key={r.id}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="gitBranch" size={18} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{r.full_name}</span>
                    <Badge variant="gray">{r.provider}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    Default branch: <code style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 4 }}>{r.default_branch}</code>
                    {r.clone_url && <span style={{ marginLeft: 12 }}>Clone: {r.clone_url}</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, color: r.is_active ? 'var(--green)' : 'var(--ink3)', fontWeight: 600 }}>
                  {r.is_active ? '● Active' : '○ Disabled'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Repository Dialog */}
      <Dialog open={openModal} onOpenChange={setOpenModal}>
        <DialogContent>
          <DialogTitle>Connect Source Repository</DialogTitle>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--red-light, #fee2e2)', color: 'var(--red, #b91c1c)', borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Provider
              </label>
              <select
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="internal">Internal Git</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                Full Name (owner/repo) *
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. hudumika/platform"
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
                Default Branch
              </label>
              <input
                type="text"
                value={form.default_branch}
                onChange={e => setForm(f => ({ ...f, default_branch: e.target.value }))}
                placeholder="master or main"
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
                Clone URL (Optional)
              </label>
              <input
                type="text"
                value={form.clone_url}
                onChange={e => setForm(f => ({ ...f, clone_url: e.target.value }))}
                placeholder="https://github.com/owner/repo.git"
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
                {submitting ? 'Connecting...' : 'Connect Repository'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default LensRepositories;
