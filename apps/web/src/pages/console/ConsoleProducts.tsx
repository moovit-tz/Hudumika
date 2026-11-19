import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { CompanyAvatar } from '../../components/PersonAvatar.js';
import { apiFetch } from '../../lib/api.js';
import { LoadState, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, KpiGrid, KpiLink, Notice, Panel, Pill, TD, TR, appName } from './console-ui.js';

export function ConsoleProducts() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/products');
  const items: any[] = data?.items ?? [];
  const sum = (k: string) => items.reduce((s, p) => s + (Number(p[k]) || 0), 0);
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Products']} titlePlain="Product" titleEm="health" subtitle="Products in your scope, their open work and the teams that cover them." />
      <LoadState loading={loading} error={error} onRetry={reload}>
        <KpiGrid>
          <KpiLink title="Products" value={String(items.length)} icon="package" color="var(--teal)" hint="In your scope" />
          <KpiLink to="/console/cases?queue=all" title="Open cases" value={String(sum('openCases'))} icon="inbox" color="var(--blue)" hint="Across these products" />
          <KpiLink to="/console/cases?tab=incidents" title="Active incidents" value={String(sum('activeIncidents'))} icon="alertTriangle" color={sum('activeIncidents') ? 'var(--red)' : 'var(--ink3)'} hint="Declared and not resolved" />
          <KpiLink title="In maintenance" value={String(items.filter(p => p.status === 'maintenance').length)} icon="shield" color="var(--gold)" hint="Declared by an operator" />
        </KpiGrid>
        <Panel title="Products" sub="Open a product to see its affected customers, incidents and cases" icon="package" flush>
          {items.length ? (
            <DataTable headers={['Product', 'Status', 'Open cases', 'Active incidents', 'Teams']}>
              {items.map((p: any) => (
                <TR key={p.app} onClick={() => navigate(`/console/products/${p.app}`)}>
                  <TD><Link to={`/console/products/${p.app}`} onClick={e => e.stopPropagation()}><span className="console-cell-title">{appName(p.app)}</span></Link></TD>
                  <TD nowrap>{p.status === 'maintenance' ? <Pill kind="health" value="maintenance" /> : <span style={{ color: 'var(--ink3)', textTransform: 'capitalize' }}>{p.status ?? '—'}</span>}</TD>
                  <TD>{p.openCases ? <strong>{p.openCases}</strong> : <span style={{ color: 'var(--ink3)' }}>0</span>}</TD>
                  <TD>{p.activeIncidents ? <strong style={{ color: 'var(--red)' }}>{p.activeIncidents}</strong> : <span style={{ color: 'var(--ink3)' }}>0</span>}</TD>
                  <TD>{p.teams.length ? p.teams.map((t: any) => t.name).join(', ') : <span style={{ color: 'var(--ink3)' }}>No team</span>}</TD>
                </TR>
              ))}
            </DataTable>
          ) : <Empty icon="package" title="No products are assigned to you">An Operations Manager adds products to your teams.</Empty>}
        </Panel>
      </LoadState>
    </div>
  );
}

const INCIDENT_STEPS: [string, string][] = [['investigating', 'Investigating'], ['identified', 'Identified'], ['monitoring', 'Monitoring'], ['resolved', 'Resolved']];

export function ConsoleProductDetail() {
  const { app } = useParams();
  const { me } = useStaff();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/products/${app}`);
  const [summary, setSummary] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = async (label: string, fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); setMsg({ ok: true, text: label }); reload(); } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'That did not work.' }); } };
  const name = appName(app);
  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && <div className="console-page">
        <PageHeader crumbs={['Console', 'Products', name]} titlePlain={name} titleEm="operations" subtitle="Customers affected, incidents and cases for this product — the same records as each customer’s profile." />
        <Notice msg={msg} />
        <KpiGrid>
          <KpiLink title="Affected customers" value={String(data.affectedCustomers.length)} icon="building" color="var(--teal)" hint="With open cases or incidents" />
          <KpiLink title="Open cases" value={String(data.cases.filter((c: any) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length)} icon="inbox" color="var(--blue)" hint="On this product in your scope" />
          <KpiLink title="Active incidents" value={String(data.incidents.filter((i: any) => i.status !== 'resolved').length)} icon="alertTriangle" color="var(--red)" hint="Not yet resolved" />
        </KpiGrid>

        <Panel title="Incidents" sub="A customer-facing summary is shown to customers only after it is approved" icon="alertTriangle">
          {data.incidents.length ? data.incidents.map((i: any) => (
            <article key={i.id} className="console-stack" style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div className="console-row">
                <Pill kind="severity" value={i.severity} /><Pill kind="incident" value={i.status} />
                <span className="console-cell-title grow">{i.title}</span>
                <span className="console-muted"><span className="console-mono">{i.ref}</span> · started {fmtRel(i.started_at)}</span>
              </div>
              <div className="console-muted">Customers: {i.customers.length ? i.customers.map((c: any) => c.name).join(', ') : 'none linked'}</div>
              {hasPerm(me, 'incidents.manage') && (
                <div className="console-stack" style={{ gap: 8 }}>
                  <Textarea rows={2} aria-label={`Customer-facing summary for ${i.ref}`} placeholder="Customer-facing summary (needs approval before customers see it)" value={summary[i.id] ?? i.public_summary ?? ''} onChange={e => setSummary({ ...summary, [i.id]: e.target.value })} />
                  <div className="console-row">
                    <Button size="sm" variant="outline" onClick={() => act('Summary saved.', () => apiFetch(`/v1/staff/incidents/${i.id}`, { method: 'PATCH', body: JSON.stringify({ public_summary: summary[i.id] ?? i.public_summary ?? null }) }))}>Save summary</Button>
                    <Button size="sm" variant="outline" disabled={!i.public_summary || !!i.public_summary_approved_at} onClick={() => act('Summary approved for customers.', () => apiFetch(`/v1/staff/incidents/${i.id}/approve-summary`, { method: 'POST', body: '{}' }))}>{i.public_summary_approved_at ? 'Summary approved' : 'Approve summary'}</Button>
                    <span className="grow" />
                    <Select value={i.status} onValueChange={s => act('Incident updated.', () => apiFetch(`/v1/staff/incidents/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: s }) }))}>
                      <SelectTrigger aria-label={`Status of ${i.ref}`} style={{ width: 170 }}><SelectValue /></SelectTrigger>
                      <SelectContent>{INCIDENT_STEPS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </article>
          )) : <Empty icon="checkCircle" title="No incidents on this product" />}
        </Panel>

        <div className="console-two">
          <Panel title="Affected customers" sub="Customers in your scope with open work here" icon="building" flush>
            {data.affectedCustomers.length ? (
              <ul className="console-list">
                {data.affectedCustomers.map((c: any) => (
                  <li key={c.tenant_id}>
                    <CompanyAvatar name={c.name} logoUrl={c.logo_url} size={28} />
                    <div className="console-list-main"><Link to={`/console/customers/${c.tenant_id}`}><div className="console-list-title">{c.name}</div></Link><div className="console-list-meta">{c.openCases} open case{c.openCases === 1 ? '' : 's'}{c.incidents ? ` · ${c.incidents} incident(s)` : ''}</div></div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon="building" title="No affected customers">No customers in your scope have cases or incidents on this product.</Empty>}
          </Panel>
          <Panel title="Cases" sub="On this product, in your scope" icon="inbox" flush>
            {data.cases.length ? (
              <DataTable headers={['Case', 'Customer', 'Status', 'Owner']}>
                {data.cases.map((c: any) => (
                  <TR key={c.id} onClick={() => navigate(`/console/cases/${c.id}`)}>
                    <TD style={{ minWidth: 180 }}><div className="console-cell-title">{c.subject}</div><div className="console-cell-sub console-mono">{c.ref_number}</div></TD>
                    <TD>{c.customer_name}</TD>
                    <TD nowrap><Pill kind="status" value={c.status} /></TD>
                    <TD nowrap>{c.owner_name ?? <span style={{ color: 'var(--ink3)' }}>Unassigned</span>}</TD>
                  </TR>
                ))}
              </DataTable>
            ) : <Empty icon="inbox" title="No cases on this product" />}
          </Panel>
        </div>
      </div>}
    </LoadState>
  );
}
