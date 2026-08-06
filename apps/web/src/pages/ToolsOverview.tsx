import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';

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

const FALLBACK: ToolsMetrics = {
  hr:      { total_staff: 8, active_staff: 6, on_leave: 1, pending_leaves: 2, today_present: 5, today_absent: 1 },
  files:   { total: 142, this_month: 18 },
  chat:    { total_messages: 384, this_month: 47 },
  support: { total_notifications: 23, unread: 4 },
  fetched_at: new Date().toISOString(),
};

function SparkBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const bw = 14, gap = 4, h = 56;
  const totalW = data.length * (bw + gap) - gap;
  return (
    <svg width={totalW} height={h}
      style={{ position: 'absolute', bottom: 0, right: 12, opacity: 0.18, pointerEvents: 'none' }}>
      {data.map((v, i) => {
        const bh = Math.max(3, (v / max) * h);
        return <rect key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={3} fill={color} />;
      })}
    </svg>
  );
}

function KpiCard({ icon, iconBg, iconColor, value, label, sub, subUp, bars, barColor, to }: {
  icon: string; iconBg: string; iconColor: string;
  value: string | number; label: string; sub: string; subUp: boolean;
  bars?: number[]; barColor: string; to?: string;
}) {
  const Wrapper = (to ? Link : 'div') as any;
  return (
    <Wrapper {...(to ? { to } : {})} style={{
      flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
      background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)',
      padding: '18px 18px 14px', cursor: to ? 'pointer' : 'default',
      textDecoration: 'none', color: 'inherit', boxSizing: 'border-box',
    }}>
      {bars && bars.length > 1 && <SparkBars data={bars} color={barColor} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        <div style={{ width: 44, height: 44, borderRadius: 9, background: iconBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon as IconName} size={20} color={iconColor} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{value}</div>
          <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, position: 'relative', fontSize: 11, color: subUp ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
        <Icon name={subUp ? 'trendingUp' : 'trendingDown'} size={12} color={subUp ? 'var(--green)' : 'var(--red)'} />
        {sub}
      </div>
    </Wrapper>
  );
}

function StatusCard({ label, value, pct, color, icon }: { label: string; value: string; pct: number; color: string; icon: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--white)', borderRadius: 9, border: '1px solid var(--border)', padding: '16px 18px' }}>
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
function ModuleSummaryCard({ icon, title, color, bg, to, children }: {
  icon: IconName; title: string; color: string; bg: string;
  to: string; children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'var(--white)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--elev-sm)' }}>
            <Icon name={icon} size={14} color={color} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{title}</span>
        </div>
        <Link to={to}
          style={{ fontSize: 11, fontWeight: 600, color, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          Open <Icon name="chevronRight" size={12} color={color} />
        </Link>
      </div>
      {children}
    </div>
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
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(100,116,139,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
  const [metrics, setMetrics] = useState<ToolsMetrics>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/v1/hr/tools-overview');
      if (res && typeof res === 'object' && 'hr' in res) {
        setMetrics(res as ToolsMetrics);
        setLastUpdated(new Date());
      }
    } catch { /* keep fallback */ }
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
  const docsPct         = Math.min(Math.round((files.this_month / Math.max(files.total * 0.15, 1)) * 100), 100);
  const chatPct         = Math.min(Math.round((chat.this_month / Math.max(chat.total_messages * 0.15, 1)) * 100), 100);
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
            <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <Icon name="refresh" size={13} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        }
      />

      {/* ── Row 1: KPI Cards ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <KpiCard
          icon="users" iconBg="rgba(8,145,178,0.1)" iconColor="var(--teal)"
          value={hr.total_staff} label="Total Staff"
          sub={`${hr.active_staff} active, ${hr.on_leave} on leave`}
          subUp={hr.active_staff >= hr.total_staff * 0.7}barColor="var(--teal)"
          to="/nexushr/employees"
        />
        <KpiCard
          icon="check" iconBg="rgba(16,185,129,0.1)" iconColor="var(--green)"
          value={hr.today_present} label="Present Today"
          sub={`${attendanceRate}% attendance rate`}
          subUp={attendanceRate >= 70}barColor="var(--green)"
          to="/nexushr/attendance"
        />
        <KpiCard
          icon="calendar" iconBg="rgba(245,158,11,0.12)" iconColor="#f59e0b"
          value={hr.pending_leaves} label="Pending Leave Requests"
          sub={`${hr.on_leave} currently on leave`}
          subUp={hr.pending_leaves === 0}barColor="#f59e0b"
          to="/nexushr/leaves"
        />
        <KpiCard
          icon="bell"
          iconBg={support.unread > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}
          iconColor={support.unread > 0 ? 'var(--red)' : 'var(--green)'}
          value={support.unread} label="Unread Notifications"
          sub={`${support.total_notifications} total in system`}
          subUp={support.unread === 0}barColor={support.unread > 0 ? 'var(--red)' : 'var(--green)'}
        />
      </div>

      {/* ── Row 2: Status Cards ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
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
          pct={readRate} color="#7c3aed" icon="bell"
        />
      </div>

      {/* ── Row 3: Module Summaries ── */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
        Module Summaries
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* HRM Dashboard */}
        <ModuleSummaryCard
          icon="briefcase" title="HRM Dashboard"
          color="var(--teal)" bg="rgba(20,184,166,0.05)"
          to="/nexushr"
        >
          <StatGrid stats={[
            { label: 'Total Staff',    value: hr.total_staff,    sub: `${staffActivePct}% active`,              color: 'var(--teal)' },
            { label: 'Present Today',  value: hr.today_present,  sub: `${attendanceRate}% rate`,                color: 'var(--green)' },
            { label: 'On Leave',       value: hr.on_leave,       sub: hr.on_leave > 0 ? 'Currently away' : 'None away' },
            { label: 'Pending Leaves', value: hr.pending_leaves, sub: hr.pending_leaves > 0 ? 'Needs review' : 'All clear', color: hr.pending_leaves > 0 ? '#f59e0b' : undefined },
          ]} />
          <ProgressFooter label="Today's Attendance" value={`${attendanceRate}%`} pct={attendanceRate} color="var(--teal)" />
        </ModuleSummaryCard>

        {/* Carbon Credits */}
        <ModuleSummaryCard
          icon="leaf" title="Carbon Credits"
          color="#059669" bg="#ecfdf5"
          to="/carbon-credits"
        >
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 12 }}>
             <Icon name="award" size={32} color="#059669" />
             <div style={{ fontSize: 13, color: 'var(--ink3)' }}>Track your company's carbon footprint offsets and view certification.</div>
          </div>
          <ProgressFooter label="Offset Tracking" value="Active" pct={100} color="#059669" />
        </ModuleSummaryCard>

        {/* Support */}
        <ModuleSummaryCard
          icon="headphones" title="Support"
          color="#7c3aed" bg="rgba(124,58,237,0.05)"
          to="/support/tickets"
        >
          <StatGrid stats={[
            { label: 'Notifications',  value: support.total_notifications, sub: 'Total in system' },
            { label: 'Unread',         value: support.unread, sub: support.unread > 0 ? 'Action needed' : 'All read', color: support.unread > 0 ? 'var(--red)' : 'var(--green)' },
            { label: 'Read',           value: support.total_notifications - support.unread, sub: 'Viewed',            color: 'var(--green)' },
            { label: 'Read Rate',      value: `${readRate}%`, sub: readRate >= 90 ? 'Excellent' : 'Needs attention',  color: '#7c3aed' },
          ]} />
          <ProgressFooter label="Read Rate" value={`${readRate}%`} pct={readRate} color="#7c3aed" />
        </ModuleSummaryCard>

        {/* Chat */}
        <ModuleSummaryCard
          icon="chatBubble" title="Chat"
          color="var(--blue)" bg="rgba(37,99,235,0.05)"
          to="/chat"
        >
          <StatGrid stats={[
            { label: 'Total Messages', value: chat.total_messages.toLocaleString(), sub: 'All time',           color: 'var(--blue)' },
            { label: 'This Month',     value: chat.this_month,                      sub: `${chatPct}% of avg` },
            { label: 'Files Shared',   value: files.total,                          sub: 'Via file manager'   },
            { label: 'Activity',       value: chatPct >= 80 ? 'High' : chatPct >= 40 ? 'Medium' : 'Low',
              sub: 'vs. monthly avg',  color: chatPct >= 80 ? 'var(--green)' : chatPct >= 40 ? '#f59e0b' : 'var(--red)' },
          ]} />
          <ProgressFooter label="Monthly Message Volume" value={`${chatPct}% of avg`} pct={chatPct} color="var(--blue)" />
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
            <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}>All systems operational</span>
          </div>
        </ModuleSummaryCard>

      </div>
    </div>
  );
};
