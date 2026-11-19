import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionCard } from '../components/SectionCard.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog.js';
import { apiFetch } from '../lib/api.js';
import type { LensRepository } from '@hudumika/types';

const PROVIDER_OPTIONS = [
  { key: 'ALL', label: 'All Providers' },
  { key: 'github', label: 'GitHub' },
  { key: 'gitlab', label: 'GitLab' },
  { key: 'internal', label: 'Internal Git' },
];

export function LensRepositories() {
  const [repos, setRepos] = useState<LensRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [providerFilter, setProviderFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    provider: 'github',
    full_name: '',
    default_branch: 'master',
    clone_url: '',
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/lens/repositories')
      .then((res: any) => setRepos(Array.isArray(res) ? res : []))
      .catch(() => setRepos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  function handleCopy(text: string, id: string) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // Filtered repositories
  const filtered = useMemo(() => {
    return repos.filter(r => {
      if (providerFilter !== 'ALL' && r.provider.toLowerCase() !== providerFilter.toLowerCase()) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        (r.default_branch && r.default_branch.toLowerCase().includes(q)) ||
        (r.clone_url && r.clone_url.toLowerCase().includes(q))
      );
    });
  }, [repos, providerFilter, search]);

  // Counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: repos.length };
    for (const r of repos) {
      const key = r.provider.toLowerCase();
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [repos]);

  const stats = useMemo(() => {
    const total = repos.length;
    const active = repos.filter(r => r.is_active).length;
    const gh = repos.filter(r => r.provider.toLowerCase() === 'github').length;
    return { total, active, gh };
  }, [repos]);

  return (
    <div className="lens-workspace">
      <PageHeader
        titlePlain="Source"
        titleEm="repositories"
        subtitle="Connected version control repositories for commit references, pull requests, and snapshots."
        crumbs={[{ label: 'Lens', to: '/lens' }, { label: 'Repositories' }]}
        actions={
          <Button size="sm" onClick={() => setOpenModal(true)}>
            <Icon name="plus" size={16} />
            Connect Repository
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
            <Icon name="gitBranch" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Connected Repos
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
              Active Sync
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{stats.active}</div>
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
            <Icon name="gitBranch" size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              GitHub Repos
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--teal)' }}>{stats.gh}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="lens-filters-wrap">
        <Tabs value={providerFilter} onValueChange={setProviderFilter} className="w-full md:w-auto">
          <TabsList>
            {PROVIDER_OPTIONS.map(opt => (
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
              aria-label="Search repositories"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repo name, URL..."
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

      {/* Main Repository List / States */}
      {loading ? (
        <SectionLoading />
      ) : repos.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="gitBranch" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No repositories connected</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0', maxWidth: 460 }}>
              Connect your GitHub or GitLab repositories to bind commit SHAs, snapshots, and pull request events to Lens items.
            </p>
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Icon name="plus" size={14} />
              Connect Repository
            </Button>
          </div>
        </SectionCard>
      ) : filtered.length === 0 ? (
        <SectionCard>
          <div className="lens-empty">
            <span className="lens-empty-icon">
              <Icon name="search" size={24} />
            </span>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>No matching repositories</h3>
            <p style={{ color: 'var(--ink3)', fontSize: 13, margin: '0 0 16px 0' }}>
              No repositories match your current filter or search criteria.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setProviderFilter('ALL');
                setSearch('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </SectionCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(r => (
            <div
              key={r.id}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 300px' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--surface-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: 'var(--ink)',
                  }}
                >
                  <Icon name="gitBranch" size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{r.full_name}</span>
                    <Badge variant="gray">{r.provider}</Badge>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        color: r.is_active ? 'var(--green)' : 'var(--ink3)',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 'var(--r-full)',
                          background: r.is_active ? 'var(--green)' : 'var(--ink3)',
                        }}
                      />
                      {r.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      Default branch:{' '}
                      <code style={{ background: 'var(--surface-hover)', padding: '2px 6px', borderRadius: 'var(--r-sm)', color: 'var(--ink2)' }}>
                        {r.default_branch}
                      </code>
                    </span>
                    {r.clone_url && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <code style={{ fontSize: 11, color: 'var(--ink3)' }}>{r.clone_url}</code>
                        <button
                          type="button"
                          aria-label="Copy clone URL"
                          onClick={() => handleCopy(r.clone_url!, r.id)}
                          title="Copy clone URL"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: copiedId === r.id ? 'var(--teal)' : 'var(--ink3)',
                            padding: 2,
                            display: 'flex',
                          }}
                        >
                          <Icon name={copiedId === r.id ? 'check' : 'copy'} size={12} />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button size="sm" variant="outline" onClick={() => handleCopy(r.full_name, `name-${r.id}`)}>
                  <Icon name={copiedId === `name-${r.id}` ? 'check' : 'copy'} size={13} />
                  {copiedId === `name-${r.id}` ? 'Copied' : 'Copy Ref'}
                </Button>
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
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--red-l)',
                  color: 'var(--red)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="repo-provider"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Provider
              </label>
              <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v }))}>
                <SelectTrigger id="repo-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="internal">Internal Git</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="repo-fullname"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Full Name (owner/repo) *
              </label>
              <Input
                id="repo-fullname"
                type="text"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. hudumika/platform"
                required
              />
            </div>
            <div>
              <label
                htmlFor="repo-branch"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Default Branch
              </label>
              <Input
                id="repo-branch"
                type="text"
                value={form.default_branch}
                onChange={e => setForm(f => ({ ...f, default_branch: e.target.value }))}
                placeholder="master or main"
              />
            </div>
            <div>
              <label
                htmlFor="repo-cloneurl"
                style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}
              >
                Clone URL (Optional)
              </label>
              <Input
                id="repo-cloneurl"
                type="text"
                value={form.clone_url}
                onChange={e => setForm(f => ({ ...f, clone_url: e.target.value }))}
                placeholder="https://github.com/owner/repo.git"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <Button type="button" variant="ghost" onClick={() => setOpenModal(false)}>
                Cancel
              </Button>
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
