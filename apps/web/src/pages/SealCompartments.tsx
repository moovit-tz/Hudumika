import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import './Seal.css';

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
  logo_url?: string | null;
}

const WAREHOUSE_TYPES = [
  'public_bonded', 'private_bonded', 'cfs', 'icd', 'virtual_icd',
  'free_zone', 'duty_free_retail', 'excise', 'sorting_centre', 'fulfillment_centre'
];

export function SealCompartments() {
  const navigate = useNavigate();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCompartment, setShowNewCompartment] = useState(false);

  // New Compartment Form State
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('cfs');
  const [newLicence, setNewLicence] = useState('');
  const [newDays, setNewDays] = useState(180);
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    apiFetch('/v1/seal/compartments')
      .then(res => setCompartments(res || []))
      .catch(() => setCompartments([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  async function handleCreateCompartment(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/compartments', {
        method: 'POST',
        body: JSON.stringify({
          code: newCode.trim(),
          name: newName.trim(),
          warehouseType: newType,
          licenceNumber: newLicence.trim() || null,
          defaultStorageDays: newDays,
        }),
      });
      setNewCode(''); setNewName(''); setNewLicence('');
      setShowNewCompartment(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create compartment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const res = await apiFetch(`/v1/seal/compartments/${id}/duplicate`, { method: 'POST' });
      showAlert(`Compartment duplicated as ${res.code}`);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to duplicate compartment');
    }
  }

  async function handleToggleStatus(id: string) {
    try {
      await apiFetch(`/v1/seal/compartments/${id}/toggle-status`, { method: 'POST' });
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to toggle status');
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await showConfirm(`Are you sure you want to delete ${name}?`, { title: 'Delete compartment', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/seal/compartments/${id}`, { method: 'DELETE' });
      showAlert('Compartment deleted');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to delete compartment');
    }
  }

  return (
    <div className="seal-page">
      {/* Header matching Image Two */}
      <div className="seal-page-hdr" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="seal-page-title">Compartments</h1>
          <p className="seal-page-sub">
            Separately-licensed bonded perimeters — each with its own zones and locations underneath.
          </p>
        </div>
        <button
          type="button"
          className="seal-btn-primary"
          onClick={() => setShowNewCompartment(v => !v)}
        >
          <Icon name="plus" size={14} />
          <span>+ New Compartment</span>
        </button>
      </div>

      {/* New Compartment Collapsible Form */}
      {showNewCompartment && (
        <form onSubmit={handleCreateCompartment} className="seal-card" style={{ marginBottom: 20, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>Register New Bonded Compartment / ICD</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label className="seal-field-label">Code</label>
              <input type="text" className="input-field" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="CFS-DSM-01" required />
            </div>
            <div>
              <label className="seal-field-label">Name</label>
              <input type="text" className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Dar es Salaam Container Freight Station" required />
            </div>
            <div>
              <label className="seal-field-label">Type</label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="seal-field-label">License Number</label>
              <input type="text" className="input-field" value={newLicence} onChange={e => setNewLicence(e.target.value)} placeholder="BW-TZ-9821" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="seal-btn-secondary" onClick={() => setShowNewCompartment(false)}>Cancel</button>
            <button type="submit" className="seal-btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Compartment'}</button>
          </div>
        </form>
      )}

      {/* Compartment List Cards matching Image Two */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div className="seal-card" style={{ padding: 20 }}><div className="seal-empty">Loading bonded compartments…</div></div>
        ) : compartments.length === 0 ? (
          <div className="seal-card" style={{ padding: 20 }}><div className="seal-empty">No compartments registered yet.</div></div>
        ) : (
          compartments.map(c => {
            const isSuspended = !c.active;

            return (
              <div
                key={c.id}
                className="seal-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  padding: '16px 20px',
                  position: 'relative',
                  opacity: isSuspended ? 0.75 : 1,
                }}
              >
                {/* Left Section: Icon & Info */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 220, cursor: 'pointer' }}
                  onClick={() => navigate(`/seal/compartments/${c.id}`)}
                >
                  {c.logo_url ? (
                    <div style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', padding: 3, background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={c.logo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <FeaturedIcon variant="brand" size="md" shape="square">
                      <Icon name="layers" size={18} />
                    </FeaturedIcon>
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
                      {isSuspended && <Badge variant="error">SUSPENDED</Badge>}
                    </div>
                    <div className="seal-mono" style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 3 }}>
                      {c.code} · {c.warehouse_type.toLowerCase()} · {c.jurisdiction} · {c.default_storage_days}d storage
                    </div>
                  </div>
                </div>

                {/* Right Section: Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
                  {c.warehouse_type === 'sorting_centre' && (
                    <button
                      type="button"
                      className="seal-btn-secondary"
                      onClick={() => navigate(`/seal/compartments/${c.id}/sorting-dashboard`)}
                    >
                      <Icon name="arrowUpDown" size={13} />
                      <span>Sorting Dashboard</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="seal-btn-secondary"
                    onClick={() => navigate(`/seal/compartments/${c.id}/layout`)}
                  >
                    <Icon name="warehouse" size={13} />
                    <span>Warehouse Layout</span>
                  </button>

                  <button
                    type="button"
                    className="seal-btn-secondary"
                    onClick={() => navigate(`/seal/compartments/${c.id}/heat-grid`)}
                  >
                    <Icon name="grid" size={13} />
                    <span>Heat Grid</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="seal-btn-secondary"
                        style={{ padding: '9px', aspectRatio: '1 / 1' }}
                      >
                        <Icon name="chevronDown" size={15} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => navigate(`/seal/compartments/${c.id}`)}>
                        <Icon name="fileText" size={14} /> View Compartment Detail
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/seal/compartments/${c.id}/edit`)}>
                        <Icon name="edit" size={14} /> Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(c.id)}>
                        <Icon name="copy" size={14} /> Duplicate Perimeter
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleStatus(c.id)}>
                        <Icon name={isSuspended ? 'play' : 'pause'} size={14} /> {isSuspended ? 'Reactivate Perimeter' : 'Suspend Operations'}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(c.id, c.name)} className="text-red-600 focus:text-red-600">
                        <Icon name="trash" size={14} /> Delete Perimeter
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
