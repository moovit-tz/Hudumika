import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import { MetricsRow } from '../components/MetricCard.js';

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
  }, []);

  const pct = (n: number, d: number) => d ? Math.round((n / d) * 100) : 0;

  // Real snapshot data only — no fabricated trend %/sparkline history, and no
  // Week/Month/Quarter selector, since /v1/analytics/kpi (etc.) return the
  // tenant's CURRENT state, not a period-bucketed aggregate; a selector here
  // would re-fetch the identical numbers regardless of which button was clicked.
  function exportCsv() {
    const rows: string[] = ['Metric,Value'];
    rows.push(`Active Shipments,${kpis.active_cases ?? ''}`);
    rows.push(`Cases This Month,${kpis.cases_this_month ?? ''}`);
    rows.push(`Delivered Today,${kpis.delivered_today ?? ''}`);
    rows.push(`Demurrage Risk,${kpis.demurrage_risk ?? ''}`);
    rows.push(`SLA Breached,${kpis.sla_breached ?? ''}`);
    rows.push(`On-Time Rate %,${kpis.on_time_rate_pct ?? ''}`);
    rows.push(`Avg Clearance Days,${kpis.avg_clearance_days ?? ''}`);
    rows.push(`Penalty Exposure TZS,${kpis.penalty_exposure_tzs ?? ''}`);
    rows.push(`Total CO2 Emissions kg,${kpis.total_co2_emissions_kg ?? ''}`);
    rows.push(`Carbon Credits Saved,${kpis.total_carbon_credits_saved ?? ''}`);
    rows.push('');
    rows.push('Stage,Avg Days,Case Count');
    for (const b of bottlenecks) rows.push(`${b.stage_label ?? b.stage ?? ''},${((b.avg_hours ?? 0) / 24).toFixed(1)},${b.case_count ?? ''}`);
    rows.push('');
    rows.push('Officer,Active Cases,Completed Cases,Avg Days');
    for (const o of officers) rows.push(`${o.name ?? ''},${o.active_cases ?? ''},${o.cases_closed ?? ''},${o.avg_days ?? ''}`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hudumika-reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Reports</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Operational analytics and performance metrics</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={loading}>Export CSV</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {!loading && (
          <MetricsRow cards={[
            {
              title: 'Active Shipments',
              value: String(kpis.active_cases ?? 0),
              // No stored historical baseline to diff against yet, so trend
              // stays neutral (0) rather than a fabricated percentage — and
              // `bars` is omitted rather than passed a fake sparkline, per
              // MetricCard's own "honest gap over fake data" rule.
              trend: 0,
              sub1Label: 'THIS MONTH', sub1Value: String(kpis.cases_this_month ?? 0),
              sub2Label: 'DELIVERED TODAY', sub2Value: String(kpis.delivered_today ?? 0),
              barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
            },
            {
              title: 'Demurrage Risk',
              value: String(kpis.demurrage_risk ?? 0),
              trend: 0,
              invertTrend: true,
              sub1Label: 'SLA BREACHED', sub1Value: String(kpis.sla_breached ?? 0),
              sub2Label: 'PENALTY EXPOSURE', sub2Value: kpis.penalty_exposure_tzs ? `TZS ${(kpis.penalty_exposure_tzs / 1_000_000).toFixed(1)}M` : '—',
              barColor: 'var(--red-l)', barHighlight: 'var(--red)',
            },
            {
              title: 'On-Time Rate',
              value: `${kpis.on_time_rate_pct ?? 0}%`,
              trend: 0,
              sub1Label: 'TARGET', sub1Value: '95%',
              sub2Label: 'ACTIVE CASES', sub2Value: String(kpis.active_cases ?? 0),
              barColor: 'var(--green-l)', barHighlight: 'var(--green)',
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
                {bottlenecks.slice(0, 8).map((b: any, i: number) => {
                  // StageBottleneck returns avg_hours/case_count — this row
                  // previously read b.avg_days/b.count, fields that don't
                  // exist on the real response, so it always rendered blank.
                  const avgDays = (b.avg_hours ?? 0) / 24;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--ink2)' }}>{b.stage_label ?? b.stage}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: avgDays > 5 ? 'var(--red)' : avgDays > 3 ? 'var(--gold)' : 'var(--teal)' }}>
                        {avgDays.toFixed(1)}d avg
                      </div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink3)' }}>{b.case_count ?? 0} cases</div>
                    </div>
                  );
                })}
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
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: 600 }}>{o.cases_closed ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink3)' }}>
                        <span>Avg days</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', fontWeight: 600 }}>{o.avg_days?.toFixed(1) ?? '—'}d</span>
                      </div>
                      {o.active_cases !== undefined && o.cases_closed !== undefined && (
                        <div style={{ marginTop: 8, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', background: 'var(--teal)', width: `${pct(o.cases_closed, o.active_cases + o.cases_closed)}%`, transition: 'width 0.3s' }} />
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
