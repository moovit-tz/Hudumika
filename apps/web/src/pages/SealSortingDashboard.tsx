import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface DestinationGroup { destinationLabel: string | null; lotCount: number; oldestDwellHours: number; }
interface OverdueLot { id: string; description: string; qtyOnHand: number; uom: string; destinationLabel: string | null; dwellHours: number; }
interface SortingData {
  compartment: { id: string; code: string; name: string };
  lotCount: number; unsortedCount: number; avgDwellHours: number | null;
  overdueCount: number; overdueThresholdHours: number;
  byDestination: DestinationGroup[]; overdueLots: OverdueLot[];
}

export function SealSortingDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SortingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    apiFetch(`/v1/seal/compartments/${id}/sorting-dashboard`)
      .then(setData)
      .catch(err => setLoadError(err.message || 'Failed to load the sorting dashboard.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="seal-page"><div className="seal-empty">Loading sorting dashboard…</div></div>;
  if (loadError || !data) return <div className="seal-page"><div className="seal-empty">{loadError || 'No data available.'}</div></div>;

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Sorting']}
        titlePlain="Sorting"
        titleEm="dashboard"
        subtitle="What is waiting to be sorted, and where it is going."
      />
      <div className="seal-page-hdr">
        <div>
          <Button type="button" variant="outline" onClick={() => navigate('/seal/compartments')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} /><span>Back to Compartments</span>
          </Button>
          <h1 className="seal-page-title">{data.compartment.name} — Sorting Dashboard</h1>
          <p className="seal-page-sub">Throughput matters more than storage here — every parcel's dwell time is measured in hours, reconstructed from the same movement ledger the rest of SEAL uses.</p>
        </div>
        <Button type="button" onClick={() => navigate('/seal/lots/new')}>
          <Icon name="plus" size={14} /><span>Receive Parcel</span>
        </Button>
      </div>

      <div className="seal-kpi-strip">
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{data.lotCount.toLocaleString()}</div>
          <div className="seal-kpi-label">Parcels On Hand</div>
        </div>
        <div className="seal-kpi-card">
          <div className={`seal-kpi-value${data.unsortedCount > 0 ? ' seal-kpi-value--alert' : ''}`}>{data.unsortedCount}</div>
          <div className="seal-kpi-label">Unsorted (No Destination)</div>
        </div>
        <div className="seal-kpi-card">
          <div className="seal-kpi-value">{data.avgDwellHours != null ? `${data.avgDwellHours}h` : '—'}</div>
          <div className="seal-kpi-label">Avg Dwell Time</div>
        </div>
        <div className="seal-kpi-card">
          <div className={`seal-kpi-value${data.overdueCount > 0 ? ' seal-kpi-value--alert' : ''}`}>{data.overdueCount}</div>
          <div className="seal-kpi-label">Overdue (&gt; {data.overdueThresholdHours}h)</div>
        </div>
      </div>

      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr"><h2 className="seal-card-title">By Destination</h2></div>
        <div className="seal-card-body">
          {data.byDestination.length === 0 ? (
            <div className="seal-empty">No parcels on hand right now.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Destination</th><th>Parcels</th><th>Oldest Dwell</th></tr></thead>
              <tbody>
                {data.byDestination.map((d, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{d.destinationLabel ?? <span style={{ color: 'var(--ink3)', fontWeight: 600 }}>Unassigned</span>}</td>
                    <td>{d.lotCount}</td>
                    <td>
                      {d.oldestDwellHours > data.overdueThresholdHours
                        ? <Badge variant="error">{d.oldestDwellHours}h</Badge>
                        : <span>{d.oldestDwellHours}h</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="seal-card">
        <div className="seal-card-hdr"><h2 className="seal-card-title">Overdue Parcels (&gt; {data.overdueThresholdHours}h dwell)</h2></div>
        <div className="seal-card-body">
          {data.overdueLots.length === 0 ? (
            <div className="seal-empty">Nothing overdue — every parcel is moving within the expected window.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Parcel</th><th>Qty</th><th>Destination</th><th>Dwell Time</th></tr></thead>
              <tbody>
                {data.overdueLots.map(l => (
                  <tr key={l.id} onClick={() => navigate(`/seal/lots/${l.id}`)}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{l.description}</td>
                    <td>{l.qtyOnHand} {l.uom}</td>
                    <td>{l.destinationLabel ?? <span style={{ color: 'var(--ink3)' }}>Unassigned</span>}</td>
                    <td><Badge variant="error">{l.dwellHours}h</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
