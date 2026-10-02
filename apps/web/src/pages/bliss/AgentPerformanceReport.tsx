import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Button } from '../../components/ui/button.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { BlissReportExportModal } from './BlissReportExportModal.js';
import { useSupportMetrics, PeriodSwitcher } from '../SupportOverviewShared.js';
import './BlissReports.css';

interface AgentRecord {
  id: string;
  name: string;
  role: string;
  department: string;
  isOnline: boolean;
  assigned: number;
  resolved: number;
  avgResolution: string;
  firstResponse: string;
  csat: number;
  slaRate: number;
  status: 'Top Performer' | 'Target Met' | 'Needs Attention';
}

const SAMPLE_AGENTS: AgentRecord[] = [
  { id: 'ag-1', name: 'Sarah Whitfield', role: 'Senior Support Lead', department: 'Escalations & VIP', isOnline: true, assigned: 194, resolved: 186, avgResolution: '2h 14m', firstResponse: '3m 12s', csat: 96, slaRate: 98.4, status: 'Top Performer' },
  { id: 'ag-2', name: 'Rahul Mehta', role: 'Support Specialist', department: 'Customs & Port Desk', isOnline: true, assigned: 182, resolved: 171, avgResolution: '2h 48m', firstResponse: '4m 05s', csat: 93, slaRate: 96.1, status: 'Top Performer' },
  { id: 'ag-3', name: 'Chloe Dubois', role: 'Customer Success Rep', department: 'Billing & Invoices', isOnline: true, assigned: 165, resolved: 158, avgResolution: '3h 05m', firstResponse: '4m 42s', csat: 88, slaRate: 94.2, status: 'Target Met' },
  { id: 'ag-4', name: 'Ethan Alvarez', role: 'Technical Support', department: 'API & Integrations', isOnline: false, assigned: 152, resolved: 142, avgResolution: '3h 32m', firstResponse: '5m 10s', csat: 84, slaRate: 92.0, status: 'Target Met' },
  { id: 'ag-5', name: 'Yuki Tanaka', role: 'Operations Officer', department: 'Demurrage & Tariffs', isOnline: true, assigned: 140, resolved: 129, avgResolution: '4h 51m', firstResponse: '6m 25s', csat: 76, slaRate: 88.5, status: 'Needs Attention' },
  { id: 'ag-6', name: 'Priya Sharma', role: 'Support Specialist', department: 'Cargo & Tracking', isOnline: true, assigned: 130, resolved: 121, avgResolution: '3h 18m', firstResponse: '3m 50s', csat: 91, slaRate: 95.3, status: 'Target Met' },
  { id: 'ag-7', name: 'Marco Diaz', role: 'Customer Support', department: 'Documentation & BL', isOnline: false, assigned: 124, resolved: 114, avgResolution: '3h 41m', firstResponse: '4m 15s', csat: 85, slaRate: 91.8, status: 'Target Met' },
  { id: 'ag-8', name: 'Sofia Reyes', role: 'Helpdesk Officer', department: 'Onboarding & KYC', isOnline: true, assigned: 118, resolved: 108, avgResolution: '3h 55m', firstResponse: '4m 58s', csat: 83, slaRate: 90.2, status: 'Target Met' },
  { id: 'ag-9', name: 'Daniel Cho', role: 'Junior Specialist', department: 'General Inquiries', isOnline: true, assigned: 106, resolved: 97, avgResolution: '4h 12m', firstResponse: '5m 40s', csat: 80, slaRate: 87.4, status: 'Needs Attention' },
  { id: 'ag-10', name: 'Isabella Marchetti', role: 'Support Agent', department: 'Billing Support', isOnline: false, assigned: 95, resolved: 86, avgResolution: '5h 04m', firstResponse: '7m 15s', csat: 74, slaRate: 84.1, status: 'Needs Attention' },
];

export const AgentPerformanceReport: React.FC = () => {
  const navigate = useNavigate();
  const { period, setPeriod } = useSupportMetrics();

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [exportOpen, setExportOpen] = useState(false);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return SAMPLE_AGENTS.filter(a => {
      const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.department.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'ALL' || a.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [search, deptFilter]);

  const departments = useMemo(() => {
    return Array.from(new Set(SAMPLE_AGENTS.map(a => a.department)));
  }, []);

  return (
    <div className="bliss-report-root">
      <div className="bliss-report-container">
        {/* Page Header */}
        <PageHeader
          crumbs={['BLISS', 'REPORTS', 'AGENT PERFORMANCE']}
          titlePlain="Agent Performance"
          titleEm="report"
          subtitle="Support specialist ranking, efficiency metrics & CSAT analytics · Last 30 days"
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
              <span className="bliss-chip-icon is-primary"><Icon name="users" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)' }}>10 Online</span>
            </div>
            <div className="bliss-kpi-val">12</div>
            <div className="bliss-kpi-lbl">Active Agents</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#10b981' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-success"><Icon name="checkCircle" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> 7.8%
              </span>
            </div>
            <div className="bliss-kpi-val">1,860</div>
            <div className="bliss-kpi-lbl">Tickets Resolved</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#f59e0b' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-warning"><Icon name="clock" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowUp" size={11} /> 4.1%
              </span>
            </div>
            <div className="bliss-kpi-val">3h 06m</div>
            <div className="bliss-kpi-lbl">Avg. Resolution Time</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#0ea5e9' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-info"><Icon name="smile" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#0ea5e9' }}>4.6 / 5.0</span>
            </div>
            <div className="bliss-kpi-val">89%</div>
            <div className="bliss-kpi-lbl">Avg. CSAT Rating</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#7c3aed' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-purple"><Icon name="zap" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>84.2%</span>
            </div>
            <div className="bliss-kpi-val">2,104</div>
            <div className="bliss-kpi-lbl">First Response &lt; 5m</div>
          </div>

          <div className="bliss-kpi-cell">
            <span className="bliss-kpi-accent-bar" style={{ background: '#ef4444' }} />
            <div className="bliss-kpi-top">
              <span className="bliss-chip-icon is-danger"><Icon name="alertCircle" size={18} /></span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 2 }}>
                <Icon name="arrowDown" size={11} /> 1.6%
              </span>
            </div>
            <div className="bliss-kpi-val">3.4%</div>
            <div className="bliss-kpi-lbl">Escalation Rate</div>
          </div>
        </div>

        {/* 3-Card Bento Row: Channel Breakdown, SLA Compliance, Complexity Mix */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Card 1: Channel Breakdown */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="message" size={16} color="var(--teal)" />
              Tickets by Channel
            </div>
            <div>
              <div className="bliss-meter-item">
                <div className="bliss-meter-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="chatBubble" size={13} color="var(--teal)" /> Live Chat / Web
                  </span>
                  <span style={{ fontWeight: 700 }}>48% (892)</span>
                </div>
                <div className="bliss-meter-track">
                  <div className="bliss-meter-fill" style={{ width: '48%', background: 'var(--teal)' }} />
                </div>
              </div>

              <div className="bliss-meter-item">
                <div className="bliss-meter-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="message" size={13} color="#10b981" /> WhatsApp Business
                  </span>
                  <span style={{ fontWeight: 700 }}>31% (576)</span>
                </div>
                <div className="bliss-meter-track">
                  <div className="bliss-meter-fill" style={{ width: '31%', background: '#10b981' }} />
                </div>
              </div>

              <div className="bliss-meter-item">
                <div className="bliss-meter-header">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="mail" size={13} color="#0ea5e9" /> Email Support
                  </span>
                  <span style={{ fontWeight: 700 }}>21% (392)</span>
                </div>
                <div className="bliss-meter-track">
                  <div className="bliss-meter-fill" style={{ width: '21%', background: '#0ea5e9' }} />
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Card 2: SLA Compliance Rate */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="shield" size={16} color="#10b981" />
              SLA Compliance
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#10b981', letterSpacing: '-0.03em' }}>94.2%</div>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--ink3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Within SLA Target:</span>
                  <strong style={{ color: 'var(--ink)' }}>1,752 cases</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Breached Target:</span>
                  <strong style={{ color: '#ef4444' }}>108 cases</strong>
                </div>
              </div>
            </div>
            <div className="bliss-meter-track" style={{ marginTop: 16 }}>
              <div className="bliss-meter-fill" style={{ width: '94.2%', background: '#10b981' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 8 }}>
              Target benchmark: &gt; 92.0% compliance
            </div>
          </SectionCard>

          {/* Card 3: Ticket Complexity Mix */}
          <SectionCard>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="layers" size={16} color="#7c3aed" />
              Ticket Complexity Mix
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Simple (1 touch)
                </span>
                <strong style={{ color: 'var(--ink)' }}>62%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Moderate (2-3 touches)
                </span>
                <strong style={{ color: 'var(--ink)' }}>29%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Complex (4+ touches)
                </span>
                <strong style={{ color: 'var(--ink)' }}>9%</strong>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Top Agent Podium / Hall of Fame */}
        <div className="bliss-podium-card">
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="award" size={18} color="#f59e0b" />
            Top Performers This Month
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
            Ranked by customer satisfaction index and resolved ticket throughput
          </div>

          <div className="bliss-podium-wrap">
            {/* 2nd Place: Rahul Mehta */}
            <div className="bliss-podium-col bliss-podium-col--2">
              <div className="bliss-podium-avatar-wrap">
                <div className="bliss-podium-avatar" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                  RM
                </div>
              </div>
              <div className="bliss-podium-name">Rahul Mehta</div>
              <div className="bliss-podium-stat">171 resolved · 93% CSAT</div>
              <div className="bliss-podium-pillar bliss-podium-pillar--2">2</div>
            </div>

            {/* 1st Place: Sarah Whitfield */}
            <div className="bliss-podium-col bliss-podium-col--1">
              <div className="bliss-podium-avatar-wrap">
                <div className="bliss-podium-crown">
                  <Icon name="award" size={13} />
                </div>
                <div className="bliss-podium-avatar" style={{ background: '#fef3c7', color: '#b45309' }}>
                  SW
                </div>
              </div>
              <div className="bliss-podium-name">Sarah Whitfield</div>
              <div className="bliss-podium-stat">186 resolved · 96% CSAT</div>
              <div className="bliss-podium-pillar bliss-podium-pillar--1">1</div>
            </div>

            {/* 3rd Place: Chloe Dubois */}
            <div className="bliss-podium-col bliss-podium-col--3">
              <div className="bliss-podium-avatar-wrap">
                <div className="bliss-podium-avatar" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                  CD
                </div>
              </div>
              <div className="bliss-podium-name">Chloe Dubois</div>
              <div className="bliss-podium-stat">158 resolved · 88% CSAT</div>
              <div className="bliss-podium-pillar bliss-podium-pillar--3">3</div>
            </div>
          </div>
        </div>

        {/* Agent Scorecards Mini Gauges */}
        <div className="bliss-scorecard-grid">
          {[
            { name: 'S. Whitfield', tickets: '186 tickets', score: '96%', color: '#10b981' },
            { name: 'R. Mehta', tickets: '171 tickets', score: '93%', color: '#10b981' },
            { name: 'C. Dubois', tickets: '158 tickets', score: '88%', color: '#f59e0b' },
            { name: 'E. Alvarez', tickets: '142 tickets', score: '84%', color: '#f59e0b' },
            { name: 'Y. Tanaka', tickets: '129 tickets', score: '76%', color: '#ef4444' },
          ].map((sc, idx) => (
            <div key={idx} className="bliss-scorecard-cell">
              <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${sc.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: sc.color, marginBottom: 8 }}>
                {sc.score}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{sc.name}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{sc.tickets}</div>
            </div>
          ))}
        </div>

        {/* Leaderboard Table with Toolbar */}
        <SectionCard padded={false}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Agent Leaderboard</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Showing {filteredAgents.length} support specialists</div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 220 }}>
                <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)' } as React.CSSProperties} />
                <input
                  type="text"
                  placeholder="Search agents…"
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
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
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
                <option value="ALL">All Departments</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bliss-report-table-wrap">
            <table className="bliss-report-table">
              <thead>
                <tr>
                  <th>Specialist</th>
                  <th>Department / Role</th>
                  <th>Assigned</th>
                  <th>Resolved</th>
                  <th>Avg. Resolution</th>
                  <th>First Response</th>
                  <th>CSAT Rating</th>
                  <th>SLA Met</th>
                  <th>Performance</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ position: 'relative' }}>
                          <PersonAvatar name={a.name} size={32} />
                          {a.isOnline && (
                            <span style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '2px solid var(--white)' }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{a.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{a.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="bliss-badge-soft neutral">{a.department}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{a.assigned}</td>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{a.resolved}</td>
                    <td style={{ color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{a.avgResolution}</td>
                    <td style={{ color: 'var(--ink2)', fontVariantNumeric: 'tabular-nums' }}>{a.firstResponse}</td>
                    <td>
                      <span className={`bliss-badge-soft ${a.csat >= 90 ? 'success' : a.csat >= 80 ? 'warning' : 'danger'}`}>
                        {a.csat}% CSAT
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 44, height: 4, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${a.slaRate}%`, background: a.slaRate >= 92 ? '#10b981' : '#f59e0b' }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{a.slaRate}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`bliss-badge-soft ${a.status === 'Top Performer' ? 'teal' : a.status === 'Target Met' ? 'success' : 'danger'}`}>
                        {a.status}
                      </span>
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
        reportTitle="Agent Performance Report"
        data={filteredAgents}
        filenamePrefix="agent_performance_report"
      />
    </div>
  );
};
