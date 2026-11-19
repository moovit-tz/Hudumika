import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Button } from '../../components/ui/button.js';
import { LoadState, fmtDate, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, KpiGrid, KpiLink, Panel, Pill, TD, TR, appName } from './console-ui.js';

const DELIVERY_LABEL: Record<string, string> = { email: 'Email', zentraEvents: 'Zentra events', studioEvents: 'Studio events', lensEvents: 'Lens events' };

export function ConsoleOverview() {
  const { me } = useStaff();
  const [params, setParams] = useSearchParams();
  const canHealth = hasPerm(me, 'monitoring.view');
  const canOps = hasPerm(me, 'overview.platform', 'overview.operations', 'security.view', 'billing.view');
  const view = params.get('view') === 'health' && canHealth ? 'health' : canOps ? 'summary' : canHealth ? 'health' : 'summary';
  const platform = hasPerm(me, 'overview.platform');
  const first = (me?.name ?? '').split(' ')[0];
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Overview']} titlePlain={view === 'health' ? 'Service' : platform ? 'Platform' : 'Operations'} titleEm={view === 'health' ? 'health' : 'overview'}
        subtitle={view === 'health' ? 'Observed product health, deliveries, jobs and changes — with what each number does and does not cover.' : `${first ? `Welcome back, ${first}. ` : ''}Work and customers across your scope.`}
        actions={platform && me?.tools.includes('platform-dashboard') && view !== 'health' ? <Button asChild variant="outline"><Link to="/console/overview/platform">Revenue & growth dashboard</Link></Button> : undefined} />
      {canOps && canHealth && (
        <Tabs value={view} onValueChange={v => setParams(p => { const n = new URLSearchParams(p); n.set('view', v); return n; }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="summary"><span className="ds-tabs-trigger-label">Summary</span></TabsTrigger>
            <TabsTrigger value="health"><span className="ds-tabs-trigger-label">Service health</span></TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {view === 'health' ? <ServiceHealth /> : <Summary />}
    </div>
  );
}

function Summary() {
  const { me } = useStaff();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/overview');
  const k = data?.cases;
  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && <>
        {k && (
          <KpiGrid>
            <KpiLink to="/console/cases?queue=all" title="Open cases" value={String(k.open)} icon="inbox" color="var(--teal)" hint="Open or in progress in your scope" />
            <KpiLink to="/console/cases?queue=unassigned" title="Unassigned" value={String(k.unassigned)} icon="userPlus" color="var(--gold)" hint="Waiting for an owner" />
            <KpiLink to="/console/cases?queue=overdue" title="Overdue" value={String(k.overdue)} icon="clock" color={k.overdue ? 'var(--red)' : 'var(--ink3)'} hint="Past a response or resolution due time" />
            <KpiLink to="/console/cases?queue=escalated" title="Escalated" value={String(k.escalated)} icon="alertTriangle" color={k.escalated ? 'var(--red)' : 'var(--ink3)'} hint="Flagged for attention" />
            {hasPerm(me, 'work.own') && <KpiLink to="/console/my-work" title="Assigned to me" value={String(k.mine)} icon="userCheck" color="var(--blue)" hint="Your open cases" />}
            <KpiLink to="/console/cases?queue=awaiting_outcome" title="Confirm outcome" value={String(k.awaiting_outcome)} icon="checkCircle" color="var(--green)" hint="Resolved, customer outcome not yet confirmed" />
          </KpiGrid>
        )}
        {(data.customers || data.platform) && (
          <KpiGrid>
            {data.customers && <KpiLink to="/console/customers" title="Customers" value={String(data.customers.customers)} icon="building" color="var(--teal)" hint={`${data.customers.active} active`} />}
            {data.platform && <KpiLink title="Active users" value={String(data.platform.users)} icon="users" color="var(--blue)" hint="Across all customer workspaces" />}
            {data.platform && <KpiLink to="/console/products" title="Products" value={String(data.platform.products)} icon="package" color="var(--gold)" hint="On the platform" />}
          </KpiGrid>
        )}
        {Array.isArray(data.incidents) && (
          <Panel title="Active incidents" sub="Declared incidents on products in your scope" icon="alertTriangle" flush
            action={hasPerm(me, 'incidents.view') ? <Button asChild size="sm" variant="outline"><Link to="/console/cases?tab=incidents">All incidents</Link></Button> : undefined}>
            {data.incidents.length ? (
              <DataTable headers={['Incident', 'Product', 'Severity', 'Status', 'Started']}>
                {data.incidents.map((i: any) => (
                  <TR key={i.id} onClick={() => navigate(`/console/products/${i.app_id}`)}>
                    <TD style={{ minWidth: 220 }}><div className="console-cell-title">{i.title}</div><div className="console-cell-sub console-mono">{i.ref}</div></TD>
                    <TD nowrap>{appName(i.app_id)}</TD>
                    <TD nowrap><Pill kind="severity" value={i.severity} /></TD>
                    <TD nowrap><Pill kind="incident" value={i.status} /></TD>
                    <TD nowrap>{fmtRel(i.started_at)}</TD>
                  </TR>
                ))}
              </DataTable>
            ) : <Empty icon="checkCircle" title="No active incidents">Nothing is declared on your products.</Empty>}
          </Panel>
        )}
      </>}
    </LoadState>
  );
}

function ServiceHealth() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/monitoring');
  const apps: any[] = data?.apps ?? [];
  const count = (s: string) => apps.filter(a => a.state === s).length;
  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && <>
        <KpiGrid>
          <KpiLink title="Healthy" value={String(count('healthy'))} icon="checkCircle" color="var(--green)" hint="Traffic in the last hour, no server errors" />
          <KpiLink title="Degraded" value={String(count('degraded'))} icon="alertTriangle" color={count('degraded') ? 'var(--gold)' : 'var(--ink3)'} hint="Some server errors in the last hour" />
          <KpiLink title="Unavailable" value={String(count('unavailable'))} icon="alertCircle" color={count('unavailable') ? 'var(--red)' : 'var(--ink3)'} hint="Mostly failing in the last hour" />
          <KpiLink title="Unknown" value={String(count('unknown'))} icon="clock" color="var(--ink3)" hint="No traffic to judge from" />
        </KpiGrid>
        <Panel title="Products" sub="Last hour · maintenance is shown as declared, never as a health reading" icon="activity" flush>
          <DataTable headers={['Product', 'State', 'Requests', 'Server errors', 'Client errors', 'p95', 'Last request']}>
            {apps.map((a: any) => (
              <TR key={a.app} onClick={() => navigate(`/console/products/${a.app}`)}>
                <TD nowrap><span className="console-cell-title">{appName(a.app)}</span></TD>
                <TD nowrap><Pill kind="health" value={a.state} /></TD>
                <TD>{a.requests1h}</TD>
                <TD>{a.serverErrors1h ? <strong style={{ color: 'var(--red)' }}>{a.serverErrors1h}</strong> : 0}</TD>
                <TD>{a.clientErrors1h}</TD>
                <TD nowrap>{a.p95Ms == null ? '—' : `${a.p95Ms} ms`}</TD>
                <TD nowrap>{fmtRel(a.lastRequestAt)}</TD>
              </TR>
            ))}
          </DataTable>
        </Panel>
        <div className="console-two">
          <Panel title="Deliveries" sub="Last 24 hours" icon="send" flush>
            <ul className="console-list">
              {Object.entries(data.deliveries).map(([k, v]: any) => (
                <li key={k}><div className="console-list-main"><div className="console-list-title">{DELIVERY_LABEL[k] ?? k}</div></div>
                  {v ? <span className="console-muted"><strong style={{ color: v.failed ? 'var(--red)' : 'var(--ink2)' }}>{v.failed} failed</strong> · {v.pending} pending</span> : <span className="console-muted">Not measured</span>}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Background jobs" sub="Last 24 hours" icon="layers" flush>
            <ul className="console-list">
              {data.jobs.durable.length ? data.jobs.durable.map((j: any) => (
                <li key={j.job_type}><div className="console-list-main"><div className="console-list-title console-mono">{j.job_type}</div></div><span className="console-muted"><strong style={{ color: j.failed ? 'var(--red)' : 'var(--ink2)' }}>{j.failed} failed</strong> · {j.pending} pending</span></li>
              )) : <li><span className="console-muted">No durable jobs in the window.</span></li>}
              <li><span className="console-muted">{data.jobs.scheduler}</span></li>
            </ul>
          </Panel>
          <Panel title="Recent deployments" sub="Releases recorded in Lens" icon="package" flush>
            {data.deployments.length ? (
              <ul className="console-list">
                {data.deployments.map((d: any) => <li key={d.id}><div className="console-list-main"><div className="console-list-title">{d.version} {d.title}</div><div className="console-list-meta">{fmtDate(d.released_at)}</div></div><span className="console-muted" style={{ textTransform: 'capitalize' }}>{d.status}</span></li>)}
              </ul>
            ) : <Empty icon="package" title="No releases recorded in Lens" />}
          </Panel>
          <Panel title="Configuration changes" sub="Recent platform setting changes" icon="settings" flush>
            {data.configChanges.length ? (
              <ul className="console-list">
                {data.configChanges.map((c: any) => <li key={c.id}><div className="console-list-main"><div className="console-list-title">{c.action} {c.target_name ?? ''}</div><div className="console-list-meta">{c.actor_name} · {fmtRel(c.created_at)}</div></div></li>)}
              </ul>
            ) : <Empty icon="settings" title="No recorded configuration changes" />}
          </Panel>
        </div>
        <Panel title="What these numbers mean" sub="Definition, source, window, refresh and coverage for every metric above" icon="fileText" flush>
          <DataTable headers={['Metric', 'Definition', 'Source', 'Window', 'Coverage']}>
            {data.definitions.map((d: any) => (
              <TR key={d.metric}>
                <TD nowrap><strong>{d.metric}</strong></TD>
                <TD style={{ minWidth: 220 }}>{d.definition}</TD>
                <TD><span className="console-cell-sub">{d.source}</span></TD>
                <TD nowrap>{d.window}<div className="console-cell-sub">refresh {d.refresh}</div></TD>
                <TD style={{ minWidth: 200 }}><span className="console-cell-sub">{d.coverage}</span></TD>
              </TR>
            ))}
          </DataTable>
        </Panel>
      </>}
    </LoadState>
  );
}
