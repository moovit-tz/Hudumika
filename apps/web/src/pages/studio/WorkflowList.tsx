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
import { Input } from '../../components/ui/input.js';
import { SingleSelectFilter } from '../../components/ui/filter-dropdown.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import type { WorkflowStudioApp, WorkflowStudioTriggerDef, WorkflowStudioActionDef } from '@hudumika/types';
import { PageHeader } from '../../components/PageHeader.js';

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
  const scopeApp = params.get('app');
  const returnTo = params.get('return');

  const [workflows, setWorkflows] = useState<WorkflowStudioApp[]>([]);
  const [triggers, setTriggers] = useState<WorkflowStudioTriggerDef[]>([]);
  const [actions, setActions] = useState<WorkflowStudioActionDef[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('ALL');
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
    if (scopeApp && !appsTouched.get(w.id)?.has(scopeApp)) return false;
    if (status !== 'ALL' && w.status !== status) return false;
    if (q && !`${w.name} ${w.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [workflows, scopeApp, status, q, appsTouched]);

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
    <div className="studio-tile studio-tile-row">
      <FeaturedIcon variant={tone} size="sm"><Icon name={tone === 'error' ? 'alertCircle' : 'zap'} size={15} /></FeaturedIcon>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--ink3)' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <PageHeader
            crumbs={['Studio', 'Studio']}
            titlePlain="Workflow"
            titleEm="automations"
            subtitle={<>{scopeApp
              ? <>Automations belonging to <strong>{scopeApp}</strong>. <a href="/studio" style={{ color: 'var(--teal)' }}>Show every app</a>.</>
              : 'Every automation across the platform — what fires it, what it does, and whether it ran.'}</>}
          />
        </div>
        {returnTo && (
          <Button type="button" variant="outline" size="sm" onClick={() => navigate(returnTo)}>
            <Icon name="arrowLeft" size={13} /> Back
          </Button>
        )}
      </div>

      <div className="studio-tiles">
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

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: '1 1 260px' }}>
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search workflows…" />
        </div>
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
      </div>

      {error && <Banner variant="error" className="mb-3">{error}</Banner>}
      {loading && <SectionLoading />}
      {!loading && visible.length === 0 && (
        <div style={{ padding: 36, textAlign: 'center', color: 'var(--ink3)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12 }}>
          No workflows match.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map(w => {
          const trig = triggerById.get(w.trigger_event);
          return (
            <div key={w.id}
              className="studio-card-interactive studio-workflow-item-mobile"
              style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card-bg, var(--white))', cursor: 'pointer' }}
              onClick={() => navigate(`/studio/w/${w.id}${returnTo ? `?return=${encodeURIComponent(returnTo)}` : ''}`)}
            >
              <div className="studio-workflow-item-header">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div onClick={e => e.stopPropagation()} title={w.supersedes_subscriber ? `Activating stands down the ${w.supersedes_subscriber} code subscriber` : undefined}>
                    <Switch checked={w.status === 'ACTIVE'} disabled={busyId === w.id || !trig} onCheckedChange={v => toggle(w, v)} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{w.name}</span>
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
                  <Icon name="arrowRight" size={14} color="var(--ink3)" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
