import React from 'react';
import { Icon } from '../components/Icon.js';
import { PageHeader } from '../components/PageHeader.js';
import { useFullLayout } from '../hooks/useFullLayout.js';
import { useSupportMetrics, PeriodSwitcher, SHdr, Av, type AgentStat } from './SupportOverviewShared.js';
import './SupportOverview.css';

export const SupportTeam: React.FC = () => {
  const isFullLayout = useFullLayout();
  const { period, setPeriod, loading, metrics } = useSupportMetrics();

  /* Real per-agent performance from the backend — no hardcoded staff list */
  const agentStats: AgentStat[] = metrics?.agents || [];

  if (loading) {
    return <div className="sov-loading">Loading team performance…</div>;
  }

  return (
    <div className="sov-root">
      <div className="sov-container" style={isFullLayout ? { maxWidth: 'none' } : undefined}>

        <PageHeader
          crumbs={['Support', 'Team']}
          titlePlain="Support"
          titleEm="team"
          subtitle="Per-agent case load, resolution speed and satisfaction for the selected period."
          actions={<div className="sov-actions"><PeriodSwitcher period={period} setPeriod={setPeriod} /></div>}
        />

        <div className="sov-card">
          <SHdr title="Agent Performance" action="Open all tickets" to="/bliss/tickets" />
          {agentStats.length === 0 ? (
            <div className="sov-empty">No tickets have been assigned to an agent in this period yet.</div>
          ) : (
            <div className="sov-table-scroll">
              <table className="sov-table">
                <thead>
                  <tr>
                    {['Agent','Assigned','Resolved','Open','Avg Time','CSAT','Resolution Rate'].map(col => (
                      <th key={col} className={col === 'Agent' ? 'sov-th-left' : ''}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div className="sov-agent-cell">
                          <Av name={a.name} userId={a.id} size={30} />
                          <span className="sov-agent-name">{a.name}</span>
                        </div>
                      </td>
                      <td className="sov-td-center">{a.assigned}</td>
                      <td className="sov-td-center sov-td-resolved">{a.resolved}</td>
                      <td className={`sov-td-center${a.open > 3 ? ' sov-td-open-high' : ''}`}>{a.open}</td>
                      <td className="sov-td-center">{a.avgResolutionHours != null ? `${a.avgResolutionHours}h` : '—'}</td>
                      <td className="sov-td-center">
                        {a.csat != null
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: a.csat >= 4.5 ? 'var(--green)' : a.csat >= 4.0 ? 'var(--gold)' : 'var(--red)' }}><Icon name="star" size={12} duotone /> {a.csat}</span>
                          : <span className="sov-td-muted">—</span>}
                      </td>
                      <td className="sov-td-center">
                        <div className="sov-rate-cell">
                          <div className="sov-bar-track sov-bar-track--rate">
                            <div className="sov-bar-fill" style={{ background: a.resolutionRate >= 80 ? 'var(--green)' : a.resolutionRate >= 60 ? 'var(--gold)' : 'var(--red)', width: `${a.resolutionRate}%` }} />
                          </div>
                          <span className="sov-rate-pct">{a.resolutionRate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
