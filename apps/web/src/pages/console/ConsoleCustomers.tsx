import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Switch } from '../../components/ui/switch.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { apiFetch, apiDownload } from '../../lib/api.js';
import { LoadState, fmtDate, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, Facts, KpiGrid, KpiLink, Notice, Panel, Pill, TD, TR, appName } from './console-ui.js';

const PAGE = 50;

export function ConsoleCustomers() {
  const { me } = useStaff();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const [q, setQ] = useState(search);
  const mine = params.get('mine') === '1';
  const offset = Number(params.get('offset') ?? 0);
  const qs = new URLSearchParams({ ...(search ? { q: search } : {}), ...(mine ? { mine: '1' } : {}), offset: String(offset), limit: String(PAGE) });
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/customers?${qs}`);
  const set = (k: string, v: string | null) => setParams(p => { const n = new URLSearchParams(p); if (v === null) n.delete(k); else n.set(k, v); if (k !== 'offset') n.delete('offset'); return n; }, { replace: true });
  useEffect(() => { const t = setTimeout(() => { if (q.trim() !== search) set('q', q.trim() || null); }, 350); return () => clearTimeout(t); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const items: any[] = data?.items ?? [];
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Customers']} titlePlain={mine ? 'My' : 'Customer'} titleEm={mine ? 'customers' : 'profiles'}
        subtitle={mine ? 'Customers you own or back up.' : 'Every customer in your scope, with its owner and open work.'}
        actions={hasPerm(me, 'customers.export') ? <Button variant="outline" onClick={() => apiDownload(`/v1/staff/customers/export?${qs}`, 'customers.csv')}>Export CSV</Button> : undefined} />
      <SearchToolbar search={q} onSearch={setQ} placeholder="Search customers…"
        quickFilter={{ label: 'Show', allLabel: 'All in my scope', value: mine ? 'mine' : null, options: [{ value: 'mine', label: 'Only customers I own' }], onChange: v => set('mine', v ? '1' : null) }} />
      <Panel title={mine ? 'Customers I own' : 'Customers'} sub={loading ? undefined : `Showing ${items.length ? `${offset + 1}–${offset + items.length}` : 0}${search ? ` matching “${search}”` : ''}`} icon="building" flush
        action={(offset > 0 || data?.hasMore) ? <div className="console-row">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => set('offset', String(Math.max(0, offset - PAGE)))}>Previous</Button>
          <Button size="sm" variant="outline" disabled={!data?.hasMore} onClick={() => set('offset', String(offset + PAGE))}>Next</Button>
        </div> : undefined}>
        <LoadState loading={loading} error={error} onRetry={reload}>
          {items.length ? (
            <DataTable headers={['Customer', 'Plan', 'Owner', 'Open cases', 'Customer since']}>
              {items.map((c: any) => (
                <TR key={c.id} onClick={() => navigate(`/console/customers/${c.id}`)}>
                  <TD style={{ minWidth: 220 }}>
                    <div className="console-cell-main">
                      <CompanyAvatar name={c.name} logoUrl={c.logo_url} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/console/customers/${c.id}`} onClick={e => e.stopPropagation()}><div className="console-cell-title">{c.name}</div></Link>
                        <div className="console-cell-sub">{c.active ? 'Active' : <span style={{ color: 'var(--red)' }}>Suspended</span>}</div>
                      </div>
                    </div>
                  </TD>
                  <TD nowrap><span style={{ textTransform: 'capitalize' }}>{c.plan ?? '—'}</span></TD>
                  <TD nowrap>{c.owner_user_id ? <span className="console-cell-main"><PersonAvatar userId={c.owner_user_id} name={c.owner_name} src={c.owner_avatar_url} size={24} />{c.owner_name}</span> : <span style={{ color: 'var(--ink3)' }}>No owner</span>}</TD>
                  <TD>{c.open_cases ? <strong>{c.open_cases}</strong> : <span style={{ color: 'var(--ink3)' }}>0</span>}</TD>
                  <TD nowrap>{fmtDate(c.created_at).split(',')[0]}</TD>
                </TR>
              ))}
            </DataTable>
          ) : <Empty icon="building" title={mine ? 'You do not own any customers yet' : search ? 'No matching customers' : 'No customers in your scope'}>
            {mine ? 'Ownership is set on each customer’s profile.' : search ? 'Try a different name.' : 'Your teams and assignments do not cover any customer yet.'}
          </Empty>}
        </LoadState>
      </Panel>
    </div>
  );
}

export function ConsoleCustomerProfile() {
  const { id } = useParams();
  const { me } = useStaff();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/customers/${id}`);
  const staff = useStaffData<any>(hasPerm(me, 'customers.manage') && hasPerm(me, 'staff.view') ? '/v1/staff/staff' : null);
  const [edit, setEdit] = useState<{ owner: string; backup: string; reason: string; standing?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    if (!edit) return; setMsg(null); setSaving(true);
    try {
      await apiFetch(`/v1/staff/customers/${id}/ownership`, { method: 'PUT', body: JSON.stringify({ owner_user_id: edit.owner === 'none' ? null : edit.owner, backup_owner_user_id: edit.backup === 'none' ? null : edit.backup, reason: edit.reason, ...(edit.standing !== undefined && hasPerm(me, 'access.approve') ? { standing_authorization: edit.standing } : {}) }) });
      setEdit(null); setMsg({ ok: true, text: 'Ownership updated.' }); reload();
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Could not save.' }); } finally { setSaving(false); }
  };
  const staffOptions: [string, string][] = [['none', 'Nobody'], ...((staff.data?.items ?? []).filter((s: any) => s.status === 'active').map((s: any) => [s.user_id, s.name] as [string, string]))];
  const own = data?.ownership;
  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && <div className="console-page">
        <PageHeader crumbs={['Console', 'Customers', data.customer.name]} titlePlain={data.customer.name}
          subtitle={<span className="console-row">
            <CompanyAvatar name={data.customer.name} logoUrl={data.customer.logo_url} size={22} />
            <span style={{ textTransform: 'capitalize' }}>{data.customer.plan} plan</span><span aria-hidden>·</span>
            <span style={{ color: data.customer.active ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{data.customer.active ? 'Active' : 'Suspended'}</span><span aria-hidden>·</span>
            <span>Business verification {String(data.customer.kyb_status ?? 'unknown').replace(/_/g, ' ')}</span>
          </span>}
          actions={hasPerm(me, 'access.request') ? <Button variant="outline" asChild><Link to={`/console/access/new?tenant=${data.customer.id}`}>Request customer access</Link></Button> : undefined} />
        <Notice msg={msg} />

        <KpiGrid>
          <KpiLink title="Open cases" value={String(data.cases.filter((c: any) => c.status === 'OPEN' || c.status === 'IN_PROGRESS').length)} icon="inbox" color="var(--teal)" hint={`${data.cases.length} you can see in total`} />
          <KpiLink title="Products entitled" value={String(data.products.filter((p: any) => p.entitled).length)} icon="package" color="var(--blue)" hint={`${data.products.filter((p: any) => p.activated).length} activated`} />
          <KpiLink title="Onboarding" value={String(data.onboarding.checkpoints.length)} icon="checkCircle" color="var(--green)" hint={`setup steps done · ${data.onboarding.openOnboardingCases} open onboarding case(s)`} />
          <KpiLink title="Email (7 days)" value={String(data.integrations.email7d.failed)} icon="alertTriangle" color={data.integrations.email7d.failed ? 'var(--red)' : 'var(--ink3)'} hint={`failed · ${data.integrations.email7d.pending} pending`} />
        </KpiGrid>

        <div className="console-two">
          <Panel title="Ownership & teams" icon="userCheck"
            action={hasPerm(me, 'customers.manage') && !edit ? <Button size="sm" variant="outline" onClick={() => setEdit({ owner: own?.owner_user_id ?? 'none', backup: own?.backup_owner_user_id ?? 'none', reason: '', standing: own?.standing_authorization ?? false })}>Change</Button> : undefined}>
            {edit ? (
              <form className="console-stack" onSubmit={e => { e.preventDefault(); save(); }}>
                <div className="console-fields">
                  <label className="console-field">Owner<Select value={edit.owner} onValueChange={v => setEdit({ ...edit, owner: v })}><SelectTrigger aria-label="Owner"><SelectValue /></SelectTrigger><SelectContent>{staffOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></label>
                  <label className="console-field">Backup owner<Select value={edit.backup} onValueChange={v => setEdit({ ...edit, backup: v })}><SelectTrigger aria-label="Backup owner"><SelectValue /></SelectTrigger><SelectContent>{staffOptions.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></label>
                </div>
                {hasPerm(me, 'access.approve') && (
                  <label className="console-row" style={{ fontSize: 'var(--text-base, 13px)', color: 'var(--ink2)', fontWeight: 500 }}>
                    <Switch checked={!!edit.standing} onCheckedChange={v => setEdit({ ...edit, standing: v })} aria-label="Standing authorization" />
                    Standing authorization — staff access sessions start without asking the customer each time
                  </label>
                )}
                <label className="console-field">Reason for the change<Input required minLength={3} value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} placeholder="Reason" /></label>
                <div className="console-row"><Button type="submit" size="sm" loading={saving}>Save</Button><Button size="sm" variant="outline" type="button" onClick={() => setEdit(null)}>Cancel</Button></div>
              </form>
            ) : (
              <Facts items={[
                ['Owner', own?.owner_user_id ? <><PersonAvatar userId={own.owner_user_id} name={own.owner_name} src={own.owner_avatar_url} size={22} />{own.owner_name}</> : <span style={{ color: 'var(--ink3)' }}>No owner</span>],
                ['Backup', own?.backup_owner_user_id ? <><PersonAvatar userId={own.backup_owner_user_id} name={own.backup_name} src={own.backup_avatar_url} size={22} />{own.backup_name}</> : <span style={{ color: 'var(--ink3)' }}>None</span>],
                ['Teams', data.teams.length ? data.teams.map((t: any) => t.name).join(', ') : <span style={{ color: 'var(--ink3)' }}>None</span>],
                ['Staff access', `${own?.standing_authorization ? 'Standing authorization' : 'Customer approves each time'} · up to ${own?.max_session_minutes ?? 60} min`],
              ]} />
            )}
          </Panel>

          <Panel title="Contacts" sub="Escalation order" icon="users" flush>
            {data.contacts.length ? (
              <ul className="console-list">
                {data.contacts.map((c: any) => (
                  <li key={c.id}>
                    <PersonAvatar userId={c.user_id} kind="contacts" name={c.name} size={30} />
                    <div className="console-list-main"><div className="console-list-title">{c.name}</div><div className="console-list-meta">{String(c.contact_role ?? '').replace(/_/g, ' ')}{c.escalation_order ? ` · escalation #${c.escalation_order}` : ''}</div></div>
                    <span className="console-muted" style={{ overflowWrap: 'anywhere' }}>{c.email ?? c.phone ?? ''}</span>
                  </li>
                ))}
              </ul>
            ) : <Empty icon="users" title="No contacts recorded" />}
          </Panel>
        </div>

        <Panel title="Products" icon="package" flush
          sub="Health is from the last 24 hours">
          <DataTable headers={['Product', 'Entitled', 'Activated', 'Health (24 h)', 'Requests (24 h)']}>
            {data.products.map((p: any) => (
              <TR key={p.app} onClick={() => navigate(`/console/products/${p.app}`)}>
                <TD><span className="console-cell-title">{appName(p.app)}</span></TD>
                <TD nowrap>{p.entitled === null ? <span style={{ color: 'var(--ink3)' }}>{p.maintenance ? 'In maintenance' : 'Unknown'}</span> : p.entitled ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>Yes</span> : <span style={{ color: 'var(--ink3)' }}>No</span>}</TD>
                <TD nowrap>{p.activated ? <>Yes <span className="console-muted">· last {p.lastActivePeriod}</span></> : <span style={{ color: 'var(--ink3)' }}>Not yet</span>}</TD>
                <TD nowrap><Pill kind="health" value={p.health} /></TD>
                <TD nowrap>{p.requests24h}{p.serverErrors24h ? <span style={{ color: 'var(--red)' }}> · {p.serverErrors24h} errors</span> : null}</TD>
              </TR>
            ))}
          </DataTable>
        </Panel>

        <Panel title="Cases" icon="inbox" flush>
          {data.cases.length ? (
            <DataTable headers={['Case', 'Product', 'Status', 'Priority', 'Owner', 'Opened']}>
              {data.cases.map((c: any) => (
                <TR key={c.id} onClick={() => navigate(`/console/cases/${c.id}`)}>
                  <TD style={{ minWidth: 220 }}><div className="console-cell-title">{c.subject}</div><div className="console-cell-sub console-mono">{c.ref_number}</div></TD>
                  <TD nowrap>{appName(c.app)}</TD>
                  <TD nowrap><Pill kind="status" value={c.status} /></TD>
                  <TD nowrap><Pill kind="priority" value={c.priority} /></TD>
                  <TD nowrap>{c.owner_name ?? <span style={{ color: 'var(--ink3)' }}>Unassigned</span>}</TD>
                  <TD nowrap>{fmtRel(c.created_at)}</TD>
                </TR>
              ))}
            </DataTable>
          ) : <Empty icon="inbox" title="No cases you can see" />}
        </Panel>

        <div className="console-two">
          <Panel title="Billing" icon="creditCard" flush>
            {data.billing.restricted ? <Empty icon="lock" title="Billing not visible" /> : (
              (data.billing.subscriptions.length || data.billing.invoices.length) ? (
                <ul className="console-list">
                  {data.billing.subscriptions.map((s: any) => <li key={s.id}><div className="console-list-main"><div className="console-list-title">{s.commercial_product_id}</div><div className="console-list-meta">Subscription</div></div><Pill kind="active" value={String(s.status === 'active')} /></li>)}
                  {data.billing.invoices.map((i: any) => <li key={i.id}><div className="console-list-main"><div className="console-list-title">{i.invoice_number}</div><div className="console-list-meta">{i.plan_code} · period from {String(i.period_start).slice(0, 10)}</div></div><strong>{i.currency} {Number(i.amount).toLocaleString()}</strong></li>)}
                </ul>
              ) : <Empty icon="creditCard" title="No subscription records" />
            )}
          </Panel>
          <Panel title="Staff access history" icon="key" flush>
            {(data.accessSessions.length || data.history.length) ? (
              <ul className="console-list">
                {data.accessSessions.map((s: any) => (
                  <li key={s.id}>
                    <PersonAvatar name={s.staff_name} src={s.staff_avatar_url} size={28} />
                    <div className="console-list-main"><div className="console-list-title">{s.staff_name}</div><div className="console-list-meta">{s.purpose} · {fmtDate(s.starts_at ?? s.expires_at)}</div></div>
                    <Pill kind="session" value={s.status} />
                  </li>
                ))}
                {data.history.map((h: any) => (
                  <li key={h.id}><div className="console-list-main"><div className="console-list-title" style={{ textTransform: 'capitalize' }}>{h.action.replace(/_/g, ' ')}</div><div className="console-list-meta">{h.reason ? `${h.reason} · ` : ''}{fmtDate(h.created_at)}</div></div></li>
                ))}
              </ul>
            ) : <Empty icon="key" title="No history yet" />}
          </Panel>
        </div>
      </div>}
    </LoadState>
  );
}
