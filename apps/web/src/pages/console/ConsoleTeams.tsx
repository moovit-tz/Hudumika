import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.js';
import { Combobox } from '../../components/ui/combobox.js';
import { Switch } from '../../components/ui/switch.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Icon } from '../../components/Icon.js';
import { APP_REGISTRY } from '../../lib/appRegistry.js';
import { apiFetch } from '../../lib/api.js';
import { LoadState, fmtDate, hasPerm, useStaff, useStaffData } from './console-shared.js';
import { DataTable, Empty, KpiGrid, KpiLink, Notice, Panel, TD, TR, appName } from './console-ui.js';

const KIND_LABEL: Record<string, string> = { product: 'Product team', portfolio: 'Customer portfolio', specialist: 'Shared specialists' };
const PRODUCT_OPTIONS = APP_REGISTRY.filter(a => a.id !== 'lens').map(a => ({ value: a.id as string, label: a.name }));

function Pick({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="console-field">{label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}

function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label?: string }) {
  return (
    <span className="console-scope-chip" style={{ fontWeight: 500 }}>
      {children}
      {onRemove && <button type="button" onClick={onRemove} aria-label={label} title={label} data-ui-native-button=""
        style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: 'var(--ink3)' }}><Icon name="x" size={12} /></button>}
    </span>
  );
}

export function ConsoleTeams() {
  const { me } = useStaff();
  const [params, setParams] = useSearchParams();
  const canTeams = hasPerm(me, 'teams.view');
  const canStaff = hasPerm(me, 'staff.view');
  const tab = params.get('tab') === 'staff' && canStaff ? 'staff' : params.get('tab') === 'roles' && canStaff ? 'roles' : canTeams ? 'teams' : 'staff';
  return (
    <div className="console-page">
      <PageHeader crumbs={['Console', 'Teams & Assignments']} titlePlain="Teams &" titleEm="assignments" />
      <Tabs value={tab} onValueChange={v => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          {canTeams && <TabsTrigger value="teams"><span className="ds-tabs-trigger-label">Teams</span></TabsTrigger>}
          {canStaff && <TabsTrigger value="staff"><span className="ds-tabs-trigger-label">Staff & roles</span></TabsTrigger>}
          {canStaff && <TabsTrigger value="roles"><span className="ds-tabs-trigger-label">Role matrix</span></TabsTrigger>}
        </TabsList>
      </Tabs>
      {tab === 'teams' ? <TeamsTab /> : tab === 'staff' ? <StaffTab /> : <RolesTab />}
    </div>
  );
}

function TeamsTab() {
  const { me } = useStaff();
  const teams = useStaffData<any>('/v1/staff/teams');
  const staff = useStaffData<any>(hasPerm(me, 'staff.view') ? '/v1/staff/staff' : null);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', kind: 'product', is_fallback: false });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const manage = hasPerm(me, 'teams.manage');
  const act = async (fn: () => Promise<any>, ok = 'Saved.') => {
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ ok: true, text: r?.openCasesNeedingReassignment?.length ? `Removed. ${r.openCasesNeedingReassignment.length} open case(s) need a new owner.` : ok });
      teams.reload(); return true;
    } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'That did not work.' }); return false; }
  };
  const staffOpts = (staff.data?.items ?? []).filter((s: any) => s.status === 'active').map((s: any) => ({ value: s.user_id as string, label: s.name as string, sublabel: s.email as string }));
  const items: any[] = teams.data?.items ?? [];
  return (
    <div className="console-stack">
      <Notice msg={msg} />
      <KpiGrid>
        <KpiLink title="Teams" value={String(items.length)} icon="users" color="var(--teal)" hint={`${items.filter(t => t.is_fallback).length} fallback queue(s)`} />
        <KpiLink title="Members" value={String(new Set(items.flatMap(t => t.members.map((m: any) => m.user_id))).size)} icon="userCheck" color="var(--blue)" hint="Distinct people on a team" />
        <KpiLink title="Open cases" value={String(items.reduce((s, t) => s + (t.openCases ?? 0), 0))} icon="inbox" color="var(--gold)" hint="Routed to these teams" />
      </KpiGrid>
      {manage && (creating ? (
        <Panel title="New team" icon="plus" action={<Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>}>
          <form className="console-stack" onSubmit={async e => { e.preventDefault(); if (await act(() => apiFetch('/v1/staff/teams', { method: 'POST', body: JSON.stringify(newTeam) }), 'Team created.')) { setCreating(false); setNewTeam({ name: '', kind: 'product', is_fallback: false }); } }}>
            <div className="console-fields">
              <label className="console-field">Team name<Input required minLength={2} value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })} placeholder="e.g. Finance Operations" /></label>
              <Pick label="Kind" value={newTeam.kind} options={Object.entries(KIND_LABEL)} onChange={v => setNewTeam({ ...newTeam, kind: v })} />
            </div>
            <label className="console-row" style={{ fontSize: 'var(--text-base, 13px)', color: 'var(--ink2)' }}>
              <Switch checked={newTeam.is_fallback} onCheckedChange={v => setNewTeam({ ...newTeam, is_fallback: v })} aria-label="Fallback queue" />
              Fallback queue — receives cases when no routing rule or coverage matches
            </label>
            <div><Button type="submit">Create team</Button></div>
          </form>
        </Panel>
      ) : <div><Button onClick={() => setCreating(true)}>New team</Button></div>)}
      <LoadState loading={teams.loading} error={teams.error} onRetry={teams.reload}>
        {items.length ? (
          <div className="console-two">
            {items.map((t: any) => (
              <Panel key={t.id} title={t.name} icon="users"
                sub={<>{KIND_LABEL[t.kind] ?? t.kind}{t.is_fallback ? ' · fallback queue' : ''} · {t.openCases} open case{t.openCases === 1 ? '' : 's'}</>}>
                <div className="console-stack" style={{ gap: 8 }}>
                  <div className="console-fact"><dt style={{ fontSize: 'var(--text-xs, 11px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink3)' }}>Products</dt></div>
                  <div className="console-row" style={{ gap: 6 }}>
                    {t.all_products ? <Chip>All products</Chip> : t.products.length ? t.products.map((p: string) => (
                      <Chip key={p} label={manage ? `Remove ${appName(p)} from ${t.name}` : undefined}
                        onRemove={manage ? () => act(() => apiFetch(`/v1/staff/teams/${t.id}/coverage`, { method: 'PUT', body: JSON.stringify({ products: t.products.filter((x: string) => x !== p) }) }), 'Coverage saved.') : undefined}>{appName(p)}</Chip>
                    )) : <span className="console-muted">No products</span>}
                    {manage && !t.all_products && (
                      <div style={{ minWidth: 180 }}>
                        <Combobox aria-label={`Add a product to ${t.name}`} placeholder="Add product…" searchPlaceholder="Search products" value=""
                          options={PRODUCT_OPTIONS.filter(o => !t.products.includes(o.value))}
                          onChange={v => v && act(() => apiFetch(`/v1/staff/teams/${t.id}/coverage`, { method: 'PUT', body: JSON.stringify({ products: [...t.products, v] }) }), 'Coverage saved.')} />
                      </div>
                    )}
                  </div>
                  <div className="console-muted">Customers: {t.all_customers ? 'all' : t.customers.map((c: any) => c.name).join(', ') || 'none named'}</div>
                </div>
                <ul className="console-list" style={{ margin: '0 -20px', borderTop: '1px solid var(--border)' }}>
                  {t.members.map((m: any) => (
                    <li key={m.user_id}>
                      <PersonAvatar userId={m.user_id} name={m.name} src={m.avatar_url} size={28} />
                      <div className="console-list-main"><div className="console-list-title">{m.name}</div><div className="console-list-meta" style={{ textTransform: 'capitalize' }}>{m.member_role}{m.expires_at ? ` · until ${fmtDate(m.expires_at)}` : ''}</div></div>
                      {manage && <Button size="sm" variant="ghost" aria-label={`Remove ${m.name} from ${t.name}`} onClick={() => act(() => apiFetch(`/v1/staff/teams/${t.id}/members/${m.user_id}`, { method: 'DELETE' }))}>Remove</Button>}
                    </li>
                  ))}
                  {!t.members.length && <li><span className="console-muted">No members yet.</span></li>}
                </ul>
                {manage && staffOpts.length > 0 && (
                  <Combobox aria-label={`Add a member to ${t.name}`} placeholder="Add a member…" searchPlaceholder="Search staff" value=""
                    options={staffOpts.filter((o: any) => !t.members.some((m: any) => m.user_id === o.value))}
                    onChange={v => v && act(() => apiFetch(`/v1/staff/teams/${t.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: v }) }), 'Member added.')} />
                )}
              </Panel>
            ))}
          </div>
        ) : <Panel title="Teams" icon="users"><Empty icon="users" title="No teams yet">Create a team to start routing cases.</Empty></Panel>}
      </LoadState>
    </div>
  );
}

function StaffTab() {
  const { me, reload: reloadMe } = useStaff();
  const staff = useStaffData<any>('/v1/staff/staff');
  const roles = useStaffData<any>('/v1/staff/roles');
  const [email, setEmail] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [grant, setGrant] = useState({ role: '', reason: '', expires: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const manage = hasPerm(me, 'staff.manage');
  const act = async (fn: () => Promise<any>, ok = 'Saved.') => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, text: ok }); staff.reload(); reloadMe(); return true; } catch (e: any) { setMsg({ ok: false, text: e?.message ?? 'That did not work.' }); return false; }
  };
  const roleOpts: [string, string][] = (roles.data?.roles ?? []).map((r: any) => [r.key, r.name]);
  const items: any[] = staff.data?.items ?? [];
  const open = items.find(s => s.user_id === openId);
  return (
    <div className="console-stack">
      <Notice msg={msg} />
      {manage && (
        <Panel title="Add a staff member" sub="Then grant a role" icon="userPlus">
          <form className="console-row" onSubmit={async e => { e.preventDefault(); if (await act(() => apiFetch('/v1/staff/staff', { method: 'POST', body: JSON.stringify({ email }) }), 'Added as staff. Grant a role to give them access.')) setEmail(''); }}>
            <Input aria-label="Email of an existing account" type="email" placeholder="Account email" required value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <Button type="submit">Add staff member</Button>
          </form>
        </Panel>
      )}
      <Panel title="Staff" sub={`${items.length} staff member${items.length === 1 ? '' : 's'}`} icon="users" flush>
        <LoadState loading={staff.loading} error={staff.error} onRetry={staff.reload}>
          {items.length ? (
            <DataTable headers={['Staff member', 'Roles', 'Teams', 'Open cases', 'Status', '']}>
              {items.map((s: any) => (
                <TR key={s.user_id} selected={openId === s.user_id} onClick={() => { setOpenId(openId === s.user_id ? null : s.user_id); setGrant({ role: '', reason: '', expires: '' }); }}>
                  <TD style={{ minWidth: 220 }}>
                    <div className="console-cell-main">
                      <PersonAvatar userId={s.user_id} name={s.name} src={s.avatar_url} size={32} />
                      <div style={{ minWidth: 0 }}><div className="console-cell-title">{s.name}{s.user_id === me?.userId ? ' (you)' : ''}</div><div className="console-cell-sub">{s.email}</div></div>
                    </div>
                  </TD>
                  <TD>{s.roles.length ? <div className="console-row" style={{ gap: 4 }}>{s.roles.map((r: any) => <span key={r.id} className="console-scope-chip console-scope-chip-role">{r.name}</span>)}</div> : <span style={{ color: 'var(--ink3)' }}>No role</span>}</TD>
                  <TD>{s.teams.length ? s.teams.map((t: any) => t.name).join(', ') : <span style={{ color: 'var(--ink3)' }}>—</span>}</TD>
                  <TD>{s.open_cases}</TD>
                  <TD nowrap><span style={{ color: s.status === 'active' ? 'var(--green)' : 'var(--ink3)', fontWeight: 600, textTransform: 'capitalize' }}>{s.status}</span></TD>
                  <TD right nowrap><Button size="sm" variant="ghost" aria-expanded={openId === s.user_id} onClick={e => { e.stopPropagation(); setOpenId(openId === s.user_id ? null : s.user_id); }}>{openId === s.user_id ? 'Close' : 'Manage'}</Button></TD>
                </TR>
              ))}
            </DataTable>
          ) : <Empty icon="users" title="No staff members" />}
        </LoadState>
      </Panel>

      {open && (
        <Panel title={open.name} sub={<>Workspace: {open.workspace_name} ({open.workspace_role}) — not used for staff access</>} icon="userCheck"
          action={<Button size="sm" variant="ghost" onClick={() => setOpenId(null)}>Close</Button>}>
          <div className="console-stack" style={{ gap: 8 }}>
            {open.roles.length ? open.roles.map((r: any) => (
              <div key={r.id} className="console-row">
                <span className="console-scope-chip console-scope-chip-role">{r.name}</span>
                <span className="grow console-muted">{r.expires_at ? `until ${fmtDate(r.expires_at)}` : 'no expiry'} · {r.reason}</span>
                {manage && open.user_id !== me?.userId && <Button size="sm" variant="outline" aria-label={`Revoke ${r.name} from ${open.name}`} onClick={() => act(() => apiFetch(`/v1/staff/staff/${open.user_id}/roles/${r.id}`, { method: 'DELETE' }), 'Role revoked.')}>Revoke</Button>}
              </div>
            )) : <span className="console-muted">No roles yet.</span>}
            {open.scopes.map((x: any) => <div key={x.id} className="console-muted">{x.effect === 'deny' ? 'Excluded' : 'Scope'}: {String(x.scope_type).replace(/_/g, ' ')}{x.app_id ? ` · ${appName(x.app_id)}` : ''}{x.tenant_id ? ` · customer ${x.tenant_id.slice(0, 8)}…` : ''}</div>)}
            {open.overrides.map((x: any) => <div key={x.id} className="console-muted">{x.effect === 'deny' ? 'Denied' : 'Also allowed'}: {x.permission}</div>)}
          </div>
          {manage && open.user_id !== me?.userId && (
            <form className="console-stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}
              onSubmit={async e => { e.preventDefault(); if (await act(() => apiFetch(`/v1/staff/staff/${open.user_id}/roles`, { method: 'POST', body: JSON.stringify({ role_key: grant.role, reason: grant.reason, ...(grant.expires ? { expires_at: new Date(grant.expires).toISOString() } : {}) }) }), 'Role granted.')) setGrant({ role: '', reason: '', expires: '' }); }}>
              <div className="console-fields">
                <Pick label="Grant a role" value={grant.role} options={roleOpts} onChange={v => setGrant({ ...grant, role: v })} />
                <label className="console-field">Expires (optional)<Input type="date" value={grant.expires} onChange={e => setGrant({ ...grant, expires: e.target.value })} /></label>
              </div>
              <label className="console-field">Reason<Input required minLength={3} value={grant.reason} onChange={e => setGrant({ ...grant, reason: e.target.value })} placeholder="Recorded in the audit log" /></label>
              <div><Button type="submit" disabled={!grant.role}>Grant role</Button></div>
            </form>
          )}
          {open.user_id === me?.userId && <span className="console-muted">You cannot change your own access.</span>}
        </Panel>
      )}
    </div>
  );
}

function RolesTab() {
  const roles = useStaffData<any>('/v1/staff/roles');
  return (
    <LoadState loading={roles.loading} error={roles.error} onRetry={roles.reload}>
      {roles.data && (
        <Panel title="Permissions by role" icon="shield" flush
          sub="Roles add up · a deny always wins · ★ all customers and products">
          <div className="console-table-wrap">
            <table className="console-matrix">
              <thead><tr><th scope="col">Permission</th>{roles.data.roles.map((r: any) => <th key={r.key} scope="col">{r.name}{r.broad_scope ? ' ★' : ''}</th>)}</tr></thead>
              <tbody>
                {Object.entries(roles.data.permissions).map(([p, label]: any) => (
                  <tr key={p}><td><div style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</div><div className="console-mono console-muted">{p}</div></td>
                    {roles.data.roles.map((r: any) => <td key={r.key} aria-label={`${r.name}: ${r.permissions.includes(p) ? 'yes' : 'no'}`}>{r.permissions.includes(p) ? <Icon name="check" size={14} color="var(--teal)" /> : null}</td>)}</tr>
                ))}
                <tr><td><strong>Default home</strong></td>{roles.data.roles.map((r: any) => <td key={r.key}>{roles.data.homes[r.default_home] ?? r.default_home}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </LoadState>
  );
}
