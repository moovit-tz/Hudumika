import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon.js';
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
  return (
    <div className="console-page console-overview">
      <PageHeader crumbs={['Console', 'Overview']} titlePlain={view === 'health' ? 'Service' : platform ? 'Platform' : 'Operations'} titleEm={view === 'health' ? 'health' : 'overview'}
        actions={platform && me?.tools.includes('platform-dashboard') && view !== 'health' ? (
          <Button asChild variant="ghost" size="xs">
            <Link to="/console/overview/platform">Revenue &amp; growth <Icon name="arrowRight" size={14} /></Link>
          </Button>
        ) : undefined} />
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

function QueueLink({ to, queue, label, value, icon }: {
  to?: string; queue?: string; label: string; value: number; icon: IconName;
}) {
  return (
    <Link className="overview-queue" to={to ?? `/console/cases?queue=${queue}`}>
      <Icon name={icon} size={16} /><span>{label}</span><strong>{value}</strong><Icon name="chevronRight" size={14} />
    </Link>
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
          <div className="overview-work">
            <section className="card overview-focus">
              <h2><Icon name="inbox" size={20} /> Open cases</h2>
              <strong className="overview-total">{k.open}</strong>
              <p>Open or in progress in your scope</p>
              <Button asChild variant="outline"><Link to="/console/cases?queue=open">View case queue <Icon name="arrowRight" size={14} /></Link></Button>
            </section>
            <Panel title="Case queues" icon="layers" flush>
              <QueueLink queue="overdue" label="Overdue" value={k.overdue} icon="clock" />
              <QueueLink queue="unassigned" label="Unassigned" value={k.unassigned} icon="userPlus" />
              <QueueLink queue="escalated" label="Escalated" value={k.escalated} icon="alertTriangle" />
              <QueueLink queue="awaiting_outcome" label="Awaiting outcome confirmation" value={k.awaiting_outcome} icon="checkCircle" />
              {hasPerm(me, 'work.own') && <QueueLink to="/console/my-work" label="Assigned to me" value={k.mine} icon="userCheck" />}
            </Panel>
          </div>
        )}
        {(data.customers || data.platform) && (
          <KpiGrid>
            {data.customers && <KpiLink to="/console/customers" title="Customers" value={String(data.customers.customers)} icon="building" color="var(--teal)" hint={`${data.customers.active} active`} />}
            {data.platform && <KpiLink title="Active users" value={String(data.platform.users)} icon="users" color="var(--blue)" hint="All workspaces" />}
            {data.platform && <KpiLink to="/console/products" title="Products" value={String(data.platform.products)} icon="package" color="var(--gold)" hint="On the platform" />}
          </KpiGrid>
        )}
        {Array.isArray(data.incidents) && (
          <Panel title="Active incidents" icon="alertTriangle" flush
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
          <KpiLink title="Healthy" value={String(count('healthy'))} icon="checkCircle" color="var(--green)" hint="Last hour" />
          <KpiLink title="Degraded" value={String(count('degraded'))} icon="alertTriangle" color={count('degraded') ? 'var(--gold)' : 'var(--ink3)'} hint="Last hour" />
          <KpiLink title="Unavailable" value={String(count('unavailable'))} icon="alertCircle" color={count('unavailable') ? 'var(--red)' : 'var(--ink3)'} hint="Last hour" />
          {count('maintenance') > 0 && <KpiLink title="Maintenance" value={String(count('maintenance'))} icon="tool" color="var(--blue)" hint="Declared maintenance" />}
          <KpiLink title="Unknown" value={String(count('unknown'))} icon="clock" color="var(--ink3)" hint="No traffic to judge from" />
        </KpiGrid>
        <Panel title="Products" sub="Last hour" icon="activity" flush>
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
          <Panel title="Recent deployments" sub="From Lens" icon="package" flush>
            {data.deployments.length ? (
              <ul className="console-list">
                {data.deployments.map((d: any) => <li key={d.id}><div className="console-list-main"><div className="console-list-title">{d.version} {d.title}</div><div className="console-list-meta">{fmtDate(d.released_at)}</div></div><span className="console-muted" style={{ textTransform: 'capitalize' }}>{d.status}</span></li>)}
              </ul>
            ) : <Empty icon="package" title="No releases recorded in Lens" />}
          </Panel>
          <Panel title="Configuration changes" icon="settings" flush>
            {data.configChanges.length ? (
              <ul className="console-list">
                {data.configChanges.map((c: any) => <li key={c.id}><div className="console-list-main"><div className="console-list-title">{c.action} {c.target_name ?? ''}</div><div className="console-list-meta">{c.actor_name} · {fmtRel(c.created_at)}</div></div></li>)}
              </ul>
            ) : <Empty icon="settings" title="No recorded configuration changes" />}
          </Panel>
        </div>
        <Panel title="What these numbers mean" icon="fileText" flush>
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
