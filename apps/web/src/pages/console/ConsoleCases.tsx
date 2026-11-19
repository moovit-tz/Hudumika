import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { LoadState, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, KpiGrid, KpiLink, Notice, Panel, Pill, TD, TR, appName } from './console-ui.js';

const isOpen = (s: string) => s === 'OPEN' || s === 'IN_PROGRESS';

/** The SLA cell: what is due next, or why nothing is. */
function SlaCell({ c }: { c: any }) {
  if (!isOpen(c.status)) return <Pill kind="outcome" value={c.customer_outcome ?? 'pending'} />;
  if (c.sla?.paused) return <Pill kind="sla" value="paused" />;
  if (c.sla?.overdue) return <Pill kind="sla" value="breached" />;
  const due = c.first_response_at ? c.resolution_due_at : c.first_response_due_at;
  return <span className="console-cell-sub" style={{ fontSize: 'var(--text-sm, 12px)' }}>{c.first_response_at ? 'Resolve' : 'Respond'} {fmtRel(due)}</span>;
}

export function CaseTable({ items, onClaimed, emptyTitle = 'No cases here', emptyText }: { items: any[]; onClaimed?: () => void; emptyTitle?: string; emptyText?: string }) {
  const { me } = useStaff();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const claim = async (c: any) => {
    setBusy(c.id); setMsg(null);
    try { await apiFetch(`/v1/staff/cases/${c.id}/claim`, { method: 'POST', body: JSON.stringify({ version: c.version }) }); setMsg({ ok: true, text: `${c.ref_number} is now yours.` }); }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Could not claim.' }); }
    finally { setBusy(null); onClaimed?.(); }
  };
  if (!items.length) return <Empty icon="inbox" title={emptyTitle}>{emptyText}</Empty>;
  return (
    <div className="console-stack">
      <Notice msg={msg} />
      <DataTable headers={['Case', 'Customer', 'Product', 'Priority', 'Owner', 'SLA', '']}>
        {items.map(c => (
          <TR key={c.id} onClick={() => navigate(`/console/cases/${c.id}`)}>
            <TD style={{ minWidth: 260 }}>
              <div className="console-cell-main">
                <div style={{ minWidth: 0 }}>
                  <Link to={`/console/cases/${c.id}`} onClick={e => e.stopPropagation()} className="console-cell-title" style={{ textDecoration: 'none', color: 'var(--ink)' }}>{c.subject}</Link>
                  <div className="console-cell-sub">
                    <span className="console-mono">{c.ref_number}</span> · <Pill kind="status" value={c.status} /> · {c.team_name ?? 'No team'} · opened {fmtRel(c.created_at)}
                    {c.escalated ? <> · <strong style={{ color: 'var(--red)' }}>Escalated</strong></> : null}
                  </div>
                </div>
              </div>
            </TD>
            <TD>
              <Link to={`/console/customers/${c.tenant_id}`} onClick={e => e.stopPropagation()} className="console-cell-main" style={{ textDecoration: 'none' }}>
                <CompanyAvatar name={c.customer_name} logoUrl={c.customer_logo_url} size={26} />
                <span className="console-cell-title" style={{ fontWeight: 500 }}>{c.customer_name}</span>
              </Link>
            </TD>
            <TD nowrap>{c.app ? <Link to={`/console/products/${c.app}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--ink)' }}>{appName(c.app)}</Link> : '—'}</TD>
            <TD nowrap><div className="console-row" style={{ gap: 6 }}><Pill kind="priority" value={c.priority} /><Pill kind="severity" value={c.severity} /></div></TD>
            <TD nowrap>{c.owner_user_id
              ? <span className="console-cell-main"><PersonAvatar userId={c.owner_user_id} name={c.owner_name ?? '—'} src={c.owner_avatar_url} size={24} /><span>{c.owner_name}</span></span>
              : <span style={{ color: 'var(--ink3)' }}>Unassigned</span>}</TD>
            <TD nowrap><SlaCell c={c} /></TD>
            <TD right nowrap>
              {!c.owner_user_id && hasPerm(me, 'cases.claim') && isOpen(c.status) && (
                <Button size="sm" variant="outline" loading={busy === c.id} onClick={e => { e.stopPropagation(); claim(c); }}>Claim</Button>
              )}
            </TD>
          </TR>
        ))}
      </DataTable>
    </div>
  );
}

const QUEUES = [
  { value: 'all', label: 'All open' }, { value: 'team', label: 'My teams' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'onboarding', label: 'Onboarding' },
  { value: 'escalated', label: 'Escalations' }, { value: 'overdue', label: 'Overdue' }, { value: 'awaiting_outcome', label: 'Confirm outcome' }, { value: 'incidents', label: 'Incident cases' },
];

export function ConsoleCases() {
  const { me } = useStaff();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'incidents' && hasPerm(me, 'incidents.view') ? 'incidents' : hasPerm(me, 'cases.view') ? 'cases' : 'incidents';
  const queue = params.get('queue') ?? 'all';
  const search = params.get('q') ?? '';
  const [q, setQ] = useState(search);
  const set = (k: string, v: string | null) => setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  // Search applies after a short pause in typing.
  useEffect(() => { const t = setTimeout(() => { if (q !== search) set('q', q.trim() || null); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = tab === 'cases' ? `/v1/staff/cases?${new URLSearchParams({ queue, ...(search ? { q: search } : {}) })}` : null;
  const cases = useStaffData<any>(path);
  const overview = useStaffData<any>(tab === 'cases' && hasPerm(me, 'overview.platform', 'overview.operations') ? '/v1/staff/overview' : null);
  const k = overview.data?.cases;
  const queueLabel = QUEUES.find(x => x.value === queue)?.label ?? 'Cases';
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Cases & Incidents']} titlePlain="Cases &" titleEm="incidents"
        subtitle="Customer cases and product incidents in your scope."
        actions={tab === 'cases' && hasPerm(me, 'cases.export') ? <Button variant="outline" onClick={() => apiDownload(`/v1/staff/cases/export?queue=${queue}`, 'cases.csv')}>Export CSV</Button> : undefined} />
      {hasPerm(me, 'cases.view') && hasPerm(me, 'incidents.view') && (
        <Tabs value={tab} onValueChange={v => set('tab', v)}>
          <TabsList>
            <TabsTrigger value="cases"><span className="ds-tabs-trigger-label">Cases</span></TabsTrigger>
            <TabsTrigger value="incidents"><span className="ds-tabs-trigger-label">Incidents</span></TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {tab === 'cases' ? (
        <>
          {k && (
            <KpiGrid>
              <KpiLink to="/console/cases?queue=all" title="Open cases" value={String(k.open)} icon="inbox" color="var(--teal)" hint="Open or in progress" />
              <KpiLink to="/console/cases?queue=unassigned" title="Unassigned" value={String(k.unassigned)} icon="userPlus" color="var(--gold)" hint="Waiting for an owner" />
              <KpiLink to="/console/cases?queue=overdue" title="Overdue" value={String(k.overdue)} icon="clock" color="var(--red)" hint="Past a response or resolution due time" />
              <KpiLink to="/console/cases?queue=awaiting_outcome" title="Confirm outcome" value={String(k.awaiting_outcome)} icon="checkCircle" color="var(--green)" hint="Resolved, customer outcome not yet confirmed" />
            </KpiGrid>
          )}
          <SearchToolbar
            search={q} onSearch={setQ} placeholder="Search reference, subject or customer…"
            quickFilter={{ label: 'Queue', allLabel: 'All open', value: queue === 'all' ? null : queue, options: QUEUES.filter(x => x.value !== 'all'), onChange: v => set('queue', v ?? 'all'), columns: 2 }}
          />
          <Panel title={queueLabel} sub={cases.data?.items ? `${cases.data.items.length} case${cases.data.items.length === 1 ? '' : 's'}${search ? ` matching “${search}”` : ''}` : undefined} icon="inbox" flush>
            <LoadState loading={cases.loading} error={cases.error} onRetry={cases.reload}>
              <CaseTable items={cases.data?.items ?? []} onClaimed={() => { cases.reload(); overview.reload(); }}
                emptyTitle={search ? 'No matching cases' : 'This queue is clear'} emptyText={search ? 'Try a different reference, subject or customer.' : 'No cases in this queue for your scope.'} />
            </LoadState>
          </Panel>
        </>
      ) : <Incidents />}
    </div>
  );
}

export function ConsoleMyWork() {
  const { me } = useStaff();
  const mine = useStaffData<any>('/v1/staff/cases?queue=mine');
  const team = useStaffData<any>(me?.teams.length ? '/v1/staff/cases?queue=team' : null);
  const reassign = useStaffData<any>(hasPerm(me, 'cases.assign') ? '/v1/staff/work/needs-reassignment' : null);
  const mineItems: any[] = mine.data?.items ?? [];
  const teamUnassigned = (team.data?.items ?? []).filter((c: any) => !c.owner_user_id);
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'My Work']} titlePlain="My" titleEm="work"
        subtitle={me?.teams.length ? `Your teams: ${me.teams.map(t => t.name).join(', ')}` : 'You are not on a team yet — ask an Operations Manager to add you.'} />
      <KpiGrid>
        <KpiLink title="Assigned to me" value={mine.loading ? '…' : String(mineItems.length)} icon="userCheck" color="var(--teal)" hint="Open cases you own" />
        <KpiLink title="Overdue" value={mine.loading ? '…' : String(mineItems.filter(c => c.sla?.overdue).length)} icon="clock" color="var(--red)" hint="Of the cases you own" />
        <KpiLink title="Waiting on customer" value={mine.loading ? '…' : String(mineItems.filter(c => c.sla?.paused).length)} icon="messageSquare" color="var(--gold)" hint="SLA paused until they reply" />
        {me?.teams.length ? <KpiLink to="/console/cases?queue=team" title="Unclaimed in my teams" value={team.loading ? '…' : String(teamUnassigned.length)} icon="inbox" color="var(--blue)" hint="Ready to claim" /> : null}
      </KpiGrid>
      <Panel title="Assigned to me" sub="Your open cases, most urgent first" icon="userCheck" flush>
        <LoadState loading={mine.loading} error={mine.error} onRetry={mine.reload}>
          <CaseTable items={mineItems} onClaimed={mine.reload} emptyTitle="Nothing assigned to you" emptyText="Claim a case from your teams’ queue below." />
        </LoadState>
      </Panel>
      {me?.teams.length ? (
        <Panel title="My teams’ queue" sub="Open cases routed to your teams" icon="users" flush>
          <LoadState loading={team.loading} error={team.error} onRetry={team.reload}>
            <CaseTable items={team.data?.items ?? []} onClaimed={() => { team.reload(); mine.reload(); }} emptyTitle="Your teams’ queues are clear" />
          </LoadState>
        </Panel>
      ) : null}
      {hasPerm(me, 'cases.assign') && (
        <Panel title="Needs reassignment" sub="Open work whose owner is no longer available" icon="alertTriangle" flush>
          <LoadState loading={reassign.loading} error={reassign.error} onRetry={reassign.reload}>
            {(reassign.data?.items ?? []).length ? (
              <ul className="console-list">
                {reassign.data.items.map((c: any) => (
                  <li key={c.id}>
                    <div className="console-list-main">
                      <Link to={`/console/cases/${c.id}`}><div className="console-list-title">{c.subject}</div></Link>
                      <div className="console-list-meta"><span className="console-mono">{c.ref_number}</span> · {c.owner_name} — {c.reason}</div>
                    </div>
                    <Button asChild size="sm" variant="outline"><Link to={`/console/cases/${c.id}`}>Reassign</Link></Button>
                  </li>
                ))}
              </ul>
            ) : <Empty icon="checkCircle" title="No stranded work">Every open case has an available owner.</Empty>}
          </LoadState>
        </Panel>
      )}
    </div>
  );
}

function Incidents() {
  const { me } = useStaff();
  const navigate = useNavigate();
  const inc = useStaffData<any>('/v1/staff/incidents');
  const products = useStaffData<any>(hasPerm(me, 'incidents.manage') ? '/v1/staff/products' : null);
  const [form, setForm] = useState({ app_id: '', title: '', severity: 'S2' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const declare = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    try { await apiFetch('/v1/staff/incidents', { method: 'POST', body: JSON.stringify(form) }); setForm({ app_id: '', title: '', severity: 'S2' }); setOpen(false); setMsg({ ok: true, text: 'Incident declared.' }); inc.reload(); }
    catch (x: any) { setMsg({ ok: false, text: x?.message ?? 'Could not declare the incident.' }); }
  };
  const items: any[] = inc.data?.items ?? [];
  const productList: string[] = (products.data?.items ?? []).map((p: any) => p.app);
  return (
    <div className="console-stack">
      <Notice msg={msg} />
      {hasPerm(me, 'incidents.manage') && open && (
        <Panel title="Declare an incident" sub="Affected customers are found from the product’s active subscriptions" icon="alertTriangle"
          action={<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}>
          <form className="console-form" onSubmit={declare}>
            <div className="console-fields">
              <label>Product
                <Select value={form.app_id} onValueChange={v => setForm({ ...form, app_id: v })}>
                  <SelectTrigger aria-label="Product"><SelectValue placeholder="Choose a product" /></SelectTrigger>
                  <SelectContent>{productList.map(a => <SelectItem key={a} value={a}>{appName(a)}</SelectItem>)}</SelectContent>
                </Select>
              </label>
              <label>Severity
                <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}>
                  <SelectTrigger aria-label="Severity"><SelectValue /></SelectTrigger>
                  <SelectContent>{['S1', 'S2', 'S3', 'S4'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </label>
            </div>
            <label>What is happening<Input required minLength={3} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Declarations failing to submit" /></label>
            <div><Button type="submit" disabled={!form.app_id}>Declare incident</Button></div>
          </form>
        </Panel>
      )}
      <Panel title="Incidents" sub={`${items.length} in your products`} icon="alertTriangle" flush
        action={hasPerm(me, 'incidents.manage') && !open ? <Button size="sm" onClick={() => setOpen(true)}>Declare incident</Button> : undefined}>
        <LoadState loading={inc.loading} error={inc.error} onRetry={inc.reload}>
          {items.length ? (
            <DataTable headers={['Incident', 'Product', 'Status', 'Customers', 'Open cases', 'Customer summary']}>
              {items.map((i: any) => (
                <TR key={i.id} onClick={() => navigate(`/console/products/${i.app_id}`)}>
                  <TD style={{ minWidth: 240 }}>
                    <div className="console-cell-title">{i.title}</div>
                    <div className="console-cell-sub"><span className="console-mono">{i.ref}</span> · started {fmtRel(i.started_at)}{i.owner_name ? ` · ${i.owner_name}` : ''}</div>
                  </TD>
                  <TD nowrap>{appName(i.app_id)}</TD>
                  <TD nowrap><div className="console-row" style={{ gap: 6 }}><Pill kind="severity" value={i.severity} /><Pill kind="incident" value={i.status} /></div></TD>
                  <TD>{i.customers}</TD><TD>{i.open_cases}</TD>
                  <TD nowrap>{i.public_summary ? (i.public_summary_approved_at ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Approved</span> : <span className="console-muted">Draft, not approved</span>) : <span className="console-muted">None</span>}</TD>
                </TR>
              ))}
            </DataTable>
          ) : <Empty icon="checkCircle" title="No incidents">Nothing is declared for your products.</Empty>}
        </LoadState>
      </Panel>
    </div>
  );
}
