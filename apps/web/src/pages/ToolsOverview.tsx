import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { MetricsRow } from '../components/MetricCard.js';
import { Button } from '../components/ui/button.js';
import { Banner } from '../components/ui/alert.js';

interface ToolsMetrics {
  hr: {
    total_staff: number;
    active_staff: number;
    on_leave: number;
    pending_leaves: number;
    today_present: number;
    today_absent: number;
  };
  files:   { total: number; this_month: number };
  chat:    { total_messages: number; this_month: number };
  support: { total_notifications: number; unread: number };
  fetched_at: string;
}

const EMPTY_METRICS: ToolsMetrics = {
  hr: { total_staff: 0, active_staff: 0, on_leave: 0, pending_leaves: 0, today_present: 0, today_absent: 0 },
  files: { total: 0, this_month: 0 },
  chat: { total_messages: 0, this_month: 0 },
  support: { total_notifications: 0, unread: 0 },
  fetched_at: '',
};

function StatusCard({ label, value, pct, color, icon }: { label: string; value: string; pct: number; color: string; icon: string }) {
  return (
    <div style={{ minWidth: 0, background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name={icon as IconName} size={14} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{value}</div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3, background: color, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 4, textAlign: 'right' }}>{Math.min(pct, 100)}%</div>
    </div>
  );
}

/* ── Module summary card shell ── */
function ModuleSummaryCard({ title, color, to, children }: {
  icon: IconName; title: string; color: string; bg: string;
  to: string; children: React.ReactNode;
}) {
  return (
    <SectionCard
      title={title}
      padded={false}
      action={
        <Link to={to}
          style={{ fontSize: 11, fontWeight: 600, color, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          Open <Icon name="chevronRight" size={12} color={color} />
        </Link>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </SectionCard>
  );
}

/* ── 2×2 stat mini-grid inside a module card ── */
function StatGrid({ stats }: { stats: { label: string; value: string | number; sub?: string; color?: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1 }}>
      {stats.map((s, i) => (
        <div key={i} style={{
          padding: '14px 16px',
          borderRight:  i % 2 === 0 ? '1px solid var(--border)' : 'none',
          borderBottom: i < 2       ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: s.color || 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{s.value}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 3 }}>{s.label}</div>
          {s.sub && <div style={{ fontSize: 10, color: s.color || 'var(--ink3)', marginTop: 2, fontWeight: 600 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Progress footer bar ── */
function ProgressFooter({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 3, background: 'var(--border)' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${Math.min(pct, 100)}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

/* ── Nav link row inside Settings card ── */
function SettingsNavItem({ icon, label, sub, to }: { icon: IconName; label: string; sub: string; to: string }) {
  return (
    <Link to={to}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '10px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', textDecoration: 'none', color: 'inherit' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}>
      <div style={{ width: 30, height: 30, borderRadius: 'var(--r)', background: 'rgba(100,116,139,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={13} color="var(--ink3)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{sub}</div>
      </div>
      <Icon name="chevronRight" size={13} color="var(--ink3)" />
    </Link>
  );
}

// This page had its own spark(), returning one of three hardcoded arrays.
// Same problem, same fix: no series, no chart.

export const ToolsOverview: React.FC = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<ToolsMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch('/v1/hr/tools-overview');
      if (res && typeof res === 'object' && 'hr' in res) {
        setMetrics(res as ToolsMetrics);
        setLastUpdated(new Date());
      }
    } catch (error: any) {
      setLoadError(error?.message || 'Could not load the tools overview.');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const { hr, files, chat, support } = metrics;
  const attendanceRate  = hr.active_staff > 0 ? Math.round((hr.today_present / hr.active_staff) * 100) : 0;
  const staffActivePct  = hr.total_staff  > 0 ? Math.round((hr.active_staff  / hr.total_staff)  * 100) : 0;
  const docsPct         = files.total > 0 ? Math.round((files.this_month / files.total) * 100) : 0;
  const chatPct         = chat.total_messages > 0 ? Math.round((chat.this_month / chat.total_messages) * 100) : 0;
  const readRate        = support.total_notifications > 0
    ? Math.round(((support.total_notifications - support.unread) / support.total_notifications) * 100)
    : 100;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Tools', 'Overview']}
        titlePlain="Tools"
        titleEm="overview"
        subtitle="Live metrics across HR, Support, Chat, and Files"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              <Icon name="refresh" size={13} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        }
      />

      {loadError && <Banner variant="error" title="Overview unavailable" action={<Button variant="outline" size="sm" onClick={load}>Try again</Button>}>{loadError}</Banner>}

      <MetricsRow cards={[
        { title: 'Total staff', value: hr.total_staff.toLocaleString(), icon: 'users', emphasis: 'primary', sub1Label: 'ACTIVE', sub1Value: hr.active_staff.toLocaleString(), sub2Label: 'ON LEAVE', sub2Value: hr.on_leave.toLocaleString(), loading, error: loadError || undefined, onRetry: load, onClick: () => navigate('/nexushr/employees') },
        { title: 'Present today', value: hr.today_present.toLocaleString(), icon: 'check', progress: attendanceRate, progressLabel: `${attendanceRate}% of active staff`, loading, error: loadError || undefined, onRetry: load, onClick: () => navigate('/nexushr/attendance') },
        { title: 'Pending leave requests', value: hr.pending_leaves.toLocaleString(), icon: 'calendar', sub1Label: 'CURRENTLY AWAY', sub1Value: hr.on_leave.toLocaleString(), loading, error: loadError || undefined, onRetry: load, onClick: () => navigate('/nexushr/leaves') },
        { title: 'Unread notifications', value: support.unread.toLocaleString(), icon: 'bell', emphasis: support.unread > 0 ? 'primary' : 'default', sub1Label: 'TOTAL', sub1Value: support.total_notifications.toLocaleString(), loading, error: loadError || undefined, onRetry: load },
      ]} />

      {/* ── Row 2: Status Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatusCard
          label="Attendance Rate" value={`${attendanceRate}%`}
          pct={attendanceRate} color="var(--teal)" icon="clock"
        />
        <StatusCard
          label="Active Staff" value={`${hr.active_staff} / ${hr.total_staff}`}
          pct={staffActivePct} color="var(--blue)" icon="users"
        />
        <StatusCard
          label="Documents This Month" value={`${files.this_month} uploaded`}
          pct={docsPct} color="var(--green)" icon="upload"
        />
        <StatusCard
          label="Notifications Read" value={`${support.total_notifications - support.unread} / ${support.total_notifications}`}
          pct={readRate} color="var(--purple)" icon="bell"
        />
      </div>

      {/* ── Row 3: Module Summaries ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
        Module Summaries
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>

        {/* HRM Dashboard */}
        <ModuleSummaryCard
          icon="briefcase" title="HRM Dashboard"
          color="var(--teal)" bg="var(--teal-l)"
          to="/nexushr"
        >
          <StatGrid stats={[
            { label: 'Total Staff',    value: hr.total_staff,    sub: `${staffActivePct}% active`,              color: 'var(--teal)' },
            { label: 'Present Today',  value: hr.today_present,  sub: `${attendanceRate}% rate`,                color: 'var(--green)' },
            { label: 'On Leave',       value: hr.on_leave,       sub: hr.on_leave > 0 ? 'Currently away' : 'None away' },
            { label: 'Pending Leaves', value: hr.pending_leaves, sub: hr.pending_leaves > 0 ? 'Needs review' : 'All clear', color: hr.pending_leaves > 0 ? 'var(--gold)' : undefined },
          ]} />
          <ProgressFooter label="Today's Attendance" value={`${attendanceRate}%`} pct={attendanceRate} color="var(--teal)" />
        </ModuleSummaryCard>

        {/* Carbon Credits */}
        <ModuleSummaryCard
          icon="leaf" title="Carbon Credits"
          color="var(--green)" bg="var(--green-l)"
          to="/carbon-credits"
        >
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 12 }}>
             <Icon name="award" size={32} color="var(--green)" />
             <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Track your company's carbon footprint offsets and view certification.</div>
          </div>
          <ProgressFooter label="Offset Tracking" value="Active" pct={100} color="var(--green)" />
        </ModuleSummaryCard>

        {/* Support */}
        <ModuleSummaryCard
          icon="headphones" title="Support"
          color="var(--purple)" bg="var(--purple-l)"
          to="/support/tickets"
        >
          <StatGrid stats={[
            { label: 'Notifications',  value: support.total_notifications, sub: 'Total in system' },
            { label: 'Unread',         value: support.unread, sub: support.unread > 0 ? 'Action needed' : 'All read', color: support.unread > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'Read',           value: support.total_notifications - support.unread, sub: 'Viewed',            color: 'var(--green)' },
            { label: 'Read Rate',      value: `${readRate}%`, sub: readRate >= 90 ? 'Excellent' : 'Needs attention',  color: 'var(--purple)' },
          ]} />
          <ProgressFooter label="Read Rate" value={`${readRate}%`} pct={readRate} color="var(--purple)" />
        </ModuleSummaryCard>

        {/* Chat */}
        <ModuleSummaryCard
          icon="chatBubble" title="Chat"
          color="var(--blue)" bg="var(--blue-l)"
          to="/chat"
        >
          <StatGrid stats={[
            { label: 'Total Messages', value: chat.total_messages.toLocaleString(), sub: 'All time',           color: 'var(--blue)' },
            { label: 'This Month',     value: chat.this_month,                      sub: `${chatPct}% of all messages` },
            { label: 'Files Shared',   value: files.total,                          sub: 'Via file manager'   },
            { label: 'Activity',       value: chatPct >= 80 ? 'High' : chatPct >= 40 ? 'Medium' : 'Low',
              sub: 'Share sent this month', color: chatPct >= 80 ? 'var(--green)' : chatPct >= 40 ? 'var(--gold)' : 'var(--red)' },
          ]} />
          <ProgressFooter label="Share Sent This Month" value={`${chatPct}%`} pct={chatPct} color="var(--blue)" />
        </ModuleSummaryCard>

        {/* Settings */}
        <ModuleSummaryCard
          icon="settings" title="Settings"
          color="var(--ink2)" bg="rgba(100,116,139,0.05)"
          to="/settings"
        >
          <div style={{ flex: 1 }}>
            <SettingsNavItem icon="users"    label="User Management"      sub={`${hr.total_staff} staff accounts`}      to="/settings" />
            <SettingsNavItem icon="shield"   label="Roles & Permissions"  sub="Access control matrix"                   to="/nexushr/roles" />
            <SettingsNavItem icon="lock"     label="Security & Logs"      sub="Login history, devices"                  to="/nexushr/login-history" />
            <SettingsNavItem icon="building" label="Company Profile"      sub="Tenant & org settings"                   to="/settings" />
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>Workspace metrics connected</span>
          </div>
        </ModuleSummaryCard>

      </div>
    </div>
  );
};
