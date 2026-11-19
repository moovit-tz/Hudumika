/**
 * Controlled customer access: a dedicated request page (not a modal) and the
 * records view for an active session. The session acts as the staff member;
 * every read and change is checked and logged by the API.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Textarea } from '../../components/ui/textarea.js';
import { Checkbox } from '../../components/ui/checkbox.js';
import { Switch } from '../../components/ui/switch.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { AccessDenied, LoadState, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, Facts, Notice, Panel, TD, TR, appName } from './console-ui.js';

export function ConsoleAccessNew() {
  const { me, reload } = useStaff();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tenant = params.get('tenant') ?? '';
  const caseId = params.get('case');
  const customer = useStaffData<any>(tenant && hasPerm(me, 'customers.view') ? `/v1/staff/customers/${tenant}` : null);
  const [form, setForm] = useState({ purpose: '', minutes: '30', app: params.get('app') ?? 'all', read: true, configure: false });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!hasPerm(me, 'access.request')) return <AccessDenied what="customer access sessions" />;
  if (!tenant) return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Request access']} titlePlain="Request customer" titleEm="access" />
      <Panel title="Choose a customer first" icon="building"><Empty icon="building" title="No customer selected">Start from a customer or a case.</Empty>
        <div><Button asChild variant="outline"><Link to="/console/customers">Go to customers</Link></Button></div></Panel>
    </div>
  );
  const c = customer.data?.customer;
  const own = customer.data?.ownership;
  const max = own?.max_session_minutes ?? 60;
  const products: string[] = (customer.data?.products ?? []).filter((p: any) => p.entitled).map((p: any) => p.app);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      const s = await apiFetch('/v1/staff/access-sessions', { method: 'POST', body: JSON.stringify({ tenant_id: tenant, app_id: form.app === 'all' ? null : form.app, actions: [form.read && 'read', form.configure && 'configure'].filter(Boolean), purpose: form.purpose, minutes: Number(form.minutes), ...(caseId ? { case_id: caseId } : {}) }) });
      await reload();
      navigate(s.status === 'active' ? `/console/access/${s.id}` : `/console/customers/${tenant}`);
    } catch (x: any) { setMsg({ ok: false, text: x?.message ?? 'Could not open the session.' }); } finally { setBusy(false); }
  };
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Customers', c?.name ?? 'Customer', 'Request access']} titlePlain="Request customer" titleEm="access"
        subtitle={c ? <span className="console-row"><CompanyAvatar name={c.name} logoUrl={c.logo_url} size={20} /><strong style={{ color: 'var(--ink2)' }}>{c.name}</strong>{caseId ? <span>· for a linked case</span> : null}</span> : undefined} />
      <div className="console-main-side">
        <Panel title="What you need" sub="Logged with your name and purpose" icon="key">
          <form className="console-stack" onSubmit={submit}>
            <label className="console-field">Purpose<Textarea required minLength={5} rows={3} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="What and why" /></label>
            <div className="console-fields">
              <label className="console-field">Product
                <Select value={form.app} onValueChange={v => setForm({ ...form, app: v })}>
                  <SelectTrigger aria-label="Product"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products in your scope</SelectItem>
                    {(products.length ? products : form.app !== 'all' ? [form.app] : []).map(a => <SelectItem key={a} value={a}>{appName(a)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="console-field">Minutes (up to {max})<Input type="number" min={5} max={max} required value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} /></label>
            </div>
            <fieldset className="console-stack" style={{ border: 0, padding: 0, margin: 0, gap: 10 }}>
              <legend className="console-field" style={{ marginBottom: 8 }}>Allowed actions</legend>
              <label className="console-row" style={{ fontSize: 'var(--text-base, 13px)', color: 'var(--ink)' }}><Checkbox aria-label="Read records" checked={form.read} onCheckedChange={v => setForm({ ...form, read: !!v })} />Read records</label>
              <label className="console-row" style={{ fontSize: 'var(--text-base, 13px)', color: 'var(--ink)' }}><Checkbox aria-label="Change product configuration" checked={form.configure} onCheckedChange={v => setForm({ ...form, configure: !!v })} />Change product configuration</label>
            </fieldset>
            <Notice msg={msg} />
            <div className="console-row">
              <Button type="submit" loading={busy} disabled={!form.read && !form.configure}>{own?.standing_authorization ? 'Open session' : 'Send request'}</Button>
              <Button asChild variant="outline"><Link to={caseId ? `/console/cases/${caseId}` : `/console/customers/${tenant}`}>Cancel</Link></Button>
            </div>
          </form>
        </Panel>
        <Panel title="How this works" icon="shield">
          <div className="console-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <Icon name={own?.standing_authorization ? 'checkCircle' : 'clock'} size={16} color={own?.standing_authorization ? 'var(--green)' : 'var(--gold)'} />
            <span style={{ fontSize: 'var(--text-base, 13px)' }}>{own?.standing_authorization
              ? 'Standing authorization: starts at once.'
              : 'Starts when the customer approves it.'}</span>
          </div>
          <ul className="console-muted" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>You act as yourself — never as a customer user.</li>
            <li>A banner shows the time left.</li>
            <li>Ends on expiry, when you end it, or when it is revoked.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function ConsoleAccessRecords() {
  const { id } = useParams();
  const { me, reload: reloadMe } = useStaff();
  const s = me?.activeAccessSession;
  const live = s && s.id === id && s.status === 'active';
  const users = useStaffData<any[]>(live && s.actions.includes('read') ? `/v1/staff/access-sessions/${id}/records/users` : null);
  const apps = useStaffData<Record<string, boolean>>(live && s.actions.includes('read') ? `/v1/staff/access-sessions/${id}/records/apps` : null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!live) return (
    <div className="console-page">
      <Panel title="Access session not active" icon="key">
        <Empty icon="key" title="This session is not active">Ended, expired, revoked or awaiting approval.</Empty>
        <div><Button asChild variant="outline"><Link to="/console">Back to the console</Link></Button></div>
      </Panel>
    </div>
  );
  const toggle = async (app: string, enabled: boolean) => {
    setMsg(null);
    try { await apiFetch(`/v1/staff/access-sessions/${id}/records/apps/${app}`, { method: 'PUT', body: JSON.stringify({ enabled }) }); setMsg({ ok: true, text: `${appName(app)} ${enabled ? 'enabled' : 'disabled'} — recorded under your name.` }); apps.reload(); }
    catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'Not allowed.' }); reloadMe(); }
  };
  const appEntries = Object.entries(apps.data ?? {});
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Access session', s.tenantName]} titlePlain={s.tenantName} titleEm="records" />
      <Panel title="Session" icon="key">
        <Facts items={[['Customer', s.tenantName], ['Product', s.appId ? appName(s.appId) : 'All products in your scope'], ['Allowed', s.actions.join(' + ')], ['Expires', fmtRel(s.expiresAt)], ['Purpose', s.purpose]]} />
      </Panel>
      <Notice msg={msg} />
      <div className="console-two">
        <Panel title="Product switches" sub={s.actions.includes('configure') ? 'You may change these during this session' : 'Read-only in this session'} icon="package" flush>
          <LoadState loading={apps.loading} error={apps.error} onRetry={apps.reload}>
            {appEntries.length ? (
              <ul className="console-list">
                {appEntries.map(([app, on]) => (
                  <li key={app}>
                    <div className="console-list-main"><div className="console-list-title">{appName(app)}</div></div>
                    {s.actions.includes('configure')
                      ? <Switch aria-label={`${appName(app)} enabled`} checked={on} onCheckedChange={v => toggle(app, v)} />
                      : <span style={{ fontWeight: 700, fontSize: 'var(--text-xs, 11px)', color: on ? 'var(--green)' : 'var(--ink3)' }}>{on ? 'On' : 'Off'}</span>}
                  </li>
                ))}
              </ul>
            ) : <Empty icon="package" title="No product overrides">The plan decides which products are on.</Empty>}
          </LoadState>
        </Panel>
        <Panel title="Workspace users" sub="Read-only" icon="users" flush>
          <LoadState loading={users.loading} error={users.error} onRetry={users.reload}>
            {(users.data ?? []).length ? (
              <DataTable headers={['User', 'Role', 'Status', 'Last sign-in']}>
                {(users.data ?? []).map((u: any) => (
                  <TR key={u.id}>
                    <TD><span className="console-cell-main"><PersonAvatar userId={u.id} name={u.name} src={u.avatar_url} size={26} /><span style={{ minWidth: 0 }}><span className="console-cell-title">{u.name}</span><div className="console-cell-sub">{u.email}</div></span></span></TD>
                    <TD nowrap>{u.role}</TD>
                    <TD nowrap>{u.active === false ? <span style={{ color: 'var(--ink3)' }}>Deactivated</span> : <span style={{ color: 'var(--green)' }}>Active</span>}</TD>
                    <TD nowrap>{fmtRel(u.last_login_at)}</TD>
                  </TR>
                ))}
              </DataTable>
            ) : <Empty icon="users" title="No users" />}
          </LoadState>
        </Panel>
      </div>
    </div>
  );
}
