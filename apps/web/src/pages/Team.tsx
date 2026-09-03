import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import { useAuth } from '../hooks/useAuth.js';
import { formatDate, formatDateTime } from '../lib/tenantLocale.js';
import './Team.css';

/**
 * Who is in this workspace, and what each role may do.
 *
 * People, Invitations and the role permission matrix used to be rendered
 * here directly (see git history) — the matrix has since been found to be
 * pure decoration (org_permissions, written by /v1/permissions, is never
 * read by any route's actual auth check — see org-rbac.ts's own header
 * comment), and People/Invitations were a live second copy of exactly the
 * same users/hr_invitations records Ondi Business already owns. All three
 * now hand off to Ondi — the one real, enforced place for each — rather
 * than re-render a duplicate or, worse, a control that silently does
 * nothing. Notices and the Customer Access toggle stay: neither exists
 * anywhere else in the platform.
 */

type Tab = 'notices' | 'activity' | 'customer-access';

// People and Invitations are gone from this tab bar (they navigate straight
// to Ondi instead — see the buttons in the tab row below); Role permissions
// was renamed and stripped down to just the one real setting it held
// (Customer Access), the matrix having been decorative all along.
const LOCAL_TABS: [Tab, string][] = [
  ['notices', 'Notices'],
  ['customer-access', 'Customer access'],
  ['activity', 'Activity'],
];

export function Team() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('notices');

  /** Only an administrator changes who is in the workspace or what a role can do. */
  const canManage = !!user && ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'].includes(user.role);

  return (
    <div className="team-page">
      <PageHeader
        crumbs={['Workspace', 'Team']}
        titlePlain="People and"
        titleEm="access"
        subtitle="Notices for your workspace, the customer portal toggle, and what's changed — who's in the workspace and their roles live in Ondi."
      />

      <div className="team-tabs" role="tablist">
        <button type="button" className="team-tab" onClick={() => navigate('/ondi')}>
          People <Icon name="externalLink" size={12} />
        </button>
        <button type="button" className="team-tab" onClick={() => navigate('/ondi?tab=invites')}>
          Invitations <Icon name="externalLink" size={12} />
        </button>
        {LOCAL_TABS.map(([id, label]) => (
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

      {tab === 'notices' && <NoticesTab canManage={canManage} />}
      {tab === 'customer-access' && <CustomerAccessCard canManage={canManage} />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  );
}

/**
 * The one real, enforced control that used to live at Workspace Settings ▸
 * Configure Features ▸ Customers ▸ "Enable Customer Portal" — moved here
 * because "who can get into this workspace" (including the customer side of
 * it) is exactly what this tab already answers for staff. Reuses the same
 * tenant_settings key ('feat-customers') so no data migration was needed;
 * actually gates POST /auth/customer-otp and /auth/customer/verify (see
 * customerPortalEnabled() in auth.routes.ts) rather than just persisting.
 * The rest of that old panel (self-registration, VAT field, customer
 * groups) didn't move with it — self-registration gated a feature that has
 * no real signup route anywhere in the codebase, and the others were
 * customer-form concerns, not workspace access.
 */
function CustomerAccessCard({ canManage }: { canManage: boolean }) {
  const [portal, setPortal] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/v1/settings')
      .then((r: any) => setPortal(r?.settings?.['feat-customers']?.portal ?? true))
      .catch(() => setPortal(true))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    setPortal(next);
    setSaving(true);
    try {
      await apiFetch('/v1/settings', { method: 'PATCH', body: JSON.stringify({ 'feat-customers': { portal: next } }) });
    } catch (e: any) {
      setPortal(!next);
      showAlert(e.message || 'Could not update the customer portal setting.', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  return (
    <div className="team-card" style={{ padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Customer portal</div>
        <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Lets customers log in (phone OTP) to view their invoices, shipments and tickets.</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)', cursor: canManage ? 'pointer' : 'default' }}>
        <input type="checkbox" checked={portal} disabled={!canManage || saving} onChange={e => toggle(e.target.checked)} />
        {portal ? 'Enabled' : 'Disabled'}
      </label>
    </div>
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
 *
 * Not a duplicate of Ondi's Activity/Login Activity pages, despite the
 * shared name — those read ondi_auth_events (identity/security actions
 * only: logins, KYC, role grants). This reads the broader domain_events
 * stream every app writes to (settings changes, invoices, shipments, staff
 * changes...). Kept as-is rather than redirected.
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
