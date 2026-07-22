import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { MetricsRow, spark } from '../components/MetricCard.js';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: 'var(--ink3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function KVRow({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--ink2)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        {value}
        {note && <span style={{ fontSize: 11, color: 'var(--ink3)', marginLeft: 6, fontWeight: 400 }}>{note}</span>}
      </span>
    </div>
  );
}

export const Reports: React.FC = () => {
  const [kpis, setKpis] = useState<any>({});
  const [officers, setOfficers] = useState<any[]>([]);
  const [bottlenecks, setBottlenecks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/analytics/kpi').catch(() => ({})),
      apiFetch('/v1/analytics/officers').then((r: any) => r.data ?? r ?? []).catch(() => []),
      apiFetch('/v1/analytics/bottlenecks').then((r: any) => r.data ?? r ?? []).catch(() => []),
    ]).then(([k, o, b]) => {
      setKpis(k);
      setOfficers(o);
      setBottlenecks(b);
    }).finally(() => setLoading(false));
  }, [period]);

  const pct = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Reports</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Operational analytics and performance metrics</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {(['week', 'month', 'quarter'] as const).map(p => (
            <button type="button" key={p} className={`fc${period === p ? ' on' : ''}`} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-sm">Export CSV</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {!loading && (
          <MetricsRow cards={[
            {
              title: 'Active Shipments',
              value: String(kpis.active_cases ?? 0),
              trend: 7.2,
              sub1Label: 'THIS MONTH', sub1Value: String(kpis.cases_this_month ?? 0),
              sub2Label: 'DELIVERED TODAY', sub2Value: String(kpis.delivered_today ?? 0),
              bars: spark(90, 15, 'up'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
            },
            {
              title: 'Demurrage Risk',
              value: String(kpis.demurrage_risk ?? 0),
              trend: -(kpis.demurrage_risk ?? 0),
              invertTrend: true,
              sub1Label: 'SLA BREACHED', sub1Value: String(kpis.sla_breached ?? 0),
              sub2Label: 'PENALTY EXPOSURE', sub2Value: kpis.penalty_exposure_tzs ? `TZS ${(kpis.penalty_exposure_tzs / 1_000_000).toFixed(1)}M` : '—',
              bars: spark(91, 15, 'down'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
            },
            {
              title: 'On-Time Rate',
              value: `${kpis.on_time_rate_pct ?? 0}%`,
              trend: 2.4,
              sub1Label: 'TARGET', sub1Value: '95%',
              sub2Label: 'PERIOD', sub2Value: period,
              bars: spark(92, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
            },
          ]} />
        )}
        {loading && <div style={{ textAlign: 'center', color: 'var(--ink3)', padding: 48 }}>Loading reports…</div>}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

            {/* Operational summary */}
            <div className="card" style={{ gridColumn: '1 / 3' }}>
              <Section title="Operational Summary">
                <KVRow label="Active Shipments"  value={kpis.active_cases ?? '—'} />
                <KVRow label="Cases This Month"  value={kpis.cases_this_month ?? '—'} />
                <KVRow label="Delivered Today"   value={kpis.delivered_today ?? '—'} />
                <KVRow label="Demurrage Risk"    value={kpis.demurrage_risk ?? '—'} note="containers" />
                <KVRow label="SLA Breached"      value={kpis.sla_breached ?? '—'} note="cases" />
                <KVRow label="On-Time Rate"      value={`${kpis.on_time_rate_pct ?? 0}%`} />
                <KVRow label="Avg Clearance Days" value={kpis.avg_clearance_days ? `${kpis.avg_clearance_days}d` : '—'} />
                <KVRow label="Penalty Exposure"  value={kpis.penalty_exposure_tzs ? `TZS ${Number(kpis.penalty_exposure_tzs).toLocaleString()}` : '—'} />
              </Section>
            </div>

            {/* Stage bottlenecks */}
            <div className="card">
              <Section title="Stage Bottlenecks">
                {bottlenecks.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No bottleneck data.</div>}
                {bottlenecks.slice(0, 8).map((b: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{b.stage?.replace(/_/g, ' ')}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: b.avg_days > 5 ? 'var(--red)' : b.avg_days > 3 ? 'var(--gold)' : 'var(--teal)' }}>
                      {b.avg_days?.toFixed(1)}d avg
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>{b.count} cases</div>
                  </div>
                ))}
              </Section>
            </div>

            {/* Sustainability */}
            <div className="card">
              <Section title="Sustainability">
                <KVRow label="Total CO2 Emissions" value={kpis.total_co2_emissions_kg ? `${Number(kpis.total_co2_emissions_kg).toLocaleString()} kg` : '—'} />
                <KVRow label="Carbon Credits Saved" value={kpis.total_carbon_credits_saved ? Number(kpis.total_carbon_credits_saved).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} />
                {!kpis.total_co2_emissions_kg && (
                  <div style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 8 }}>No shipments have a CO2 estimate yet — closed shipments with origin, destination, and weight populated calculate this automatically.</div>
                )}
              </Section>
            </div>

            {/* Officer performance */}
            <div className="card" style={{ gridColumn: '1 / 4' }}>
              <Section title="Officer Performance">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {officers.map((o: any) => (
                    <div key={o.user_id} className="card" style={{ padding: 12, background: 'var(--bg)' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{o.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)', marginBottom: 3 }}>
                        <span>Active cases</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>{o.active_cases ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)', marginBottom: 3 }}>
                        <span>Completed</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>{o.completed_cases ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)' }}>
                        <span>Avg days</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>{o.avg_days?.toFixed(1) ?? '—'}d</span>
                      </div>
                      {o.active_cases !== undefined && o.completed_cases !== undefined && (
                        <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--teal)', width: `${pct(o.completed_cases, o.active_cases + o.completed_cases)}%`, transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>
                  ))}
                  {officers.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: 13 }}>No officer data available.</div>}
                </div>
              </Section>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
