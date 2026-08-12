import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, IconName } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';

// Employee self-service landing. Every widget reads a self-scoped endpoint
// (identity from the token), so this page needs no manager role — it is the one
// NexusHR surface a regular employee lands on.
export function MyHubPage() {
  const { user } = useAuth();
  const [active, setActive] = useState<any>(null);
  const [weekMins, setWeekMins] = useState(0);
  const [balances, setBalances] = useState<any[]>([]);
  const [leaveConfigured, setLeaveConfigured] = useState(true);
  const [latestSlip, setLatestSlip] = useState<any>(null);
  const [slipCount, setSlipCount] = useState(0);

  useEffect(() => {
    apiFetch('/v1/hr/clock-in/active').then(r => setActive(r?.active ? r.session : null)).catch(() => {});
    apiFetch('/v1/hr/clock-in/weekly').then(r => setWeekMins(r?.workedMinutesTotal || 0)).catch(() => {});
    apiFetch('/v1/hr/leave-balances').then(r => { setBalances(r?.balances || []); setLeaveConfigured(r?.configured !== false); }).catch(() => {});
    apiFetch('/v1/payroll/me/payslips').then(r => { const list = Array.isArray(r) ? r : []; setSlipCount(list.length); setLatestSlip(list[0] || null); }).catch(() => {});
  }, []);

  const hm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  const money = (v: any) => 'TZS ' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const slipPeriod = latestSlip && latestSlip.period_year && latestSlip.period_month
    ? new Date(latestSlip.period_year, latestSlip.period_month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (latestSlip?.run_name ?? '');

  const clockInAt = active?.clock_in_at ? new Date(active.clock_in_at) : null;

  const card: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' };
  const cardHead = (icon: IconName, title: string, variant: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <FeaturedIcon variant={variant} size="sm" shape="square"><Icon name={icon} size={17} strokeWidth={1.75} /></FeaturedIcon>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{title}</span>
    </div>
  );
  const linkBtn = (to: string, label: string) => (
    <Link to={to} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25, textDecoration: 'none', alignSelf: 'flex-start' }}>
      {label} <Icon name="arrowRight" size={13} />
    </Link>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        crumbs={['NexusHR', 'My HR']}
        titlePlain="My"
        titleEm="hub"
        subtitle={`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''} — your time, leave and pay at a glance.`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Clock-in status + week hours */}
        <div style={card}>
          {cardHead('clock', 'Time this week', active ? 'success' : 'gray')}
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', fontFamily: 'var(--mono)' }}>{hm(weekMins)}</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>logged in the last 7 days</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--green)' : 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--ink3)' }} />
            {active ? `Clocked in${clockInAt ? ` since ${clockInAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}` : 'Not clocked in'}
          </div>
          {linkBtn('/nexushr/clock-in', active ? 'Go to timesheet' : 'Clock in')}
        </div>

        {/* Leave balances */}
        <div style={card}>
          {cardHead('calendar', 'Leave balance', 'info')}
          {!leaveConfigured || balances.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No leave entitlement is configured for you yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {balances.slice(0, 4).map((b: any) => (
                <div key={b.code || b.leave_type_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{b.name || b.code}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {Number(b.remaining ?? 0)}<span style={{ fontSize: 11, color: 'var(--ink3)', fontWeight: 500 }}> / {Number(b.entitled ?? 0)} days</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Latest payslip */}
        <div style={card}>
          {cardHead('dollarSign', 'Latest payslip', 'brand')}
          {latestSlip ? (
            <>
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{money(latestSlip.net_pay)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--ink3)', marginTop: 2 }}>net pay · {slipPeriod}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>{slipCount} payslip{slipCount === 1 ? '' : 's'} on file</div>
              {linkBtn('/nexushr/my-payslips', 'View payslips')}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No approved payslip yet. It appears here once a payroll run that includes you is approved.</div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 10 }}>Quick links</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {([
            { to: '/nexushr/clock-in', icon: 'clock' as IconName, label: 'Clock-in & timesheet' },
            { to: '/nexushr/my-payslips', icon: 'fileText' as IconName, label: 'My payslips' },
            { to: `/nexushr/staff/${user?.id ?? ''}`, icon: 'user' as IconName, label: 'My profile' },
          ]).map(q => (
            <Link key={q.to} to={q.to} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25, textDecoration: 'none' }}>
              <Icon name={q.icon} size={13} /> {q.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
