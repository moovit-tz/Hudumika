import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Compartment {
  id: string;
  code: string;
  name: string;
  warehouse_type: string;
  jurisdiction: string;
  default_storage_days: number;
  guarantee_id: string | null;
  storage_fee_per_day: string;
  storage_fee_currency: string;
  handling_fee_flat: string;
  storage_fee_per_cbm_per_day: string;
  billing_method: 'flat_per_lot' | 'per_cbm';
  geofence_id: string | null;
  active: boolean;
  licence_number?: string | null;
  licence_expiry?: string | null;
  customs_office_code?: string | null;
  logo_url?: string | null;
}

interface Zone { id: string; compartment_id: string; code: string; name: string; zone_type: string; }
interface Location { id: string; compartment_id: string; zone_id: string; code: string; location_type: string; volume_cbm: string | null; }
interface Lot { id: string; lot_number: string; description: string; qty_on_hand: number; uom: string; status: string; }

export function SealCompartmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<{
    compartment: Compartment;
    zones: Zone[];
    locations: Location[];
    lots: Lot[];
    stats: { zoneCount: number; locationCount: number; lotCount: number; totalCapacityUnits: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'zones' | 'lots' | 'billing'>('overview');

  // New Zone & Location
  const [newZoneCode, setNewZoneCode] = useState('');
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('bulk');

  function loadDetail() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/compartments/${id}`)
      .then(res => setData(res))
      .catch(err => showAlert(err.message || 'Failed to load compartment details'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadDetail(); }, [id]);

  if (loading) {
    return <div className="seal-page"><div className="seal-card"><div className="seal-empty">Loading compartment details…</div></div></div>;
  }

  if (!data) {
    return <div className="seal-page"><div className="seal-card"><div className="seal-empty">Compartment not found.</div></div></div>;
  }

  const { compartment: c, zones, locations, lots, stats } = data;
  const isSuspended = !c.active;

  async function handleDuplicate() {
    try {
      const res = await apiFetch(`/v1/seal/compartments/${c.id}/duplicate`, { method: 'POST' });
      showAlert(`Compartment duplicated as ${res.code}`, { variant: 'success' });
      navigate(`/seal/compartments/${res.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to duplicate compartment');
    }
  }

  async function handleToggleStatus() {
    try {
      await apiFetch(`/v1/seal/compartments/${c.id}/toggle-status`, { method: 'POST' });
      loadDetail();
    } catch (err: any) {
      showAlert(err.message || 'Failed to toggle status');
    }
  }

  async function handleDelete() {
    const ok = await showConfirm(`Are you sure you want to delete ${c.name}? This will deactivate the compartment.`, { title: 'Delete compartment', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/seal/compartments/${c.id}`, { method: 'DELETE' });
      showAlert('Compartment deleted', { variant: 'success' });
      navigate('/seal/compartments');
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete compartment');
    }
  }

  async function handleAddZone(e: React.FormEvent) {
    e.preventDefault();
    if (!newZoneCode.trim() || !newZoneName.trim()) return;
    try {
      await apiFetch('/v1/seal/zones', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: c.id, code: newZoneCode.trim(), name: newZoneName.trim(), zoneType: newZoneType }),
      });
      setNewZoneCode(''); setNewZoneName('');
      loadDetail();
    } catch (err: any) {
      showAlert(err.message || 'Failed to add zone');
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Compartment']}
        titlePlain="Bonded"
        titleEm="compartment"
        subtitle="Its zones, locations and what is stored in them."
      />
      {/* Back Link */}
      <div style={{ marginBottom: 16 }}>
        <Link to="/seal/compartments" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--seal)', textDecoration: 'none' }}>
          <Icon name="arrowLeft" size={14} /> Back to Compartments
        </Link>
      </div>

      {/* Header Card */}
      <div className="seal-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {c.logo_url ? (
              <div style={{ width: 56, height: 56, borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', padding: 4, background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <img src={c.logo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            ) : (
              <FeaturedIcon variant="brand" size="lg" shape="square"><Icon name="layers" size={24} /></FeaturedIcon>
            )}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 className="seal-page-title" style={{ margin: 0, fontSize: 22 }}>{c.name}</h1>
                <Badge variant={isSuspended ? 'error' : 'success'}>{isSuspended ? 'SUSPENDED' : 'ACTIVE'}</Badge>
              </div>
              <div className="seal-mono" style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
                {c.code} · {c.warehouse_type.replace(/_/g, ' ').toUpperCase()} · Jurisdiction: {c.jurisdiction} · {c.default_storage_days}d storage
              </div>
              {c.licence_number && (
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 4 }}>
                  License: <strong>{c.licence_number}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="seal-btn-secondary" onClick={() => navigate(`/seal/compartments/${c.id}/layout`)}>
              <Icon name="warehouse" size={14} /><span>Warehouse Layout</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={() => navigate(`/seal/compartments/${c.id}/heat-grid`)}>
              <Icon name="grid" size={14} /><span>Heat Grid</span>
            </button>
            {c.warehouse_type === 'sorting_centre' && (
              <button type="button" className="seal-btn-secondary" onClick={() => navigate(`/seal/compartments/${c.id}/sorting-dashboard`)}>
                <Icon name="arrowUpDown" size={14} /><span>Sorting Dashboard</span>
              </button>
            )}
            <button type="button" className="seal-btn-secondary" onClick={() => navigate(`/seal/compartments/${c.id}/edit`)}>
              <Icon name="edit" size={14} /><span>Edit</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={handleDuplicate} title="Duplicate this warehouse definition">
              <Icon name="copy" size={14} /><span>Duplicate</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={handleToggleStatus} style={{ color: isSuspended ? 'var(--seal)' : 'var(--red)' }}>
              <Icon name={isSuspended ? 'play' : 'pause'} size={14} /><span>{isSuspended ? 'Reactivate' : 'Suspend'}</span>
            </button>
            <button type="button" className="seal-btn-secondary" onClick={handleDelete} style={{ color: 'var(--red)' }}>
              <Icon name="trash" size={14} /><span>Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="seal-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Zones & Racks</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{stats.zoneCount}</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>{stats.locationCount} total location slots</div>
        </div>
        <div className="seal-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Lots On Hand</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--seal)', marginTop: 4 }}>{stats.lotCount}</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Active bonded lots</div>
        </div>
        <div className="seal-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Est. Storage Rate</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
            {c.storage_fee_currency} {Number(c.storage_fee_per_day).toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Method: {c.billing_method}</div>
        </div>
        <div className="seal-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)' }}>Capacity Units</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>{stats.totalCapacityUnits}</div>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>Est. max storage capacity</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <button
          type="button"
          style={{
            padding: '10px 18px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid var(--seal)' : '2px solid transparent',
            color: activeTab === 'overview' ? 'var(--seal)' : 'var(--ink3)', cursor: 'pointer',
          }}
          onClick={() => setActiveTab('overview')}
        >
          Overview & Zones
        </button>
        <button
          type="button"
          style={{
            padding: '10px 18px', fontSize: 13, fontWeight: 700, background: 'none', border: 'none',
            borderBottom: activeTab === 'lots' ? '2px solid var(--seal)' : '2px solid transparent',
            color: activeTab === 'lots' ? 'var(--seal)' : 'var(--ink3)', cursor: 'pointer',
          }}
          onClick={() => setActiveTab('lots')}
        >
          Lots On Hand ({lots.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Add Zone Card */}
          <form onSubmit={handleAddZone} className="seal-card" style={{ padding: 20 }}>
            <h3 className="seal-card-title" style={{ marginBottom: 12 }}>Add New Storage Zone</h3>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ minWidth: 120 }}>
                <label className="seal-field-label">Zone Code</label>
                <input type="text" className="input-field" value={newZoneCode} onChange={e => setNewZoneCode(e.target.value)} placeholder="Z-BULK-01" />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label className="seal-field-label">Zone Name</label>
                <input type="text" className="input-field" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} placeholder="Bulk Storage Area" />
              </div>
              <div style={{ minWidth: 140 }}>
                <label className="seal-field-label">Zone Type</label>
                <Select value={newZoneType} onValueChange={setNewZoneType}>
                  <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bulk">Bulk Storage</SelectItem>
                    <SelectItem value="receiving">Receiving</SelectItem>
                    <SelectItem value="pick">Pick Area</SelectItem>
                    <SelectItem value="quarantine">Quarantine</SelectItem>
                    <SelectItem value="yard">Yard Slot</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button type="submit" className="seal-btn-primary">Add Zone</button>
            </div>
          </form>

          {/* Zone List */}
          <div className="seal-card" style={{ padding: 20 }}>
            <h3 className="seal-card-title" style={{ marginBottom: 14 }}>Configured Zones ({zones.length})</h3>
            {zones.length === 0 ? (
              <div className="seal-empty">No zones created yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {zones.map(z => (
                  <div key={z.id} style={{ padding: 14, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{z.name}</div>
                    <div className="seal-mono" style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>{z.code} · {z.zone_type}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'lots' && (
        <div className="seal-card" style={{ padding: 20 }}>
          <h3 className="seal-card-title" style={{ marginBottom: 14 }}>Bonded Lots Stored in {c.name}</h3>
          {lots.length === 0 ? (
            <div className="seal-empty">No active lots currently stored in this compartment.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--ink3)', fontSize: 11, textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 12px' }}>Lot #</th>
                    <th style={{ padding: '8px 12px' }}>Description</th>
                    <th style={{ padding: '8px 12px' }}>Qty on Hand</th>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700 }}>{l.lot_number}</td>
                      <td style={{ padding: '10px 12px' }}>{l.description}</td>
                      <td style={{ padding: '10px 12px' }}>{l.qty_on_hand} {l.uom}</td>
                      <td style={{ padding: '10px 12px' }}><span className="seal-pill">{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
