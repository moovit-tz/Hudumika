import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
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
interface Zone { id: string; code: string; name: string; zone_type: string; }

const ZONE_TYPES = ['receiving', 'bulk', 'pick', 'vas', 'quarantine', 'outbound', 'yard', 'sort_lane'];
const LOCATION_TYPES = ['rack', 'floor', 'yard_slot', 'tank', 'dock', 'staging'];

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
  const [zones, setZones] = useState<Zone[]>([]);

  // Add Location / Floor form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZoneCode, setNewZoneCode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('bulk');
  const [creatingZone, setCreatingZone] = useState(false);
  const [newLocZoneId, setNewLocZoneId] = useState('');
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocType, setNewLocType] = useState('rack');
  const [newLocFloor, setNewLocFloor] = useState(0);
  const [newLocRow, setNewLocRow] = useState('');
  const [newLocCol, setNewLocCol] = useState('');
  const [newLocTiers, setNewLocTiers] = useState('1');
  const [newLocCapacity, setNewLocCapacity] = useState('10');
  const [newLocLength, setNewLocLength] = useState('');
  const [newLocWidth, setNewLocWidth] = useState('');
  const [newLocHeight, setNewLocHeight] = useState('');
  const [addingLoc, setAddingLoc] = useState(false);

  // Rack Details drawer — edit mode
  const [editingLoc, setEditingLoc] = useState(false);
  const [editRow, setEditRow] = useState('');
  const [editCol, setEditCol] = useState('');
  const [editFloor, setEditFloor] = useState(0);
  const [editTiers, setEditTiers] = useState('1');
  const [editCapacity, setEditCapacity] = useState('1');
  const [editLength, setEditLength] = useState('');
  const [editWidth, setEditWidth] = useState('');
  const [editHeight, setEditHeight] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingLoc, setDeletingLoc] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}/warehouse-layout`).then(d => {
      setData(d);
      if (d.floors.length && !d.floors.some((f: Floor) => f.floorLevel === activeFloor)) setActiveFloor(d.floors[0].floorLevel);
      setNewLocFloor(d.floors.length ? d.floors[d.floors.length - 1].floorLevel : 0);
    }).finally(() => setLoading(false));
  }

  function loadZones() {
    if (!id) return;
    apiFetch(`/v1/seal/zones?compartment_id=${id}`).then(rows => {
      setZones(rows ?? []);
      setNewLocZoneId(prev => prev || rows?.[0]?.id || '');
    }).catch(() => setZones([]));
  }

  useEffect(() => { load(); loadZones(); }, [id]);

  async function handlePopulateData() {
    if (!id) return;
    setPopulating(true);
    try {
      await apiFetch(`/v1/seal/compartments/${id}/populate-layout`, { method: 'POST' });
      showAlert('Warehouse layout auto-populated with 12 structured grid racks & dimensional metrics!', { variant: 'success' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to populate warehouse layout');
    } finally {
      setPopulating(false);
    }
  }

  async function handleCreateZone(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newZoneCode.trim() || !newZoneName.trim()) return;
    setCreatingZone(true);
    try {
      const zone = await apiFetch('/v1/seal/zones', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: id, code: newZoneCode.trim(), name: newZoneName.trim(), zoneType: newZoneType }),
      });
      setNewZoneCode(''); setNewZoneName('');
      setZones(prev => [...prev, zone]);
      setNewLocZoneId(zone.id);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create zone');
    } finally {
      setCreatingZone(false);
    }
  }

  async function handleCreateLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !newLocZoneId || !newLocCode.trim()) return;
    setAddingLoc(true);
    try {
      await apiFetch('/v1/seal/locations', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId: id, zoneId: newLocZoneId, code: newLocCode.trim(), locationType: newLocType,
          floorLevel: newLocFloor,
          gridRow: newLocRow ? Number(newLocRow) : null, gridCol: newLocCol ? Number(newLocCol) : null,
          maxStackTiers: Number(newLocTiers) || 1, capacityUnits: Number(newLocCapacity) || 1,
          lengthM: newLocLength ? Number(newLocLength) : null,
          widthM: newLocWidth ? Number(newLocWidth) : null,
          heightM: newLocHeight ? Number(newLocHeight) : null,
        }),
      });
      showAlert(`${newLocCode.trim()} added to the layout.`, { variant: 'success' });
      setNewLocCode(''); setNewLocRow(''); setNewLocCol(''); setNewLocLength(''); setNewLocWidth(''); setNewLocHeight('');
      setActiveFloor(newLocFloor);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add this location.');
    } finally {
      setAddingLoc(false);
    }
  }

  function openLocationDetails(loc: LayoutLocation) {
    setSelectedLoc(loc);
    setEditingLoc(false);
  }

  function startEditLoc() {
    if (!selectedLoc) return;
    setEditRow(selectedLoc.gridRow != null ? String(selectedLoc.gridRow) : '');
    setEditCol(selectedLoc.gridCol != null ? String(selectedLoc.gridCol) : '');
    setEditFloor(activeFloor);
    setEditTiers(String(selectedLoc.maxStackTiers));
    setEditCapacity(String(selectedLoc.capacityUnits));
    setEditLength(selectedLoc.lengthM != null ? String(selectedLoc.lengthM) : '');
    setEditWidth(selectedLoc.widthM != null ? String(selectedLoc.widthM) : '');
    setEditHeight(selectedLoc.heightM != null ? String(selectedLoc.heightM) : '');
    setEditingLoc(true);
  }

  async function handleSaveEditLoc() {
    if (!selectedLoc) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/v1/seal/locations/${selectedLoc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          floorLevel: editFloor,
          gridRow: editRow ? Number(editRow) : null, gridCol: editCol ? Number(editCol) : null,
          maxStackTiers: Number(editTiers) || 1, capacityUnits: Number(editCapacity) || 1,
          lengthM: editLength ? Number(editLength) : null,
          widthM: editWidth ? Number(editWidth) : null,
          heightM: editHeight ? Number(editHeight) : null,
        }),
      });
      showAlert('Rack updated.', { variant: 'success' });
      setEditingLoc(false);
      setSelectedLoc(null);
      setActiveFloor(editFloor);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to update this rack.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteLoc() {
    if (!selectedLoc) return;
    const ok = await showConfirm(`Delete rack ${selectedLoc.code}? This cannot be undone.`, { title: 'Delete rack', confirmLabel: 'Delete' });
    if (!ok) return;
    setDeletingLoc(true);
    try {
      await apiFetch(`/v1/seal/locations/${selectedLoc.id}`, { method: 'DELETE' });
      showAlert(`${selectedLoc.code} deleted.`, { variant: 'success' });
      setSelectedLoc(null);
      setEditingLoc(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete this rack.');
    } finally {
      setDeletingLoc(false);
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
              <Icon name="package" size={13} /><span>3D View</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={handlePopulateData} disabled={populating}>
              <Icon name="refresh" size={13} /><span>{populating ? 'Populating…' : 'Populate Real Layout'}</span>
            </button>
            <button type="button" className={showAddForm ? 'seal-btn-primary' : 'seal-btn-secondary'} onClick={() => setShowAddForm(v => !v)}>
              <Icon name="plus" size={13} /><span>Add Rack / Floor</span>
            </button>
          </div>
        </div>

        {/* Add Rack / Floor Form */}
        {showAddForm && (
          <div className="seal-card" style={{ padding: 20, marginBottom: 20 }}>
            {zones.length === 0 ? (
              <form onSubmit={handleCreateZone}>
                <h3 className="seal-card-title" style={{ marginBottom: 4 }}>Create a Zone First</h3>
                <p style={{ fontSize: 12.5, color: 'var(--ink3)', margin: '0 0 14px' }}>
                  Racks belong to a zone (e.g. Bulk Storage, Receiving). This compartment has none yet.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="seal-field-row" style={{ width: 140 }}>
                    <label className="seal-field-label">Zone Code</label>
                    <input type="text" className="input-field" value={newZoneCode} onChange={e => setNewZoneCode(e.target.value)} placeholder="Z-BULK-A" />
                  </div>
                  <div className="seal-field-row" style={{ flex: 1, minWidth: 180 }}>
                    <label className="seal-field-label">Zone Name</label>
                    <input type="text" className="input-field" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="Bulk Storage Rack A" />
                  </div>
                  <div className="seal-field-row" style={{ width: 160 }}>
                    <label className="seal-field-label">Zone Type</label>
                    <Select value={newZoneType} onValueChange={setNewZoneType}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>{ZONE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <button type="submit" className="seal-btn-primary" disabled={creatingZone}>{creatingZone ? 'Creating…' : 'Create Zone'}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCreateLocation}>
                <h3 className="seal-card-title" style={{ marginBottom: 14 }}>Add a Rack / Location</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 14 }}>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Zone</label>
                    <Select value={newLocZoneId} onValueChange={setNewLocZoneId}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>{zones.map(z => <SelectItem key={z.id} value={z.id}>{z.code} — {z.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Rack Code</label>
                    <input type="text" className="input-field" value={newLocCode} onChange={e => setNewLocCode(e.target.value)} placeholder="BLK-C1" required />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Location Type</label>
                    <Select value={newLocType} onValueChange={setNewLocType}>
                      <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                      <SelectContent>{LOCATION_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label" title="0 = Ground Floor, 1 = Mezzanine 1, 2 = Mezzanine 2, …">
                      Floor Level
                    </label>
                    <input type="number" min="0" className="input-field" value={newLocFloor} onChange={e => setNewLocFloor(Number(e.target.value) || 0)} />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Grid Row</label>
                    <input type="number" min="1" className="input-field" value={newLocRow} onChange={e => setNewLocRow(e.target.value)} placeholder="1" />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Grid Col</label>
                    <input type="number" min="1" className="input-field" value={newLocCol} onChange={e => setNewLocCol(e.target.value)} placeholder="1" />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Stack Tiers</label>
                    <input type="number" min="1" className="input-field" value={newLocTiers} onChange={e => setNewLocTiers(e.target.value)} />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Capacity / Tier</label>
                    <input type="number" min="1" className="input-field" value={newLocCapacity} onChange={e => setNewLocCapacity(e.target.value)} />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Length (m)</label>
                    <input type="number" min="0" step="any" className="input-field" value={newLocLength} onChange={e => setNewLocLength(e.target.value)} />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Width (m)</label>
                    <input type="number" min="0" step="any" className="input-field" value={newLocWidth} onChange={e => setNewLocWidth(e.target.value)} />
                  </div>
                  <div className="seal-field-row">
                    <label className="seal-field-label">Height (m)</label>
                    <input type="number" min="0" step="any" className="input-field" value={newLocHeight} onChange={e => setNewLocHeight(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" className="seal-btn-secondary" onClick={() => setShowAddForm(false)}>Cancel</button>
                  <button type="submit" className="seal-btn-primary" disabled={addingLoc || !newLocZoneId || !newLocCode.trim()}>
                    {addingLoc ? 'Adding…' : 'Add to Layout'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

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
              <Icon name="package" size={18} style={{ color: 'var(--seal)' }} />
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
                  No locations placed on the grid yet. Click <strong>"Populate Real Layout"</strong> to auto-generate 12 structured rack slots, or <strong>"Add Rack / Floor"</strong> to place them yourself.
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
                            onClick={() => openLocationDetails(loc)}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {!editingLoc && (
                      <>
                        <button type="button" title="Edit rack" onClick={startEditLoc} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink3)' }}>
                          <Icon name="edit" size={15} />
                        </button>
                        <button type="button" title="Delete rack" onClick={handleDeleteLoc} disabled={deletingLoc} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--red)' }}>
                          <Icon name="trash" size={15} />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => { setSelectedLoc(null); setEditingLoc(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </div>

                {editingLoc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div className="seal-field-row">
                        <label className="seal-field-label" title="0 = Ground Floor, 1 = Mezzanine 1, 2 = Mezzanine 2, …">Floor Level</label>
                        <input type="number" min="0" className="input-field" value={editFloor} onChange={e => setEditFloor(Number(e.target.value) || 0)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Stack Tiers</label>
                        <input type="number" min="1" className="input-field" value={editTiers} onChange={e => setEditTiers(e.target.value)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Grid Row</label>
                        <input type="number" min="1" className="input-field" value={editRow} onChange={e => setEditRow(e.target.value)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Grid Col</label>
                        <input type="number" min="1" className="input-field" value={editCol} onChange={e => setEditCol(e.target.value)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Capacity / Tier</label>
                        <input type="number" min="1" className="input-field" value={editCapacity} onChange={e => setEditCapacity(e.target.value)} />
                      </div>
                      <div />
                      <div className="seal-field-row">
                        <label className="seal-field-label">Length (m)</label>
                        <input type="number" min="0" step="any" className="input-field" value={editLength} onChange={e => setEditLength(e.target.value)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Width (m)</label>
                        <input type="number" min="0" step="any" className="input-field" value={editWidth} onChange={e => setEditWidth(e.target.value)} />
                      </div>
                      <div className="seal-field-row">
                        <label className="seal-field-label">Height (m)</label>
                        <input type="number" min="0" step="any" className="input-field" value={editHeight} onChange={e => setEditHeight(e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                      <button type="button" className="seal-btn-secondary" onClick={() => setEditingLoc(false)}>Cancel</button>
                      <button type="button" className="seal-btn-primary" onClick={handleSaveEditLoc} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save Changes'}</button>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
