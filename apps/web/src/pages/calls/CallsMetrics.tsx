import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../../lib/api.js';
import { Button } from '../../components/ui/button.js';
import { Banner } from '../../components/ui/alert.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
import { type MetricCardProps } from '../../components/MetricCard.js';
import { Card } from '../../components/ui/card.js';
import { FeaturedIcon } from '../../components/ui/featured-icon.js';
import { Icon } from '../../components/Icon.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Metrics {
  days: number;
  personal: {
    calls: number;
    callsMissed: number;
    callSeconds: number;
    meetingsJoined: number;
    meetingSeconds: number;
  };
  // Only present for management roles (SUPER_ADMIN/ADMIN/TENANT_ADMIN/
  // MANAGER/HR) — GET /v1/calls/metrics omits it entirely for everyone
  // else, so its absence here is a real permissions signal, not empty data.
  tenant?: {
    calls: number;
    callsMissed: number;
    avgCallSeconds: number;
    meetings: number;
    dailyTrend: { day: string; calls: number; meetings: number }[];
    topParticipants: { userId: string; name: string; meetings: number; totalSeconds: number }[];
  };
}

const fmtHrs = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function CallSummary({ cards }: { cards: MetricCardProps[] }) {
  return <div className="cc-summary-grid">{cards.map(card => (
    <Card key={card.title} className="cc-summary-card">
      <div className="cc-summary-label"><span>{card.title}</span><FeaturedIcon variant="brand" size="sm"><Icon name={card.icon || 'phone'} size={16} /></FeaturedIcon></div>
      <strong className="cc-summary-value">{card.value}</strong>
      <span className="cc-summary-detail">{card.sub1Label ? `${card.sub1Label.toLowerCase()}: ${card.sub1Value}` : card.comparisonLabel || 'In the selected period'}</span>
    </Card>
  ))}</div>;
}

/** Real /v1/calls/metrics data only — no fabricated call logs, no CSAT/MOS
 *  scores (nothing in this codebase measures either), no random-number
 *  fallback when a fresh tenant genuinely has zero calls yet. A tenant with
 *  no activity in the period sees real zeros, not an invented "48 calls,
 *  96.4% answered, 4.8/5.0 CSAT". */
export function CallsMetrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/v1/calls/metrics?days=${days}`)
      .then(value => { if (!cancelled) setData(value); })
      .catch((e: any) => { if (!cancelled) { setData(null); setError(e?.message || 'Could not load call metrics.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const purpleColor = cssVar('--purple', '#8b5cf6');
  const greenColor = cssVar('--green', '#10b981');

  const tenant = data?.tenant;
  const personal = data?.personal;
  const answeredPct = tenant && tenant.calls > 0 ? Math.round(((tenant.calls - tenant.callsMissed) / tenant.calls) * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="cc-metrics-toolbar">
        <div><h2>Activity at a glance</h2><p>Calls and meetings over the last {days} days.</p></div>
        <div className="cc-periods" role="group" aria-label="Activity period">
          {[7, 30, 90].map(d => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'ghost'} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</Button>
          ))}
        </div>
      </div>
      {error && <Banner variant="error">{error}</Banner>}
      {loading ? <SectionLoading label="Loading call activity…" /> : error ? null : !tenant ? (

        <>
          {/* Non-management roles only get their own numbers back from the
              API — shown honestly as "your activity", not padded out with
              tenant-wide figures the endpoint never actually returned. */}
          <SectionCard title="Your Call & Meeting Activity">
            <CallSummary cards={[
              { title: 'Your calls', value: String(personal?.calls ?? 0), icon: 'phone', barHighlight: 'var(--green)', comparisonLabel: `${days}-day period`, emphasis: 'primary' },
              { title: 'Missed', value: String(personal?.callsMissed ?? 0), icon: 'alertCircle', barHighlight: 'var(--red)', sub1Label: 'SHARE OF CALLS', sub1Value: personal?.calls ? `${Math.round(((personal.callsMissed ?? 0) / personal.calls) * 100)}%` : '—' },
              { title: 'Call time', value: fmtHrs(personal?.callSeconds ?? 0), icon: 'clock', barHighlight: 'var(--blue)' },
              { title: 'Meetings joined', value: String(personal?.meetingsJoined ?? 0), icon: 'camera', barHighlight: 'var(--purple)' },
              { title: 'Meeting time', value: fmtHrs(personal?.meetingSeconds ?? 0), icon: 'video', barHighlight: 'var(--purple)', emphasis: 'subtle' },
            ]} />
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink3)' }}>
              Tenant-wide trends and leaderboards are visible to managers and admins.
            </div>
          </SectionCard>
        </>
      ) : (
        <>
          {/* Top Executive KPI Metrics — all real, from GET /v1/calls/metrics */}
          <CallSummary cards={[
            { title: 'Direct calls', value: String(tenant.calls), icon: 'phone', barHighlight: 'var(--green)', comparisonLabel: `${days}-day period`, sub1Label: 'ANSWERED', sub1Value: answeredPct != null ? `${answeredPct}%` : '—', bars: tenant.dailyTrend.map(d => d.calls), emphasis: 'primary' },
            { title: 'Video meetings', value: String(tenant.meetings), icon: 'camera', barHighlight: 'var(--purple)', bars: tenant.dailyTrend.map(d => d.meetings) },
            { title: 'Avg. duration', value: tenant.calls > 0 ? fmtHrs(tenant.avgCallSeconds) : '—', icon: 'clock', barHighlight: 'var(--blue)' },
            { title: 'Missed calls', value: String(tenant.callsMissed), icon: 'alertCircle', barHighlight: 'var(--red)', sub1Label: 'SHARE OF CALLS', sub1Value: tenant.calls > 0 ? `${Math.round((tenant.callsMissed / tenant.calls) * 100)}%` : '—' },
          ]} />

          <div className="cc-analytics-grid">
          <SectionCard title={`Conversation activity · ${days} days`} collapsible={false}>
            {tenant.dailyTrend.length === 0 ? (
              <div className="cc-chart-empty"><FeaturedIcon variant="gray" size="lg"><Icon name="barChart2" size={24} /></FeaturedIcon><h3>Every conversation counts</h3><p>Your call and meeting trends will appear here as your team connects.</p></div>
            ) : (
              <div style={{ height: 220, marginTop: 10 }}>
                <Bar
                  data={{
                    labels: tenant.dailyTrend.map(d => d.day.slice(5)),
                    datasets: [
                      { label: 'Direct calls', data: tenant.dailyTrend.map(d => d.calls), backgroundColor: greenColor, borderRadius: 4 },
                      { label: 'Video Meetings & Rooms', data: tenant.dailyTrend.map(d => d.meetings), backgroundColor: purpleColor, borderRadius: 4 },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12, weight: 'bold' } } } },
                    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                  }}
                />
              </div>
            )}
          </SectionCard>

          {/* Top Meeting Participants Leaderboard */}
          <SectionCard title="Team participation" collapsible={false}>
            {tenant.topParticipants.length === 0 ? (
              <div className="cc-empty cc-participation-empty"><FeaturedIcon variant="gray" size="lg"><Icon name="users" size={22} /></FeaturedIcon><h3>Room for everyone</h3><p>Meeting participants and time spent together will appear here.</p></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tenant.topParticipants.map(p => (
                  <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PersonAvatar userId={p.userId} name={p.name} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{p.meetings} video meeting{p.meetings === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: purpleColor, fontFamily: 'var(--font)' }}>
                      {fmtHrs(p.totalSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
