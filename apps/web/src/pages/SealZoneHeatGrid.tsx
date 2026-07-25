import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

interface HeatLocation {
  id: string; code: string; locationType: string; lotCount: number; capacityUnits: number;
  occupancyPct: number; flagged: boolean; lots: { id: string; description: string }[];
}
interface HeatZone { id: string; code: string; name: string; zoneType: string; locations: HeatLocation[]; }
interface HeatGrid { compartment: { id: string; code: string; name: string }; overallOccupancyPct: number; lotCount: number; zones: HeatZone[]; }

// Banded occupancy color helper — same bands as the real Warehouse Layout view.
function bandColor(pct: number): string {
  if (pct >= 86) return 'var(--red)';
  if (pct >= 61) return 'var(--gold)';
  return 'var(--green)';
}
function bandBg(pct: number): string {
  if (pct >= 86) return 'var(--red-l)';
  if (pct >= 61) return 'var(--gold-l)';
  return 'var(--green-l)';
}

export function SealZoneHeatGrid() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<HeatGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    apiFetch(`/v1/seal/compartments/${id}/heat-grid`)
      .then(res => { setData(res); setActiveZoneId(res.zones[0]?.id ?? null); })
      .catch(err => setLoadError(err.message || 'Failed to load occupancy data.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="seal-page"><div className="seal-empty">Loading warehouse occupancy data…</div></div>;
  if (loadError || !data) return <div className="seal-page"><div className="seal-empty">{loadError || 'No data available.'}</div></div>;

  const activeZone = data.zones.find(z => z.id === activeZoneId) ?? data.zones[0];
  const flaggedCount = data.zones.flatMap(z => z.locations).filter(l => l.flagged).length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="seal-page">
        <div className="seal-page-hdr">
          <div>
            <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/compartments')} style={{ marginBottom: 12 }}>
              <Icon name="arrowLeft" size={13} />
              <span>Back to Compartments</span>
            </button>
            <h1 className="seal-page-title">{data.compartment.name} — Zone Heat Grid</h1>
            <p className="seal-page-sub">Quick flat occupancy overview — lot count per location vs. capacity. For floor levels, vertical stacking, and a 3D view, use Warehouse Layout.</p>
          </div>
          <button type="button" className="seal-btn-primary" onClick={() => navigate(`/seal/compartments/${data.compartment.id}/layout`)}>
            <Icon name="warehouse" size={14} />
            <span>Open Warehouse Layout</span>
          </button>
        </div>

        <div className="seal-kpi-strip">
          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant={data.overallOccupancyPct >= 86 ? 'error' : data.overallOccupancyPct >= 61 ? 'warning' : 'success'} size="md" shape="square">
              <Icon name="pieChart" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value" style={{ color: bandColor(data.overallOccupancyPct) }}>{data.overallOccupancyPct}%</div>
              <div className="seal-kpi-label">Occupancy</div>
            </div>
          </div>
          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="package" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value">{data.lotCount.toLocaleString()}</div>
              <div className="seal-kpi-label">Lots On Hand</div>
            </div>
          </div>
          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant={flaggedCount > 0 ? 'warning' : 'success'} size="md" shape="square">
              <Icon name="alertTriangle" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value">{flaggedCount}</div>
              <div className="seal-kpi-label">Flagged Locations</div>
            </div>
          </div>
        </div>

        {data.zones.length === 0 ? (
          <div className="seal-card"><div className="seal-empty">No zones defined in this compartment yet.</div></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: 20 }}>
            <div className="seal-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div className="seal-mode-group">
                  {data.zones.map(z => (
                    <button
                      key={z.id}
                      type="button"
                      className={`seal-mode-btn ${activeZoneId === z.id ? 'active' : ''}`}
                      onClick={() => setActiveZoneId(z.id)}
                    >
                      <Icon name="layers" size={13} />
                      <span>{z.code}</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--green)' }} /> 0-60%
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)' }} /> 61-85%
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--red)' }} /> 86-100%
                  </span>
                </div>
              </div>

              {!activeZone || activeZone.locations.length === 0 ? (
                <div className="seal-empty">No locations in {activeZone?.name ?? 'this zone'} yet.</div>
              ) : (
                <div className="seal-rack-grid">
                  {activeZone.locations.map(loc => (
                    <Tooltip key={loc.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="seal-rack-box"
                          style={{ borderColor: bandColor(loc.occupancyPct), background: bandBg(loc.occupancyPct) }}
                        >
                          {loc.flagged && (
                            <span style={{ position: 'absolute', top: 8, right: 8 }}>
                              <Icon name="alertTriangle" size={14} style={{ color: 'var(--red)' }} />
                            </span>
                          )}
                          <div className="seal-rack-code">{loc.code}</div>
                          <div className="seal-rack-pct" style={{ color: bandColor(loc.occupancyPct) }}>
                            {loc.occupancyPct}%
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{loc.code} Location</div>
                        <div>Occupancy: {loc.occupancyPct}% ({loc.lotCount} / {loc.capacityUnits} lots)</div>
                        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>Status: {loc.flagged ? 'Hold/Alert' : 'Normal Operations'}</div>
                        {loc.lots.length > 0 && (
                          <div style={{ fontSize: 11, marginTop: 4 }}>{loc.lots.map(l => l.description).join(', ')}</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>

            <div className="seal-card" style={{ padding: 20 }}>
              <h3 className="seal-card-title" style={{ marginBottom: 14 }}>{activeZone?.name ?? 'Zone'} Summary</h3>
              {activeZone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="seal-field-row">
                    <span className="seal-field-label">Locations</span>
                    <span className="seal-field-value">{activeZone.locations.length}</span>
                  </div>
                  <div className="seal-field-row">
                    <span className="seal-field-label">Total Capacity</span>
                    <span className="seal-field-value">{activeZone.locations.reduce((s, l) => s + l.capacityUnits, 0)} slots</span>
                  </div>
                  <div className="seal-field-row">
                    <span className="seal-field-label">Occupied</span>
                    <span className="seal-field-value">{activeZone.locations.reduce((s, l) => s + l.lotCount, 0)} lots</span>
                  </div>
                  <div className="seal-field-row">
                    <span className="seal-field-label">Flagged</span>
                    <span className="seal-field-value" style={{ color: activeZone.locations.some(l => l.flagged) ? 'var(--red)' : 'var(--ink)' }}>
                      {activeZone.locations.filter(l => l.flagged).length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
