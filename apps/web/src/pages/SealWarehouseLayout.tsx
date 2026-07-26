import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { SealWarehouse3D } from '../components/SealWarehouse3D.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import './Seal.css';

interface TierLot { id: string; description: string; qtyOnHand: number; uom: string; }
interface Tier { tier: number; lotCount: number; capacityUnits: number; occupancyPct: number; lots: TierLot[]; }
interface LayoutLocation {
  id: string; code: string; locationType: string; gridRow: number | null; gridCol: number | null;
  maxStackTiers: number; capacityUnits: number; lotCount: number; totalSlots: number; occupancyPct: number;
  flagged: boolean; tiers: Tier[];
  lengthM: number | null; widthM: number | null; heightM: number | null;
  volumeCbm: number | null; lotVolumeCbm: number; volumeOccupancyPct: number | null;
}
interface Floor {
  floorLevel: number; label: string; totalSlots: number; occupiedSlots: number; occupancyPct: number;
  volumeCapacityCbm: number; volumeUsedCbm: number;
  placedCount: number; unplacedCount: number; locations: LayoutLocation[];
}
interface Layout {
  compartment: { id: string; code: string; name: string };
  overallOccupancyPct: number; totalSlots: number; occupiedSlots: number; remainingSlots: number;
  volumeCapacityCbm: number; volumeUsedCbm: number;
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

function formatVolumeDisplay(cbm: number): string {
  if (cbm >= 1_000_000) return `${(cbm / 1_000_000).toFixed(1)}M m³`;
  if (cbm >= 10_000) return `${(cbm / 1_000).toFixed(1)}k m³`;
  return `${cbm.toLocaleString(undefined, { maximumFractionDigits: 1 })} m³`;
}

export function SealWarehouseLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFloor, setActiveFloor] = useState(0);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [selectedLoc, setSelectedLoc] = useState<LayoutLocation | null>(null);
  const [populating, setPopulating] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}/warehouse-layout`).then(d => {
      setData(d);
      if (d.floors.length && !d.floors.some((f: Floor) => f.floorLevel === activeFloor)) setActiveFloor(d.floors[0].floorLevel);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  async function handlePopulateData() {
    if (!id) return;
    setPopulating(true);
    try {
      await apiFetch(`/v1/seal/compartments/${id}/populate-layout`, { method: 'POST' });
      showAlert('Warehouse layout auto-populated with 12 structured grid racks & dimensional metrics!');
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to populate warehouse layout');
    } finally {
      setPopulating(false);
    }
  }

  if (loading || !data) return <div className="seal-page"><div className="seal-empty">Loading warehouse layout…</div></div>;

  const floor = data.floors.find(f => f.floorLevel === activeFloor) ?? data.floors[0];
  const placed = floor?.locations.filter(l => l.gridRow != null && l.gridCol != null) ?? [];
  const maxRow = Math.max(1, ...placed.map(l => l.gridRow ?? 0));
  const maxCol = Math.max(1, ...placed.map(l => l.gridCol ?? 0));

  return (
    <TooltipProvider delayDuration={150}>
      <div className="seal-page" style={{ maxWidth: 1240, margin: '0 auto', paddingBottom: 60 }}>
        {/* Page Header */}
        <div className="seal-page-hdr">
          <div>
            <button type="button" className="seal-btn-secondary" onClick={() => navigate('/seal/compartments')} style={{ marginBottom: 12 }}>
              <Icon name="arrowLeft" size={13} /><span>Back to Compartments</span>
            </button>
            <h1 className="seal-page-title">{data.compartment.name} — Warehouse Layout</h1>
            <p className="seal-page-sub">Interactive 2D Plan and 3D Stack with real dimensional and lot occupancy data.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className={viewMode === '2d' ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setViewMode('2d')}>
              <Icon name="grid" size={13} /><span>2D Plan</span>
            </button>
            <button type="button" className={viewMode === '3d' ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setViewMode('3d')}>
              <Icon name="box" size={13} /><span>3D View</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={handlePopulateData} disabled={populating}>
              <Icon name="refreshCw" size={13} /><span>{populating ? 'Populating…' : 'Populate Real Layout'}</span>
            </button>
          </div>
        </div>

        {/* Clean Redesigned KPI Cards Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}>
          <div className="seal-card" style={{ padding: '18px 20px', borderRadius: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: bandColor(data.overallOccupancyPct), lineHeight: 1.1 }}>
              {data.overallOccupancyPct}%
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginTop: 6 }}>
              Overall Occupancy
            </div>
          </div>

          <div className="seal-card" style={{ padding: '18px 20px', borderRadius: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {data.occupiedSlots} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink3)' }}>/ {data.totalSlots}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginTop: 6 }}>
              Slots Used
            </div>
          </div>

          <div className="seal-card" style={{ padding: '18px 20px', borderRadius: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {data.remainingSlots}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginTop: 6 }}>
              Remaining Space
            </div>
          </div>

          <div className="seal-card" style={{ padding: '18px 20px', borderRadius: 14 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.1 }}>
              {data.lotCount.toLocaleString()}
            </div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginTop: 6 }}>
              Lots On Hand
            </div>
          </div>

          {data.volumeCapacityCbm > 0 && (
            <div className="seal-card" style={{ padding: '18px 20px', borderRadius: 14 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: bandColor(Math.round((data.volumeUsedCbm / data.volumeCapacityCbm) * 100)), lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatVolumeDisplay(data.volumeUsedCbm)} / {formatVolumeDisplay(data.volumeCapacityCbm)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)', marginTop: 6 }}>
                Volume Used
              </div>
            </div>
          )}
        </div>

        {/* 3D View Mode */}
        {viewMode === '3d' && (
          <div className="seal-card" style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Icon name="box" size={18} style={{ color: 'var(--seal)' }} />
              <h2 className="seal-card-title" style={{ fontSize: 16 }}>3D Interactive Warehouse Stack & Routes</h2>
            </div>
            <SealWarehouse3D floors={data.floors} />
          </div>
        )}

        {/* 2D Plan View Mode */}
        {viewMode === '2d' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {data.floors.map(f => (
              <button
                key={f.floorLevel}
                type="button"
                className={activeFloor === f.floorLevel ? 'seal-btn-primary' : 'seal-btn-secondary'}
                onClick={() => setActiveFloor(f.floorLevel)}
              >
                <Icon name="layers" size={14} />
                <span>{f.label}</span>
                <Badge variant={f.occupancyPct >= 86 ? 'error' : f.occupancyPct >= 61 ? 'warning' : 'success'} style={{ marginLeft: 6 }}>{f.occupancyPct}%</Badge>
              </button>
            ))}
          </div>
        )}

        {viewMode === '2d' && floor && (
          <div style={{ display: 'grid', gridTemplateColumns: selectedLoc && !isMobile ? '1fr 320px' : '1fr', gap: 20 }}>
            <div className="seal-card" style={{ padding: 24, borderRadius: 14 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="warehouse" size={18} style={{ color: 'var(--seal)' }} />
                  <h2 className="seal-card-title" style={{ fontSize: 16, margin: 0, fontWeight: 800, color: 'var(--ink)' }}>{floor.label} Plan</h2>
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--green)' }} /> 0-60%</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--gold)' }} /> 61-85%</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--red)' }} /> 86-100%</span>
                </div>
              </div>

              {placed.length === 0 ? (
                <div className="seal-empty" style={{ padding: 40, textAlign: 'center' }}>
                  No locations placed on the grid yet. Click <strong>"Populate Real Layout"</strong> above to auto-generate 12 structured rack slots.
                </div>
              ) : (
                /* Responsive Grid Wrapper preventing overflow clipping */
                <div style={{ overflowX: 'auto', paddingBottom: 10 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${Math.max(maxCol, 4)}, minmax(130px, 1fr))`,
                      gap: 12,
                      width: '100%',
                    }}
                  >
                    {placed.map(loc => (
                      <Tooltip key={loc.id}>
                        <TooltipTrigger asChild>
                          <div
                            style={{
                              border: `2px solid ${bandColor(loc.occupancyPct)}`,
                              background: bandBg(loc.occupancyPct),
                              borderRadius: 12,
                              padding: '14px 12px',
                              textAlign: 'center',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                            }}
                            onClick={() => setSelectedLoc(loc)}
                            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                          >
                            {loc.flagged && <Icon name="alertTriangle" size={13} style={{ position: 'absolute', top: 6, right: 6, color: 'var(--red)' }} />}
                            <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--ink)' }}>{loc.code}</div>
                            <div style={{ fontSize: 12, color: bandColor(loc.occupancyPct), fontWeight: 800, marginTop: 4 }}>
                              {loc.occupancyPct}%
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                              {loc.lotCount} {loc.lotCount === 1 ? 'lot' : 'lots'} ({loc.maxStackTiers}T)
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div style={{ fontWeight: 700 }}>{loc.code} · {loc.locationType}</div>
                          <div>{loc.lotCount} / {loc.totalSlots} slots ({loc.occupancyPct}%)</div>
                          {loc.lengthM != null && <div>{loc.lengthM}m × {loc.widthM}m × {loc.heightM}m ({loc.volumeCbm?.toFixed(2)} m³)</div>}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Location Inspector Drawer */}
            {selectedLoc && (
              <div className="seal-card" style={{ padding: 20, borderRadius: 14, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--bg)' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--ink)' }}>{selectedLoc.code} Rack Details</h3>
                  <button type="button" onClick={() => setSelectedLoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Icon name="close" size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                  <div>
                    <span style={{ color: 'var(--ink3)' }}>Occupancy Rate:</span>{' '}
                    <strong style={{ color: bandColor(selectedLoc.occupancyPct) }}>{selectedLoc.occupancyPct}%</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink3)' }}>Grid Position:</span>{' '}
                    <strong>Row {selectedLoc.gridRow}, Col {selectedLoc.gridCol}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--ink3)' }}>Stacking Tiers:</span>{' '}
                    <strong>{selectedLoc.maxStackTiers} Tiers</strong>
                  </div>
                  {selectedLoc.lengthM && (
                    <div>
                      <span style={{ color: 'var(--ink3)' }}>Dimensions:</span>{' '}
                      <strong>{selectedLoc.lengthM}m × {selectedLoc.widthM}m × {selectedLoc.heightM}m</strong>
                    </div>
                  )}
                  {selectedLoc.volumeCbm && (
                    <div>
                      <span style={{ color: 'var(--ink3)' }}>Volume Capacity:</span>{' '}
                      <strong>{formatVolumeDisplay(selectedLoc.volumeCbm)}</strong>
                    </div>
                  )}

                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--bg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontWeight: 800, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink3)' }}>
                        Stored Lots ({selectedLoc.tiers.reduce((s, t) => s + t.lotCount, 0)})
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--seal)' }}>
                        {selectedLoc.maxStackTiers} Stack Tiers
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto', paddingRight: 4 }}>
                      {selectedLoc.tiers.map(t => (
                        <div key={t.tier} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Icon name="layers" size={12} style={{ color: 'var(--seal)' }} /> Tier {t.tier}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: t.lots.length > 0 ? 'var(--green-l)' : 'var(--bg)', color: t.lots.length > 0 ? 'var(--green)' : 'var(--ink3)' }}>
                              {t.lots.length} {t.lots.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>

                          {t.lots.length === 0 ? (
                            <div style={{ fontSize: 11, color: 'var(--ink3)', fontStyle: 'italic', padding: '4px 0' }}>Empty tier slot</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {t.lots.map(lot => (
                                <div key={lot.id} style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--blue-l)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                                    <Icon name="package" size={12} />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>
                                      {lot.description}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>
                                        Qty: {lot.qtyOnHand} {lot.uom}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
