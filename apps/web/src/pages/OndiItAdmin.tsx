import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon, IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SectionCard } from '../components/SectionCard.js';

// IT-admin / security overview. Composes the existing security endpoints
// (devices, login history, activity log, staff) into one real dashboard — no
// new aggregate endpoint, no invented figures.
//
// Moved here from NexusHR (was ITAdminDashboard.tsx at /nexushr/it-admin) —
// it reads the exact same devices/login-history data NexusHR's own sidebar
// already says was consolidated into Ondi ("now one home (Ondi)... this nav
// just points there instead of rendering a second copy"); this dashboard
// was that second copy in aggregate form. Sits alongside Sessions & Security
// / Activity / Login Activity, same isAdmin gate, no new permission needed.
export function OneIdItAdmin() {
  const [devices, setDevices] = useState<any[]>([]);
  const [logins, setLogins] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/v1/hr/devices').then(d => setDevices(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/v1/hr/login-history').then(d => setLogins(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/v1/hr/activity-log').then(d => setActivity(Array.isArray(d) ? d : [])).catch(() => {});
    apiFetch('/v1/hr/staff').then(d => setStaff(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const trusted = devices.filter(d => d.trusted).length;
  const weekAgo = Date.now() - 7 * 86400000;
  const recentLogins = logins.filter(l => new Date(l.created_at).getTime() >= weekAgo);
  const failed = recentLogins.filter(l => String(l.status).toUpperCase() === 'FAILED').length;

  const byRole = (() => {
    const m: Record<string, number> = {};
    for (const s of staff) { const r = s.role || 'UNKNOWN'; m[r] = (m[r] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  })();
  const roleMax = Math.max(1, ...byRole.map(([, n]) => n));

  const when = (t: string) => {
    const d = new Date(t); const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const kpis: { label: string; value: number; sub: string; icon: IconName; variant: any; to: string }[] = [
    { label: 'Devices', value: devices.length, sub: `${trusted} trusted`, icon: 'smartphone', variant: 'brand', to: '/ondi/sessions' },
    { label: 'Sign-ins (7d)', value: recentLogins.length, sub: `${failed} failed`, icon: 'lock', variant: failed > 0 ? 'warning' : 'success', to: '/ondi/login-activity' },
    { label: 'Activity events', value: activity.length, sub: 'recent', icon: 'activity', variant: 'info', to: '/nexushr/activity-logs' },
    { label: 'Staff accounts', value: staff.length, sub: `${byRole.length} roles`, icon: 'users', variant: 'gray', to: '/nexushr/employees' },
  ];

  const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' };
  const cardAction = (to: string, link: string) => (
    <Link to={to} style={{ fontSize: 11, fontWeight: 600, color: 'var(--teal)', textDecoration: 'none' }}>{link} →</Link>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader crumbs={['Ondi', 'Enterprise']} titlePlain="IT admin" titleEm="dashboard"
        subtitle="Devices, sign-ins, activity and accounts across the workspace." />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        {kpis.map(k => (
          <Link key={k.label} to={k.to} style={{ ...card, padding: 18, textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FeaturedIcon variant={k.variant} size="sm" shape="square"><Icon name={k.icon} size={17} strokeWidth={1.75} /></FeaturedIcon>
              <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>{k.label}</span>
            </div>
            <div><span style={{ fontSize: 28, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{k.value}</span> <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{k.sub}</span></div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {/* Users by role */}
        <SectionCard title="Accounts by role" action={cardAction('/nexushr/roles', 'Manage')}>
            {byRole.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No accounts.</div> : byRole.map(([role, n], i) => {
              const colors = ['var(--teal)', 'var(--blue)', 'var(--purple)', 'var(--green)', 'var(--gold)', 'var(--red)', 'var(--ink3)'];
              return (
                <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1 }}>{role}</span>
                  <div style={{ width: 90, height: 6, borderRadius: 3, background: 'var(--border)' }}>
                    <div style={{ height: '100%', width: `${Math.round((n / roleMax) * 100)}%`, background: colors[i % colors.length], borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', minWidth: 20, textAlign: 'right' }}>{n}</span>
                </div>
              );
            })}
        </SectionCard>

        {/* Recent sign-ins */}
        <SectionCard title="Recent sign-ins" action={cardAction('/ondi/login-activity', 'View all')}>
            {logins.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px' }}>No sign-in history.</div> : logins.slice(0, 8).map(l => {
              const ok = String(l.status).toUpperCase() === 'SUCCESS';
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--red)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user_name || 'Unknown'}</span>
                  <span style={{ fontSize: 11, color: ok ? 'var(--ink3)' : 'var(--red)', fontWeight: ok ? 400 : 600 }}>{ok ? 'signed in' : 'failed'}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 56, textAlign: 'right' }}>{when(l.created_at)}</span>
                </div>
              );
            })}
        </SectionCard>

        {/* Recent activity */}
        <SectionCard title="Recent activity" action={cardAction('/nexushr/activity-logs', 'View all')}>
            {activity.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: '8px' }}>No activity logged.</div> : activity.slice(0, 8).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.user_name ? <strong style={{ fontWeight: 600 }}>{a.user_name}</strong> : 'System'} <span style={{ color: 'var(--ink2)' }}>{a.action}</span>
                </span>
                {a.module && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink3)' }}>{a.module}</span>}
                <span style={{ fontSize: 11, color: 'var(--ink3)', minWidth: 56, textAlign: 'right' }}>{when(a.created_at)}</span>
              </div>
            ))}
        </SectionCard>
      </div>
    </div>
  );
}

export default OneIdItAdmin;
