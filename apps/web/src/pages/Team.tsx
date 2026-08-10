import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatDate, formatDateTime } from '../lib/tenantLocale.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import './Team.css';

/**
 * Who is in this workspace, and what each role may do.
 *
 * Both already existed and neither was reachable from the workspace console.
 * Inviting a colleague, deactivating a leaver and changing somebody's role
 * lived inside NexusHR, mixed into employment records; the role permission
 * matrix had a complete API — GET/PATCH /v1/permissions — whose only consumer
 * was HRM.tsx. "Who can get into my workspace" is the first question a tenant
 * administrator has, and the console could not answer it.
 *
 * Nothing here is a new system. It is the existing endpoints, in the console
 * where the person who needs them is already standing.
 */

const ASSIGNABLE_ROLES = [
  { value: 'TENANT_ADMIN', label: 'Administrator', desc: 'Full workspace configuration and billing.' },
  // ADMIN is a distinct role in real data. Leaving it out rendered an empty
  // role picker for anyone holding it — a control showing nothing, next to a
  // person who plainly has a role.
  { value: 'ADMIN',        label: 'Admin (legacy)', desc: 'Equivalent to Administrator; kept for existing accounts.' },
  { value: 'MANAGER',      label: 'Manager',       desc: 'Runs operations; can change thresholds, not credentials.' },
  { value: 'FINANCE',      label: 'Finance',       desc: 'Invoicing, bills and financial reports.' },
  { value: 'SALES',        label: 'Sales',         desc: 'Customers, leads and quotations.' },
  { value: 'SENIOR',       label: 'Senior officer', desc: 'Clearance work, including escalations.' },
  { value: 'OFFICER',      label: 'Officer',       desc: 'Day-to-day clearance and shipments.' },
  { value: 'JUNIOR',       label: 'Junior',        desc: 'Assisted work, limited approvals.' },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ASSIGNABLE_ROLES.map(r => [r.value, r.label]),
);

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  last_login_at?: string | null;
  created_at?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

type Tab = 'people' | 'invitations' | 'roles' | 'notices' | 'activity';

export function Team() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('people');

  /** Only an administrator changes who is in the workspace or what a role can do. */
  const canManage = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);

  return (
    <div className="team-page">
      <PageHeader
        crumbs={['Workspace', 'Team']}
        titlePlain="People and"
        titleEm="access"
        subtitle="Who belongs to this workspace, what they may do, and who is still waiting to accept an invitation."
      />

      <div className="team-tabs" role="tablist">
        {([
          ['people', 'People'],
          ['invitations', 'Invitations'],
          ['roles', 'Role permissions'],
          ['notices', 'Notices'],
          ['activity', 'Activity'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`team-tab${tab === id ? ' team-tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' && <PeopleTab canManage={canManage} meId={user?.id} />}
      {tab === 'invitations' && <InvitationsTab canManage={canManage} />}
      {tab === 'roles' && <RolesTab canManage={canManage} />}
      {tab === 'notices' && <NoticesTab canManage={canManage} />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  );
}

/* ── People ─────────────────────────────────────────────────────── */

function PeopleTab({ canManage, meId }: { canManage: boolean; meId?: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/hr/staff')
      .then((r: any) => setMembers(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch((e: any) => showAlert(e.message || 'Could not load the team.', { variant: 'error' }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter(m =>
      `${m.name} ${m.email} ${ROLE_LABEL[m.role] ?? m.role}`.toLowerCase().includes(needle));
  }, [members, q]);

  async function changeRole(m: Member, role: string) {
    if (role === m.role) return;
    setBusy(m.id);
    try {
      await apiFetch(`/v1/hr/staff/${m.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, role } : x)));
    } catch (e: any) {
      showAlert(e.message || 'That role could not be changed.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function setActive(m: Member, active: boolean) {
    /**
     * Deactivating is how somebody loses access, so it says what it does.
     * Their record and history stay; only the ability to sign in goes.
     */
    if (!active) {
      const ok = await showConfirm(
        `${m.name} will no longer be able to sign in to this workspace. Their record and history stay.`,
        { title: 'Remove access?', variant: 'danger', confirmLabel: 'Remove access' },
      );
      if (!ok) return;
    }
    setBusy(m.id);
    try {
      await apiFetch(`/v1/hr/staff/${m.id}/status`, { method: 'PATCH', body: JSON.stringify({ active }) });
      setMembers(prev => prev.map(x => (x.id === m.id ? { ...x, active } : x)));
    } catch (e: any) {
      showAlert(e.message || 'That change could not be saved.', { variant: 'error' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="team-empty">Loading the team…</div>;

  return (
    <>
      <div className="team-toolbar">
        <div className="team-count">
          {members.filter(m => m.active).length} active
          {members.some(m => !m.active) && ` · ${members.filter(m => !m.active).length} without access`}
        </div>
        <div className="team-search">
          <Icon name="search" size={14} color="var(--ink3)" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, email or role"
            aria-label="Search the team"
          />
        </div>
      </div>

      <div className="team-card">
        <div className="team-scroll">
          <table className="team-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Last signed in</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={4} className="team-none">Nobody matches that search.</td></tr>
              )}
              {shown.map(m => (
                <tr key={m.id} className={m.active ? '' : 'team-row--off'}>
                  <td>
                    <div className="team-person">
                      <PersonAvatar userId={m.id} name={m.name} size={32} />
                      <div>
                        <div className="team-name">
                          {m.name}
                          {m.id === meId && <span className="team-you">you</span>}
                        </div>
                        <div className="team-email">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {/* Only offer a picker for a role the picker can represent.
                        A role outside this set — SUPER_ADMIN, or a portal
                        CUSTOMER — renders as text rather than an empty
                        control that silently cannot show its own value. */}
                    {canManage && m.id !== meId && ASSIGNABLE_ROLES.some(r => r.value === m.role) ? (
                      <Select value={m.role} onValueChange={v => changeRole(m, v)} disabled={busy === m.id}>
                        <SelectTrigger className="team-role-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ASSIGNABLE_ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="team-role-static">{ROLE_LABEL[m.role] ?? m.role}</span>
                    )}
                  </td>
                  <td className="team-muted">{m.last_login_at ? formatDate(m.last_login_at) : 'Not since this was recorded'}</td>
                  <td>
                    {m.id === meId ? (
                      // Removing your own access would lock you out of the console
                      // you are standing in, so it is not offered.
                      <span className="team-muted">—</span>
                    ) : canManage ? (
                      <button
                        type="button"
                        className={`team-access${m.active ? '' : ' team-access--off'}`}
                        disabled={busy === m.id}
                        onClick={() => setActive(m, !m.active)}
                      >
                        {m.active ? 'Remove access' : 'Restore access'}
                      </button>
                    ) : (
                      <span className="team-muted">{m.active ? 'Active' : 'No access'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Invitations ────────────────────────────────────────────────── */

function InvitationsTab({ canManage }: { canManage: boolean }) {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('OFFICER');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/hr/invitations')
      .then((r: any) => setInvites(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setInvites([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    try {
      await apiFetch('/v1/hr/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      showAlert(`${email.trim()} has been invited as ${ROLE_LABEL[role] ?? role}.`,
                { title: 'Invitation sent', variant: 'success' });
      setEmail('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'That invitation could not be sent.', { variant: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {canManage && (
        <form className="team-invite" onSubmit={invite}>
          <div className="team-invite-field">
            <label htmlFor="invite-email">Email address</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@example.co.tz"
              required
            />
          </div>
          <div className="team-invite-field">
            <label htmlFor="invite-role">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={sending}>
            {sending ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
      )}

      <div className="team-card">
        {loading ? (
          <div className="team-empty">Loading invitations…</div>
        ) : invites.length === 0 ? (
          <div className="team-empty">No invitations are outstanding.</div>
        ) : (
          <div className="team-scroll">
            <table className="team-table">
              <thead>
                <tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th></tr>
              </thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{ROLE_LABEL[i.role] ?? i.role}</td>
                    <td><span className={`team-pill team-pill--${i.status.toLowerCase()}`}>{i.status.toLowerCase()}</span></td>
                    <td className="team-muted">{formatDate(i.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Role permissions ───────────────────────────────────────────── */

interface Perm { role: string; resource: string; action: string; allowed: boolean }

function RolesTab({ canManage }: { canManage: boolean }) {
  const [perms, setPerms] = useState<Perm[]>([]);
  const [meta, setMeta] = useState<{ roles: string[]; resources: string[]; actions: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string>('MANAGER');

  useEffect(() => {
    Promise.all([
      apiFetch('/v1/permissions').catch(() => []),
      apiFetch('/v1/permissions/meta').catch(() => null),
    ])
      .then(([p, m]: any[]) => {
        setPerms(Array.isArray(p) ? p : (p?.data ?? []));
        setMeta(m);
        if (m?.roles?.length) setRole(m.roles.includes('MANAGER') ? 'MANAGER' : m.roles[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggle = (resource: string, action: string) => {
    setPerms(prev => prev.map(p =>
      p.role === role && p.resource === resource && p.action === action
        ? { ...p, allowed: !p.allowed }
        : p));
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    try {
      await apiFetch('/v1/permissions', { method: 'PATCH', body: JSON.stringify({ permissions: perms }) });
      setDirty(false);
      showAlert('Role permissions updated.', { variant: 'success' });
    } catch (e: any) {
      showAlert(e.message || 'Those permissions could not be saved.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="team-empty">Loading permissions…</div>;
  if (!meta) return <div className="team-empty">Permissions are not available for this workspace.</div>;

  const has = (resource: string, action: string) =>
    perms.find(p => p.role === role && p.resource === resource && p.action === action)?.allowed ?? false;

  return (
    <>
      <div className="team-toolbar">
        <div className="team-role-picker">
          <label htmlFor="perm-role">Role</label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="perm-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meta.roles.map(r => <SelectItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        )}
      </div>

      <div className="team-card">
        <div className="team-scroll">
          <table className="team-table team-matrix">
            <thead>
              <tr>
                <th>Area</th>
                {meta.actions.map(a => <th key={a} className="team-matrix-act">{a}</th>)}
              </tr>
            </thead>
            <tbody>
              {meta.resources.map(res => (
                <tr key={res}>
                  <td className="team-matrix-res">{res}</td>
                  {meta.actions.map(act => (
                    <td key={act} className="team-matrix-cell">
                      <input
                        type="checkbox"
                        checked={has(res, act)}
                        disabled={!canManage}
                        onChange={() => toggle(res, act)}
                        aria-label={`${ROLE_LABEL[role] ?? role} may ${act} ${res}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Activity ───────────────────────────────────────────────────── */

interface Event {
  id: string;
  event_type: string;
  source_app: string;
  entity_type: string;
  payload: any;
  created_at: string;
  actor_name: string | null;
}

/**
 * What has been happening in this workspace, and who did it.
 *
 * There was no way to ask. Settings changes in particular left no trace at
 * all — including SMTP credentials, payment gateway keys and which apps the
 * whole workspace can see. They are recorded now, and this reads the same
 * domain_events stream every other app already writes to, so an app added
 * later appears here without anyone wiring it up.
 */
function ActivityTab() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/v1/activity?limit=100')
      .then((r: any) => setEvents(Array.isArray(r) ? r : (r?.data ?? [])))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  /** The event type as a person would say it. */
  const describe = (e: Event): string => {
    const p = e.payload ?? {};
    switch (e.event_type) {
      case 'settings.changed':
        // Key names, never values — the record of a credential change must not
        // become a second copy of the credential.
        return `Changed workspace settings: ${(p.keys ?? []).join(', ') || 'no keys recorded'}`;
      case 'hr.staff_role_changed':  return `Changed ${p.name ?? 'someone'}'s role to ${p.role ?? 'a new role'}`;
      case 'hr.staff_deactivated':   return `Removed access for ${p.name ?? 'someone'}`;
      case 'hr.staff_reactivated':   return `Restored access for ${p.name ?? 'someone'}`;
      case 'hr.staff_invited':       return `Invited ${p.email ?? 'someone'} as ${p.role ?? 'a member'}`;
      default:
        return e.event_type.replace(/[._]/g, ' ');
    }
  };

  if (loading) return <div className="team-empty">Loading activity…</div>;
  if (events.length === 0) {
    return <div className="team-empty">Nothing has been recorded for this workspace yet.</div>;
  }

  return (
    <div className="team-card">
      <ul className="team-feed">
        {events.map(e => (
          <li key={e.id} className="team-feed-row">
            <div className="team-feed-main">
              <span className="team-feed-what">{describe(e)}</span>
              <span className="team-feed-who">
                {/* Null actor stays null — an older row simply never recorded
                    one, and "System" would be a claim about how it happened. */}
                {e.actor_name ?? 'Actor not recorded'} · {e.source_app}
              </span>
            </div>
            <time className="team-feed-when" dateTime={e.created_at}>{formatDateTime(e.created_at)}</time>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Notices ────────────────────────────────────────────────────── */

interface Notice {
  id: string;
  title: string;
  body: string | null;
  badge: string;
  active: boolean;
  created_at: string;
  dismissed_count: number;
}

/**
 * Telling your own organisation something.
 *
 * Announcements have always rendered for tenant users — they are the ticker in
 * the header — but authoring was mounted only under /v1/superadmin, so a tenant
 * administrator could not post a notice to their own staff. The table always
 * carried a tenant_id; the surface was missing.
 */
function NoticesTab({ canManage }: { canManage: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/workspace/announcements')
      .then((r: any) => setNotices(r?.data ?? []))
      .catch(() => setNotices([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPosting(true);
    try {
      await apiFetch('/v1/workspace/announcements', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), body: body.trim() || undefined }),
      });
      setTitle(''); setBody('');
      load();
    } catch (err: any) {
      showAlert(err.message || 'That notice could not be posted.', { variant: 'error' });
    } finally {
      setPosting(false);
    }
  }

  async function setActive(n: Notice, active: boolean) {
    try {
      await apiFetch(`/v1/workspace/announcements/${n.id}`, {
        method: 'PATCH', body: JSON.stringify({ active }),
      });
      setNotices(prev => prev.map(x => (x.id === n.id ? { ...x, active } : x)));
    } catch (err: any) {
      showAlert(err.message || 'That notice could not be changed.', { variant: 'error' });
    }
  }

  async function remove(n: Notice) {
    const ok = await showConfirm(`Delete "${n.title}"? It disappears for everyone who has not read it.`,
      { title: 'Delete notice?', variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/workspace/announcements/${n.id}`, { method: 'DELETE' });
      setNotices(prev => prev.filter(x => x.id !== n.id));
    } catch (err: any) {
      showAlert(err.message || 'That notice could not be deleted.', { variant: 'error' });
    }
  }

  return (
    <>
      {canManage && (
        <form className="team-invite team-notice-form" onSubmit={post}>
          <div className="team-invite-field team-notice-grow">
            <label htmlFor="notice-title">Notice</label>
            <input id="notice-title" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Office closed Friday for Eid" required />
          </div>
          <div className="team-invite-field team-notice-grow">
            <label htmlFor="notice-body">Detail (optional)</label>
            <input id="notice-body" value={body} onChange={e => setBody(e.target.value)}
              placeholder="Clearance desk reopens Monday at 8am" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={posting}>
            {posting ? 'Posting…' : 'Post to the workspace'}
          </button>
        </form>
      )}

      <div className="team-card">
        {loading ? (
          <div className="team-empty">Loading notices…</div>
        ) : notices.length === 0 ? (
          <div className="team-empty">Nothing has been posted to this workspace.</div>
        ) : (
          <ul className="team-feed">
            {notices.map(n => (
              <li key={n.id} className="team-feed-row">
                <div className="team-feed-main">
                  <span className="team-feed-what">
                    {n.title}
                    {!n.active && <span className="team-notice-off">not showing</span>}
                  </span>
                  <span className="team-feed-who">
                    {n.body ? `${n.body} · ` : ''}
                    {/* Dismissals are the only real signal that a notice was seen. */}
                    read by {n.dismissed_count} {n.dismissed_count === 1 ? 'person' : 'people'} · {formatDate(n.created_at)}
                  </span>
                </div>
                {canManage && (
                  <div className="team-notice-actions">
                    <button type="button" className="team-access team-access--off" onClick={() => setActive(n, !n.active)}>
                      {n.active ? 'Stop showing' : 'Show again'}
                    </button>
                    <button type="button" className="team-access" onClick={() => remove(n)}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
