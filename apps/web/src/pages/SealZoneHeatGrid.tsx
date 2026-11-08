import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { PageHeader } from '../components/PageHeader.js';
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
  const isMobile = useIsMobile();
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

  if (loading) return <div className="seal-page"><SectionLoading label="Loading warehouse occupancy data…" /></div>;
  if (loadError || !data) return <div className="seal-page"><div className="seal-empty">{loadError || 'No data available.'}</div></div>;

  const activeZone = data.zones.find(z => z.id === activeZoneId) ?? data.zones[0];
  const flaggedCount = data.zones.flatMap(z => z.locations).filter(l => l.flagged).length;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="seal-page">
        <PageHeader
          crumbs={['SEAL', 'Compartments']}
          titlePlain="Zone heat"
          titleEm="grid"
          subtitle={<>Quick flat occupancy overview for <strong>{data.compartment.name}</strong> — lot count per location vs. capacity. For floor levels, vertical stacking, and a 3D view, use Warehouse Layout.</>}
          backTo="/seal/compartments"
          backLabel="Back to Compartments"
          actions={
            <Button onClick={() => navigate(`/seal/compartments/${data.compartment.id}/layout`)}>
              <Icon name="warehouse" size={14} />
              Open Warehouse Layout
            </Button>
          }
        />

        <div className="seal-kpi-strip">
          <div className="seal-kpi-card">
            <div className="seal-kpi-inner">
              <FeaturedIcon variant={data.overallOccupancyPct >= 86 ? 'error' : data.overallOccupancyPct >= 61 ? 'warning' : 'success'} size="md" shape="square">
                <Icon name="pieChart" size={18} />
              </FeaturedIcon>
              <div>
                <div className="seal-kpi-value" style={{ color: bandColor(data.overallOccupancyPct) }}>{data.overallOccupancyPct}%</div>
                <div className="seal-kpi-label">Occupancy</div>
              </div>
            </div>
          </div>
          <div className="seal-kpi-card">
            <div className="seal-kpi-inner">
              <FeaturedIcon variant="brand" size="md" shape="square">
                <Icon name="package" size={18} />
              </FeaturedIcon>
              <div>
                <div className="seal-kpi-value">{data.lotCount.toLocaleString()}</div>
                <div className="seal-kpi-label">Lots On Hand</div>
              </div>
            </div>
          </div>
          <div className="seal-kpi-card">
            <div className="seal-kpi-inner">
              <FeaturedIcon variant={flaggedCount > 0 ? 'warning' : 'success'} size="md" shape="square">
                <Icon name="alertTriangle" size={18} />
              </FeaturedIcon>
              <div>
                <div className="seal-kpi-value">{flaggedCount}</div>
                <div className="seal-kpi-label">Flagged Locations</div>
              </div>
            </div>
          </div>
        </div>

        {data.zones.length === 0 ? (
          <div className="seal-card"><div className="seal-empty">No zones defined in this compartment yet.</div></div>
        ) : (
          <div className={isMobile ? '' : 'seal-heat-layout'}>
            <div className="seal-card seal-heat-main">
              <div className="seal-heat-toolbar">
                <div className="seal-mode-group">
                  {data.zones.map(z => (
                    <button data-ui-native-button=""
                      key={z.id}
                      type="button"
                      className={`seal-mode-btn${activeZoneId === z.id ? ' active' : ''}`}
                      onClick={() => setActiveZoneId(z.id)}
                    >
                      <Icon name="layers" size={13} />
                      <span>{z.code}</span>
                    </button>
                  ))}
                </div>
                <div className="seal-legend">
                  <span className="seal-legend-item">
                    <span className="seal-legend-dot" style={{ background: 'var(--green)' }} /> 0-60%
                  </span>
                  <span className="seal-legend-item">
                    <span className="seal-legend-dot" style={{ background: 'var(--gold)' }} /> 61-85%
                  </span>
                  <span className="seal-legend-item">
                    <span className="seal-legend-dot" style={{ background: 'var(--red)' }} /> 86-100%
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
                            <span className="seal-rack-flag">
                              <Icon name="alertTriangle" size={14} />
                            </span>
                          )}
                          <div className="seal-rack-code">{loc.code}</div>
                          <div className="seal-rack-pct" style={{ color: bandColor(loc.occupancyPct) }}>
                            {loc.occupancyPct}%
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="seal-tip">
                        <div className="seal-tip-header">
                          <div className="seal-tip-title">
                            <Icon name="layers" size={13} color="var(--teal)" />
                            <span>{loc.code}</span>
                          </div>
                          <span className={`seal-tip-status ${loc.flagged ? 'seal-tip-status--alert' : 'seal-tip-status--ok'}`}>
                            {loc.flagged ? 'Hold / Alert' : 'Normal'}
                          </span>
                        </div>

                        <div className="seal-tip-grid">
                          <div className="seal-tip-key">Occupancy:</div>
                          <div className="seal-tip-val">
                            {loc.occupancyPct}% <span className="seal-tip-val-sub">({loc.lotCount}/{loc.capacityUnits})</span>
                          </div>
                        </div>

                        {loc.lots.length > 0 && (
                          <div className="seal-tip-lots">
                            <div className="seal-tip-lots-title">
                              Stored Lots ({loc.lots.length})
                            </div>
                            <div className="seal-tip-lots-list">
                              {loc.lots.slice(0, 2).map((l, idx) => (
                                <div key={idx} className="seal-tip-lot-item">
                                  • {l.description}
                                </div>
                              ))}
                              {loc.lots.length > 2 && (
                                <div className="seal-tip-lots-more">
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

            <div className="seal-card seal-heat-sidebar">
              <h3 className="seal-card-title seal-card-title--spaced">{activeZone?.name ?? 'Zone'} Summary</h3>
              {activeZone && (
                <div className="seal-heat-sidebar-body">
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
                    <span className="seal-field-value" style={{ color: activeZone.locations.some(l => l.flagged) ? 'var(--red)' : undefined }}>
                      {activeZone.locations.filter(l => l.flagged).length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="seal-card seal-sensor-card">
          <div className="seal-card-hdr">
            <h2 className="seal-card-title">Zone Sensors &amp; Cameras</h2>
            <Button variant="outline" size="sm" onClick={() => setShowNewSensor(v => !v)}>
              <Icon name="plus" size={13} /> Register Sensor
            </Button>
          </div>
          {showNewSensor && (
            <form className="seal-sensor-form" onSubmit={handleAddSensor}>
              <div className="seal-field-row seal-sensor-field">
                <label className="seal-field-label">Device ID</label>
                <Input value={newSensorId} onChange={e => setNewSensorId(e.target.value)} placeholder="CAM-ZONE-A1" />
              </div>
              <div className="seal-field-row seal-sensor-field">
                <label className="seal-field-label">Type</label>
                <Select value={newSensorType} onValueChange={setNewSensorType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SENSOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="seal-field-row seal-sensor-field--name">
                <label className="seal-field-label">Name</label>
                <Input value={newSensorName} onChange={e => setNewSensorName(e.target.value)} placeholder="e.g. Zone A Overhead Cam" />
              </div>
              <Button type="submit" size="sm" disabled={savingSensor || !newSensorId.trim() || !newSensorName.trim()}>
                {savingSensor ? 'Registering…' : 'Register'}
              </Button>
            </form>
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
                        <div className="seal-sensor-name">{s.name}</div>
                        <div className="seal-sensor-id">{s.deviceId}</div>
                      </td>
                      <td>{s.deviceType.replace(/_/g, ' ')}</td>
                      <td>{s.zoneName ?? '—'}</td>
                      <td>
                        {s.latestReading ? (
                          <span>{s.latestReading.value} <span className="seal-reading-meta">({s.latestReading.type.replace(/_/g, ' ')}, {new Date(s.latestReading.recordedAt).toLocaleString()})</span></span>
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
