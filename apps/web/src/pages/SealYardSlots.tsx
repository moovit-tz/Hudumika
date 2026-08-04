import React, { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.js';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Compartment { id: string; code: string; name: string; }
interface YardSlot { id: string; compartmentId: string; code: string; capacityTeu: number; active: boolean; occupiedCount: number; }

export function SealYardSlots() {
  const isMobile = useIsMobile();
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [slots, setSlots] = useState<YardSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();
  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newCapacity, setNewCapacity] = useState('1');
  const [newCompartmentId, setNewCompartmentId] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    const params = compartmentId ? `?compartment_id=${compartmentId}` : '';
    apiFetch(`/v1/seal/yard-slots${params}`).then(setSlots).finally(() => setLoading(false));
  }
  useEffect(() => {
    apiFetch('/v1/seal/compartments').then(rows => {
      setCompartments(rows);
      if (rows.length === 1) { setNewCompartmentId(rows[0].id); }
    });
  }, []);
  useEffect(() => { reload(); }, [compartmentId]);
  useEffect(() => {
    if (compartmentId) setNewCompartmentId(compartmentId);
  }, [compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCompartmentId || !newCode.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/seal/yard-slots', {
        method: 'POST',
        body: JSON.stringify({ compartmentId: newCompartmentId, code: newCode.trim(), capacityTeu: Number(newCapacity) || 1 }),
      });
      setNewCode(''); setShowNew(false);
      reload();
    } catch (err: any) {
      showAlert(err.message || 'Failed to create yard slot.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Yard Slots']}
        titlePlain="Yard"
        titleEm="slots"
        subtitle="Where a gated-in container sits before/during devanning — a different physical spot from the rack/bin a devanned lot is put away into."
      />
      <div className="seal-page-hdr">
        <button type="button" className="seal-btn-primary" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>New Slot</span>
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14, alignItems: 'flex-end' }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Compartment</label>
              <Select value={newCompartmentId} onValueChange={setNewCompartmentId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Choose a compartment" /></SelectTrigger>
                <SelectContent>{compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Code</label>
              <input type="text" className="input-field" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="e.g. Y-A12" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Capacity (TEU)</label>
              <input type="number" min="1" className="input-field" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <button type="submit" className="seal-btn-primary" disabled={saving || !newCompartmentId || !newCode.trim()}>{saving ? 'Creating…' : 'Create Slot'}</button>
          </div>
        </form>
      )}

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : slots.length === 0 ? (
            <div className="seal-empty">No yard slots defined yet.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Code</th><th>Capacity (TEU)</th><th>Occupied</th><th>Status</th></tr></thead>
              <tbody>
                {slots.map(s => (
                  <tr key={s.id}>
                    <td className="seal-mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.code}</td>
                    <td>{s.capacityTeu}</td>
                    <td>{s.occupiedCount} / {s.capacityTeu}</td>
                    <td><Badge variant={s.occupiedCount >= s.capacityTeu ? 'warning' : 'success'}>{s.occupiedCount >= s.capacityTeu ? 'Full' : 'Available'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
