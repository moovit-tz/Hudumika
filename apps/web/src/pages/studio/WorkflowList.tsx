import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './studio.css';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Switch } from '../../components/ui/switch.js';
import { SearchToolbar, SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import type { WorkflowStudioApp, WorkflowStudioTriggerDef, WorkflowStudioActionDef } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';
import { Tip } from '../../components/ui/tooltip.js';
import { Card } from '../../components/ui/card.js';
import './WorkflowList.css';

/**
 * The workflow list.
 *
 * Deliberately shows only figures the API really returns — run count, last run,
 * status, trigger. The reference designs carry success-rate percentages and
 * throughput sparklines; none of that is computed anywhere in this platform,
 * and a fabricated 98.2% on an automation console is exactly the kind of thing
 * someone would make a decision on.
 */
export function WorkflowList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get('return');
  // app filter — initialised from ?app= so old sidebar links still work
  const [app, setApp] = useState<string>(params.get('app') ?? '__all__');

  const [workflows, setWorkflows] = useState<WorkflowStudioApp[]>([]);
  const [triggers, setTriggers] = useState<WorkflowStudioTriggerDef[]>([]);
  const [actions, setActions] = useState<WorkflowStudioActionDef[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('ALL');
  const [activity, setActivity] = useState('ALL');
  const [sort, setSort] = useState('updated');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  useEffect(() => { setPage(1); }, [app, status, q, activity, sort, pageSize]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [wf, tr, ac] = await Promise.all([
          apiFetch('/v1/workflow-studio/apps'),
          apiFetch('/v1/workflow-studio/triggers'),
          apiFetch('/v1/workflow-studio/actions'),
        ]);
        if (!alive) return;
        setWorkflows(wf.data ?? []);
        setTriggers(tr.data ?? []);
        setActions(ac.data ?? []);
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Could not load workflows.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const triggerById = useMemo(() => new Map(triggers.map(t => [t.id, t])), [triggers]);
  const actionById = useMemo(() => new Map(actions.map(a => [a.id, a])), [actions]);

  const appOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of triggers) seen.set(t.app, t.appName);
    for (const a of actions) seen.set(a.app, a.appName);
    const sorted = [...seen.entries()].sort((x, y) => x[1].localeCompare(y[1]));
    return [{ value: '__all__', label: 'All apps' }, ...sorted.map(([value, label]) => ({ value, label }))];
  }, [triggers, actions]);

  /**
   * Which apps a workflow touches — the trigger's app plus every app it acts on.
   * Scoping by the trigger alone was wrong: "Released declaration releases bonded
   * lots" fires on a ClearOS event but does SEAL's work, so it vanished from
   * SEAL's own view.
   */
  const appsTouched = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const w of workflows) {
      const set = new Set<string>();
      const trig = triggerById.get(w.trigger_event);
      if (trig) set.add(trig.app);
      for (const n of w.nodes ?? []) {
        if (n.type === 'action') {
          const a = actionById.get(n.eventOrAction ?? '');
          if (a) set.add(a.app);
        }
      }
      map.set(w.id, set);
    }
    return map;
  }, [workflows, triggerById, actionById]);

  const visible = useMemo(() => workflows.filter(w => {
    if (app !== '__all__' && !appsTouched.get(w.id)?.has(app)) return false;
    if (status !== 'ALL' && w.status !== status) return false;
    if (activity === 'never' && w.run_count > 0) return false;
    if (activity === 'ran' && !w.run_count) return false;
    if (activity === 'recent' && (!w.last_run_at || Date.now() - new Date(w.last_run_at).getTime() > 30 * 86400000)) return false;
    if (activity === 'unrunnable' && triggerById.has(w.trigger_event)) return false;
    if (q && !`${w.name} ${w.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'runs' ? b.run_count - a.run_count : sort === 'lastRun' ? (Date.parse(b.last_run_at ?? '') || 0) - (Date.parse(a.last_run_at ?? '') || 0) : Date.parse(b.updated_at) - Date.parse(a.updated_at)), [workflows, app, status, q, activity, sort, appsTouched, triggerById]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pages);
  const paged = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function clearFilters() { setApp('__all__'); setStatus('ALL'); setActivity('ALL'); setQ(''); setPage(1); }

  const counts = useMemo(() => ({
    total: workflows.length,
    active: workflows.filter(w => w.status === 'ACTIVE').length,
    draft: workflows.filter(w => w.status === 'DRAFT').length,
    unrunnable: workflows.filter(w => !triggerById.get(w.trigger_event)).length,
  }), [workflows, triggerById]);

  async function toggle(w: WorkflowStudioApp, next: boolean) {
    setBusyId(w.id); setError('');
    try {
      const res = await apiFetch(`/v1/workflow-studio/apps/${w.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: next ? 'ACTIVE' : 'DRAFT' }),
      });
      setWorkflows(list => list.map(x => (x.id === w.id ? { ...x, status: res.data.status } : x)));
    } catch (e: any) { setError(e?.message ?? 'Could not change status.'); }
    setBusyId(null);
  }

  const stat = (label: string, value: number, tone: 'brand' | 'success' | 'gray' | 'error') => (
    <Card className="workflow-metric">
      <FeaturedIcon variant={tone} size="sm"><Icon name={tone === 'error' ? 'alertCircle' : 'zap'} size={15} /></FeaturedIcon>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
      </div>
    </Card>
  );

  return (
    <div className="studio-page workflow-list-page">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <PageHeader
            crumbs={['Studio', 'Workflows']}
            titlePlain="Workflow"
            titleEm="automations"
            actions={<Button size="lg" onClick={() => navigate('/studio/new')}><Icon name="plus" size={16} />New workflow</Button>}
            subtitle="Connect workspace events to actions. Monitor what is active and what has run."
          />
        </div>
        {returnTo && (
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(returnTo)}>
            <Icon name="arrowLeft" size={13} /> Back
          </Button>
        )}
      </div>

      <div className="workflow-metrics">
        {stat('Workflows', counts.total, 'brand')}
        {stat('Active', counts.active, 'success')}
        {stat('Draft', counts.draft, 'gray')}
        {counts.unrunnable > 0 && stat('Cannot run', counts.unrunnable, 'error')}
      </div>

      {counts.unrunnable > 0 && (
        <Banner variant="error" icon="alertCircle" className="mb-4">
          {counts.unrunnable} workflow{counts.unrunnable === 1 ? '' : 's'} reference a trigger no app emits, so {counts.unrunnable === 1 ? 'it' : 'they'} can never fire. Open one to pick a real trigger.
        </Banner>
      )}

      <div className="workflow-toolbar">
        {/* ── filter pills ── */}
        <div className="workflow-filter-group">
          <SingleSelectFilter
            label="App"
            value={app}
            onChange={v => setApp(v ?? '__all__')}
            options={appOptions}
          />
          <SingleSelectFilter
            label="Status"
            value={status}
            onChange={v => setStatus(v ?? 'ALL')}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'PAUSED', label: 'Paused' },
            ]}
          />
          <SingleSelectFilter label="Activity" value={activity} onChange={v => setActivity(v ?? 'ALL')} options={[{value:'ALL',label:'All'},{value:'never',label:'Never run'},{value:'ran',label:'Has runs'},{value:'recent',label:'Last 30 days'},{value:'unrunnable',label:'Cannot run'}]} />
          <SingleSelectFilter label="Sort" value={sort} onChange={v => setSort(v ?? 'updated')} options={[{value:'updated',label:'Recently updated'},{value:'name',label:'Name'},{value:'runs',label:'Most runs'},{value:'lastRun',label:'Last run'}]} />
        </div>

        {/* ── search – grows to fill available space ── */}
        <div className="workflow-search">
          <SearchToolbar search={q} onSearch={setQ} placeholder="Search workflows" />
        </div>

        {(app !== '__all__' || status !== 'ALL' || activity !== 'ALL' || q) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
        )}

        {/* ── pagination – pushed to far right ── */}
        {!loading && visible.length > 0 && (
          <div className="workflow-pagination">
            <div className="workflow-toolbar-sep" />
            <span className="workflow-count" aria-live="polite">
              {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visible.length)} of {visible.length}
            </span>
            <SingleSelectFilter label="Per page" value={String(pageSize)} onChange={v => setPageSize(Number(v ?? 5))} options={[5, 10, 20].map(n => ({value: String(n), label: String(n)}))} />
            <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">
              <Icon name="chevronLeft" size={14} />
            </Button>
            <span className="workflow-page-label">Page {currentPage} of {pages}</span>
            <Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page">
              <Icon name="chevronRight" size={14} />
            </Button>
          </div>
        )}
      </div>

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {loading && <SectionLoading />}
      {!loading && visible.length === 0 && (
        <Card className="workflow-empty"><FeaturedIcon><Icon name="gitBranch" size={24} /></FeaturedIcon><h2>{workflows.length ? 'No matching workflows' : 'Build your first workflow'}</h2><p>{workflows.length ? 'Try a different search or status.' : 'Choose an event, connect actions, and review the flow before activating it.'}</p><Button variant="outline" onClick={() => workflows.length ? clearFilters() : navigate('/studio/new')}>{workflows.length ? 'Clear filters' : 'Create workflow'}</Button></Card>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {paged.map(w => {
          const trig = triggerById.get(w.trigger_event);
          return (
            <Card key={w.id}
              className="workflow-list-item"
            >
              <div className="studio-workflow-item-header">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tip label={w.supersedes_subscriber ? `Activating stands down the ${w.supersedes_subscriber} code subscriber` : 'Toggle workflow status'}><div onClick={e => e.stopPropagation()}>
                    <Switch aria-label={`Activate ${w.name}`} checked={w.status === 'ACTIVE'} disabled={busyId === w.id || !trig} onCheckedChange={v => toggle(w, v)} />
                  </div></Tip>
                  <button className="workflow-name" onClick={() => navigate(`/studio/w/${w.id}${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`)} data-ui-native-button="">{w.name}</button>
                  <Badge variant={w.status === 'ACTIVE' ? 'success' : w.status === 'PAUSED' ? 'warning' : 'gray'}>{w.status}</Badge>
                  {!trig && <Badge variant="error">Trigger not registered</Badge>}
                  {w.supersedes_subscriber && <Badge variant="info">Replaces code</Badge>}
                </div>
              </div>

              {w.description && (
                <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {w.description}
                </div>
              )}

              <div className="studio-workflow-item-meta">
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{trig ? `${trig.appName} · ${trig.label}` : w.trigger_event}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>
                    {w.run_count} run{w.run_count === 1 ? '' : 's'}
                    {w.last_run_at ? ` · ${new Date(w.last_run_at).toLocaleDateString()}` : ' · never run'}
                  </span>
                  <Button variant="outline" onClick={() => navigate(`/studio/w/${w.id}${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`)}>Open<Icon name="arrowRight" size={16} /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
