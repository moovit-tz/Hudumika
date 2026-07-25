import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import './Seal.css';

interface HeatLocation {
  id: string; code: string; locationType: string; lotCount: number; capacityUnits: number;
  occupancyPct: number; flagged: boolean; lots: { id: string; description: string }[];
}
interface HeatZone { id: string; code: string; name: string; zoneType: string; locations: HeatLocation[]; }
interface HeatGrid { compartment: { id: string; code: string; name: string }; overallOccupancyPct: number; lotCount: number; zones: HeatZone[]; }

type ViewMode = 'heat-grid' | 'sections' | 'fleet-map' | 'isometric-3d';

// Banded occupancy color helper (Ware Sync reference rules)
function bandColor(pct: number): string {
  if (pct >= 86) return '#475569'; // Slate 86-100%
  if (pct >= 61) return '#3b82f6'; // Indigo 61-85%
  return '#00ffb3';                // Cyan/Emerald 0-60%
}
function bandBg(pct: number): string {
  if (pct >= 86) return 'rgba(71, 85, 105, 0.08)';
  if (pct >= 61) return 'rgba(59, 130, 246, 0.08)';
  return 'rgba(0, 255, 179, 0.08)';
}

export function SealZoneHeatGrid() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<HeatGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('heat-grid');
  const [activeZone, setActiveZone] = useState<string>('Zone C');
  const [selectedDrone, setSelectedDrone] = useState<string | null>('Flowdeck DR1');
  const [hoveredLoc, setHoveredLoc] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}/heat-grid`)
      .then(setData)
      .catch(() => {
        // Fallback default structure for demonstration
        setData({
          compartment: { id: id || 'cmp-1', code: 'Z-C', name: 'Zone C Warehouse' },
          overallOccupancyPct: 84,
          lotCount: 4150,
          zones: [
            {
              id: 'z-c', code: 'ZC', name: 'Zone C', zoneType: 'RACK',
              locations: [
                { id: 'c1', code: 'C1', locationType: 'BIN', lotCount: 72, capacityUnits: 100, occupancyPct: 72, flagged: false, lots: [{ id: 'l1', description: 'Electronics Lot A' }] },
                { id: 'c2', code: 'C2', locationType: 'BIN', lotCount: 41, capacityUnits: 100, occupancyPct: 41, flagged: false, lots: [{ id: 'l2', description: 'Spare Parts B' }] },
                { id: 'c3', code: 'C3', locationType: 'BIN', lotCount: 91, capacityUnits: 100, occupancyPct: 91, flagged: true, lots: [{ id: 'l3', description: 'Chemical Drum C' }] },
                { id: 'c4', code: 'C4', locationType: 'BIN', lotCount: 78, capacityUnits: 100, occupancyPct: 78, flagged: false, lots: [{ id: 'l4', description: 'Textile Roll D' }] },
                { id: 'c5', code: 'C5', locationType: 'BIN', lotCount: 53, capacityUnits: 100, occupancyPct: 53, flagged: false, lots: [{ id: 'l5', description: 'Hardware Lot E' }] },
                { id: 'c6', code: 'C6', locationType: 'BIN', lotCount: 48, capacityUnits: 100, occupancyPct: 48, flagged: false, lots: [{ id: 'l6', description: 'Pallet Stock F' }] },
                { id: 'c7', code: 'C7', locationType: 'BIN', lotCount: 84, capacityUnits: 100, occupancyPct: 84, flagged: false, lots: [{ id: 'l7', description: 'Auto Parts G' }] },
                { id: 'c8', code: 'C8', locationType: 'BIN', lotCount: 93, capacityUnits: 100, occupancyPct: 93, flagged: true, lots: [{ id: 'l8', description: 'Battery Cell H' }] },
                { id: 'c9', code: 'C9', locationType: 'BIN', lotCount: 39, capacityUnits: 100, occupancyPct: 39, flagged: false, lots: [{ id: 'l9', description: 'Apparel Box I' }] },
              ]
            }
          ]
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading && !data) return <div className="seal-page"><div className="seal-empty">Loading warehouse occupancy data…</div></div>;

  const currentCompartmentName = data?.compartment?.name || 'Zone C Overview';

  return (
    <TooltipProvider delayDuration={150}>
      <div className="seal-page">
        {/* Header Navigation & Title */}
        <div className="seal-page-hdr">
          <div>
            <button
              type="button"
              className="seal-btn-secondary"
              onClick={() => navigate('/seal/compartments')}
              style={{ marginBottom: 12 }}
            >
              <Icon name="arrowLeft" size={13} />
              <span>Back to Warehouse Map</span>
            </button>
            <h1 className="seal-page-title">{currentCompartmentName}</h1>
            <p className="seal-page-sub">
              Real-time bonded warehouse rack occupancy, turnover rate analysis, and autonomous fleet track monitoring.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button type="button" className="seal-action-btn-primary">
              <Icon name="upload" size={14} />
              <span>Save Layout</span>
            </button>
            <button type="button" className="seal-btn-secondary">
              <Icon name="eye" size={14} />
              <span>Preview</span>
            </button>
            <button type="button" className="seal-btn-secondary">
              <Icon name="plus" size={14} />
              <span>Add New Layout</span>
            </button>
          </div>
        </div>

        {/* View Mode & Filter Control Bar */}
        <div className="seal-mode-bar">
          {/* Zone Filter Tabs */}
          <div className="seal-mode-group">
            {['Zone A', 'Zone C', 'Zone D', 'Zone B'].map(z => (
              <button
                key={z}
                type="button"
                className={`seal-mode-btn ${activeZone === z ? 'active' : ''}`}
                onClick={() => setActiveZone(z)}
              >
                <Icon name="layers" size={13} />
                <span>{z}</span>
              </button>
            ))}
          </div>

          {/* Interactive Mode Selector */}
          <div className="seal-mode-group">
            <button
              type="button"
              className={`seal-mode-btn ${viewMode === 'heat-grid' ? 'active' : ''}`}
              onClick={() => setViewMode('heat-grid')}
            >
              <Icon name="grid" size={14} />
              <span>Zone Heat Grid</span>
            </button>
            <button
              type="button"
              className={`seal-mode-btn ${viewMode === 'sections' ? 'active' : ''}`}
              onClick={() => setViewMode('sections')}
            >
              <Icon name="columns" size={14} />
              <span>Section Overview</span>
            </button>
            <button
              type="button"
              className={`seal-mode-btn ${viewMode === 'fleet-map' ? 'active' : ''}`}
              onClick={() => setViewMode('fleet-map')}
            >
              <Icon name="truck" size={14} />
              <span>AGV & Drone Fleet</span>
            </button>
            <button
              type="button"
              className={`seal-mode-btn ${viewMode === 'isometric-3d' ? 'active' : ''}`}
              onClick={() => setViewMode('isometric-3d')}
            >
              <Icon name="box" size={14} />
              <span>3D Isometric View</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="seal-btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
              <Icon name="calendar" size={13} /> Last 7 Days
            </span>
            <span className="seal-btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}>
              <Icon name="chevronDown" size={13} /> Floor 1
            </span>
          </div>
        </div>

        {/* 4 Top KPI Cards with Vector Icons */}
        <div className="seal-kpi-strip">
          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant="warning" size="md" shape="square">
              <Icon name="pieChart" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value seal-kpi-value--alert">{data?.overallOccupancyPct ?? 84}%</div>
              <div className="seal-kpi-label">Occupancy</div>
              <div style={{ fontSize: 11.5, color: '#eab308', marginTop: 2, fontWeight: 600 }}>Approaching full capacity</div>
            </div>
          </div>

          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant="info" size="md" shape="square">
              <Icon name="container" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value">310 / 372 m²</div>
              <div className="seal-kpi-label">Volume Utilization</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Current Utilization 64.5%</div>
            </div>
          </div>

          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant="brand" size="md" shape="square">
              <Icon name="package" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value">{(data?.lotCount ?? 4150).toLocaleString()} Items</div>
              <div className="seal-kpi-label">Item Count</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Current Inventory Count</div>
            </div>
          </div>

          <div className="seal-kpi-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <FeaturedIcon variant="success" size="md" shape="square">
              <Icon name="clock" size={18} />
            </FeaturedIcon>
            <div>
              <div className="seal-kpi-value">15 days</div>
              <div className="seal-kpi-label">Turnover Rate</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>Avg. Item duration in zone</div>
            </div>
          </div>
        </div>

        {/* VIEW MODE 1: ZONE HEAT GRID (Ware Sync Image 1 & 3) */}
        {viewMode === 'heat-grid' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr', gap: 20 }}>
            {/* Main Rack Grid Box */}
            <div className="seal-card" style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="warehouse" size={18} style={{ color: 'var(--teal)' }} />
                  <h2 className="seal-card-title" style={{ fontSize: 16 }}>{activeZone}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--ink3)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#00ffb3' }} /> 0-60%
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#3b82f6' }} /> 61-85%
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: '#64748b' }} /> 86-100%
                  </span>
                </div>
              </div>

              {/* 3x3 Grid of Zone Racks */}
              <div className="seal-rack-grid">
                {(data?.zones[0]?.locations || []).map(loc => (
                  <Tooltip key={loc.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="seal-rack-box"
                        style={{
                          borderColor: bandColor(loc.occupancyPct),
                          background: bandBg(loc.occupancyPct),
                        }}
                      >
                        {loc.flagged && (
                          <span style={{ position: 'absolute', top: 8, right: 8 }}>
                            <Icon name="alertTriangle" size={14} style={{ color: '#ef4444' }} />
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
                    </TooltipContent>
                  </Tooltip>
                ))}

                {/* Drag New Rack placeholder */}
                <div className="seal-drag-rack">
                  <Icon name="plus" size={20} style={{ marginBottom: 6 }} />
                  <span>+ Drag New Rack</span>
                </div>
              </div>
            </div>

            {/* Right Side Turnover & Intelligence Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="seal-card" style={{ padding: 20 }}>
                <div className="seal-card-hdr" style={{ padding: 0, paddingBottom: 12, border: 'none' }}>
                  <h3 className="seal-card-title">Zone C layout</h3>
                  <Icon name="moreHorizontal" size={16} style={{ color: 'var(--ink3)', cursor: 'pointer' }} />
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} /> High Turnover
                      </span>
                      <span>5,583+</span>
                    </div>
                    <div className="seal-runway">
                      <div className="seal-runway-fill" style={{ width: '75%', background: '#3b82f6' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1' }} /> Medium Turnover
                      </span>
                      <span>2,107</span>
                    </div>
                    <div className="seal-runway">
                      <div className="seal-runway-fill" style={{ width: '45%', background: '#6366f1' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Optimization Insight Card */}
              <div className="seal-insight-card">
                <div className="seal-insight-title">
                  <Icon name="sparkles" size={16} />
                  <span>Optimization Insight</span>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, margin: '0 0 16px', opacity: 0.9 }}>
                  To manage capacity efficiently, redistribute low-turnover SKUs to Zone D, which has 48% available space to balance.
                </p>
                <button
                  type="button"
                  className="seal-btn-secondary"
                  style={{ width: '100%', justifyContent: 'center', fontWeight: 700 }}
                  onClick={() => setActiveZone('Zone D')}
                >
                  <Icon name="arrowRight" size={13} />
                  <span>View Zone D</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 2: SECTION OVERVIEW (Ware Sync Image 2) */}
        {viewMode === 'sections' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: 20 }}>
              {/* Shelves Grid (A-Electronics, B-Appliances, C-Home Decor, D-Sports) */}
              <div className="seal-card" style={{ padding: 20 }}>
                <div className="seal-card-hdr" style={{ padding: 0, paddingBottom: 16, border: 'none' }}>
                  <h2 className="seal-card-title" style={{ fontSize: 16 }}>Section Overview (20)</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="seal-btn-secondary" style={{ fontSize: 11.5 }}>
                      <Icon name="plus" size={12} /> Add Request
                    </button>
                    <button type="button" className="seal-btn-secondary" style={{ fontSize: 11.5 }}>
                      <Icon name="edit" size={12} /> Edit Section
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                  {[
                    { section: 'A-Electronics', count: '5/12', color: '#10b981', items: ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12'], active: [1,4,5,6,11] },
                    { section: 'B-Appliances', count: '7/12', color: '#eab308', items: ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12'], active: [0,2,5,6,7,8,11] },
                    { section: 'C-Home Decor', count: '8/12', color: '#a855f7', items: ['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12'], active: [1,2,4,5,6,8,9,10] },
                    { section: 'D-Sports', count: '7/12', color: '#06b6d4', items: ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12'], active: [0,3,4,5,6,9,11] },
                  ].map(sec => (
                    <div key={sec.section} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 12, background: 'var(--bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>
                        <span>{sec.section}</span>
                        <span style={{ color: 'var(--ink3)' }}>{sec.count}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {sec.items.map((item, idx) => {
                          const isActive = sec.active.includes(idx);
                          return (
                            <div
                              key={item}
                              style={{
                                padding: '10px 4px',
                                textAlign: 'center',
                                borderRadius: 10,
                                fontSize: 11.5,
                                fontWeight: 700,
                                background: isActive ? sec.color : 'var(--white)',
                                color: isActive ? '#fff' : 'var(--ink3)',
                                border: isActive ? 'none' : '1px dashed var(--border)',
                              }}
                            >
                              {item}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: 3D Banner & Section Donut */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* 3D Glass Metallic Banner */}
                <div className="seal-3d-banner">
                  <div style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px' }}>$6,357</div>
                  <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Orders This Month</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <Badge variant="success">
                      <Icon name="check" size={11} style={{ marginRight: 3 }} /> 58% Prepaid
                    </Badge>
                    <Badge variant="info">
                      <Icon name="creditCard" size={11} style={{ marginRight: 3 }} /> 42% CoD
                    </Badge>
                  </div>
                  <div className="seal-3d-graphic" />
                </div>

                {/* B-Section Usage Donut Card */}
                <div className="seal-card" style={{ padding: 20 }}>
                  <h3 className="seal-card-title" style={{ marginBottom: 14 }}>B-Section Usage</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ position: 'relative', width: 90, height: 90 }}>
                      <svg width="90" height="90" viewBox="0 0 36 36">
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border)" strokeWidth="3.8" />
                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f59e0b" strokeWidth="3.8" strokeDasharray="56, 100" />
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>56%</span>
                        <span style={{ fontSize: 9, color: 'var(--ink3)' }}>Location Used</span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>240</div>
                        <div style={{ color: 'var(--ink3)' }}>Total Shelves</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>136</div>
                        <div style={{ color: 'var(--ink3)' }}>Empty Shelves</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>84</div>
                        <div style={{ color: 'var(--ink3)' }}>Full Shelves</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>20</div>
                        <div style={{ color: 'var(--ink3)' }}>Newly Added</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row KPI Grid (Order Statistics, Inventory Overview) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: 20 }}>
              <div className="seal-card" style={{ padding: 20 }}>
                <h3 className="seal-card-title" style={{ marginBottom: 16 }}>Order Statistics</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 110, padding: '0 10px' }}>
                  {[
                    { day: '25', h1: 60, h2: 30 },
                    { day: '26', h1: 90, h2: 45 },
                    { day: '27', h1: 70, h2: 80 },
                    { day: '28', h1: 50, h2: 35 },
                    { day: '29', h1: 85, h2: 60 },
                    { day: '30', h1: 75, h2: 40 },
                  ].map(b => (
                    <div key={b.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', height: 90 }}>
                        <div style={{ flex: 1, height: `${b.h1}%`, background: '#0e1f3d', borderRadius: 4 }} />
                        <div style={{ flex: 1, height: `${b.h2}%`, background: '#f59e0b', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--ink3)' }}>{b.day}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="seal-card" style={{ padding: 20, textAlign: 'center' }}>
                <h3 className="seal-card-title" style={{ marginBottom: 12 }}>Order Summary</h3>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 10 }}>$5,961</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 12 }}>Orders Completed 42%</div>
                <div className="seal-runway" style={{ height: 10 }}>
                  <div className="seal-runway-fill" style={{ width: '42%', background: '#eab308' }} />
                </div>
              </div>

              <div className="seal-card" style={{ padding: 20 }}>
                <h3 className="seal-card-title" style={{ marginBottom: 14 }}>Inventory Overview</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>4,236</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Orders Received</div>
                    <Badge variant="success" style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>+26%</span>
                      <Icon name="trendingUp" size={12} />
                    </Badge>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg)' }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>2,778</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Orders Shipped</div>
                    <Badge variant="error" style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>-20%</span>
                      <Icon name="trendingDown" size={12} />
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 3: FLOWDECK AGV & DRONE FLEET MONITOR (Ware Sync Image 4) */}
        {viewMode === 'fleet-map' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Security Alert Banner */}
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#991b1b', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                <Icon name="alertTriangle" size={18} style={{ color: '#ef4444' }} />
                <span>Security Alert: Flowdeck RAIL1 requires maintenance. Please call a technician to perform repairs.</span>
              </div>
              <button type="button" className="seal-btn-secondary" style={{ fontSize: 11.5 }}>
                <Icon name="close" size={12} /> Dismiss
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: 20 }}>
              {/* Fleet Map Canvas */}
              <div className="seal-fleet-canvas">
                {/* Simulated AGV/Drone nodes with SVG Vector Icons */}
                {[
                  { id: 'DR1', name: 'Flowdeck DR1', battery: '12%', top: '25%', left: '42%', active: true, icon: 'plane' },
                  { id: 'EVA002', name: 'Flowdeck EVA002', battery: '75%', top: '65%', left: '20%', active: false, icon: 'truck' },
                  { id: 'ARMZu', name: 'Flowdeck ARMZu', battery: '87%', top: '70%', left: '60%', active: false, icon: 'tool' },
                ].map(node => (
                  <div
                    key={node.id}
                    className="seal-drone-node"
                    style={{ top: node.top, left: node.left, borderColor: node.active ? '#ef4444' : 'var(--teal)' }}
                    onClick={() => setSelectedDrone(node.name)}
                  >
                    <Icon name={node.icon} size={16} style={{ color: node.active ? '#ef4444' : 'var(--teal)' }} />
                  </div>
                ))}

                {/* Drone Inspector Overlay Popover */}
                {selectedDrone && (
                  <div style={{ position: 'absolute', top: '20%', left: '46%', width: 280, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5 }}>{selectedDrone}</span>
                      <Badge variant="error">12% Battery</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>DR01-EV23 · Last update: 13:00</div>

                    <div className="seal-insight-card" style={{ marginTop: 12, padding: 10, fontSize: 11.5 }}>
                      <Icon name="sparkles" size={13} style={{ marginRight: 4 }} />
                      AI Insight: Flowdeck DR1 battery optimization can boost runtime by 22%.
                    </div>

                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                      <button type="button" className="seal-btn-secondary" style={{ flex: 1, padding: 6, fontSize: 11 }}>
                        <Icon name="zap" size={11} /> Charge
                      </button>
                      <button type="button" className="seal-btn-secondary" style={{ flex: 1, padding: 6, fontSize: 11 }}>
                        <Icon name="tool" size={11} /> Manual
                      </button>
                      <button type="button" className="seal-btn-secondary" style={{ flex: 1, padding: 6, fontSize: 11 }}>
                        <Icon name="anchor" size={11} /> Dock
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Panel Device Health & Activity Log */}
              <div className="seal-card" style={{ padding: 18 }}>
                <h3 className="seal-card-title" style={{ marginBottom: 14 }}>Recent Activity</h3>
                <div className="seal-timeline">
                  <div className="seal-timeline-row">
                    <div className="seal-timeline-dot" />
                    <div className="seal-timeline-body">
                      <div className="seal-timeline-time">09:00 AM</div>
                      <div className="seal-timeline-text">Shipment SHP-9312 picked up (18 boxes, 310kg) → Routed to Zone 05</div>
                    </div>
                  </div>
                  <div className="seal-timeline-row">
                    <div className="seal-timeline-dot" style={{ background: '#ef4444' }} />
                    <div className="seal-timeline-body">
                      <div className="seal-timeline-time">09:05 AM</div>
                      <div className="seal-timeline-text">Flowdeck DR1 battery dropped to 15% → Auto-scheduled charging</div>
                    </div>
                  </div>
                  <div className="seal-timeline-row">
                    <div className="seal-timeline-dot" style={{ background: '#059669' }} />
                    <div className="seal-timeline-body">
                      <div className="seal-timeline-time">09:10 AM</div>
                      <div className="seal-timeline-text">Dock 02 congestion detected → Rerouted EVA002 to Corridor C</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 4: 3D ISOMETRIC PERSPECTIVE VIEW (Ware Sync Image 5) */}
        {viewMode === 'isometric-3d' && (
          <div className="seal-card seal-iso-container" style={{ padding: 40, overflow: 'hidden' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <Badge variant="brand">Interactive 3D Warehouse Perspective</Badge>
              <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>Hover over any rack zone block to view 3D volumetric metrics.</p>
            </div>

            <div className="seal-iso-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {['Zone A', 'Zone C', 'Zone D'].map((z, zIdx) => (
                <div key={z} style={{ border: '2px solid var(--border)', borderRadius: 16, padding: 16, background: 'var(--white)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="box" size={14} style={{ color: 'var(--teal)' }} />
                    <span>{z} Layout</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {['1','2','3','4','5','6','7','8','9'].map(num => {
                      const code = `${z.replace('Zone ', '')}${num}`;
                      const isHovered = hoveredLoc === code;
                      return (
                        <div
                          key={code}
                          onMouseEnter={() => setHoveredLoc(code)}
                          onMouseLeave={() => setHoveredLoc(null)}
                          style={{
                            height: 48,
                            borderRadius: 10,
                            border: `2px solid ${isHovered ? '#ea580c' : bandColor(zIdx === 1 ? 72 : 45)}`,
                            background: isHovered ? '#fff7ed' : bandBg(zIdx === 1 ? 72 : 45),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 12,
                            boxShadow: isHovered ? 'var(--shadow-lg)' : 'none',
                            transform: isHovered ? 'translateZ(10px)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {code}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Hover Inspector Tooltip */}
            {hoveredLoc && (
              <div style={{ position: 'fixed', bottom: 40, right: 40, background: '#0f172a', color: '#fff', padding: '12px 18px', borderRadius: 12, boxShadow: 'var(--shadow-lg)', zIndex: 100, fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="info" size={18} style={{ color: '#38bdf8' }} />
                <div>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>Rack Location {hoveredLoc}</div>
                  <div>Volume: 120m³ · Occupancy: 78%</div>
                  <div style={{ color: '#4ade80', marginTop: 2 }}>Status: Normal Operation</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
