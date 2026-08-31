import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon, type IconName } from '../components/Icon.js';
import { Button } from '../components/ui/button.js';
import { MetricsRow, type MetricCardProps } from '../components/MetricCard.js';

interface LeaveBalance {
  code: string;
  name: string;
  entitled: number;
  used: number;
  remaining: number;
}

interface Payslip {
  id: string;
  run_name?: string;
  period_year?: number;
  period_month?: number;
  gross_pay: number;
  net_pay: number;
  paye: number;
  nssf: number;
  created_at: string;
}

interface MyDoc {
  id: string;
  name: string;
  type: string;
  created_at: string;
  storage_key: string;
  expiry_date?: string;
  approval_status?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg, #ffffff)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--ink3)',
};

export function MyHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeClockIn, setActiveClockIn] = useState<any>(null);
  const [weekMins, setWeekMins] = useState(0);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveConfigured, setLeaveConfigured] = useState(true);
  const [latestSlip, setLatestSlip] = useState<Payslip | null>(null);
  const [slipCount, setSlipCount] = useState(0);
  const [myDocs, setMyDocs] = useState<MyDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [act, wk, lve, ps, docs] = await Promise.all([
        apiFetch('/v1/hr/clock-in/active').catch(() => ({ active: false })),
        apiFetch('/v1/hr/clock-in/weekly').catch(() => ({ workedMinutesTotal: 0 })),
        apiFetch('/v1/hr/leave-balances').catch(() => ({ balances: [], configured: false })),
        apiFetch('/v1/payroll/me/payslips').catch(() => []),
        apiFetch('/v1/hr/documents').catch(() => []),
      ]);

      const session = act?.active ? act.session : null;
      setActiveClockIn(session);
      setWeekMins(wk?.workedMinutesTotal || 0);
      setBalances(Array.isArray(lve?.balances) ? lve.balances : []);
      setLeaveConfigured(lve?.configured !== false);

      const slips = Array.isArray(ps) ? ps : [];
      setSlipCount(slips.length);
      setLatestSlip(slips[0] || null);

      if (Array.isArray(docs)) {
        setMyDocs(docs.filter((d: any) => d.user_id === user?.id).slice(0, 5));
      }
    } catch (err) {
      console.error('[MyHub] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const hm = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  const money = (v: any) => 'TZS ' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const slipPeriod = latestSlip && latestSlip.period_year && latestSlip.period_month
    ? new Date(latestSlip.period_year, latestSlip.period_month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : (latestSlip?.run_name ?? 'Current Pay Period');

  const metrics: MetricCardProps[] = [
    {
      title: 'Weekly Hours Tracked',
      value: hm(weekMins),
      sub1Label: 'Target 40h',
      sub1Value: `${Math.min(100, Math.round((weekMins / 2400) * 100))}% completed`,
      barColor: activeClockIn ? 'var(--green)' : 'var(--teal)',
      icon: 'clock',
    },
    {
      title: 'Annual Leave Balance',
      value: balances.length > 0 ? `${balances[0].remaining} Days` : '0 Days',
      sub1Label: 'Total Entitled',
      sub1Value: balances.length > 0 ? `${balances[0].entitled} Days` : 'Configuring',
      barColor: 'var(--teal)',
      icon: 'calendar',
    },
    {
      title: 'Net Salary (Take-Home)',
      value: latestSlip ? money(latestSlip.net_pay) : 'TZS 0',
      sub1Label: 'Period',
      sub1Value: slipPeriod,
      barColor: 'var(--teal)',
      icon: 'dollarSign',
    },
    {
      title: 'Verified Personnel Records',
      value: String(myDocs.length),
      sub1Label: 'Compliance Rating',
      sub1Value: '100% Compliant',
      barColor: 'var(--purple)',
      icon: 'shield',
    },
  ];

  if (loading) return <div style={{ padding: 40, color: 'var(--ink3)', textAlign: 'center' }}>Loading your employee hub…</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 50 }}>
      {/* 📊 KPI Row */}
      <MetricsRow cards={metrics} />

      {/* 🚀 Main Split Dashboard Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, marginTop: 24 }}>
        {/* Left Primary Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card 1: Today's Shift & Attendance Timeline */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                  <Icon name="clock" size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Today's Shift Timeline</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Standard Shift: 08:00 AM – 05:00 PM (1h Break)</div>
                </div>
              </div>
              <Link to="/nexushr/clock-in" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                Full Roster ➔
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { title: 'Expected In', time: '08:00 AM', status: 'Done', color: 'var(--green)' },
                { title: 'Clocked In', time: activeClockIn ? new Date(activeClockIn.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--', status: activeClockIn ? 'Active' : 'Pending', color: activeClockIn ? 'var(--green)' : 'var(--ink3)' },
                { title: 'Lunch Break', time: '01:00 PM', status: '1 Hour', color: 'var(--teal)' },
                { title: 'Expected Out', time: '05:00 PM', status: 'Scheduled', color: 'hsl(var(--primary))' },
              ].map((s, idx) => (
                <div key={idx} style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border)' }}>
                  <div style={labelStyle}>{s.title}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 4, fontFamily: 'var(--mono)' }}>{s.time}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{s.status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Leave Balances & Visual Progress */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--teal)' }}>
                  <Icon name="calendar" size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Leave Entitlements &amp; Allowances</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Track your remaining paid leave days for the year</div>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate('/nexushr/leaves')} style={{ height: 32, fontSize: 12, fontWeight: 700 }}>
                + Request Leave
              </Button>
            </div>

            {!leaveConfigured || balances.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                No leave entitlement package has been configured for your account yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {balances.map(b => {
                  const pct = b.entitled > 0 ? Math.min(100, Math.round((b.remaining / b.entitled) * 100)) : 0;
                  return (
                    <div key={b.code} style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{b.name || b.code}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--teal)', background: 'var(--teal-l)', padding: '2px 6px', borderRadius: 6 }}>
                          {pct}% Available
                        </span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>
                        {b.remaining} <span style={{ fontSize: 12, color: 'var(--ink3)', fontWeight: 500 }}>/ {b.entitled} Days</span>
                      </div>
                      <div style={{ height: 6, width: '100%', background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--teal)', borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: Pay Breakdown & PDF Download */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)' }}>
                  <Icon name="dollarSign" size={17} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Pay &amp; Earnings Summary</div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Period: {slipPeriod}</div>
                </div>
              </div>
              <Link to="/nexushr/my-payslips" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none' }}>
                All Slips ({slipCount}) ➔
              </Link>
            </div>

            {latestSlip ? (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'center' }}>
                <div style={{ background: 'var(--bg)', borderRadius: 12, padding: 18, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Net Take-Home Pay</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      {money(latestSlip.net_pay)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12 }}>
                    <div>Gross Salary: <strong style={{ color: 'var(--ink)' }}>{money(latestSlip.gross_pay)}</strong></div>
                    <div>PAYE Tax: <strong style={{ color: 'var(--ink)' }}>{money(latestSlip.paye)}</strong></div>
                    <div>NSSF: <strong style={{ color: 'var(--ink)' }}>{money(latestSlip.nssf)}</strong></div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
                  <Button onClick={() => navigate('/nexushr/my-payslips')} style={{ height: 42, fontWeight: 700, fontSize: 13 }}>
                    <Icon name="download" size={14} /> Download PDF
                  </Button>
                  <Button variant="outline" onClick={() => navigate(`/nexushr/staff/${user?.id}`)} style={{ height: 38, fontSize: 12 }}>
                    Payment Details
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                No approved payslip generated for your profile yet.
              </div>
            )}
          </div>
        </div>

        {/* Right Secondary Column: Quick Actions & Personal Feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Card 4: Quick Action Shortcuts */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              ESS Quick Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { to: '/nexushr/clock-in', icon: 'clock', label: 'Clock-in' },
                { to: '/nexushr/my-payslips', icon: 'fileText', label: 'Payslips' },
                { to: `/nexushr/staff/${user?.id}`, icon: 'user', label: 'My Profile' },
                { to: '/nexushr/leaves', icon: 'calendar', label: 'Leave' },
                { to: '/nexushr/documents', icon: 'file', label: 'Documents' },
                { to: '/nexushr/holidays', icon: 'sun', label: 'Holidays' },
                { to: '/nexushr/calls', icon: 'camera', label: 'Calls' },
                { to: '/nexushr/shifts', icon: 'timer', label: 'Roster' },
              ].map(q => (
                <Link
                  key={q.to}
                  to={q.to}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--ink)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Icon name={q.icon as IconName} size={15} color="var(--teal)" />
                  <span>{q.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Card 5: My Personnel Documents */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>My Personnel Files</span>
              <Link to="/nexushr/documents" style={{ fontSize: 11.5, color: 'var(--teal)', fontWeight: 600, textDecoration: 'none' }}>
                View All
              </Link>
            </div>

            {myDocs.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: 10, textAlign: 'center' }}>
                No personal contract or ID files attached yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {myDocs.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <Icon name="fileText" size={14} color="var(--teal)" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(`http://localhost:3001/v1/documents/download?key=${encodeURIComponent(doc.storage_key)}&filename=${encodeURIComponent(doc.name)}`, '_blank')}
                      style={{ fontSize: 11, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                    >
                      PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 6: Upcoming Public Holidays */}
          <div style={{ ...cardStyle, background: 'var(--teal-l)', border: '1px solid var(--teal-m)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--teal)', fontWeight: 700, fontSize: 13 }}>
              <Icon name="sun" size={16} /> Upcoming Public Holidays
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.4 }}>
              <strong>Nane Nane Day (Farmers' Day)</strong><br />
              August 8, 2026 • Official National Holiday
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
