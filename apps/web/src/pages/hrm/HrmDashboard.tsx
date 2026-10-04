import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { Icon } from '../../components/Icon.js';
import type { IconName } from '../../components/Icon.js';
import { MetricsRow, type MetricCardProps } from '../../components/MetricCard.js';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Banner } from '../../components/ui/alert.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { Avatar, Badge, PageHeader, Card, S } from './shared.js';
import '../HRMDashboard.css';

const RUN_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  DRAFT:            { bg:'var(--bg)',      fg:'var(--ink3)'  },
  CALCULATED:       { bg:'var(--blue-l)',  fg:'var(--blue)'  },
  PENDING_APPROVAL: { bg:'var(--gold-l)',  fg:'var(--gold)'  },
  APPROVED:         { bg:'var(--green-l)', fg:'var(--green)' },
  PAID:             { bg:'var(--green-l)', fg:'var(--green)' },
  CANCELLED:        { bg:'var(--red-l)',   fg:'var(--red)'   },
};
/* -- Page routing -- */
export function HrmDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<any>(null);
  const [depts, setDepts] = useState<{ name: string; employees: number }[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [dashboardErrors, setDashboardErrors] = useState<string[]>([]);

  useEffect(() => {
    const failed = (label: string) => setDashboardErrors(prev => prev.includes(label) ? prev : [...prev, label]);
    apiFetch('/v1/hr/tools-overview').then(d => setMetrics(d)).catch(() => failed('workforce metrics'));
    apiFetch('/v1/hr/departments')
      .then((r: any) => setDepts((Array.isArray(r) ? r : []).map((d: any) => ({ name: d.name, employees: d.employee_count || 0 }))))
      .catch(() => { setDepts([]); failed('departments'); });
    apiFetch('/v1/payroll/runs')
      .then((r: any) => setRuns(Array.isArray(r) ? r : []))
      .catch(() => { setRuns([]); failed('payroll'); });
    apiFetch('/v1/hr/leaves?status=PENDING')
      .then((r: any) => setPendingLeaves(Array.isArray(r) ? r.slice(0, 5) : []))
      .catch(() => { setPendingLeaves([]); failed('leave approvals'); });
    apiFetch('/v1/hr/holidays?upcoming=true&limit=4')
      .then((r: any) => setHolidays(Array.isArray(r) ? r : []))
      .catch(() => { setHolidays([]); failed('holidays'); });
    apiFetch('/v1/hr/activity-log')
      .then((r: any) => setActivities(Array.isArray(r) ? r.slice(0, 5) : []))
      .catch(() => { setActivities([]); failed('activity'); });
    apiFetch('/v1/hr/recruitment/interviews/upcoming?limit=5')
      .then((r: any) => setInterviews(Array.isArray(r) ? r : []))
      .catch(() => { setInterviews([]); failed('interviews'); });
    apiFetch('/v1/hr/announcements')
      .then((r: any) => setAnnouncements(Array.isArray(r) ? r.slice(0, 3) : []))
      .catch(() => { setAnnouncements([]); failed('announcements'); });
  }, []);

  const hr = metrics?.hr ?? { total_staff:0, active_staff:0, on_leave:0, pending_leaves:0, today_present:0, today_absent:0 };
  const attRate = hr.active_staff > 0 ? Math.round((hr.today_present / hr.active_staff) * 100) : 0;
  const deptTotal = depts.reduce((s, d) => s + d.employees, 0);

  const latestRun = runs.length > 0 ? runs[0] : null;
  const latestRunNet = latestRun ? (Number(latestRun.total_net || 0) / 1_000_000).toFixed(2) : '0.00';
  // holidays is already sorted/limited by the backend; the nearest upcoming
  // one is just its first real (not-yet-passed) entry.
  const nextHoliday = holidays[0] ?? null;

  const kpis = [
    { label:'Total Staff',       value: hr.total_staff,       sub: `${hr.active_staff} active`, icon:'users' as IconName, color:'var(--teal)',  bg:'var(--teal-l)', path:'/nexushr/employees' },
    { label:'Present Today',     value: hr.today_present,     sub: `${attRate}% rate`,          icon:'check' as IconName, color:'var(--green)', bg:'var(--green-l)',  path:'/nexushr/attendance' },
    { label:'On Leave',          value: hr.on_leave,          sub: `${hr.pending_leaves} pending`, icon:'calendar' as IconName, color:'var(--gold)', bg:'var(--gold-l)', path:'/nexushr/leaves' },
    { label:'Pending Approvals', value: hr.pending_leaves,    sub: 'Action required',           icon:'clock' as IconName, color:'var(--red)',   bg:'var(--red-l)',  path:'/nexushr/leaves' },
    { label:'Latest Payroll',    value: `TZS ${latestRunNet}M`, sub: latestRun?.name || 'No run yet', icon:'dollarSign' as IconName, color:'var(--purple)', bg:'var(--purple-l)', path:'/nexushr/payroll' },
  ];

  return (
    <div className="hrd-dashboard">
      <PageHeader
        icon="home"
        title="Workforce Overview"
        sub="Attendance, people operations, leave and payroll at a glance"
      />

      {dashboardErrors.length > 0 && (
        <Banner variant="error" title="Some dashboard data could not be loaded">
          Unavailable: {dashboardErrors.join(', ')}. Refresh the page or try again shortly.
        </Banner>
      )}

      {/* ── SmartHR Admin Welcome & Action Header Banner ──────────────── */}
      {/* ── AI Insights Card Banner ───────────────────────────────────── */}
      {/* ── SmartHR 5 Metric KPI Cards Row ────────────────────────────── */}
      <div className="hrd-kpi-grid">
        {kpis.map(k => (
          <Link key={k.label} to={k.path} className="hrd-kpi-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k.label}</span>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--r)', background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={k.icon} size={18} color={k.color} />
              </div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{k.value}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: k.color, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{k.sub}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Next Holiday Spotlight ─────────────────────────────────────── */}
      {nextHoliday && (
        <div style={{
          background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
          borderRadius: 'var(--r)', padding: '16px 22px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16, boxShadow: 'var(--elev)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--r)', background: 'hsl(var(--primary-foreground) / 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon name="sun" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'hsl(var(--primary-foreground) / 0.75)' }}>Next Holiday</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{nextHoliday.name || nextHoliday.title}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'hsl(var(--primary-foreground) / 0.9)', whiteSpace: 'nowrap' }}>
            {new Date(nextHoliday.date || nextHoliday.start_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      )}

      {/* ── Main SmartHR Dashboard 2-Column Grid ──────────────────────── */}
      <div className="hrd-content-grid">

        {/* ── LEFT COLUMN ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 1. Today's Attendance Overview */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="check" size={16} color="var(--green)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Today's Attendance Overview</span>
              </div>
              <Link to="/nexushr/attendance" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Mark Attendance →</Link>
            </div>
            <div style={{ padding: '20px' }}>
              {[
                { label: 'Present Today', val: hr.today_present, total: hr.active_staff, color: 'var(--green)' },
                { label: 'On Approved Leave', val: hr.on_leave, total: hr.active_staff, color: 'var(--gold)' },
                { label: 'Absent / Unreported', val: hr.today_absent, total: hr.active_staff, color: 'var(--red)' },
              ].map(row => {
                const pct = hr.active_staff > 0 ? Math.round((row.val / hr.active_staff) * 100) : 0;
                return (
                  <div key={row.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>
                        {row.val} <span style={{ color: 'var(--ink3)', fontWeight: 400, fontSize: 12 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 'var(--r-sm)', background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: row.color, borderRadius: 'var(--r-sm)', transition: 'width 0.6s ease' }} />
                    </div>
                  </div>
                );
              })}

              <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--bg)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>Workforce Attendance Rate</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: attRate >= 70 ? 'var(--green)' : 'var(--red)' }}>{attRate}%</div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 'var(--badge-radius)', fontSize: 12, fontWeight: 700,
                  background: attRate >= 70 ? 'var(--green-l)' : 'var(--red-l)',
                  color: attRate >= 70 ? 'var(--green)' : 'var(--red)'
                }}>
                  {attRate >= 70 ? 'Optimal Presence' : 'Attention Needed'}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Department Breakdown */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="building" size={16} color="var(--purple)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Department Distribution</span>
              </div>
              <Link to="/nexushr/departments" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Manage →</Link>
            </div>
            <div style={{ padding: '18px 20px' }}>
              {depts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '16px 0' }}>No departments defined yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {depts.map((d, i) => {
                    const palette = ['var(--teal)', 'var(--blue)', 'var(--purple)', 'var(--green)', 'var(--gold)', 'var(--red)'];
                    const col = palette[i % palette.length];
                    const pct = deptTotal > 0 ? Math.round((d.employees / deptTotal) * 100) : 0;
                    return (
                      <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{d.name}</span>
                        <div style={{ width: 110, height: 6, borderRadius: 'var(--r-sm)', background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 'var(--r-sm)'}} />
                        </div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', minWidth: 40, textAlign: 'right' }}>
                          {d.employees} <span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 400 }}>({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3. Recent Security & System Activity Logs */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="activity" size={16} color="var(--blue)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Recent Audit Activity</span>
              </div>
              <Link to="/nexushr/activity-logs" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>View All →</Link>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {activities.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0', textAlign: 'center' }}>No recent audit activity logged.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {activities.map((a: any, idx: number) => (
                    <div key={a.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: idx < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="user" size={14} color="var(--blue)" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.user_name || a.actor || 'System Event'} — <span style={{ fontWeight: 400, color: 'var(--ink2)' }}>{a.action || a.description}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                          {a.created_at ? new Date(a.created_at).toLocaleString() : 'Just now'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Upcoming Interviews */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="userPlus" size={16} color="var(--purple)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Upcoming Interviews</span>
              </div>
              <Link to="/nexushr/recruitment" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Recruitment →</Link>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {interviews.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0', textAlign: 'center' }}>No interviews scheduled.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {interviews.map((iv: any) => {
                    const modeInfo: Record<string, { icon: IconName; label: string; color: string; bg: string }> = {
                      VIDEO:  { icon: 'video' as IconName,  label: 'Video call', color: 'var(--blue)',   bg: 'var(--blue-l)' },
                      PHONE:  { icon: 'phone' as IconName,  label: 'Phone',      color: 'var(--green)',  bg: 'var(--green-l)' },
                      ONSITE: { icon: 'mapPin' as IconName, label: 'On-site',    color: 'var(--gold)',   bg: 'var(--gold-l)' },
                    };
                    const m = modeInfo[iv.mode] ?? modeInfo.VIDEO;
                    return (
                      <div key={iv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <PersonAvatar userId={iv.candidate_id} kind="candidates" name={iv.candidate_name} size={30} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{iv.candidate_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            {new Date(iv.scheduled_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            {iv.interviewer_name ? ` · with ${iv.interviewer_name}` : ''}
                          </div>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--r)', background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
                          <Icon name={m.icon} size={10} /> {m.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* 1. Payroll Runs Widget */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="dollarSign" size={16} color="var(--green)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Payroll Engine</span>
              </div>
              <Link to="/nexushr/payroll" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Payroll →</Link>
            </div>
            <div style={{ padding: '18px 20px' }}>
              {runs.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', textAlign: 'center', padding: '16px 0' }}>No statutory payroll runs configured yet.</div>
              ) : (() => {
                const latest = runs[0];
                const st = RUN_STATUS_STYLE[latest.status] ?? RUN_STATUS_STYLE.DRAFT;
                return (
                  <>
                    <div style={{ padding: '16px', background: 'var(--bg)', borderRadius: 'var(--r)', marginBottom: 12, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{latest.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 'var(--r)', background: st.bg, color: st.fg, textTransform: 'uppercase' }}>
                          {String(latest.status).replace('_',' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font)', letterSpacing: '-0.02em' }}>
                        TZS {(Number(latest.total_net || 0) / 1_000_000).toFixed(2)}M
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Net payout across verified employee contracts</div>
                    </div>
                    {runs.slice(1, 4).map((r: any) => {
                      const rs = RUN_STATUS_STYLE[r.status] ?? RUN_STATUS_STYLE.DRAFT;
                      return (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{r.name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, fontFamily: 'var(--font)', fontWeight: 700, color: 'var(--ink2)' }}>
                              {(Number(r.total_net || 0) / 1_000_000).toFixed(1)}M
                            </span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--r)', background: rs.bg, color: rs.fg, textTransform: 'uppercase' }}>
                              {String(r.status).replace('_',' ')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>

          {/* 2. Pending Leave Requests */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="calendar" size={16} color="var(--gold)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Pending Leave Approvals</span>
              </div>
              <Link to="/nexushr/leaves" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Review ({pendingLeaves.length}) →</Link>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {pendingLeaves.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '16px 0', textAlign: 'center' }}>No pending leave applications.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pendingLeaves.map((l: any, idx: number) => (
                    <div key={l.id || idx} style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--r)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{l.user_name || l.employee_name || 'Staff Member'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{l.leave_type || 'Annual Leave'} • {l.start_date || 'Upcoming'}</div>
                      </div>
                      <Link to="/nexushr/leaves" style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: 'var(--teal-l)', color: 'var(--teal)', textDecoration: 'none' }}>
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 3. Upcoming Holidays */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="sun" size={16} color="var(--teal)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Upcoming Holidays</span>
              </div>
              <Link to="/nexushr/holidays" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>Calendar →</Link>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {holidays.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0', textAlign: 'center' }}>No upcoming public holidays listed.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {holidays.map((h: any, idx: number) => (
                    <div key={h.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: idx < holidays.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="sun" size={14} color="var(--teal)" />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{h.name || h.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{h.date || h.start_date}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r)', background: 'var(--bg)', color: 'var(--ink2)' }}>
                        Holiday
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4. Latest Announcements */}
          <div style={{ background: 'var(--white)', borderRadius: 'var(--r)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--elev-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="volume2" size={16} color="var(--ink3)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Latest Announcements</span>
              </div>
              <Link to="/nexushr/announcements" style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>View All →</Link>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {(() => {
                const catColor: Record<string, string> = { HR: 'var(--purple)', Policy: 'var(--teal)', IT: 'var(--blue)' };
                const catBg: Record<string, string> = { HR: 'var(--purple-l)', Policy: 'var(--teal-l)', IT: 'var(--blue-l)' };
                return announcements.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--ink3)', padding: '12px 0', textAlign: 'center' }}>No announcements posted yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {announcements.map((a: any, idx: number) => (
                      <div key={a.id || idx} style={{ display: 'flex', gap: 10, paddingBottom: idx < announcements.length - 1 ? 14 : 0, borderBottom: idx < announcements.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: catColor[a.category] || 'var(--ink3)', marginTop: 5, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{a.title}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {a.body}
                          </div>
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: catBg[a.category] || 'var(--bg)', color: catColor[a.category] || 'var(--ink2)' }}>
                              {a.category || 'General'}
                            </span>
                            {a.author_name && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>By {a.author_name}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

        </div>
      </div>

      {/* ── SmartHR HR Hub Quick Modules Grid Section ───────────────────── */}
      <div className="hrd-hub">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>SmartHR Management Hub</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--ink3)' }}>Direct access shortcuts to core workforce applications & features</p>
          </div>
        </div>
        <div className="hrd-hub-grid">
          {[
            { label:'Manage Staff',    icon:'users'      as IconName, path:'/nexushr/employees',   color:'var(--blue)', bg:'var(--blue-l)' },
            { label:'Attendance',      icon:'clock'      as IconName, path:'/nexushr/attendance',  color:'var(--teal)', bg:'var(--teal-l)' },
            { label:'Leave Requests',  icon:'calendar'   as IconName, path:'/nexushr/leaves',      color:'var(--gold)', bg:'var(--gold-l)' },
            { label:'Payroll Engine',  icon:'dollarSign' as IconName, path:'/nexushr/payroll',     color:'var(--green)', bg:'var(--green-l)' },
            { label:'Departments',     icon:'building'   as IconName, path:'/nexushr/departments', color:'var(--purple)', bg:'var(--purple-l)' },
            { label:'Shift Roster',    icon:'timer'      as IconName, path:'/nexushr/shifts',      color:'var(--blue)', bg:'var(--blue-l)' },
            { label:'Overtime',        icon:'zap'        as IconName, path:'/nexushr/overtime',    color:'var(--gold)', bg:'var(--gold-l)' },
            { label:'Org Chart',       icon:'layers'     as IconName, path:'/nexushr/org-chart',   color:'var(--teal)', bg:'var(--teal-l)' },
            { label:'Recruitment',     icon:'userPlus'   as IconName, path:'/nexushr/recruitment', color:'var(--purple)', bg:'var(--purple-l)' },
            { label:'Performance',     icon:'target'     as IconName, path:'/nexushr/performance', color:'var(--green)', bg:'var(--green-l)' },
            { label:'IT Admin',        icon:'barChart2'  as IconName, path:'/ondi/it-admin',       color:'var(--red)', bg:'var(--red-l)' },
            { label:'Announcements',   icon:'volume2'    as IconName, path:'/nexushr/announcements',color:'var(--ink3)',bg:'rgba(100,116,139,0.08)' },
            { label:'Roles & Security',icon:'shield'     as IconName, path:'/nexushr/roles',       color:'var(--red)', bg:'var(--red-l)' },
            { label:'HR Documents',    icon:'fileText'   as IconName, path:'/nexushr/documents',   color:'var(--blue)', bg:'var(--blue-l)' },
            { label:'Asset Tracking',  icon:'package'    as IconName, path:'/nexushr/assets',      color:'var(--teal)', bg:'var(--teal-l)' },
            { label:'Visitors',        icon:'userPlus'   as IconName, path:'/nexushr/visitors',    color:'var(--purple)', bg:'var(--purple-l)' },
          ].map(m => (
            <Link key={m.path} to={m.path} className="hrd-hub-link" style={{ '--hrd-module-color': m.color, '--hrd-module-bg': m.bg } as React.CSSProperties}>
              <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={m.icon} size={15} color={m.color} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.25 }}>{m.label}</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}