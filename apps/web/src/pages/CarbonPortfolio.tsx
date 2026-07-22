import React, { useCallback, useEffect, useState } from 'react';
import { usePageSEO } from '../hooks/usePageSEO.js';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { MetricsRow, spark } from '../components/MetricCard.js';
import { exportCsv, ExportButton, StatTile, DataTable, ClickableBarChart } from '../components/AnalyticsKit.js';
import type { ColumnDef } from '../components/AnalyticsKit.js';
import type { CarbonPortfolioResponse, CarbonModeBreakdown, CarbonCustomerBreakdown } from '@hudumika/types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const MODE_COLOR: Record<string, string> = {
  SEA: 'rgba(20,184,166,.75)', AIR: 'rgba(220,38,38,.75)',
  ROAD: 'rgba(217,119,6,.75)', RAIL: 'rgba(37,99,235,.75)',
};

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

export const CarbonPortfolio: React.FC = () => {
  usePageSEO('Carbon Portfolio', 'Track carbon credits and sustainability metrics.');
  const [data, setData] = useState<CarbonPortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/analytics/carbon');
      setData(res);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load carbon portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const exportModeCsv = () => data && exportCsv(
    'carbon-by-mode.csv',
    ['Mode', 'CO2 (kg)', 'Credits (est.)', 'Shipments'],
    data.by_mode.map(m => [m.mode, m.co2_kg, m.credits, m.shipment_count]),
  );
  const exportCustomerCsv = () => data && exportCsv(
    'carbon-by-customer.csv',
    ['Customer', 'CO2 (kg)', 'Credits (est.)', 'Shipments'],
    data.by_customer.map(c => [c.customer_name, c.co2_kg, c.credits, c.shipment_count]),
  );

  const customerColumns: ColumnDef<CarbonCustomerBreakdown>[] = [
    { key: 'customer', label: 'Customer', sortValue: c => c.customer_name, render: c => <strong>{c.customer_name}</strong> },
    { key: 'shipments', label: 'Shipments', align: 'right', sortValue: c => c.shipment_count, render: c => `${c.shipment_count}` },
    { key: 'co2', label: 'CO₂ (kg)', align: 'right', sortValue: c => c.co2_kg, render: c => <span style={{ fontFamily: 'var(--mono)' }}>{c.co2_kg.toLocaleString('en')}</span> },
    { key: 'credits', label: 'Credits (est.)', align: 'right', sortValue: c => c.credits, render: c => <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>{c.credits.toFixed(2)}</span> },
  ];

  const monthLabels = data?.by_month.map(m => fmtMonth(m.month)) ?? [];
  const monthValues = data?.by_month.map(m => m.co2_kg) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '10px 20px',
        background: 'var(--white)', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--green-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name="globe" size={18} color="var(--green)" strokeWidth={1.75} />
        </div>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', lineHeight: 1.2 }}>Carbon Portfolio</h1>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 1 }}>
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={load} title="Refresh data" disabled={loading}>
          <Icon name="refresh" size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{
          border: '1px solid var(--border)', borderRadius: 16, background: 'var(--white)',
          boxShadow: '0 1px 2px rgba(15,23,42,0.04)', padding: 24,
        }}>
          {error && (
            <div style={{ padding: 16, background: 'var(--red-l)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 6, marginBottom: 20 }}>
              {error}
            </div>
          )}

          {/* Not-a-tradeable-credit disclosure — this is an internal GLEC-based estimate,
              not a Gold Standard/Verra registered offset. Shown once, up top, so it can't
              be missed or mistaken for something sellable. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 20, fontSize: 12.5, color: 'var(--ink2)' }}>
            <Icon name="alertTriangle" size={15} color="var(--gold)" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Internal ESG estimate (GLEC v3.2 / ISO 14083 methodology) computed per shipment from route distance, cargo weight, and transport mode. Not a registry-issued or tradeable carbon credit.</span>
          </div>

          <MetricsRow cards={[
            {
              title: 'Total Emissions',
              value: `${(data?.total_co2_kg ?? 0).toLocaleString('en')} kg`,
              trend: 0,
              sub1Label: 'AVG / SHIPMENT', sub1Value: `${(data?.avg_co2_per_shipment_kg ?? 0).toLocaleString('en')} kg`,
              sub2Label: 'SHIPMENTS CALC.', sub2Value: String(data?.calculated_shipment_count ?? 0),
              icon: 'trendingUp',
              bars: spark(97, 15, 'up'), barColor: 'var(--red-l)', barHighlight: 'var(--red)',
              onMenuClick: load, menuTitle: 'Refresh emissions data',
            },
            {
              title: 'Credits Saved (est.)',
              value: `${(data?.total_credits ?? 0).toLocaleString('en')}`,
              trend: 0,
              sub1Label: 'MODES TRACKED', sub1Value: String(data?.by_mode.length ?? 0),
              sub2Label: 'CUSTOMERS',      sub2Value: String(data?.by_customer.length ?? 0),
              icon: 'checkCircle',
              bars: spark(98, 15, 'up'), barColor: 'var(--green-l)', barHighlight: 'var(--green)',
              onMenuClick: load, menuTitle: 'Refresh credits data',
            },
            {
              title: 'Data Coverage',
              value: data && (data.calculated_shipment_count + data.uncalculated_shipment_count) > 0
                ? `${Math.round((data.calculated_shipment_count / (data.calculated_shipment_count + data.uncalculated_shipment_count)) * 100)}%`
                : '—',
              trend: 0,
              sub1Label: 'NOT YET CALCULATED', sub1Value: String(data?.uncalculated_shipment_count ?? 0),
              icon: 'package',
              bars: spark(99, 15, 'flat'), barColor: 'var(--blue-l)', barHighlight: 'var(--blue)',
              onMenuClick: load, menuTitle: 'Refresh coverage data',
            },
          ]} />

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 14, color: 'var(--ink3)' }}>
              Loading carbon portfolio…
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 28 }}>

              {/* ── By mode ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="truck" size={14} color="#2563eb" strokeWidth={1.75} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Emissions by Transport Mode</h2>
                  </div>
                  <ExportButton onClick={exportModeCsv} />
                </div>
                <div className="card">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                    {(data?.by_mode ?? []).map((m: CarbonModeBreakdown) => (
                      <StatTile key={m.mode} label={`${m.mode} · ${m.shipment_count} shipment${m.shipment_count === 1 ? '' : 's'}`} value={`${m.co2_kg.toLocaleString('en')} kg`} />
                    ))}
                    {(!data || data.by_mode.length === 0) && (
                      <div style={{ padding: 12, color: 'var(--ink3)', fontSize: 13 }}>No calculated shipments yet.</div>
                    )}
                  </div>
                  {data && data.by_mode.length > 0 && (
                    <ClickableBarChart
                      labels={data.by_mode.map(m => m.mode)}
                      values={data.by_mode.map(m => m.co2_kg)}
                      barColors={data.by_mode.map(m => MODE_COLOR[m.mode] ?? 'rgba(107,114,128,.75)')}
                      yLabel="CO₂ (kg)"
                    />
                  )}
                </div>
              </div>

              {/* ── Trend by month ── */}
              {data && data.by_month.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(217,119,6,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="clock" size={14} color="#d97706" strokeWidth={1.75} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Monthly Trend</h2>
                  </div>
                  <div className="card">
                    <ClickableBarChart
                      labels={monthLabels}
                      values={monthValues}
                      barColors={monthLabels.map(() => 'rgba(20,184,166,.75)')}
                      yLabel="CO₂ (kg)"
                    />
                  </div>
                </div>
              )}

              {/* ── By customer ── */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="users" size={14} color="#7c3aed" strokeWidth={1.75} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>Emissions by Customer</h2>
                  </div>
                  <ExportButton onClick={exportCustomerCsv} />
                </div>

                <button
                  type="button"
                  onClick={() => setTableOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--teal)', fontSize: 12.5, fontWeight: 600, padding: '6px 0', marginBottom: tableOpen ? 12 : 0,
                  }}
                >
                  <Icon name={tableOpen ? 'chevronUp' : 'chevronDown'} size={13} />
                  {tableOpen ? 'Hide customer table' : `View ${data?.by_customer.length ?? 0} customers`}
                </button>

                {tableOpen && (
                  <DataTable
                    rows={data?.by_customer ?? []}
                    columns={customerColumns}
                    rowKey={c => c.customer_id}
                    emptyMessage="No calculated shipments to break down by customer yet."
                  />
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
