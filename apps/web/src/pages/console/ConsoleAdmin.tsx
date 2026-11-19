import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Switch } from '../../components/ui/switch.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar, CompanyAvatar } from '../../components/PersonAvatar.js';
import { apiDownload, apiFetch } from '../../lib/api.js';
import { LoadState, fmtDate, fmtRel, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, Facts, KpiGrid, KpiLink, Notice, Panel, Pill, TD, TR, appName } from './console-ui.js';

type Msg = { ok: boolean; text: string } | null;
function useAct(reload: () => unknown) {
  const [msg, setMsg] = useState<Msg>(null);
  const act = async (fn: () => Promise<unknown>, ok = 'Saved.') => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); reload(); return true; } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'That did not work.' }); return false; }
  };
  return { msg, act };
}

// ── Identity & Security ───────────────────────────────────────────────────
export function ConsoleSecurity() {
  const { me } = useStaff();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/security');
  const { msg, act } = useAct(reload);
  const mfaOn = data?.staffMfa?.filter((s: any) => s.mfa).length ?? 0;
  const activeSessions = (data?.accessSessions ?? []).filter((s: any) => s.status === 'active' || s.status === 'pending_approval');
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Identity & Security']} titlePlain="Identity &" titleEm="security"
        subtitle="Staff sign-in posture, customer access sessions and recent sign-in events." />
      <Notice msg={msg} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && <>
          <KpiGrid>
            {data.staffMfa && <KpiLink title="Staff with 2FA" value={`${mfaOn} / ${data.staffMfa.length}`} icon="shield" color={mfaOn === data.staffMfa.length ? 'var(--green)' : 'var(--gold)'} hint="Active staff with two-factor sign-in" />}
            {data.staffSessions && <KpiLink title="Staff sessions" value={String(data.staffSessions.length)} icon="key" color="var(--teal)" hint="Signed-in staff devices" />}
            {data.accessSessions && <KpiLink title="Customer access open" value={String(activeSessions.length)} icon="eye" color={activeSessions.length ? 'var(--gold)' : 'var(--ink3)'} hint="Active or awaiting the customer’s approval" />}
            {data.authEvents && <KpiLink title="Sign-in events" value={String(data.authEvents.length)} icon="activity" color="var(--blue)" hint="Last 7 days, your customers" />}
          </KpiGrid>

          {data.accessSessions && (
            <Panel title="Customer access sessions" sub="Staff acting inside a customer’s records — always as themselves, always logged" icon="eye" flush>
              {data.accessSessions.length ? (
                <DataTable headers={['Staff', 'Customer', 'Scope', 'Purpose', 'Status', '']}>
                  {data.accessSessions.map((s: any) => (
                    <TR key={s.id}>
                      <TD nowrap><span className="console-cell-main"><PersonAvatar name={s.staff_name} src={s.staff_avatar_url} size={26} />{s.staff_name}</span></TD>
                      <TD><Link to={`/console/customers/${s.tenant_id}`} style={{ color: 'var(--ink)', fontWeight: 600 }}>{s.customer_name}</Link></TD>
                      <TD nowrap>{s.app_id ? appName(s.app_id) : 'All products'}<div className="console-cell-sub" style={{ textTransform: 'capitalize' }}>{s.actions.join(' + ')}</div></TD>
                      <TD style={{ minWidth: 180 }}>{s.purpose}<div className="console-cell-sub">{s.basis === 'standing_authorization' ? 'Standing authorization' : 'Customer approval'}</div></TD>
                      <TD nowrap><Pill kind="session" value={s.status} /><div className="console-cell-sub">{s.ended_at ? `ended ${fmtRel(s.ended_at)}` : `expires ${fmtRel(s.expires_at)}`}</div></TD>
                      <TD right nowrap>{['active', 'pending_approval'].includes(s.status) && hasPerm(me, 'access.oversee') && <Button size="sm" variant="outline" onClick={() => act(() => apiFetch(`/v1/staff/access-sessions/${s.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'Revoked by security' }) }), 'Access session revoked.')}>Revoke</Button>}</TD>
                    </TR>
                  ))}
                </DataTable>
              ) : <Empty icon="eye" title="No access sessions" />}
            </Panel>
          )}

          {data.staffMfa && (
            <div className="console-two">
              <Panel title="Two-factor coverage" sub={`${mfaOn} of ${data.staffMfa.length} active staff`} icon="shield" flush>
                <ul className="console-list">
                  {data.staffMfa.map((s: any) => (
                    <li key={s.user_id}><PersonAvatar userId={s.user_id} name={s.name} size={28} /><div className="console-list-main"><div className="console-list-title">{s.name}</div></div>
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-xs, 11px)', color: s.mfa ? 'var(--green)' : 'var(--gold)' }}>{s.mfa ? '2FA on' : 'No 2FA'}</span></li>
                  ))}
                </ul>
              </Panel>
              <Panel title="Staff sign-in sessions" sub="Revoking signs that device out" icon="key" flush>
                {data.staffSessions.length ? (
                  <ul className="console-list">
                    {data.staffSessions.map((d: any) => (
                      <li key={d.id}>
                        <PersonAvatar userId={d.user_id} name={d.name} size={28} />
                        <div className="console-list-main"><div className="console-list-title">{d.name}</div><div className="console-list-meta">{d.device_label} · used {fmtRel(d.last_used_at)}</div></div>
                        {hasPerm(me, 'security.revoke') && <Button size="sm" variant="outline" aria-label={`Revoke session of ${d.name}`} onClick={() => act(() => apiFetch(`/v1/staff/security/sessions/${d.id}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'Revoked from the staff console' }) }), 'Session revoked.')}>Revoke</Button>}
                      </li>
                    ))}
                  </ul>
                ) : <Empty icon="key" title="No active sessions" />}
              </Panel>
            </div>
          )}

          {data.authEvents && (
            <Panel title="Sign-in events" sub="Last 7 days, customers in your scope" icon="activity" flush>
              {data.authEvents.length ? (
                <DataTable headers={['Event', 'User', 'When']}>
                  {data.authEvents.map((e: any) => (
                    <TR key={e.id}><TD><span style={{ textTransform: 'capitalize' }}>{e.event_type.replace(/_/g, ' ')}</span></TD><TD>{e.user_name ?? <span style={{ color: 'var(--ink3)' }}>Unknown user</span>}</TD><TD nowrap>{fmtDate(e.created_at)}</TD></TR>
                  ))}
                </DataTable>
              ) : <Empty icon="activity" title="No sign-in events" />}
            </Panel>
          )}
        </>}
      </LoadState>
    </div>
  );
}

// ── Billing ───────────────────────────────────────────────────────────────
export function ConsoleBilling() {
  const { me } = useStaff();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/billing');
  const invoices: any[] = data?.invoices ?? [];
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Billing & Subscriptions']} titlePlain="Billing" titleEm="overview"
        subtitle="Plans across your customers and recent subscription invoices. Subscriptions, packages and transactions are under this section in the sidebar."
        actions={<div className="console-row">
          {hasPerm(me, 'billing.export') && <Button variant="outline" onClick={() => apiDownload('/v1/staff/billing/export', 'subscription-invoices.csv')}>Export CSV</Button>}
          {me?.tools.includes('subscriptions') && <Button asChild><Link to="/console/billing/subscriptions">Manage subscriptions</Link></Button>}
        </div>} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && <>
          <KpiGrid>
            {data.plans.map((p: any) => <KpiLink key={p.plan} title={String(p.plan ?? 'No plan')} value={String(p.customers)} icon="creditCard" color="var(--teal)" hint="customers on this plan" />)}
          </KpiGrid>
          <Panel title="Recent subscription invoices" sub={`${invoices.length} in your scope`} icon="fileText" flush>
            {invoices.length ? (
              <DataTable headers={['Invoice', 'Customer', 'Plan', 'Amount', 'Period from']}>
                {invoices.map((i: any) => (
                  <TR key={i.id} onClick={() => navigate(`/console/customers/${i.tenant_id}`)}>
                    <TD nowrap><span className="console-mono">{i.invoice_number}</span></TD>
                    <TD><span className="console-cell-main"><CompanyAvatar name={i.customer_name} size={24} /><span className="console-cell-title" style={{ fontWeight: 500 }}>{i.customer_name}</span></span></TD>
                    <TD nowrap>{i.plan_code}</TD>
                    <TD nowrap><strong>{i.currency} {Number(i.amount).toLocaleString()}</strong></TD>
                    <TD nowrap>{String(i.period_start).slice(0, 10)}</TD>
                  </TR>
                ))}
              </DataTable>
            ) : <Empty icon="fileText" title="No subscription invoices in your scope" />}
          </Panel>
        </>}
      </LoadState>
    </div>
  );
}

// ── Reports & Audit ───────────────────────────────────────────────────────
export function ConsoleAudit() {
  const { me } = useStaff();
  const [action, setAction] = useState('');
  const [applied, setApplied] = useState('');
  useEffect(() => { const t = setTimeout(() => setApplied(action.trim()), 400); return () => clearTimeout(t); }, [action]);
  const qs = applied ? `?action=${encodeURIComponent(applied)}` : '';
  const { data, loading, error, reload } = useStaffData<any>(`/v1/staff/audit${qs}`);
  const staffActions: any[] = data?.staffActions ?? [];
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Reports & Audit']} titlePlain="Audit" titleEm="history"
        subtitle="Every consequential staff action — who, what, for which customer, why and with what result. Sensitive fields are redacted."
        actions={hasPerm(me, 'audit.export') ? <Button variant="outline" onClick={() => apiDownload(`/v1/staff/audit/export${qs}`, 'staff-audit.csv')}>Export CSV</Button> : undefined} />
      <SearchToolbar search={action} onSearch={setAction} placeholder="Filter by action, e.g. staff. or access. or platform_admin."
        quickFilter={{ label: 'Area', allLabel: 'All actions', value: ['staff.', 'access.', 'case.', 'platform_admin.'].includes(applied) ? applied : null,
          options: [{ value: 'staff.', label: 'Staff grants' }, { value: 'access.', label: 'Customer access' }, { value: 'case.', label: 'Cases' }, { value: 'platform_admin.', label: 'Platform tools' }],
          onChange: v => setAction(v ?? '') }} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && <>
          <Panel title="Staff actions" sub={`${staffActions.length} most recent${applied ? ` matching “${applied}”` : ''}`} icon="fileText" flush>
            {staffActions.length ? (
              <DataTable headers={['When', 'Who', 'Action', 'Target', 'Purpose', 'Result']}>
                {staffActions.map((a: any) => (
                  <TR key={a.id}>
                    <TD nowrap>{fmtDate(a.created_at)}</TD>
                    <TD nowrap><span className="console-cell-main"><PersonAvatar userId={a.actor_user_id} name={a.actor_name ?? 'System'} src={a.actor_avatar_url} size={24} />{a.actor_name ?? 'System'}</span></TD>
                    <TD nowrap><span className="console-mono">{a.action}</span></TD>
                    <TD><span className="console-cell-sub" style={{ overflowWrap: 'anywhere' }}>{a.target_type} {a.target_id ? String(a.target_id).slice(0, 12) : ''}{a.app_id ? ` · ${appName(a.app_id)}` : ''}</span></TD>
                    <TD>{a.purpose ?? <span style={{ color: 'var(--ink3)' }}>—</span>}</TD>
                    <TD nowrap><span style={{ fontWeight: 700, fontSize: 'var(--text-xs, 11px)', color: a.outcome === 'ok' ? 'var(--green)' : 'var(--red)' }}>{a.outcome === 'ok' ? 'OK' : a.outcome === 'denied' ? 'Denied' : 'Error'}</span></TD>
                  </TR>
                ))}
              </DataTable>
            ) : <Empty icon="fileText" title="No staff actions recorded" />}
          </Panel>
          <Panel title="Operator actions on customer workspaces" sub="Impersonation and other direct operator actions" icon="eye" flush>
            {data.operatorActions.length ? (
              <ul className="console-list">
                {data.operatorActions.map((a: any) => (
                  <li key={a.id}><div className="console-list-main"><div className="console-list-title">{a.operator_name} — {String(a.action).replace(/_/g, ' ')}</div><div className="console-list-meta">{a.reason}</div></div><span className="console-muted">{fmtDate(a.created_at)}</span></li>
                ))}
              </ul>
            ) : <Empty icon="eye" title="None recorded" />}
          </Panel>
          {data.note && <div className="console-muted">{data.note}</div>}
        </>}
      </LoadState>
    </div>
  );
}

// ── Platform settings (operations) ────────────────────────────────────────
const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dur = (m: number) => (m >= 1440 && m % 1440 === 0 ? `${m / 1440} d` : m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`);

export function ConsoleSettings() {
  const { me } = useStaff();
  const { data, loading, error, reload } = useStaffData<any>('/v1/staff/settings');
  const { msg, act } = useAct(reload);
  const [sla, setSla] = useState<Record<string, { f: string; r: string }>>({});
  const manage = hasPerm(me, 'settings.manage');
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Platform Settings']} titlePlain="Console" titleEm="settings"
        subtitle="How cases are timed and routed, and which products are in maintenance. Platform configuration, branding and integrations are under this section in the sidebar." />
      <Notice msg={msg} />
      <LoadState loading={loading} error={error} onRetry={reload}>
        {data && <>
          {hasPerm(me, 'settings.view') && (
            <div className="console-two">
              <Panel title="SLA targets" sub="Per priority. Minutes count business hours unless marked 24/7." icon="clock" flush>
                <DataTable headers={['Priority', 'First response', 'Resolution', 'Clock', ...(manage ? [''] : [])]}>
                  {data.sla.map((p: any) => {
                    const v = sla[p.priority] ?? { f: String(p.first_response_minutes), r: String(p.resolution_minutes) };
                    const dirty = v.f !== String(p.first_response_minutes) || v.r !== String(p.resolution_minutes);
                    return (
                      <TR key={p.priority}>
                        <TD nowrap><Pill kind="priority" value={p.priority} /></TD>
                        <TD nowrap>{manage ? <Input type="number" min={5} aria-label={`${p.priority} first response minutes`} value={v.f} onChange={e => setSla({ ...sla, [p.priority]: { ...v, f: e.target.value } })} style={{ width: 96 }} /> : dur(p.first_response_minutes)}</TD>
                        <TD nowrap>{manage ? <Input type="number" min={5} aria-label={`${p.priority} resolution minutes`} value={v.r} onChange={e => setSla({ ...sla, [p.priority]: { ...v, r: e.target.value } })} style={{ width: 96 }} /> : dur(p.resolution_minutes)}</TD>
                        <TD nowrap>{p.business_hours_only ? 'Business hours' : '24/7'}</TD>
                        {manage && <TD right nowrap><Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty} onClick={() => act(() => apiFetch(`/v1/staff/settings/sla/${p.priority}`, { method: 'PUT', body: JSON.stringify({ first_response_minutes: Number(v.f), resolution_minutes: Number(v.r), business_hours_only: p.business_hours_only }) }), `${p.priority} SLA saved.`)}>Save</Button></TD>}
                      </TR>
                    );
                  })}
                </DataTable>
              </Panel>
              <Panel title="Business hours" sub="Waiting on the customer pauses the resolution clock; the due time moves by the paused time" icon="calendar">
                {data.businessHours ? <Facts items={[
                  ['Time zone', data.businessHours.timezone],
                  ['Working days', data.businessHours.work_days.map((d: number) => DAY[d]).join(', ')],
                  ['Hours', `${hhmm(data.businessHours.start_minute)} – ${hhmm(data.businessHours.end_minute)}`],
                  ['Holidays', data.businessHours.holidays.length ? data.businessHours.holidays.join(', ') : 'None'],
                ]} /> : <Empty icon="clock" title="No business hours set" />}
              </Panel>
            </div>
          )}
          {hasPerm(me, 'settings.view') && (
            <Panel title="Routing rules" sub="First matching rule wins. With no match: a team covering the product, then the customer, then the fallback team, then Unassigned." icon="link" flush>
              {data.routingRules.length ? (
                <DataTable headers={['#', 'Rule', 'Matches', 'Sends to', 'State', ...(manage ? [''] : [])]}>
                  {data.routingRules.map((r: any) => (
                    <TR key={r.id}>
                      <TD nowrap>{r.position}</TD>
                      <TD><span className="console-cell-title">{r.name}</span></TD>
                      <TD>{[r.app_id && appName(r.app_id), r.category && `category ${r.category}`, r.priority && `priority ${r.priority}`].filter(Boolean).join(' · ') || 'Everything'}</TD>
                      <TD nowrap><strong>{r.team_name}</strong></TD>
                      <TD nowrap><Pill kind="active" value={String(!!r.active)} /></TD>
                      {manage && <TD right nowrap>{r.active && <Button size="sm" variant="outline" onClick={() => act(() => apiFetch(`/v1/staff/settings/routing-rules/${r.id}`, { method: 'DELETE' }), 'Rule turned off.')}>Turn off</Button>}</TD>}
                    </TR>
                  ))}
                </DataTable>
              ) : <Empty icon="link" title="No routing rules yet">Cases still route by team coverage and the fallback team.</Empty>}
            </Panel>
          )}
          {hasPerm(me, 'maintenance.manage') && (
            <Panel title="Maintenance" sub="A declared state — service health never reads it as healthy or unavailable" icon="shield" flush>
              <ul className="console-list">
                {data.appStatus.map((a: any) => (
                  <li key={a.app_id}>
                    <div className="console-list-main"><div className="console-list-title">{appName(a.app_id)}</div>{a.message && <div className="console-list-meta">{a.message}</div>}</div>
                    {a.status === 'maintenance' && <Pill kind="health" value="maintenance" />}
                    <Switch aria-label={`Maintenance for ${appName(a.app_id)}`} checked={a.status === 'maintenance'} onCheckedChange={v => act(() => apiFetch(`/v1/staff/settings/maintenance/${a.app_id}`, { method: 'PUT', body: JSON.stringify({ maintenance: v, reason: v ? 'Maintenance started from the staff console' : 'Maintenance ended from the staff console' }) }), v ? `${appName(a.app_id)} is in maintenance.` : `${appName(a.app_id)} maintenance ended.`)} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>}
      </LoadState>
    </div>
  );
}
