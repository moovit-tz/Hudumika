import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { MetricsRow } from '../components/MetricCard.js';
import { apiFetch } from '../lib/api.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

interface Summary {
  shipments: number;
  containers: number;
  delayed_shipments: number;
  shipments_at_pod: number;
}

interface CarrierRow {
  carrier: string;
  shipments: number;
  on_time_pct: number | null;
  avg_deviation_days: number | null;
  avg_transit_days: number | null;
}

interface LaneRow {
  lane: string;
  shipments: number;
  avg_delay_days: number | null;
  avg_transit_days: number | null;
}

interface RegionRow {
  country: string;
  shipments: number;
  avg_delay_days: number | null;
}

interface DemurrageAnalysis {
  total_containers: number;
  active_containers: number;
  total_demurrage_cost: number;
  by_carrier: Record<string, { count: number; cost: number }>;
  monthly_trend: { month: string; cost: number; avg_days: number; containers: number }[];
}

function ReliabilityBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: 'var(--ink3)', fontSize: 12.5 }}>—</span>;
  const variant = pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error';
  const label = pct >= 80 ? 'HIGH' : pct >= 50 ? 'MED' : 'LOW';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      <Badge variant={variant}>{label}</Badge>
    </div>
  );
}

function RankedBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color }} />
    </div>
  );
}

function EmptyPanel({ icon, title, sub }: { icon: any; title: string; sub: string }) {
  return (
    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)' }}>
      <Icon name={icon} size={24} color="var(--border2)" />
      <div style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: 'var(--ink2)' }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
};
const panelHeadStyle: React.CSSProperties = {
  padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

export function CargoDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);
  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [regions, setRegions] = useState<RegionRow[]>([]);
  const [demurrage, setDemurrage] = useState<DemurrageAnalysis | null>(null);
  const [demurrageEnabled, setDemurrageEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, c, l, r] = await Promise.all([
        apiFetch('/v1/cargotracker/dashboard/summary').catch(() => null),
        apiFetch('/v1/cargotracker/dashboard/carrier-analysis').catch(() => []),
        apiFetch('/v1/cargotracker/dashboard/lane-analysis').catch(() => []),
        apiFetch('/v1/cargotracker/dashboard/regional-analysis').catch(() => []),
      ]);
      setSummary(s);
      setCarriers(Array.isArray(c) ? c : []);
      setLanes(Array.isArray(l) ? l : []);
      setRegions(Array.isArray(r) ? r : []);

      try {
        setDemurrage(await apiFetch('/v1/cargotracker/dashboard/demurrage-analysis'));
      } catch {
        setDemurrageEnabled(false);
      }
      setLoading(false);
    })();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  const maxLaneShipments = Math.max(1, ...lanes.map(l => l.shipments));
  const maxRegionShipments = Math.max(1, ...regions.map(r => r.shipments));
  const maxCarrierCost = Math.max(1, ...Object.values(demurrage?.by_carrier ?? {}).map(v => v.cost));

  if (loading) {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--ink3)' }}>Loading dashboard…</div>;
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px 32px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        crumbs={['CargoTracker', 'Dashboard']}
        titlePlain="Cargo tracking"
        titleEm="overview"
        subtitle="Shipments, containers, carrier reliability and demurrage — across every lane you track."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => navigate('/cargotracker/track')}>
            <Icon name="search" size={14} /> Track a shipment
          </button>
        }
      />

      <MetricsRow cards={[
        {
          title: 'Shipments Tracked',
          value: String(summary?.shipments ?? 0),
          barHighlight: 'var(--blue)',
          icon: 'map',
        },
        {
          title: 'Containers',
          value: String(summary?.containers ?? 0),
          barHighlight: 'var(--teal)',
          icon: 'package',
        },
        {
          title: 'Delayed Shipments',
          value: String(summary?.delayed_shipments ?? 0),
          invertTrend: true, barHighlight: 'var(--red)',
          icon: 'alertTriangle',
        },
        {
          title: 'Shipments at POD',
          value: String(summary?.shipments_at_pod ?? 0),
          barHighlight: 'var(--green)',
          icon: 'checkCircle',
        },
      ]} />

      {/* Carrier reliability */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Carrier Analysis</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>On-time %, ETA deviation and transit time, computed from your own tracked shipments</div>
          </div>
        </div>
        {carriers.length === 0 ? (
          <EmptyPanel icon="ship" title="No carrier data yet" sub="Save a few tracked shipments to see reliability by carrier." />
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Carrier', 'Shipments', 'On-time', 'Avg Deviation', 'Avg Transit'].map(h => (
                    <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carriers.map(c => (
                  <tr key={c.carrier} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.carrier}</td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{c.shipments}</td>
                    <td style={{ padding: '12px 20px' }}><ReliabilityBadge pct={c.on_time_pct} /></td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: c.avg_deviation_days && c.avg_deviation_days > 0 ? 'var(--red)' : 'var(--ink2)' }}>
                      {c.avg_deviation_days === null ? '—' : `${c.avg_deviation_days > 0 ? '+' : ''}${c.avg_deviation_days}d`}
                    </td>
                    <td style={{ padding: '12px 20px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{c.avg_transit_days === null ? '—' : `${c.avg_transit_days}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Lane performance */}
        <div style={panelStyle}>
          <div style={panelHeadStyle}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Lane Performance</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Busiest origin → destination lanes</div>
            </div>
          </div>
          {lanes.length === 0 ? (
            <EmptyPanel icon="mapPin" title="No lane data yet" sub="Lanes appear once you've tracked shipments with known ports." />
          ) : (
            <div style={{ padding: '8px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lanes.slice(0, 8).map(l => (
                <div key={l.lane}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{l.lane}</span>
                    <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>
                      {l.shipments} shipment{l.shipments === 1 ? '' : 's'}
                      {l.avg_delay_days !== null && ` · ${l.avg_delay_days > 0 ? '+' : ''}${l.avg_delay_days}d delay`}
                    </span>
                  </div>
                  <RankedBar value={l.shipments} max={maxLaneShipments} color="var(--blue)" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regional performance */}
        <div style={panelStyle}>
          <div style={panelHeadStyle}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Regional Analysis</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Destination country, from your own shipment history</div>
            </div>
          </div>
          {regions.length === 0 ? (
            <EmptyPanel icon="globe" title="No regional data yet" sub="Regions are grouped from destination port codes." />
          ) : (
            <div style={{ padding: '8px 20px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {regions.slice(0, 8).map(r => (
                <div key={r.country}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.country}</span>
                    <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.shipments} shipment{r.shipments === 1 ? '' : 's'}
                      {r.avg_delay_days !== null && ` · ${r.avg_delay_days > 0 ? '+' : ''}${r.avg_delay_days}d delay`}
                    </span>
                  </div>
                  <RankedBar value={r.shipments} max={maxRegionShipments} color="var(--teal)" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Demurrage & Detention */}
      <div style={panelStyle}>
        <div style={panelHeadStyle}>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Demurrage & Detention</div>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Cost exposure by carrier and month</div>
          </div>
          {demurrageEnabled && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/cargotracker/demurrage')}>
              Open Demurrage <Icon name="arrowRight" size={13} />
            </button>
          )}
        </div>
        {!demurrageEnabled ? (
          <EmptyPanel icon="lock" title="Demurrage tracking isn't enabled" sub="This tenant doesn't have the Demurrage entitlement — contact your administrator to turn it on." />
        ) : !demurrage || demurrage.total_containers === 0 ? (
          <EmptyPanel icon="package" title="No containers tracked yet" sub="Add containers under Demurrage & Detention to see cost trends here." />
        ) : (
          <div style={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Cost by carrier</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(demurrage.by_carrier).sort((a, b) => b[1].cost - a[1].cost).slice(0, 6).map(([carrier, v]) => (
                  <div key={carrier}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{carrier}</span>
                      <span style={{ color: 'var(--ink3)', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(v.cost)} · {v.count} box{v.count === 1 ? '' : 'es'}</span>
                    </div>
                    <RankedBar value={v.cost} max={maxCarrierCost} color="var(--gold)" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Monthly trend</div>
              {demurrage.monthly_trend.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>Not enough discharge-date history yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {demurrage.monthly_trend.slice(-6).map(m => (
                    <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ink2)' }}>{m.month}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--ink)' }}>{formatCurrency(m.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
