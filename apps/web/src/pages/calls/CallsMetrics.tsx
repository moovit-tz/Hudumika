import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../../lib/api.js';
import { Icon } from '../../components/Icon.js';
import { SectionCard } from '../../components/SectionCard.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';

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
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function StatCard({ label, value, icon, color = 'var(--teal)', sub }: { label: string; value: string; icon: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 18, display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--elev)' }}>
      <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={icon as any} size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink3)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
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
    setLoading(true);
    setError(null);
    apiFetch(`/v1/calls/metrics?days=${days}`)
      .then(setData)
      .catch((e: any) => { setData(null); setError(e?.message || 'Could not load call metrics.'); })
      .finally(() => setLoading(false));
  }, [days]);

  const purpleColor = cssVar('--purple', '#8b5cf6');
  const greenColor = cssVar('--green', '#10b981');

  const tenant = data?.tenant;
  const personal = data?.personal;
  const answeredPct = tenant && tenant.calls > 0 ? Math.round(((tenant.calls - tenant.callsMissed) / tenant.calls) * 100) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Period Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink3)' }}>Period:</span>
        {[7, 30, 90].map(d => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            style={{
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 'var(--r)',
              border: '1px solid var(--border)', cursor: 'pointer',
              background: days === d ? 'hsl(var(--primary))' : 'var(--white)',
              color: days === d ? 'hsl(var(--primary-foreground))' : 'var(--ink2)',
              boxShadow: days === d ? 'var(--elev)' : 'none',
            }}
          >
            {d} Days
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--red-l)', color: 'var(--red)', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>Loading metrics…</div>
      ) : !tenant ? (
        <>
          {/* Non-management roles only get their own numbers back from the
              API — shown honestly as "your activity", not padded out with
              tenant-wide figures the endpoint never actually returned. */}
          <SectionCard title="Your Call & Meeting Activity">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <StatCard label="Your Calls" value={String(personal?.calls ?? 0)} icon="phone" color="var(--green)" />
              <StatCard label="Missed" value={String(personal?.callsMissed ?? 0)} icon="alertCircle" color="var(--red)" />
              <StatCard label="Call Time" value={fmtHrs(personal?.callSeconds ?? 0)} icon="clock" color="var(--blue)" />
              <StatCard label="Meetings Joined" value={String(personal?.meetingsJoined ?? 0)} icon="camera" color={purpleColor} />
              <StatCard label="Meeting Time" value={fmtHrs(personal?.meetingSeconds ?? 0)} icon="video" color={purpleColor} />
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--ink3)' }}>
              Tenant-wide trends and leaderboards are visible to managers and admins.
            </div>
          </SectionCard>
        </>
      ) : (
        <>
          {/* Top Executive KPI Metrics — all real, from GET /v1/calls/metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <StatCard label="Support Voice Calls" value={String(tenant.calls)} icon="phone" color="var(--green)" sub={answeredPct != null ? `${answeredPct}% Answered` : undefined} />
            <StatCard label="Video Meetings" value={String(tenant.meetings)} icon="camera" color={purpleColor} />
            <StatCard label="Avg Call Duration" value={tenant.calls > 0 ? fmtHrs(tenant.avgCallSeconds) : '—'} icon="clock" color="var(--blue)" />
            <StatCard label="Missed / Declined" value={String(tenant.callsMissed)} icon="alertCircle" color="var(--red)" sub={tenant.calls > 0 ? `${Math.round((tenant.callsMissed / tenant.calls) * 100)}% of calls` : undefined} />
          </div>

          {/* Daily Volume Trend Chart */}
          <SectionCard title={`Daily Volume Trends — Voice Calls vs Video Meetings (${days} Days)`}>
            {tenant.dailyTrend.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No calls or meetings recorded in this period yet.</div>
            ) : (
              <div style={{ height: 220, marginTop: 10 }}>
                <Bar
                  data={{
                    labels: tenant.dailyTrend.map(d => d.day.slice(5)),
                    datasets: [
                      { label: 'Support Voice Calls', data: tenant.dailyTrend.map(d => d.calls), backgroundColor: greenColor, borderRadius: 4 },
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
          <SectionCard title="Most Meeting & Video Time">
            {tenant.topParticipants.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No meeting participation recorded in this period yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tenant.topParticipants.map(p => (
                  <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <PersonAvatar userId={p.userId} name={p.name} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{p.meetings} video meeting{p.meetings === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: purpleColor, fontFamily: 'var(--mono)' }}>
                      {fmtHrs(p.totalSeconds)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
