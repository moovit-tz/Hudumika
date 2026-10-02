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

const TRAFFIC_TREND_DATA = [
  { day: 'Jul 1', visits: 680, resolved: 610 },
  { day: 'Jul 4', visits: 720, resolved: 650 },
  { day: 'Jul 7', visits: 850, resolved: 780 },
  { day: 'Jul 10', visits: 910, resolved: 840 },
  { day: 'Jul 13', visits: 990, resolved: 920 },
  { day: 'Jul 16', visits: 840, resolved: 790 },
  { day: 'Jul 19', visits: 1040, resolved: 980 },
  { day: 'Jul 22', visits: 1120, resolved: 1050 },
  { day: 'Jul 25', visits: 980, resolved: 910 },
  { day: 'Jul 28', visits: 1180, resolved: 1110 },
  { day: 'Jul 30', visits: 1240, resolved: 1170 },
];

interface DailyTrafficRow {
  date: string;
  inbound: number;
  uniqueUsers: number;
  firstResponse: string;
  deflectionRate: string;
  fcrRate: string;
}

const DAILY_TRAFFIC_DATA: DailyTrafficRow[] = [
  { date: 'Jul 30, 2026', inbound: 1240, uniqueUsers: 840, firstResponse: '1m 45s', deflectionRate: '46.2%', fcrRate: '71.4%' },
  { date: 'Jul 29, 2026', inbound: 1190, uniqueUsers: 790, firstResponse: '1m 52s', deflectionRate: '45.0%', fcrRate: '69.8%' },
  { date: 'Jul 28, 2026', inbound: 1180, uniqueUsers: 760, firstResponse: '2m 10s', deflectionRate: '43.8%', fcrRate: '68.2%' },
  { date: 'Jul 27, 2026', inbound: 920, uniqueUsers: 610, firstResponse: '1m 38s', deflectionRate: '48.1%', fcrRate: '73.0%' },
  { date: 'Jul 26, 2026', inbound: 890, uniqueUsers: 580, firstResponse: '1m 40s', deflectionRate: '47.5%', fcrRate: '72.4%' },
  { date: 'Jul 25, 2026', inbound: 980, uniqueUsers: 640, firstResponse: '2m 04s', deflectionRate: '44.1%', fcrRate: '67.9%' },
  { date: 'Jul 24, 2026', inbound: 1050, uniqueUsers: 710, firstResponse: '1m 58s', deflectionRate: '42.9%', fcrRate: '66.8%' },
  { date: 'Jul 23, 2026', inbound: 1110, uniqueUsers: 740, firstResponse: '2m 15s', deflectionRate: '41.8%', fcrRate: '65.4%' },
  { date: 'Jul 22, 2026', inbound: 1120, uniqueUsers: 750, firstResponse: '2m 08s', deflectionRate: '43.2%', fcrRate: '67.0%' },
  { date: 'Jul 21, 2026', inbound: 1080, uniqueUsers: 720, firstResponse: '1m 59s', deflectionRate: '44.6%', fcrRate: '68.9%' },
];

export const SupportTrafficReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = useSupportMetrics();

  const [channelFilter, setChannelFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const filteredTraffic = useMemo(() => {
    return DAILY_TRAFFIC_DATA.filter(t => {
      return !search || t.date.toLowerCase().includes(search.toLowerCase());
    });
  }, [search]);

  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        {/* Page Header */}
        <PageHeader
          crumbs={['BLISS', 'REPORTS', 'TRAFFIC & INBOUND']}
          titlePlain="Traffic & Inbound"
          titleEm="report"
          subtitle="Support channel traffic volume, inquiry origin & deflection analytics · Last 30 days"
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
            <span className="bliss-kpi-accent-bar" style={{ background: 'var(--teal, #0f766e)' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-primary"><Icon name="inbox" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> +12.4%
              </span>
            </div>
            <div className="bliss-kpi-val">24,820</div>
            <div className="bliss-kpi-lbl">Total Inquiries</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#0ea5e9' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-info"><Icon name="users" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>Active Requesters</span>
            </div>
            <div className="bliss-kpi-val">14,350</div>
            <div className="bliss-kpi-lbl">Unique Customers</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#10b981' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-success"><Icon name="sparkle" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> +3.8%
              </span>
            </div>
            <div className="bliss-kpi-val" style={{ color: '#10b981' }}>44.2%</div>
            <div className="bliss-kpi-lbl">AI &amp; KB Deflection</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#7c3aed' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-purple"><Icon name="clock" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>Instant Triage</span>
            </div>
            <div className="bliss-kpi-val">1.8s</div>
            <div className="bliss-kpi-lbl">Avg. Bot Response</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#f59e0b' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-warning"><Icon name="checkCircle" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> +3.2%
              </span>
            </div>
            <div className="bliss-kpi-val">68.5%</div>
            <div className="bliss-kpi-lbl">First Contact Res. (FCR)</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#0284c7' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-info"><Icon name="layers" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>100% Online</span>
            </div>
            <div className="bliss-kpi-val">6</div>
            <div className="bliss-kpi-lbl">Connected Channels</div>
          </div>
        </div>

        {/* Bento Row: Inbound Visits Trend + Channel Donut Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
          {/* Inbound Trend Chart */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-8">
            <SectionCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="activity" size={16} color="var(--teal)" />
                    Inbound Traffic &amp; Resolved Volume
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Daily incoming tickets vs completed resolutions</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--teal)' }} /> Inbound Inquiries
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Resolved Cases
                  </span>
                </div>
              </div>

              <div style={{ width: '100%', height: 210, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={TRAFFIC_TREND_DATA} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trafficInboundGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--teal)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--teal)" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="trafficResolvedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke="var(--ink3)" fontSize={11} tickLine={false} />
                    <YAxis stroke="var(--ink3)" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--white)',
                        borderColor: 'var(--border)',
                        borderRadius: 'var(--r, 8px)',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Area type="monotone" dataKey="visits" stroke="var(--teal)" strokeWidth={2.5} fillOpacity={1} fill="url(#trafficInboundGrad)" name="Inbound Inquiries" />
                    <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#trafficResolvedGrad)" name="Resolved Cases" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          {/* Traffic Sources Breakdown */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-4">
            <SectionCard>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="layers" size={16} color="#0ea5e9" />
                Inbound Traffic Sources
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 16 }}>
                Primary origin channels for customer requests
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { name: 'WhatsApp Business', pct: '38%', count: '9,430', color: '#10b981', icon: 'message' },
                  { name: 'Live Web Chat', pct: '24%', count: '5,950', color: 'var(--teal)', icon: 'chatBubble' },
                  { name: 'Email Desk', pct: '19%', count: '4,710', color: '#0ea5e9', icon: 'mail' },
                  { name: 'Customer Portal', pct: '12%', count: '2,980', color: '#7c3aed', icon: 'globe' },
                  { name: 'Direct Telephony / Calls', pct: '7%', count: '1,750', color: '#f59e0b', icon: 'phone' },
                ].map((src, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: idx < 4 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: src.color }} />
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{src.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--ink3)', fontSize: 11.5 }}>{src.count}</span>
                      <strong style={{ color: 'var(--ink)', width: 36, textAlign: 'right' }}>{src.pct}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>

        {/* Live Support Activity Stream & Engagement Snapshot Bento */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
          {/* Live Activity Stream */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-7">
            <SectionCard>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="activity" size={16} color="#10b981" />
                  Live Support Stream
                </div>
                <span className="bliss-badge-soft teal" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal)' }} />
                  Real-time
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { title: 'New WhatsApp inquiry received', sub: 'Dar es Salaam Port Desk · Consignment #BL-99201', time: '2m ago', chip: 'is-primary', icon: 'message' },
                  { title: 'Customs declaration query resolved via AI', sub: 'Instant Copilot deflection · Tariff classification HS-8703', time: '6m ago', chip: 'is-success', icon: 'sparkle' },
                  { title: 'Payment confirmation ticket assigned', sub: 'Customer: Prime Logistics Ltd · Assigned to Sarah W.', time: '11m ago', chip: 'is-warning', icon: 'creditCard' },
                  { title: 'Customer searching Knowledge Base', sub: 'Search query: "demurrage free days calculation"', time: '14m ago', chip: 'is-info', icon: 'search' },
                  { title: 'Automated status check deflected', sub: 'Container GPS telemetry check · Deflected by webhook', time: '19m ago', chip: 'is-purple', icon: 'truck' },
                  { title: 'Returning clearing agent opened chat', sub: 'VIP tier account: Bakhresa Group · Mobile App session', time: '24m ago', chip: 'is-primary', icon: 'user' },
                ].map((act, idx) => (
                  <div key={idx} className="bliss-live-item">
                    <div className="bliss-live-icon-wrap">
                      <span className={`bliss-chip-icon ${act.chip}`} style={{ width: 34, height: 34 }}>
                        <Icon name={act.icon as any} size={15} />
                      </span>
                      <span className="bliss-live-dot" style={{ background: '#10b981' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{act.title}</div>
                        <span style={{ fontSize: 11, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>{act.time}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{act.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Engagement Snapshot & Health Signals */}
          <div style={{ gridColumn: 'span 12' }} className="lg:col-span-5">
            <SectionCard>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="shield" size={16} color="var(--teal)" />
                Engagement &amp; Health Signals
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ padding: '12px 14px', borderRadius: 'var(--r, 8px)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="target" size={11} /> Inquiries / Session
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>1.4</div>
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 'var(--r, 8px)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="zap" size={11} /> AI Deflection Rate
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981', marginTop: 4 }}>44.2%</div>
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 'var(--r, 8px)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="users" size={11} /> New vs Returning
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>58% / 42%</div>
                </div>

                <div style={{ padding: '12px 14px', borderRadius: 'var(--r, 8px)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="globe" size={11} /> Active Port Nodes
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--teal)', marginTop: 4 }}>14 Hubs</div>
                </div>
              </div>

              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', letterSpacing: '0.04em', marginBottom: 8 }}>
                System Health &amp; Load Signals
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r, 6px)', background: 'var(--bg)' }}>
                  <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="shield" size={13} color="#10b981" /> Bot Spam Filtered
                  </span>
                  <span className="bliss-badge-soft success">1.4% flagged</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r, 6px)', background: 'var(--bg)' }}>
                  <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="clock" size={13} color="#0ea5e9" /> Avg Response Load
                  </span>
                  <span className="bliss-badge-soft info">1.8s median</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 'var(--r, 6px)', background: 'var(--bg)' }}>
                  <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="alertTriangle" size={13} color="#f59e0b" /> Traffic Spike Events
                  </span>
                  <span className="bliss-badge-soft warning">0 abnormal spikes</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>

        {/* 3 Bento Cards: Device Breakdown, Top Categories, Top Regions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Device Distribution */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="layers" size={16} color="var(--teal)" />
              Device &amp; Client Breakdown
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Mobile &amp; WhatsApp Client</span><strong>52%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '52%', background: '#10b981' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Desktop Portal &amp; Web</span><strong>36%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '36%', background: 'var(--teal)' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Tablet Devices</span><strong>8%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '8%', background: '#0ea5e9' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>API &amp; Automated Webhooks</span><strong>4%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '4%', background: '#7c3aed' }} /></div>
              </div>
            </div>
          </SectionCard>

          {/* Top Categories */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="tag" size={16} color="#0ea5e9" />
              Top Support Inquiries
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { cat: 'Customs & Port Clearance', count: '8,410' },
                { cat: 'Invoicing & Peti Approvals', count: '6,240' },
                { cat: 'Container & Fleet GPS Tracking', count: '4,890' },
                { cat: 'Demurrage Tariff Disputes', count: '3,110' },
                { cat: 'Account Setup & Security', count: '2,170' },
              ].map((c, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: idx < 4 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.cat}</span>
                  <span style={{ color: 'var(--ink3)', fontWeight: 700 }}>{c.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Top Origin Regions */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="globe" size={16} color="#7c3aed" />
              Top Origin Hubs
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Tanzania (Dar es Salaam / Tanga)</span><strong>48%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '48%', background: 'var(--teal)' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Kenya (Mombasa / Nairobi)</span><strong>24%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '24%', background: '#0ea5e9' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>Uganda &amp; Rwanda Transit</span><strong>16%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '16%', background: '#7c3aed' }} /></div>
              </div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header"><span>International (UAE &amp; China)</span><strong>12%</strong></div>
                <div className="bliss-meter-track"><div className="bliss-meter-fill" style={{ width: '12%', background: '#f59e0b' }} /></div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Daily Traffic Breakdown Table */}
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Daily Inbound Breakdown</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Historical day-by-day throughput, first response velocity and resolution rates</div>
            </div>

            <div style={{ position: 'relative', width: 220 }}>
              <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
              <input
                type="text"
                placeholder="Filter dates…"
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
          </div>

          <div className="bliss-report-table-wrap">
            <table className="bliss-report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Inbound Inquiries</th>
                  <th>Unique Customers</th>
                  <th>First Response Avg.</th>
                  <th>AI Deflection Rate</th>
                  <th>First Contact Resolution (FCR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTraffic.map((t, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.date}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{t.inbound.toLocaleString()}</td>
                    <td style={{ color: 'var(--ink2)' }}>{t.uniqueUsers.toLocaleString()}</td>
                    <td style={{ color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{t.firstResponse}</td>
                    <td>
                      <span className="bliss-badge-soft success">{t.deflectionRate}</span>
                    </td>
                    <td>
                      <span className="bliss-badge-soft teal">{t.fcrRate}</span>
                    </td>
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
        reportTitle="Traffic & Inbound Report"
        data={filteredTraffic}
        filenamePrefix="traffic_report"
      />
    </div>
  );
};
