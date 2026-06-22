import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import type { StageBottleneck, OfficerPerformance } from '@clearos/types';
import { MetricsRow, spark } from '../components/MetricCard.js';

export const Analytics: React.FC = () => {
  const [bottlenecks, setBottlenecks] = useState<StageBottleneck[]>([]);
  const [officers, setOfficers] = useState<OfficerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const [bottlenecksRes, officersRes] = await Promise.all([
          apiFetch('/v1/analytics/bottlenecks'),
          apiFetch('/v1/analytics/officers'),
        ]);
        setBottlenecks(bottlenecksRes.data || []);
        setOfficers(officersRes.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics metrics');
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      {/* Top Header */}
      <div
        className="topbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '52px',
          padding: '0 16px',
          background: 'var(--white)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy)' }}>📊 Operations Analytics Hub</h1>
      </div>

      <div className="scroll-area" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {error && (
          <div style={{ padding: '16px', background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: '6px', marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <MetricsRow cards={[
          {
            title: 'Stage Bottlenecks',
            value: String(bottlenecks.length),
            trend: -2.1,
            invertTrend: true,
            sub1Label: 'SLOWEST STAGE', sub1Value: bottlenecks.length > 0 ? bottlenecks.reduce((m, b) => b.avg_hours > m.avg_hours ? b : m, bottlenecks[0]).stage.replace(/_/g, ' ') : '—',
            sub2Label: 'AVG HOURS', sub2Value: bottlenecks.length > 0 ? `${(bottlenecks.reduce((s, b) => s + b.avg_hours, 0) / bottlenecks.length).toFixed(1)}h` : '—',
            bars: spark(93, 15, 'down'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
          },
          {
            title: 'Officer Performance',
            value: String(officers.length),
            trend: 8.5,
            sub1Label: 'TOP OFFICER', sub1Value: officers.length > 0 ? officers.reduce((m, o) => o.cases_closed > m.cases_closed ? o : m, officers[0]).name.split(' ')[0] : '—',
            sub2Label: 'AVG CLOSED', sub2Value: officers.length > 0 ? String(Math.round(officers.reduce((s, o) => s + o.cases_closed, 0) / officers.length)) : '—',
            bars: spark(94, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
          },
          {
            title: 'SLA Compliance',
            value: '85.4%',
            trend: 2.4,
            sub1Label: 'TARGET', sub1Value: '95%',
            sub2Label: 'ON-TIME RATE', sub2Value: '91.2%',
            bars: spark(95, 15, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
          },
        ]} />

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px', color: 'var(--ink3)' }}>
            Processing operational bottlenecks and officer stats...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

            {/* Grid for summaries */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div className="card">
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Slowest Stage
                </h3>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--red)' }}>
                  {bottlenecks.length > 0
                    ? bottlenecks.reduce((max, b) => (b.avg_hours > max.avg_hours ? b : max), bottlenecks[0]).stage.replace(/_/g, ' ')
                    : 'N/A'}
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '4px' }}>
                  Identified by largest cumulative hours spent per case.
                </p>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Top Performing Officer
                </h3>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--green)' }}>
                  {officers.length > 0
                    ? officers.reduce((max, o) => (o.cases_closed > max.cases_closed ? o : max), officers[0]).name
                    : 'N/A'}
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '4px' }}>
                  Highest closed cases this month.
                </p>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Average Duty Flow
                </h3>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--navy)' }}>
                  85.4% On-Time
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--ink2)', marginTop: '4px' }}>
                  SLA target compliance index across all teams.
                </p>
              </div>
            </div>

            {/* Bottlenecks section */}
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy)', marginBottom: '16px' }}>
                Clearance Stages Cycle Times & Bottlenecks
              </h2>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ textAlign: 'left', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Clearance Stage</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Processed Cases</th>
                        <th className="col-hide-md" style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Avg Duration (Hours)</th>
                        <th className="col-hide-md" style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>P90 Duration</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>SLA Breaches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bottlenecks.map((bot) => (
                        <tr key={bot.stage} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{bot.stage.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '12px 16px' }}>{bot.case_count} cases</td>
                          <td className="col-hide-md" style={{ padding: '12px 16px', fontFamily: 'var(--mono)' }}>
                            <span style={{ color: bot.avg_hours > 24 ? 'var(--red)' : 'var(--ink)' }}>
                              {bot.avg_hours}h
                            </span>
                          </td>
                          <td className="col-hide-md" style={{ padding: '12px 16px', fontFamily: 'var(--mono)', color: 'var(--ink2)' }}>{bot.p90_hours}h</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={bot.sla_breaches > 0 ? 'badge badge-red' : 'badge badge-green'}>
                              {bot.sla_breaches} breaches
                            </span>
                          </td>
                        </tr>
                      ))}
                      {bottlenecks.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)' }}>
                            No stage history recorded to analyze cycle times.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Officers Performance section */}
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy)', marginBottom: '16px' }}>
                Operational Officers Output & Penalties
              </h2>
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <div className="rtbl-wrap">
                  <table className="rtbl" style={{ textAlign: 'left', fontSize: '13.5px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Officer Name</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Active Cases</th>
                        <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Closed Cases</th>
                        <th className="col-hide-md" style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Avg Cycle (Days)</th>
                        <th className="col-hide-md" style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink2)' }}>Demurrage Penalties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officers.map((off) => (
                        <tr key={off.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{off.name}</td>
                          <td style={{ padding: '12px 16px' }}>{off.active_cases} active</td>
                          <td style={{ padding: '12px 16px' }}>{off.cases_closed} closed</td>
                          <td className="col-hide-md" style={{ padding: '12px 16px', fontFamily: 'var(--mono)' }}>{off.avg_days} days</td>
                          <td className="col-hide-md" style={{ padding: '12px 16px' }}>
                            <span className={off.penalties_caused > 0 ? 'badge badge-red' : 'badge badge-green'}>
                              {off.penalties_caused} incidents
                            </span>
                          </td>
                        </tr>
                      ))}
                      {officers.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--ink3)' }}>
                            No active clearing officers found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
