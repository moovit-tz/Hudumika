// ─── CallsMetrics.tsx — real usage metrics for calls + meetings ───────────
// Personal figures are visible to everyone; the tenant-wide trend/leaderboard
// section only comes back from the API for management roles (calls.routes.ts
// gates it server-side) — a "who calls the most" ranking visible to every
// employee reads as surveillance in an HR context, so it isn't rendered at
// all for anyone the API didn't include it for.
import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface Metrics {
  days: number;
  personal: { calls: number; callsMissed: number; callSeconds: number; meetingsJoined: number; meetingSeconds: number };
  tenant?: {
    calls: number; callsMissed: number; avgCallSeconds: number; meetings: number;
    dailyTrend: { day: string; calls: number; meetings: number }[];
    topParticipants: { userId: string; name: string; meetings: number; totalSeconds: number }[];
  };
}

const fmtHrs = (s: number) => { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; };

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--teal-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon as any} size={16} color="var(--teal)" />
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{label}</div>
      </div>
    </div>
  );
}

export function CallsMetrics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/v1/hr/metrics/calls?days=${days}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [days]);

  if (loading && !data) return <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: 20 }}>Loading metrics…</div>;
  if (!data) return <div style={{ fontSize: 12.5, color: 'var(--ink3)', padding: 20 }}>Could not load metrics.</div>;

  const missedRate = data.personal.calls > 0 ? Math.round((data.personal.callsMissed / data.personal.calls) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Your activity</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', background: days === d ? 'hsl(var(--primary))' : 'var(--white)', color: days === d ? 'hsl(var(--primary-foreground))' : 'var(--ink2)' }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Direct calls" value={String(data.personal.calls)} icon="phone" />
        <StatCard label="Missed / declined" value={`${data.personal.callsMissed} (${missedRate}%)`} icon="alertCircle" />
        <StatCard label="Call time" value={fmtHrs(data.personal.callSeconds)} icon="clock" />
        <StatCard label="Meetings joined" value={String(data.personal.meetingsJoined)} icon="users" />
        <StatCard label="Meeting time" value={fmtHrs(data.personal.meetingSeconds)} icon="camera" />
      </div>

      {data.tenant && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginTop: 8 }}>Team-wide (last {data.days} days)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <StatCard label="Total calls" value={String(data.tenant.calls)} icon="phone" />
            <StatCard label="Total meetings" value={String(data.tenant.meetings)} icon="camera" />
            <StatCard label="Avg call length" value={fmtHrs(data.tenant.avgCallSeconds)} icon="clock" />
            <StatCard label="Missed / declined" value={String(data.tenant.callsMissed)} icon="alertCircle" />
          </div>

          {data.tenant.dailyTrend.length > 0 && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, height: 220 }}>
              <Bar
                data={{
                  labels: data.tenant.dailyTrend.map(d => d.day.slice(5)),
                  datasets: [
                    { label: 'Calls', data: data.tenant.dailyTrend.map(d => d.calls), backgroundColor: 'hsl(var(--primary))' },
                    { label: 'Meetings', data: data.tenant.dailyTrend.map(d => d.meetings), backgroundColor: 'var(--purple)' },
                  ],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
              />
            </div>
          )}

          {data.tenant.topParticipants.length > 0 && (
            <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Most meeting time</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.tenant.topParticipants.map(p => (
                  <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <span style={{ flex: 1, color: 'var(--ink)' }}>{p.name}</span>
                    <span style={{ color: 'var(--ink3)' }}>{p.meetings} meeting{p.meetings === 1 ? '' : 's'}</span>
                    <span style={{ color: 'var(--ink3)', minWidth: 56, textAlign: 'right' }}>{fmtHrs(p.totalSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
