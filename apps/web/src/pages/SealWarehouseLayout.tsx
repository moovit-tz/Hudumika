import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SealWarehouse3D } from '../components/SealWarehouse3D.js';
import './Seal.css';

interface TierLot { id: string; description: string; qtyOnHand: number; uom: string; }
interface Tier { tier: number; lotCount: number; capacityUnits: number; occupancyPct: number; lots: TierLot[]; }
interface LayoutLocation {
  id: string; code: string; locationType: string; gridRow: number | null; gridCol: number | null;
  maxStackTiers: number; capacityUnits: number; lotCount: number; totalSlots: number; occupancyPct: number;
  flagged: boolean; tiers: Tier[];
}
interface Floor {
  floorLevel: number; label: string; totalSlots: number; occupiedSlots: number; occupancyPct: number;
  placedCount: number; unplacedCount: number; locations: LayoutLocation[];
}
interface Layout {
  compartment: { id: string; code: string; name: string };
  overallOccupancyPct: number; totalSlots: number; occupiedSlots: number; remainingSlots: number;
  lotCount: number; floors: Floor[];
}

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

export function SealWarehouseLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFloor, setActiveFloor] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}/warehouse-layout`).then(d => {
      setData(d);
      if (d.floors.length && !d.floors.some((f: Floor) => f.floorLevel === activeFloor)) setActiveFloor(d.floors[0].floorLevel);
    }).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlace(locId: string, patch: { gridRow?: number; gridCol?: number; floorLevel?: number; maxStackTiers?: number }) {
    setSaving(locId);
    try {
      await apiFetch(`/v1/seal/locations/${locId}`, { method: 'PATCH', body: JSON.stringify(patch) });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this location.');
    } finally {
      setSaving(null);
    }
  }

  if (loading || !data) return <div className="seal-page"><div className="seal-empty">Loading warehouse layout…</div></div>;

  const floor = data.floors.find(f => f.floorLevel === activeFloor) ?? data.floors[0];
  const placed = floor?.locations.filter(l => l.gridRow != null && l.gridCol != null) ?? [];
  const unplaced = floor?.locations.filter(l => l.gridRow == null || l.gridCol == null) ?? [];
  const maxRow = Math.max(1, ...placed.map(l => l.gridRow ?? 0));
  const maxCol = Math.max(1, ...placed.map(l => l.gridCol ?? 0));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="seal-page">
        <div className="seal-page-hdr">
          <div>
            <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/compartments')} style={{ marginBottom: 12 }}>
              <Icon name="arrowLeft" size={13} /><span>Back to Compartments</span>
            </button>
            <h1 className="seal-page-title">{data.compartment.name} — Warehouse Layout</h1>
            <p className="seal-page-sub">Real floor plan by level and vertical stacking tier — every number here comes from actual lot placements, not a demo.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={viewMode === '2d' ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setViewMode('2d')}>
              <Icon name="grid" size={13} /><span>2D Plan</span>
            </button>
            <button type="button" className={viewMode === '3d' ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setViewMode('3d')}>
              <Icon name="box" size={13} /><span>3D View</span>
            </button>
            {viewMode === '2d' && (
              <button type="button" className={editMode ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setEditMode(v => !v)}>
                <Icon name="edit" size={13} /><span>{editMode ? 'Done Editing' : 'Edit Layout'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="seal-kpi-strip">
          <div className="seal-kpi-card">
            <div className="seal-kpi-value" style={{ color: bandColor(data.overallOccupancyPct) }}>{data.overallOccupancyPct}%</div>
            <div className="seal-kpi-label">Overall Occupancy</div>
          </div>
          <div className="seal-kpi-card">
            <div className="seal-kpi-value">{data.occupiedSlots} / {data.totalSlots}</div>
            <div className="seal-kpi-label">Slots Used (all floors)</div>
          </div>
          <div className="seal-kpi-card">
            <div className="seal-kpi-value">{data.remainingSlots}</div>
            <div className="seal-kpi-label">Remaining Space</div>
          </div>
          <div className="seal-kpi-card">
            <div className="seal-kpi-value">{data.lotCount.toLocaleString()}</div>
            <div className="seal-kpi-label">Lots On Hand</div>
          </div>
        </div>

        {viewMode === '3d' && (
          <div className="seal-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Icon name="box" size={18} style={{ color: 'var(--seal)' }} />
              <h2 className="seal-card-title" style={{ fontSize: 16 }}>3D Warehouse — all floors, actual rack placement and aisle routes</h2>
            </div>
            <SealWarehouse3D floors={data.floors} />
          </div>
        )}

        {viewMode === '2d' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {data.floors.map(f => (
            <button
              key={f.floorLevel}
              type="button"
              className={activeFloor === f.floorLevel ? 'seal-btn-primary' : 'seal-btn-secondary'}
              onClick={() => setActiveFloor(f.floorLevel)}
            >
              <Icon name="layers" size={13} />
              <span>{f.label}</span>
              <Badge variant={f.occupancyPct >= 86 ? 'error' : f.occupancyPct >= 61 ? 'warning' : 'success'} style={{ marginLeft: 4 }}>{f.occupancyPct}%</Badge>
            </button>
          ))}
        </div>
        )}

        {viewMode === '2d' && floor && (
          <>
            <div className="seal-card" style={{ padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="warehouse" size={18} style={{ color: 'var(--seal)' }} />
                  <h2 className="seal-card-title" style={{ fontSize: 16 }}>{floor.label} Floor Plan</h2>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--green)' }} /> 0-60%</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)' }} /> 61-85%</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--red)' }} /> 86-100%</span>
                </div>
              </div>

              {placed.length === 0 ? (
                <div className="seal-empty">No locations on this floor have been placed on the grid yet. {editMode ? 'Use the row/col fields below to place one.' : 'Switch to Edit Layout to place locations.'}</div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${maxCol}, minmax(90px, 1fr))`,
                    gridTemplateRows: `repeat(${maxRow}, auto)`,
                    gap: 10,
                  }}
                >
                  {placed.map(loc => (
                    <Tooltip key={loc.id}>
                      <TooltipTrigger asChild>
                        <div
                          style={{
                            gridRow: loc.gridRow!, gridColumn: loc.gridCol!,
                            border: `2px solid ${bandColor(loc.occupancyPct)}`, background: bandBg(loc.occupancyPct),
                            borderRadius: 10, padding: '10px 8px', textAlign: 'center', position: 'relative', cursor: 'default',
                          }}
                        >
                          {loc.flagged && <Icon name="alertTriangle" size={12} style={{ position: 'absolute', top: 6, right: 6, color: 'var(--red)' }} />}
                          <div style={{ fontWeight: 800, fontSize: 12.5 }}>{loc.code}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: bandColor(loc.occupancyPct) }}>{loc.occupancyPct}%</div>
                          {loc.maxStackTiers > 1 && (
                            <div style={{ display: 'flex', gap: 2, marginTop: 6, justifyContent: 'center' }}>
                              {loc.tiers.map(t => (
                                <span key={t.tier} title={`Tier ${t.tier}: ${t.occupancyPct}%`} style={{
                                  width: 8, height: 14, borderRadius: 2,
                                  background: bandColor(t.occupancyPct), opacity: t.lotCount > 0 ? 1 : 0.25,
                                }} />
                              ))}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{loc.code} · {loc.locationType}</div>
                        <div>{loc.lotCount} / {loc.totalSlots} slots ({loc.occupancyPct}%)</div>
                        {loc.maxStackTiers > 1 && (
                          <div style={{ marginTop: 6 }}>
                            {loc.tiers.map(t => (
                              <div key={t.tier} style={{ fontSize: 11 }}>
                                Tier {t.tier}: {t.lotCount}/{t.capacityUnits} — {t.lots.map(l => l.description).join(', ') || 'empty'}
                              </div>
                            ))}
                          </div>
                        )}
                        {loc.maxStackTiers === 1 && loc.tiers[0]?.lots.length > 0 && (
                          <div style={{ fontSize: 11, marginTop: 4 }}>{loc.tiers[0].lots.map(l => l.description).join(', ')}</div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>

            {editMode && (
              <div className="seal-card" style={{ marginBottom: 20 }}>
                <div className="seal-card-hdr"><h2 className="seal-card-title">Place / Edit Locations on {floor.label}</h2></div>
                <div style={{ padding: '4px 0' }}>
                  <table className="seal-table">
                    <thead><tr><th>Code</th><th>Row</th><th>Col</th><th>Stack Tiers</th><th>Capacity/Tier</th><th></th></tr></thead>
                    <tbody>
                      {floor.locations.map(loc => (
                        <LayoutRow key={loc.id} loc={loc} saving={saving === loc.id} onSave={patch => handlePlace(loc.id, patch)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unplaced.length > 0 && !editMode && (
              <div className="seal-empty">{unplaced.length} location(s) on this floor aren't placed on the grid yet — switch to Edit Layout to place them.</div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

function LayoutRow({ loc, saving, onSave }: { loc: LayoutLocation; saving: boolean; onSave: (patch: any) => void }) {
  const [row, setRow] = useState(String(loc.gridRow ?? ''));
  const [col, setCol] = useState(String(loc.gridCol ?? ''));
  const [tiers, setTiers] = useState(String(loc.maxStackTiers));
  const [capacity, setCapacity] = useState(String(loc.capacityUnits));

  return (
    <tr>
      <td style={{ fontWeight: 700 }}>{loc.code}</td>
      <td><input type="number" min="1" className="input-field" style={{ width: 70 }} value={row} onChange={e => setRow(e.target.value)} /></td>
      <td><input type="number" min="1" className="input-field" style={{ width: 70 }} value={col} onChange={e => setCol(e.target.value)} /></td>
      <td><input type="number" min="1" className="input-field" style={{ width: 70 }} value={tiers} onChange={e => setTiers(e.target.value)} /></td>
      <td><input type="number" min="1" className="input-field" style={{ width: 90 }} value={capacity} onChange={e => setCapacity(e.target.value)} /></td>
      <td>
        <button
          type="button" className="seal-btn-secondary" disabled={saving}
          onClick={() => onSave({
            gridRow: row ? Number(row) : null, gridCol: col ? Number(col) : null,
            maxStackTiers: Number(tiers) || 1, capacityUnits: Number(capacity) || 1,
          })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
