import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { PersonAvatar } from '../components/PersonAvatar.js';

export function OndiItAdmin() {
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

  const cardAction = (to: string, link: string) => (
    <Link to={to} style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>{link} →</Link>
  );

  return (
    <div className="ondi-page-container">
      <PageHeader
        crumbs={['Ondi', 'Enterprise']}
        titlePlain="IT Admin"
        titleEm="dashboard"
        subtitle="Executive security overview — devices, sign-ins, audit events, and accounts across this workspace."
      />

      {/* KPI Stats Grid */}
      <div className="ondi-kpi-grid">
        <Link to="/ondi/sessions" style={{ textDecoration: 'none' }}>
          <div className="ondi-kpi-card">
            <div className="ondi-kpi-header">
              <span className="ondi-kpi-title">Workspace Devices</span>
              <FeaturedIcon variant="brand" size="sm" shape="square">
                <Icon name="smartphone" size={17} />
              </FeaturedIcon>
            </div>
            <div className="ondi-kpi-body">
              <span className="ondi-kpi-num">{devices.length}</span>
              <span className="ondi-kpi-sub">{trusted} trusted</span>
            </div>
          </div>
        </Link>

        <Link to="/ondi/login-activity" style={{ textDecoration: 'none' }}>
          <div className="ondi-kpi-card">
            <div className="ondi-kpi-header">
              <span className="ondi-kpi-title">7-Day Sign-Ins</span>
              <FeaturedIcon variant={failed > 0 ? 'error' : 'success'} size="sm" shape="square">
                <Icon name="lock" size={17} />
              </FeaturedIcon>
            </div>
            <div className="ondi-kpi-body">
              <span className="ondi-kpi-num" style={{ color: failed > 0 ? '#b91c1c' : 'var(--ink)' }}>{recentLogins.length}</span>
              <span className="ondi-kpi-sub">{failed} failed attempts</span>
            </div>
          </div>
        </Link>

        <Link to="/ondi/activity" style={{ textDecoration: 'none' }}>
          <div className="ondi-kpi-card">
            <div className="ondi-kpi-header">
              <span className="ondi-kpi-title">Audit Events</span>
              <FeaturedIcon variant="info" size="sm" shape="square">
                <Icon name="activity" size={17} />
              </FeaturedIcon>
            </div>
            <div className="ondi-kpi-body">
              <span className="ondi-kpi-num" style={{ color: 'var(--teal)' }}>{activity.length}</span>
              <span className="ondi-kpi-sub">recent events</span>
            </div>
          </div>
        </Link>

        <Link to="/ondi" style={{ textDecoration: 'none' }}>
          <div className="ondi-kpi-card">
            <div className="ondi-kpi-header">
              <span className="ondi-kpi-title">Staff Accounts</span>
              <FeaturedIcon variant="gray" size="sm" shape="square">
                <Icon name="users" size={17} />
              </FeaturedIcon>
            </div>
            <div className="ondi-kpi-body">
              <span className="ondi-kpi-num">{staff.length}</span>
              <span className="ondi-kpi-sub">{byRole.length} roles assigned</span>
            </div>
          </div>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20 }}>
        {/* Accounts by Role */}
        <SectionCard title="Accounts by Role" action={cardAction('/ondi/roles', 'Manage Roles')}>
          {byRole.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)' }}>No accounts registered.</div> : byRole.map(([role, n], i) => {
            const colors = ['var(--teal)', '#1d4ed8', '#7c3aed', '#047857', '#b45309', '#b91c1c', 'var(--ink3)'];
            return (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{role}</span>
                <div style={{ width: 110, height: 8, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((n / roleMax) * 100)}%`, background: colors[i % colors.length], borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', minWidth: 24, textAlign: 'right' }}>{n}</span>
              </div>
            );
          })}
        </SectionCard>

        {/* Recent Sign-Ins */}
        <SectionCard title="Recent Sign-Ins" action={cardAction('/ondi/login-activity', 'View All')}>
          {logins.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>No sign-in history.</div> : logins.slice(0, 8).map(l => {
            const ok = String(l.status).toUpperCase() === 'SUCCESS';
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
                <PersonAvatar userId={l.user_id} name={l.user_name || 'Unknown'} size={24} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user_name || 'Unknown'}</span>
                <Badge variant={ok ? 'success' : 'error'}>
                  {ok ? 'Success' : 'Failed'}
                </Badge>
                <span style={{ fontSize: 11.5, color: 'var(--ink3)', minWidth: 60, textAlign: 'right' }}>{when(l.created_at)}</span>
              </div>
            );
          })}
        </SectionCard>

        {/* Recent Activity */}
        <SectionCard title="Recent Security Activity" action={cardAction('/ondi/activity', 'View All')}>
          {activity.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '8px 0' }}>No activity logged.</div> : activity.slice(0, 8).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
              <PersonAvatar userId={a.user_id} name={a.user_name || 'System'} size={24} />
              <span style={{ fontSize: 12.5, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.user_name ? <strong style={{ fontWeight: 700 }}>{a.user_name}</strong> : 'System'} <span style={{ color: 'var(--ink2)' }}>{a.action}</span>
              </span>
              {a.module && <Badge variant="brand">{a.module}</Badge>}
              <span style={{ fontSize: 11.5, color: 'var(--ink3)', minWidth: 60, textAlign: 'right' }}>{when(a.created_at)}</span>
            </div>
          ))}
        </SectionCard>
      </div>
    </div>
  );
}

export default OndiItAdmin;
