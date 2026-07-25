import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { ClickableBarChart } from '../components/AnalyticsKit.js';
import { apiFetch } from '../lib/api.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface DailyActivity { date: string; received: number; released: number; }
interface CompartmentMetrics {
  compartmentId: string; code: string; name: string; lotCount: number; flaggedLotCount: number;
  occupancyPct: number; avgStorageDurationDays: number | null;
}
interface Metrics {
  scope: 'compartment' | 'all';
  lotCount: number; flaggedLotCount: number; occupancyPct: number; avgStorageDurationDays: number | null;
  dailyActivity: DailyActivity[];
  byCompartment: CompartmentMetrics[];
}

function bandColor(pct: number): string {
  if (pct >= 86) return 'var(--red)';
  if (pct >= 61) return 'var(--gold)';
  return 'var(--green)';
}

export function SealMetrics() {
  const navigate = useNavigate();
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/metrics?${params.toString()}`).then(setData).finally(() => setLoading(false));
  }, [compartmentId]);

  if (loading || !data) return <div className="seal-page"><div className="seal-empty">Loading metrics…</div></div>;

  const activityDays = data.dailyActivity.filter((_, i) => i % 3 === 0 || i === data.dailyActivity.length - 1);

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Warehouse Metrics</h1>
          <p className="seal-page-sub">
            {data.scope === 'compartment' ? 'This warehouse' : 'Combined across all warehouses'} — every number reconstructed from real lot and movement-ledger rows, not a projection.
          </p>
        </div>
      </div>

      <div className="seal-kpi-strip">
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{data.lotCount.toLocaleString()}</div>
          <div className="seal-kpi-label">Lots On Hand</div>
        </div>
        <div className="seal-kpi-card">
          <div className="seal-kpi-value" style={{ color: bandColor(data.occupancyPct) }}>{data.occupancyPct}%</div>
          <div className="seal-kpi-label">Occupancy</div>
        </div>
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{data.avgStorageDurationDays != null ? `${data.avgStorageDurationDays}d` : '—'}</div>
          <div className="seal-kpi-label">Avg Storage Duration</div>
        </div>
        <div className="seal-kpi-card">
          <div className={`seal-kpi-value${data.flaggedLotCount > 0 ? ' seal-kpi-value--alert' : ''}`}>{data.flaggedLotCount}</div>
          <div className="seal-kpi-label">Flagged Lots</div>
        </div>
      </div>

      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr">
          <h2 className="seal-card-title">Receiving &amp; Release Activity — Last 30 Days</h2>
        </div>
        <div style={{ padding: 20 }}>
          {data.dailyActivity.every(d => d.received === 0 && d.released === 0) ? (
            <div className="seal-empty">No receipt or release movements recorded in the last 30 days.</div>
          ) : (
            <ClickableBarChart
              labels={activityDays.map(d => new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }))}
              values={activityDays.map(d => d.received - d.released)}
              barColors={activityDays.map(d => (d.received - d.released) >= 0 ? 'rgba(20,184,166,.75)' : 'rgba(220,38,38,.75)')}
              yLabel="Net lots (received − released)"
            />
          )}
        </div>
      </div>

      {data.scope === 'all' && data.byCompartment.length > 0 && (
        <div className="seal-card">
          <div className="seal-card-hdr"><h2 className="seal-card-title">By Warehouse</h2></div>
          <div className="seal-card-body">
            <table className="seal-table">
              <thead>
                <tr><th>Warehouse</th><th>Lots</th><th>Occupancy</th><th>Avg Storage Duration</th><th>Flagged</th><th></th></tr>
              </thead>
              <tbody>
                {data.byCompartment.map(c => (
                  <tr key={c.compartmentId} onClick={() => navigate(`/seal/compartments/${c.compartmentId}/heat-grid`)}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.name}</td>
                    <td>{c.lotCount}</td>
                    <td><span style={{ fontWeight: 700, color: bandColor(c.occupancyPct) }}>{c.occupancyPct}%</span></td>
                    <td>{c.avgStorageDurationDays != null ? `${c.avgStorageDurationDays}d` : '—'}</td>
                    <td>{c.flaggedLotCount > 0 ? <Badge variant="error">{c.flaggedLotCount}</Badge> : <span style={{ color: 'var(--ink3)' }}>0</span>}</td>
                    <td><Icon name="chevronRight" size={14} style={{ color: 'var(--ink3)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
