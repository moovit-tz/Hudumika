import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { PageHeader } from '../../components/PageHeader.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { ListPagination, paginate } from '../../components/ui/list-pagination.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { healthOf } from './projectData.js';
import { apiFetch } from '../../lib/api.js';
import { useIsMobile } from '../../hooks/useIsMobile.js';

interface TimelineProject {
  id: string;
  name: string;
  color: string;
  status: string;
  start_date: string | null;
  target_date: string | null;
  task_count: number;
  task_done_count: number;
  health_status?: string;
  progress_pct?: number;
  owner_name: string | null;
  owner_id: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthsBetween(a: Date, b: Date): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  const cur = new Date(a.getFullYear(), a.getMonth(), 1);
  const end = new Date(b.getFullYear(), b.getMonth() + 1, 1);
  while (cur < end) {
    out.push({ year: cur.getFullYear(), month: cur.getMonth(), label: `${MONTH_NAMES[cur.getMonth()]} ${cur.getFullYear()}` });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function dayOffset(date: Date, rangeStart: Date, totalDays: number): number {
  const diff = (date.getTime() - rangeStart.getTime()) / 86400000;
  return Math.max(0, Math.min(100, (diff / totalDays) * 100));
}

const HEALTH_CONFIG: Record<string, { label: string; color: string; badge: 'success' | 'warning' | 'error' | 'brand' }> = {
  on_track: { label: 'On Track', color: 'var(--green)', badge: 'success' },
  at_risk: { label: 'At Risk', color: 'var(--gold)', badge: 'warning' },
  critical: { label: 'Critical', color: 'var(--red)', badge: 'error' },
  completed: { label: 'Completed', color: 'var(--teal)', badge: 'brand' },
};

export const ProjectTimeline: React.FC = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<TimelineProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showUnscheduled, setShowUnscheduled] = useState(true);
  const [tlPage, setTlPage] = useState(1);
  const [tlPageSize, setTlPageSize] = useState(25);
  const [unschedPage, setUnschedPage] = useState(1);
  const [unschedPageSize, setUnschedPageSize] = useState(25);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError('');
    apiFetch('/v1/tasks/projects')
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
        setProjects(data.map((row: any) => ({ ...row, health_status: healthOf(row.health_status) })));
      })
      .catch((err: any) => setLoadError(err.message || 'Unable to load projects'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset pagination when filters change
  useEffect(() => {
    setTlPage(1);
    setUnschedPage(1);
  }, [statusFilter, search]);

  const scheduled = useMemo(() => {
    let list = projects.filter(p => p.start_date && p.target_date);
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime());
  }, [projects, statusFilter, search]);

  const unscheduled = useMemo(() => {
    let list = projects.filter(p => !p.start_date || !p.target_date);
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [projects, statusFilter, search]);

  const { rangeStart, rangeEnd, months, totalDays } = useMemo(() => {
    if (scheduled.length === 0) {
      const now = new Date();
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 6, 0);
      return { rangeStart: s, rangeEnd: e, months: monthsBetween(s, e), totalDays: (e.getTime() - s.getTime()) / 86400000 };
    }
    const dates = scheduled.flatMap(p => [new Date(p.start_date!), new Date(p.target_date!)]);
    const minD = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    minD.setDate(1);
    maxD.setMonth(maxD.getMonth() + 1, 0);
    const td = (maxD.getTime() - minD.getTime()) / 86400000;
    return { rangeStart: minD, rangeEnd: maxD, months: monthsBetween(minD, maxD), totalDays: td || 1 };
  }, [scheduled]);

  const today = new Date();
  const todayOffset = dayOffset(today, rangeStart, totalDays);

  return (
    <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font)' }}>
      {loadError && (
        <Alert variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>
            {loadError} <Button variant="outline" size="sm" onClick={load} style={{ marginLeft: 8 }}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        crumbs={['Projects', 'Planning']}
        titlePlain="Project"
        titleEm="timeline"
        subtitle="Portfolio Gantt chart — unified timeline with start dates, targets, and delivery milestones."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/directory')}>
              <Icon name="briefcase" size={13} style={{ marginRight: 6 }} /> Directory
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects/milestones')}>
              <Icon name="flag" size={13} style={{ marginRight: 6 }} /> Milestones
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 20 }}>
        {/* Controls Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-xs" style={{ width: 140 }}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="in_progress">Active</SelectItem>
                <SelectItem value="not_started">Planning</SelectItem>
                <SelectItem value="finished">Finished</SelectItem>
                <SelectItem value="on_hold">On Hold</SelectItem>
              </SelectContent>
            </Select>

            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              {scheduled.length} scheduled · {unscheduled.length} unscheduled
            </span>
          </div>

          <SearchToolbar search={search} onSearch={setSearch} placeholder="Search timeline projects…" />
        </div>

        {loading ? (
          <SectionLoading />
        ) : scheduled.length === 0 && unscheduled.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 48, textAlign: 'center' }}>
            <FeaturedIcon variant="brand" size="lg" style={{ margin: '0 auto 12px' }}>
              <Icon name="calendar" size={24} />
            </FeaturedIcon>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No Projects Found</h3>
            <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 400, margin: '0 auto 16px' }}>
              No projects match the current search filters. Create a project and specify start and target dates to plot on the timeline.
            </p>
            <Button onClick={() => navigate('/projects/new')}>Create Project</Button>
          </div>
        ) : (
          <>
            {/* Gantt Timeline View */}
            {scheduled.length > 0 && (<>
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--card-shadow)', marginBottom: 24 }}>
                {/* Month headers */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', position: 'relative' }}>
                  <div style={{ width: isMobile ? 140 : 260, flexShrink: 0, padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em', borderRight: '1px solid var(--border)' }}>
                    Project & Owner
                  </div>
                  <div style={{ flex: 1, display: 'flex', position: 'relative', overflowX: 'auto' }}>
                    {months.map((m, i) => (
                      <div key={`${m.year}-${m.month}`} style={{ flex: 1, padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textAlign: 'center', borderRight: i < months.length - 1 ? '1px solid var(--border)' : 'none', minWidth: 65 }}>
                        {m.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Project rows */}
                {paginate(scheduled, tlPage, tlPageSize).visible.map(p => {
                  const start = new Date(p.start_date!);
                  const end = new Date(p.target_date!);
                  const left = dayOffset(start, rangeStart, totalDays);
                  const right = dayOffset(end, rangeStart, totalDays);
                  const width = Math.max(3, right - left);
                  const pct = p.progress_pct ?? (p.task_count > 0 ? Math.round((p.task_done_count / p.task_count) * 100) : 0);
                  const health = HEALTH_CONFIG[p.health_status || 'on_track'] || HEALTH_CONFIG.on_track;

                  return (
                    <div
                      key={p.id}
                      style={{ display: 'flex', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      {/* Left identity cell */}
                      <div style={{ width: isMobile ? 140 : 260, flexShrink: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderRight: '1px solid var(--border)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.color || 'var(--teal)', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {p.owner_name && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <PersonAvatar userId={p.owner_id} name={p.owner_name} size={14} />
                                {p.owner_name}
                              </span>
                            )}
                            <span>· {pct}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Right timeline track */}
                      <div style={{ flex: 1, position: 'relative', padding: '10px 0', minHeight: 46 }}>
                        {/* Today marker */}
                        {todayOffset > 0 && todayOffset < 100 && (
                          <div
                            style={{
                              position: 'absolute',
                              left: `${todayOffset}%`,
                              top: 0,
                              bottom: 0,
                              width: 2,
                              background: 'var(--red)',
                              opacity: 0.7,
                              zIndex: 2,
                            }}
                            title={`Today: ${today.toLocaleDateString()}`}
                          />
                        )}

                        {/* Bar */}
                        <div
                          style={{
                            position: 'absolute',
                            left: `${left}%`,
                            width: `${width}%`,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            height: 22,
                            borderRadius: 'var(--r-sm)',
                            background: `color-mix(in srgb, ${p.color || 'var(--teal)'} 20%, transparent)`,
                            border: `1.5px solid ${p.color || 'var(--teal)'}`,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          }}
                          title={`${p.name}\nStart: ${p.start_date}\nTarget: ${p.target_date}\nProgress: ${pct}%\nHealth: ${health.label}`}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: `${pct}%`,
                              background: p.color || 'var(--teal)',
                              opacity: 0.85,
                              transition: 'width 0.3s',
                            }}
                          />
                          <span
                            style={{
                              position: 'relative',
                              zIndex: 1,
                              fontSize: 10,
                              fontWeight: 700,
                              color: 'var(--ink)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <ListPagination total={scheduled.length} page={tlPage} pageSize={tlPageSize} onPageChange={setTlPage} onPageSizeChange={setTlPageSize} noun="projects" />
            </>)}

            {/* Unscheduled Projects Section */}
            {unscheduled.length > 0 && (
              <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, boxShadow: 'var(--card-shadow)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FeaturedIcon variant="warning" size="sm">
                      <Icon name="clock" size={13} />
                    </FeaturedIcon>
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                        Unscheduled Projects ({unscheduled.length})
                      </h4>
                      <p style={{ fontSize: 11, color: 'var(--ink3)', margin: 0 }}>
                        These projects lack a start or target date and cannot appear on the Gantt chart.
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowUnscheduled(!showUnscheduled)}>
                    <Icon name={showUnscheduled ? 'chevronUp' : 'chevronDown'} size={14} />
                  </Button>
                </div>

                {showUnscheduled && (<>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, marginTop: 12 }}>
                    {paginate(unscheduled, unschedPage, unschedPageSize).visible.map(p => (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}/edit`)}
                        style={{
                          padding: '10px 12px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-md)',
                          background: 'var(--bg-subtle)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            {p.start_date ? `Starts: ${p.start_date}` : p.target_date ? `Due: ${p.target_date}` : 'No dates set'}
                          </div>
                        </div>
                        <Button variant="outline" size="sm" style={{ height: 26, fontSize: 11, padding: '0 8px' }}>
                          Set Dates
                        </Button>
                      </div>
                    ))}
                  </div>

                  <ListPagination total={unscheduled.length} page={unschedPage} pageSize={unschedPageSize} onPageChange={setUnschedPage} onPageSizeChange={setUnschedPageSize} noun="projects" />
                </>)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
