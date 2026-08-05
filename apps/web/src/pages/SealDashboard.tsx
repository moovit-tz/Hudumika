import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip,
} from 'chart.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { ClickableBarChart } from '../components/AnalyticsKit.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import { CUSTOMS_STATUS_VARIANT } from '../lib/sealStatus.js';
import { CUSTOMS_STATUS_LABELS, type CustomsStatus } from '@hudumika/types';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface DashboardData {
  compartmentCount: number;
  lotCount: number;
  expiringSoonCount: number;
  byStatus: { status: CustomsStatus; count: number }[];
}

interface Compartment {
  id: string; code: string; name: string; warehouse_type: string; jurisdiction: string;
}

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

export function SealDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [metricsData, setMetricsData] = useState<Metrics | null>(null);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);

    Promise.all([
      apiFetch(`/v1/seal/dashboard?${params.toString()}`).catch(() => null),
      apiFetch(`/v1/seal/metrics?${params.toString()}`).catch(() => null),
      apiFetch('/v1/seal/compartments').catch(() => []),
    ]).then(([d, m, c]) => {
      setDashData(d);
      setMetricsData(m);
      setCompartments(c ?? []);
    }).finally(() => setLoading(false));
  }, [compartmentId]);

  const activityDays = metricsData?.dailyActivity?.filter((_, i) => i % 3 === 0 || i === (metricsData?.dailyActivity?.length ?? 0) - 1) ?? [];

  return (
    <div className="seal-page">
      {/* Header */}
      <PageHeader
        crumbs={['SEAL', 'Bonded Warehouse Dashboard']}
        titlePlain="Bonded Warehouse"
        titleEm="dashboard"
        subtitle="Combined customs-controlled stock ledger &amp; operational metrics — real-time fiscal movements, rack utilization &amp; telemetry."
      />
      <div className="seal-page-hdr">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/lots/new')}>
            <Icon name="plus" size={14} />
            <span>Receive Lot</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/seal/lots')}>
            <Icon name="package" size={14} />
            <span>View All Lots</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="seal-empty">Loading warehouse dashboard &amp; metrics…</div>
      ) : (
        <>
          {/* KPI Cards Strip (Ware Sync & Navexa Aesthetics) */}
          <div className="seal-kpi-strip">
            <div className="seal-kpi-card">
              <div className="seal-kpi-value">{dashData?.compartmentCount ?? compartments.length ?? 0}</div>
              <div className="seal-kpi-label">Compartments</div>
            </div>
            <div className="seal-kpi-card">
              <div className="seal-kpi-value">{(metricsData?.lotCount ?? dashData?.lotCount ?? 0).toLocaleString()}</div>
              <div className="seal-kpi-label">Lots On Hand</div>
            </div>
            <div className="seal-kpi-card">
              <div className="seal-kpi-value" style={{ color: bandColor(metricsData?.occupancyPct ?? 0) }}>
                {metricsData?.occupancyPct ?? 0}%
              </div>
              <div className="seal-kpi-label">Occupancy</div>
            </div>
            <div className="seal-kpi-card">
              <div className="seal-kpi-value">
                {metricsData?.avgStorageDurationDays != null ? `${metricsData.avgStorageDurationDays}d` : '—'}
              </div>
              <div className="seal-kpi-label">Avg Storage Duration</div>
            </div>
            <div className="seal-kpi-card">
              <div className={`seal-kpi-value${(dashData?.expiringSoonCount ?? 0) > 0 ? ' seal-kpi-value--alert' : ''}`}>
                {dashData?.expiringSoonCount ?? 0}
              </div>
              <div className="seal-kpi-label">Expiring &le; 30 Days</div>
            </div>
            <div className="seal-kpi-card">
              <div className={`seal-kpi-value${(metricsData?.flaggedLotCount ?? 0) > 0 ? ' seal-kpi-value--alert' : ''}`}>
                {metricsData?.flaggedLotCount ?? 0}
              </div>
              <div className="seal-kpi-label">Flagged Lots</div>
            </div>
          </div>

          {/* Receiving & Release Movement Activity Chart */}
          <div className="seal-card" style={{ marginBottom: 24 }}>
            <div className="seal-card-hdr">
              <div>
                <h2 className="seal-card-title">Receiving &amp; Release Movement Activity — Last 30 Days</h2>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                  {metricsData?.scope === 'compartment' ? 'Current warehouse view' : 'Combined across all bonded facilities'}
                </div>
              </div>
              <Badge variant="brand">Real-Time Ledger</Badge>
            </div>
            <div style={{ padding: 20 }}>
              {!metricsData?.dailyActivity || metricsData.dailyActivity.every(d => d.received === 0 && d.released === 0) ? (
                <div className="seal-empty">No receipt or release movements recorded in the last 30 days.</div>
              ) : (
                <ClickableBarChart
                  labels={activityDays.map(d => new Date(d.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }))}
                  values={activityDays.map(d => d.received - d.released)}
                  barColors={activityDays.map(d => (d.received - d.released) >= 0 ? 'rgba(20,184,166,.75)' : 'rgba(239,68,68,.75)')}
                  yLabel="Net lots (received − released)"
                />
              )}
            </div>
          </div>

          {/* Grid Layout: Status Breakdown & Compartments Visualizer */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Left: Lots by Customs Status */}
            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Lots by Customs Status</h2>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/lots')}>
                  <Icon name="package" size={13} />
                  <span>View List</span>
                </button>
              </div>
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(dashData?.byStatus?.length ?? 0) === 0 ? (
                  <div className="seal-empty">No lots on hand yet.</div>
                ) : (
                  dashData!.byStatus.map(row => (
                    <div key={row.status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg)', borderRadius: 10 }}>
                      <Badge variant={CUSTOMS_STATUS_VARIANT[row.status]}>{CUSTOMS_STATUS_LABELS[row.status] ?? row.status}</Badge>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right: Active Warehouses / Compartments */}
            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Warehouses &amp; Compartments</h2>
                <button type="button" className="btn btn-secondary" onClick={() => navigate('/seal/compartments')}>
                  <Icon name="layers" size={13} />
                  <span>Manage All</span>
                </button>
              </div>
              <div style={{ padding: 12 }}>
                {compartments.length === 0 ? (
                  <div className="seal-empty">No compartments registered.</div>
                ) : (
                  compartments.map(c => {
                    const compMetric = metricsData?.byCompartment?.find(m => m.compartmentId === c.id);
                    const occ = compMetric?.occupancyPct ?? 0;
                    return (
                      <div
                        key={c.id}
                        onClick={() => navigate(`/seal/compartments/${c.id}/heat-grid`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                          borderRadius: 12, border: '1px solid var(--border)', marginBottom: 10,
                          cursor: 'pointer', background: 'var(--white)', transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
                      >
                        <FeaturedIcon variant="brand" size="sm" shape="square">
                          <Icon name="layers" size={16} />
                        </FeaturedIcon>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                          <div className="seal-mono" style={{ color: 'var(--ink3)', fontSize: 11.5, marginTop: 2 }}>
                            {c.code} · {c.jurisdiction}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: bandColor(occ) }}>
                            {occ}% Occ
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                            {compMetric?.lotCount ?? 0} lots
                          </div>
                        </div>
                        <Icon name="chevronRight" size={14} color="var(--ink3)" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* By Warehouse Performance Breakdown Table (Metrics integration) */}
          {metricsData?.byCompartment && metricsData.byCompartment.length > 0 && (
            <div className="seal-card">
              <div className="seal-card-hdr">
                <h2 className="seal-card-title">Warehouse Facility Performance Breakdown</h2>
              </div>
              <div className="seal-card-body">
                <table className="seal-table">
                  <thead>
                    <tr>
                      <th>Facility</th>
                      <th>Lots On Hand</th>
                      <th>Occupancy %</th>
                      <th>Avg Storage Duration</th>
                      <th>Flagged Lots</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricsData.byCompartment.map(c => (
                      <tr key={c.compartmentId} onClick={() => navigate(`/seal/compartments/${c.compartmentId}/heat-grid`)}>
                        <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.name}</td>
                        <td>{c.lotCount}</td>
                        <td>
                          <span style={{ fontWeight: 800, color: bandColor(c.occupancyPct) }}>
                            {c.occupancyPct}%
                          </span>
                        </td>
                        <td>{c.avgStorageDurationDays != null ? `${c.avgStorageDurationDays}d` : '—'}</td>
                        <td>
                          {c.flaggedLotCount > 0 ? (
                            <Badge variant="error">{c.flaggedLotCount}</Badge>
                          ) : (
                            <span style={{ color: 'var(--ink3)' }}>0</span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ height: 30, padding: '0 10px', fontSize: 12 }}
                            onClick={e => { e.stopPropagation(); navigate(`/seal/compartments/${c.compartmentId}/heat-grid`); }}
                          >
                            <Icon name="grid" size={12} />
                            <span>Heat Grid</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
