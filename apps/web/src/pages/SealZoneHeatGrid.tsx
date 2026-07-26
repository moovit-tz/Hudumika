import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface HeatLocation {
  id: string; code: string; locationType: string; lotCount: number; capacityUnits: number;
  occupancyPct: number; flagged: boolean; lots: { id: string; description: string }[];
}
interface HeatZone { id: string; code: string; name: string; zoneType: string; locations: HeatLocation[]; }
interface HeatGrid { compartment: { id: string; code: string; name: string }; overallOccupancyPct: number; lotCount: number; zones: HeatZone[]; }
interface SensorDevice {
  id: string; deviceId: string; deviceType: string; name: string; zoneName?: string; active: boolean;
  latestReading: { value: number; type: string; recordedAt: string } | null;
}

const SENSOR_TYPES = ['camera', 'occupancy_sensor', 'weight_sensor', 'door_sensor'];

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
  const [sensors, setSensors] = useState<SensorDevice[]>([]);
  const [showNewSensor, setShowNewSensor] = useState(false);
  const [newSensorId, setNewSensorId] = useState('');
  const [newSensorType, setNewSensorType] = useState('camera');
  const [newSensorName, setNewSensorName] = useState('');
  const [savingSensor, setSavingSensor] = useState(false);

  function reloadSensors() {
    if (!id) return;
    apiFetch(`/v1/seal/sensors?compartment_id=${id}`).then(setSensors);
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    apiFetch(`/v1/seal/compartments/${id}/heat-grid`)
      .then(res => { setData(res); setActiveZoneId(res.zones[0]?.id ?? null); })
      .catch(err => setLoadError(err.message || 'Failed to load occupancy data.'))
      .finally(() => setLoading(false));
    reloadSensors();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddSensor(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newSensorId.trim() || !newSensorName.trim()) return;
    setSavingSensor(true);
    try {
      await apiFetch('/v1/seal/sensors', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: id, deviceId: newSensorId.trim(), deviceType: newSensorType, name: newSensorName.trim() }),
      });
      setNewSensorId(''); setNewSensorName(''); setShowNewSensor(false);
      reloadSensors();
    } catch (err: any) {
      showAlert(err.message || 'Failed to register this sensor.');
    } finally {
      setSavingSensor(false);
    }
  }

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
                      <TooltipContent side="top" style={{ width: 250, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon name="layers" size={13} style={{ color: 'var(--seal)' }} />
                            <span>{loc.code}</span>
                          </div>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12,
                            background: loc.flagged ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                            color: loc.flagged ? '#fca5a5' : '#6ee7b7', border: `1px solid ${loc.flagged ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                          }}>
                            {loc.flagged ? 'Hold / Alert' : 'Normal'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 10px', fontSize: 11.5 }}>
                          <div style={{ color: '#94a3b8' }}>Occupancy:</div>
                          <div style={{ color: '#f8fafc', fontWeight: 700, textAlign: 'right' }}>
                            {loc.occupancyPct}% <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>({loc.lotCount}/{loc.capacityUnits})</span>
                          </div>
                        </div>

                        {loc.lots.length > 0 && (
                          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 11 }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4, fontWeight: 700 }}>
                              Stored Lots ({loc.lots.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {loc.lots.slice(0, 2).map((l, idx) => (
                                <div key={idx} style={{ color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                  • {l.description}
                                </div>
                              ))}
                              {loc.lots.length > 2 && (
                                <div style={{ color: '#94a3b8', fontSize: 10, fontStyle: 'italic' }}>
                                  +{loc.lots.length - 2} more items…
                                </div>
                              )}
                            </div>
                          </div>
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

        <div className="seal-card" style={{ marginTop: 20 }}>
          <div className="seal-card-hdr">
            <h2 className="seal-card-title">Zone Sensors &amp; Cameras</h2>
            <button type="button" className="seal-btn-secondary" onClick={() => setShowNewSensor(v => !v)}>
              <Icon name="plus" size={13} /><span>Register Sensor</span>
            </button>
          </div>
          {showNewSensor && (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="seal-field-row" style={{ width: 160 }}>
                <label className="seal-field-label">Device ID</label>
                <input type="text" className="input-field" value={newSensorId} onChange={e => setNewSensorId(e.target.value)} placeholder="CAM-ZONE-A1" />
              </div>
              <div className="seal-field-row" style={{ width: 160 }}>
                <label className="seal-field-label">Type</label>
                <Select value={newSensorType} onValueChange={setNewSensorType}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>{SENSOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="seal-field-row" style={{ width: 220, flex: 1 }}>
                <label className="seal-field-label">Name</label>
                <input type="text" className="input-field" value={newSensorName} onChange={e => setNewSensorName(e.target.value)} placeholder="e.g. Zone A Overhead Cam" />
              </div>
              <button type="button" className="seal-btn-primary" disabled={savingSensor || !newSensorId.trim() || !newSensorName.trim()} onClick={handleAddSensor}>
                {savingSensor ? 'Registering…' : 'Register'}
              </button>
            </div>
          )}
          <div className="seal-card-body">
            {sensors.length === 0 ? (
              <div className="seal-empty">No sensors or cameras registered for this warehouse yet — this is a real, testable ingestion contract (device_id → reading), waiting for hardware to be wired up.</div>
            ) : (
              <table className="seal-table">
                <thead><tr><th>Device</th><th>Type</th><th>Zone</th><th>Latest Reading</th></tr></thead>
                <tbody>
                  {sensors.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.name}</div>
                        <div className="seal-mono" style={{ color: 'var(--ink3)', fontSize: 11 }}>{s.deviceId}</div>
                      </td>
                      <td>{s.deviceType.replace(/_/g, ' ')}</td>
                      <td>{s.zoneName ?? '—'}</td>
                      <td>
                        {s.latestReading ? (
                          <span>{s.latestReading.value} <span style={{ color: 'var(--ink3)', fontSize: 11 }}>({s.latestReading.type.replace(/_/g, ' ')}, {new Date(s.latestReading.recordedAt).toLocaleString()})</span></span>
                        ) : (
                          <Badge variant="gray">No readings yet</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
