import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Button } from '../../components/ui/button.js';
import { BlissReportExportModal } from './BlissReportExportModal.js';
import { useSupportMetrics, PeriodSwitcher } from '../SupportOverviewShared.js';
import './BlissReports.css';

interface SLABreachRecord {
  id: string;
  ticketRef: string;
  customer: string;
  category: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  targetTime: string;
  actualTime: string;
  breachAmount: string;
  isBreached: boolean;
  assignedTo: string;
  createdAt: string;
}

const SAMPLE_BREACHES: SLABreachRecord[] = [
  { id: 'b-1', ticketRef: '#TCK-4790', customer: 'Grace Whitman', category: 'Tariff Classification', priority: 'HIGH', targetTime: '4h', actualTime: '6h 42m', breachAmount: '+2h 42m', isBreached: true, assignedTo: 'Sarah Whitfield', createdAt: 'Today, 09:15' },
  { id: 'b-2', ticketRef: '#TCK-4802', customer: 'Noah Petrov', category: 'Cargo Telemetry & GPS', priority: 'URGENT', targetTime: '2h', actualTime: '3h 15m', breachAmount: '+1h 15m', isBreached: true, assignedTo: 'Rahul Mehta', createdAt: 'Today, 10:30' },
  { id: 'b-3', ticketRef: '#TCK-4809', customer: 'Lena Kowalski', category: 'Demurrage Tariff Dispute', priority: 'LOW', targetTime: '8h', actualTime: '9h 05m', breachAmount: '+1h 05m', isBreached: true, assignedTo: 'Yuki Tanaka', createdAt: 'Yesterday' },
  { id: 'b-4', ticketRef: '#TCK-4815', customer: 'Amir Hussain', category: 'Payment & Currency Exchange', priority: 'HIGH', targetTime: '4h', actualTime: '4h 38m', breachAmount: '+38m', isBreached: true, assignedTo: 'Chloe Dubois', createdAt: 'Yesterday' },
  { id: 'b-5', ticketRef: '#TCK-4821', customer: 'Priya Sharma', category: 'BRELA Company Search', priority: 'URGENT', targetTime: '2h', actualTime: '2h 51m', breachAmount: '+51m', isBreached: true, assignedTo: 'Ethan Alvarez', createdAt: '2 days ago' },
  { id: 'b-6', ticketRef: '#TCK-4828', customer: 'Marco Diaz', category: 'Customs Declaration #TZ-992', priority: 'LOW', targetTime: '8h', actualTime: '11h 20m', breachAmount: '+3h 20m', isBreached: true, assignedTo: 'Sofia Reyes', createdAt: '2 days ago' },
  { id: 'b-7', ticketRef: '#TCK-4834', customer: 'Sofia Reyes', category: 'Container Release Letter', priority: 'HIGH', targetTime: '4h', actualTime: '4h 47m', breachAmount: '+47m', isBreached: true, assignedTo: 'Daniel Cho', createdAt: '3 days ago' },
  { id: 'b-8', ticketRef: '#TCK-4841', customer: 'Daniel Cho', category: 'Port Wharfage Invoice', priority: 'URGENT', targetTime: '2h', actualTime: '3h 58m', breachAmount: '+1h 58m', isBreached: true, assignedTo: 'Isabella Marchetti', createdAt: '3 days ago' },
  { id: 'b-9', ticketRef: '#TCK-4849', customer: 'Isabella Marchetti', category: 'Bonded Warehouse Stock Out', priority: 'LOW', targetTime: '8h', actualTime: '8h 33m', breachAmount: '+33m', isBreached: true, assignedTo: 'Marco Diaz', createdAt: '4 days ago' },
  { id: 'b-10', ticketRef: '#TCK-4856', customer: 'Tariq Al-Mansour', category: 'Escalated Dispatch Claim', priority: 'HIGH', targetTime: '4h', actualTime: '6h 09m', breachAmount: '+2h 09m', isBreached: true, assignedTo: 'Sarah Whitfield', createdAt: '5 days ago' },
];

const SLA_TREND_DATA = [
  { week: 'Week 1', rate: 89.2, target: 92.0 },
  { week: 'Week 2', rate: 90.8, target: 92.0 },
  { week: 'Week 3', rate: 88.5, target: 92.0 },
  { week: 'Week 4', rate: 93.1, target: 92.0 },
  { week: 'Week 5', rate: 92.4, target: 92.0 },
  { week: 'Week 6', rate: 94.2, target: 92.0 },
];

export const SLAComplianceReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = useSupportMetrics();

  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const filteredBreaches = useMemo(() => {
    return SAMPLE_BREACHES.filter(b => {
      const matchSearch = !search || b.ticketRef.toLowerCase().includes(search.toLowerCase()) || b.customer.toLowerCase().includes(search.toLowerCase()) || b.category.toLowerCase().includes(search.toLowerCase());
      const matchPri = priorityFilter === 'ALL' || b.priority === priorityFilter;
      return matchSearch && matchPri;
    });
  }, [search, priorityFilter]);

  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        {/* Page Header */}
        <PageHeader
          crumbs={['BLISS', 'REPORTS', 'SLA COMPLIANCE']}
          titlePlain="SLA Compliance"
          titleEm="report"
          subtitle="Service level agreement tracking, resolution deadlines & breach prevention · Last 30 days"
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', padding: 3, borderRadius: 'var(--r, 6px)', border: '1px solid var(--border)' }}>
                <PeriodSwitcher period={period} setPeriod={setPeriod} />
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/bliss/overview')}>
                <Icon name="activity" size={14} /> Overview
              </Button>
              <Button size="sm" onClick={() => setExportOpen(true)}>
                <Icon name="download" size={14} /> Export Report
              </Button>
            </div>
          }
        />

        {/* 6 KPI Cards with Hover Accent Bars */}
        <div className="bliss-kpi-strip">
          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#10b981' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-success"><Icon name="shield" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> +1.2%
              </span>
            </div>
            <div className="bliss-kpi-val" style={{ color: '#10b981' }}>91.4%</div>
            <div className="bliss-kpi-lbl">Met SLA Target</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#ef4444' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-danger"><Icon name="alertTriangle" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>107 cases</span>
            </div>
            <div className="bliss-kpi-val" style={{ color: '#ef4444' }}>8.6%</div>
            <div className="bliss-kpi-lbl">Breached SLA</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#0ea5e9' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-info"><Icon name="clock" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>Benchmark &lt; 30m</span>
            </div>
            <div className="bliss-kpi-val">18m</div>
            <div className="bliss-kpi-lbl">Avg. First Response</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: 'var(--teal, #0f766e)' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-primary"><Icon name="clipboard" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>100% Tracked</span>
            </div>
            <div className="bliss-kpi-val">1,240</div>
            <div className="bliss-kpi-lbl">Tickets This Period</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#7c3aed' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-purple"><Icon name="timer" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowDown" size={11} /> 14m
              </span>
            </div>
            <div className="bliss-kpi-val">3h 52m</div>
            <div className="bliss-kpi-lbl">Avg. Resolution Time</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#f59e0b' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-warning"><Icon name="smile" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>Top tier</span>
            </div>
            <div className="bliss-kpi-val">96.1%</div>
            <div className="bliss-kpi-lbl">CSAT on SLA Met</div>
          </div>
        </div>

        {/* Bento Row: Compliance Gauge + SLA Trend AreaChart */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
          {/* Compliance Gauge Card */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-5">
            <SectionCard>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="checkCircle" size={16} color="#10b981" />
                Overall Compliance Rate
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
                Target SLA standard vs actual fulfilled deadlines
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
                <div style={{ position: 'relative', width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="160" height="160" viewBox="0 0 160 160">
                    <circle cx="80" cy="80" r="64" fill="none" stroke="var(--bg)" strokeWidth="14" />
                    <circle
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="14"
                      strokeDasharray={402}
                      strokeDashoffset={402 * (1 - 0.914)}
                      strokeLinecap="round"
                      transform="rotate(-90 80 80)"
                    />
                  </svg>
                  <div style={{ position: 'absolute', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', letterSpacing: '-0.02em', lineHeight: 1 }}>
                      91.4%
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', marginTop: 4 }}>
                      SLA MET
                    </div>
                  </div>
                </div>

                <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>1,133</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>Within SLA Target</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>107</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>SLA Breached</div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* SLA Trend Chart Card */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-7">
            <SectionCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="trendingUp" size={16} color="var(--teal)" />
                    SLA Compliance Trend
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Weekly performance vs 92.0% SLA target benchmark</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} /> Met Rate %
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} /> Target (92%)
                  </span>
                </div>
              </div>

              <div style={{ width: '100%', height: 210, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={SLA_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="slaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--teal)" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="week" stroke="var(--ink3)" fontSize={11} tickLine={false} />
                    <YAxis domain={[80, 100]} stroke="var(--ink3)" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--white)',
                        borderColor: 'var(--border)',
                        borderRadius: 'var(--r, 8px)',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                      formatter={(val: any) => [`${val}%`, 'SLA Met Rate']}
                    />
                    <Area type="monotone" dataKey="rate" stroke="var(--teal)" strokeWidth={2.5} fillOpacity={1} fill="url(#slaGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Priority Breakdown & Team Breach Rate Bento */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
          {/* Priority Breakdown */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-7">
            <SectionCard>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="flag" size={16} color="var(--teal)" />
                Compliance by Ticket Priority
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="bliss-meter-item">
                  <div className="bliss-meter-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#ef4444' }}>
                      <Icon name="flag" size={13} /> Urgent (1h Target)
                    </span>
                    <span style={{ fontWeight: 800 }}>82.0%</span>
                  </div>
                  <div className="bliss-meter-track">
                    <div className="bliss-meter-fill" style={{ width: '82%', background: '#ef4444' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>210 tickets handled · 38 breached</div>
                </div>

                <div className="bliss-meter-item">
                  <div className="bliss-meter-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#f59e0b' }}>
                      <Icon name="flag" size={13} /> High (2h Target)
                    </span>
                    <span style={{ fontWeight: 800 }}>88.4%</span>
                  </div>
                  <div className="bliss-meter-track">
                    <div className="bliss-meter-fill" style={{ width: '88.4%', background: '#f59e0b' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>356 tickets handled · 41 breached</div>
                </div>

                <div className="bliss-meter-item">
                  <div className="bliss-meter-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#0ea5e9' }}>
                      <Icon name="flag" size={13} /> Medium (4h Target)
                    </span>
                    <span style={{ fontWeight: 800 }}>93.6%</span>
                  </div>
                  <div className="bliss-meter-track">
                    <div className="bliss-meter-fill" style={{ width: '93.6%', background: '#0ea5e9' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>468 tickets handled · 30 breached</div>
                </div>

                <div className="bliss-meter-item">
                  <div className="bliss-meter-header">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#10b981' }}>
                      <Icon name="flag" size={13} /> Low (8h Target)
                    </span>
                    <span style={{ fontWeight: 800 }}>98.1%</span>
                  </div>
                  <div className="bliss-meter-track">
                    <div className="bliss-meter-fill" style={{ width: '98.1%', background: '#10b981' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>206 tickets handled · 4 breached</div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Top Teams by Breach Rate */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-5">
            <SectionCard padded={false}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="users" size={16} color="var(--teal)" />
                  Top Teams by Breach Rate
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Queues requiring staffing or triage optimization</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { name: 'Billing Support', count: 142, rate: '14.1% breach', badge: 'danger', icon: 'creditCard' },
                  { name: 'Technical Support & API', count: 389, rate: '9.3% breach', badge: 'warning', icon: 'code' },
                  { name: 'Onboarding & KYC', count: 205, rate: '6.8% breach', badge: 'info', icon: 'userPlus' },
                  { name: 'Customs & Port Logistics', count: 312, rate: '4.2% breach', badge: 'info', icon: 'truck' },
                  { name: 'Account Management', count: 504, rate: '2.4% breach', badge: 'success', icon: 'checkCircle' },
                ].map((tm, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: idx < 4 ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={`bliss-chip-icon is-${tm.badge === 'danger' ? 'danger' : tm.badge === 'warning' ? 'warning' : tm.badge === 'info' ? 'info' : 'success'}`} style={{ width: 32, height: 32 }}>
                        <Icon name={tm.icon as any} size={15} />
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{tm.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{tm.count} cases handled</div>
                      </div>
                    </div>
                    <span className={`bliss-badge-soft ${tm.badge}`}>{tm.rate}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        {/* SLA Breaches & At-Risk Queue Table */}
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Recent SLA Breaches &amp; Escalations</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Detailed audit log of tickets exceeding configured service level commitments</div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 220 }}>
                <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input
                  type="text"
                  placeholder="Search tickets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: 'var(--r, 6px)',
                    border: '1px solid var(--border)',
                    fontSize: 12.5,
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                    outline: 'none',
                  }}
                />
              </div>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--r, 6px)',
                  border: '1px solid var(--border)',
                  fontSize: 12.5,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              >
                <option value="ALL">All Priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
          </div>

          <div className="bliss-report-table-wrap">
            <table className="bliss-report-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>SLA Target</th>
                  <th>Actual Time</th>
                  <th>Breach Amount</th>
                  <th>Assigned Agent</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredBreaches.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 700, color: 'var(--teal)', fontFamily: 'monospace' }}>
                      {b.ticketRef}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.customer}</td>
                    <td><span className="bliss-badge-soft neutral">{b.category}</span></td>
                    <td>
                      <span className={`bliss-badge-soft ${b.priority === 'URGENT' ? 'danger' : b.priority === 'HIGH' ? 'warning' : b.priority === 'MEDIUM' ? 'info' : 'neutral'}`}>
                        {b.priority}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink2)' }}>{b.targetTime}</td>
                    <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{b.actualTime}</td>
                    <td>
                      <span className={`bliss-badge-soft ${b.breachAmount.includes('h') ? 'danger' : 'warning'}`}>
                        {b.breachAmount}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink2)' }}>{b.assignedTo}</td>
                    <td style={{ color: 'var(--ink3)', fontSize: 11.5 }}>{b.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Export Dialog */}
      <BlissReportExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        reportTitle="SLA Compliance Report"
        data={filteredBreaches}
        filenamePrefix="sla_compliance_report"
      />
    </div>
  );
};
