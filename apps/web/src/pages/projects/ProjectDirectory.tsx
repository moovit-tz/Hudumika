import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { Input } from '../../components/ui/input.js';
import { healthOf, money } from './projectData.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: string;
  owner_id: string;
  owner_name: string | null;
  start_date: string | null;
  target_date: string | null;
  task_count: number;
  task_done_count: number;
  health_status?: string;
  progress_pct?: number;
  member_count: number;
  currency: string;
  ref?: string;
  industry?: string;
  project_tags?: string[];
  customer_name?: string | null;
  baseline_budget?: number;
  actual_cost?: number;
}

const STATUS_META: Record<string, { label: string; variant: 'gray' | 'brand' | 'warning' | 'error' | 'success' }> = {
  not_started: { label: 'Planning', variant: 'gray' },
  in_progress: { label: 'In Progress', variant: 'brand' },
  on_hold: { label: 'On Hold', variant: 'warning' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  finished: { label: 'Finished', variant: 'success' },
};

const HEALTH_META: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'brand' }> = {
  on_track: { label: 'On Track', variant: 'success' },
  at_risk: { label: 'At Risk', variant: 'warning' },
  critical: { label: 'Critical', variant: 'error' },
  completed: { label: 'Completed', variant: 'brand' },
};

const INDUSTRIES = [
  'general', 'construction', 'engineering', 'real_estate', 'manufacturing',
  'transport', 'public_sector', 'telecom', 'it_software', 'energy', 'mining'
];

export const ProjectDirectory: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [industryFilter, setIndustryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [viewMode, setViewMode] = useState<'grid' | 'rows'>('grid');
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch('/v1/project-os/bookmarks')
      .then((ids: string[]) => setBookmarks(new Set(ids)))
      .catch(() => {});
  }, []);

  const toggleBookmark = useCallback((projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    apiFetch(`/v1/project-os/bookmarks/${projectId}`, { method: 'POST' }).catch(() => {
      setBookmarks(prev => {
        const rollback = new Set(prev);
        if (rollback.has(projectId)) rollback.delete(projectId);
        else rollback.add(projectId);
        return rollback;
      });
    });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, healthFilter, industryFilter, pageSize]);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/tasks/projects')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
        setProjects(data.map((row: any) => ({
          ...row,
          health_status: healthOf(row.health_status),
          baseline_budget: Number(row.baseline_budget || row.current_budget || 0),
          actual_cost: Number(row.actual_cost || 0),
          progress_pct: Number(row.progress_pct || 0),
        })));
      })
      .catch((err: any) => setLoadError(err.message || 'Unable to load projects'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter === 'bookmarked') {
      list = list.filter(p => bookmarks.has(p.id));
    } else if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (healthFilter !== 'all') list = list.filter(p => p.health_status === healthFilter);
    if (industryFilter !== 'all') list = list.filter(p => (p.industry || 'general') === industryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        `${p.name} ${p.ref || ''} ${p.customer_name || ''} ${p.industry || ''} ${p.description || ''} ${(p.project_tags || []).join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list;
  }, [projects, statusFilter, healthFilter, industryFilter, search, bookmarks]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <PageHeader
        crumbs={['Projects', 'Directory']}
        titlePlain="Project"
        titleEm="directory"
        subtitle="Cross-workspace directory — browse, filter, and inspect project governance across departments."
        actions={
          <Button onClick={() => navigate('/projects/new')}>
            <Icon name="plus" size={14} /> New Project
          </Button>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* Controls Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList wrap>
              <TabsTrigger value="all">All ({projects.length})</TabsTrigger>
              <TabsTrigger value="bookmarked">
                <Icon name="bookmark" size={12} style={{ marginRight: 4 }} />
                Bookmarked{bookmarks.size > 0 ? ` (${bookmarks.size})` : ''}
              </TabsTrigger>
              <TabsTrigger value="in_progress">Active</TabsTrigger>
              <TabsTrigger value="not_started">Planning</TabsTrigger>
              <TabsTrigger value="finished">Finished</TabsTrigger>
              <TabsTrigger value="on_hold">On Hold</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: isMobile ? '100%' : 200 }}>
              <Icon
                name="search"
                size={14}
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }}
              />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search directory…"
                style={{ paddingLeft: 30, height: 34, fontSize: 12.5 }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 2 }}
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>

            {/* Health Filter */}
            <Select value={healthFilter} onValueChange={setHealthFilter}>
              <SelectTrigger style={{ height: 34, width: 120, fontSize: 12 }}>
                <SelectValue placeholder="Health" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Health</SelectItem>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="at_risk">At Risk</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>

            {/* Industry Filter */}
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger style={{ height: 34, width: 130, fontSize: 12 }}>
                <SelectValue placeholder="Industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                {INDUSTRIES.map(ind => (
                  <SelectItem key={ind} value={ind}>
                    {ind.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View Mode Toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '6px 10px',
                  background: viewMode === 'grid' ? 'var(--teal-l)' : 'var(--white)',
                  color: viewMode === 'grid' ? 'var(--teal)' : 'var(--ink3)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Grid view"
              >
                <Icon name="grid" size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('rows')}
                style={{
                  padding: '6px 10px',
                  background: viewMode === 'rows' ? 'var(--teal-l)' : 'var(--white)',
                  color: viewMode === 'rows' ? 'var(--teal)' : 'var(--ink3)',
                  border: 'none',
                  borderLeft: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Table view"
              >
                <Icon name="list" size={13} />
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <SectionLoading label="Loading projects directory…" size={32} />
        ) : filtered.length === 0 ? (
          <div style={{
            background: 'var(--surface, var(--white))',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: 48,
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}>
            <FeaturedIcon variant="gray" size="lg">
              <Icon name="search" size={24} />
            </FeaturedIcon>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>No projects match your filter</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', maxWidth: 400 }}>
              Try adjusting your search terms or clearing specific status and industry filters.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSearch(''); setStatusFilter('all'); setHealthFilter('all'); setIndustryFilter('all'); }}
            >
              Clear filters
            </Button>
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
            {visible.map(p => {
              const pct = p.progress_pct || (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0);
              const sm = STATUS_META[p.status] || STATUS_META.not_started;
              const hb = HEALTH_META[p.health_status || 'on_track'] || HEALTH_META.on_track;

              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/projects/${p.id}`);
                    }
                  }}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  style={{
                    background: 'var(--surface, var(--white))',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: 16,
                    boxShadow: 'var(--card-shadow)',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s, transform 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.boxShadow = 'var(--elev)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.boxShadow = 'var(--card-shadow)';
                    e.currentTarget.style.transform = '';
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                        {p.ref && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, background: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--r-sm)', color: 'var(--ink2)' }}>
                            {p.ref}
                          </span>
                        )}
                        {p.industry && (
                          <span style={{ fontSize: 10.5, color: 'var(--ink3)', textTransform: 'capitalize' }}>
                            {p.industry.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                        <Badge variant={hb.variant}>{hb.label}</Badge>
                        <Badge variant={sm.variant}>{sm.label}</Badge>
                        <button
                          type="button"
                          title={bookmarks.has(p.id) ? 'Remove bookmark' : 'Bookmark project'}
                          onClick={e => toggleBookmark(p.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                            color: bookmarks.has(p.id) ? 'var(--teal)' : 'var(--ink3)',
                            transition: 'color 0.15s',
                          }}
                        >
                          <Icon name="bookmark" size={14} style={bookmarks.has(p.id) ? { fill: 'var(--teal)' } : undefined} />
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                      {p.name}
                    </div>

                    {p.customer_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ink2)', fontWeight: 600, marginBottom: 8 }}>
                        <Icon name="building" size={12} style={{ color: 'var(--teal)' }} />
                        {p.customer_name}
                      </div>
                    )}

                    {p.description && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 34 }}>
                        {p.description}
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 4 }}>
                        <span>Progress</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--teal)' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink3)', marginBottom: 10 }}>
                      <span>{p.task_done_count || 0}/{p.task_count || 0} tasks done</span>
                      {(p.baseline_budget || 0) > 0 && (
                        <span>Budget: {money(p.baseline_budget, p.currency)}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <PersonAvatar name={p.owner_name || 'Lead'} userId={p.owner_id} size={22} />
                      <span style={{ color: 'var(--ink2)', fontWeight: 600 }}>{p.owner_name || 'Unassigned'}</span>
                    </div>
                    <span style={{ color: 'var(--teal)', fontWeight: 700 }}>
                      Open &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ background: 'var(--surface, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflowX: 'auto', boxShadow: 'var(--card-shadow)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--card-sunken, var(--bg))' }}>
                  {['', 'Project', 'Industry', 'Health', 'Status', 'Progress', 'Tasks', 'Owner', 'Timeline', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Actions' ? 'right' : 'left', padding: '10px 14px', fontWeight: 700, fontSize: 11, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const pct = p.progress_pct || (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0);
                  const sm = STATUS_META[p.status] || STATUS_META.not_started;
                  const hb = HEALTH_META[p.health_status || 'on_track'] || HEALTH_META.on_track;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 6px 12px 14px', width: 28 }}>
                        <button
                          type="button"
                          title={bookmarks.has(p.id) ? 'Remove bookmark' : 'Bookmark project'}
                          onClick={e => toggleBookmark(p.id, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                            color: bookmarks.has(p.id) ? 'var(--teal)' : 'var(--ink3)',
                            transition: 'color 0.15s',
                          }}
                        >
                          <Icon name="bookmark" size={14} style={bookmarks.has(p.id) ? { fill: 'var(--teal)' } : undefined} />
                        </button>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 800, color: 'var(--ink)' }}>{p.name}</div>
                            {p.ref && <span style={{ fontSize: 10.5, color: 'var(--ink3)' }}>{p.ref}</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textTransform: 'capitalize', color: 'var(--ink2)' }}>
                        {p.industry ? p.industry.replace('_', ' ') : 'General'}
                      </td>
                      <td style={{ padding: '12px 14px' }}><Badge variant={hb.variant}>{hb.label}</Badge></td>
                      <td style={{ padding: '12px 14px' }}><Badge variant={sm.variant}>{sm.label}</Badge></td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 90 }}>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--ink3)' }}>
                        {p.task_done_count}/{p.task_count}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {p.owner_name ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PersonAvatar name={p.owner_name} userId={p.owner_id} size={20} />
                            <span style={{ fontSize: 12, fontWeight: 500 }}>{p.owner_name}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>
                        {p.start_date || '—'} &rarr; {p.target_date || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/projects/${p.id}`);
                          }}
                        >
                          Open &rarr;
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
              Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} projects
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 600 }}>
                Page {currentPage} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>
                Next
              </Button>
              <Select value={String(pageSize)} onValueChange={value => setPageSize(Number(value))}>
                <SelectTrigger style={{ height: 32, width: 110, fontSize: 12 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[12, 24, 48].map(size => (
                    <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
