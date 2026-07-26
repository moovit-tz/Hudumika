import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Inventory.css';

interface Warehouse { id: string; code: string; name: string; address: string | null; active: boolean; }
interface Location { id: string; warehouseId: string; code: string; name: string; locationType: string; isPickable: boolean; }

const LOCATION_TYPES = ['bin', 'shelf', 'floor', 'staging'];

export function InventoryWarehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNewWarehouse, setShowNewWarehouse] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState('bin');

  function reload() {
    apiFetch('/v1/inventory/warehouses').then(setWarehouses);
    apiFetch('/v1/inventory/locations').then(setLocations);
  }
  useEffect(() => { reload(); }, []);

  async function handleCreateWarehouse(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/inventory/warehouses', {
        method: 'POST',
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), address: newAddress.trim() || null }),
      });
      setNewCode(''); setNewName(''); setNewAddress(''); setShowNewWarehouse(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this warehouse.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLocation(warehouseId: string) {
    if (!newLocCode.trim() || !newLocName.trim()) return;
    try {
      await apiFetch('/v1/inventory/locations', {
        method: 'POST',
        body: JSON.stringify({ warehouseId, code: newLocCode.trim(), name: newLocName.trim(), locationType: newLocType }),
      });
      setNewLocCode(''); setNewLocName('');
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this location.');
    }
  }

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <h1 className="inv-page-title">Warehouses</h1>
          <p className="inv-page-sub">Each warehouse holds its own bins/shelves/staging locations — a simpler two-level hierarchy than SEAL's customs compartments.</p>
        </div>
        <Button type="button" onClick={() => setShowNewWarehouse(v => !v)}>
          <Icon name="plus" size={14} /><span>New Warehouse</span>
        </Button>
      </div>

      {showNewWarehouse && (
        <form onSubmit={handleCreateWarehouse} className="inv-card" style={{ marginBottom: 20 }}>
          <div className="inv-form-grid-3">
            <div className="inv-field-row">
              <label className="inv-field-label">Code</label>
              <Input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="WH-01" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Name</label>
              <Input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Main Warehouse" />
            </div>
            <div className="inv-field-row">
              <label className="inv-field-label">Address (optional)</label>
              <Input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Street, city" />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newCode.trim() || !newName.trim()}>{saving ? 'Creating…' : 'Create Warehouse'}</Button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {warehouses.length === 0 ? (
          <div className="inv-card"><div className="inv-empty">No warehouses yet.</div></div>
        ) : warehouses.map(w => {
          const isOpen = selected === w.id;
          const warehouseLocations = locations.filter(l => l.warehouseId === w.id);
          return (
            <div className="inv-card" key={w.id}>
              <div className="inv-card-hdr" style={{ cursor: 'pointer' }} onClick={() => setSelected(isOpen ? null : w.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <FeaturedIcon variant="brand" size="md" shape="square"><Icon name="warehouse" size={18} /></FeaturedIcon>
                  <div>
                    <div className="inv-card-title">{w.name}</div>
                    <div className="inv-mono" style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{w.code}{w.address ? ` · ${w.address}` : ''}</div>
                  </div>
                </div>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={16} />
              </div>

              {isOpen && (
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {warehouseLocations.map(l => (
                      <span key={l.id} className="inv-mono" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        {l.code} — {l.name} ({l.locationType})
                      </span>
                    ))}
                    {warehouseLocations.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink3)' }}>No locations yet.</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Input type="text" style={{ width: 100 }} placeholder="Code" value={newLocCode} onChange={e => setNewLocCode(e.target.value)} />
                    <Input type="text" style={{ width: 160 }} placeholder="Name" value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                    <Select value={newLocType} onValueChange={setNewLocType}>
                      <SelectTrigger style={{ width: 140 }}><SelectValue /></SelectTrigger>
                      <SelectContent>{LOCATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={() => handleCreateLocation(w.id)}>Add Location</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
