import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Inventory.css';
import { PageHeader } from '../components/PageHeader.js';

interface Session { id: string; warehouseId: string; warehouseName?: string; status: string; startedAt: string; postedAt: string | null; notes: string | null; }
interface Warehouse { id: string; code: string; name: string; }

const STATUS_VARIANT: Record<string, 'info' | 'success' | 'error'> = { open: 'info', posted: 'success', cancelled: 'error' };

export function InventoryCounts() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newWarehouseId, setNewWarehouseId] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    apiFetch('/v1/inventory/count-sessions').then(setSessions).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);
  useEffect(() => { apiFetch('/v1/inventory/warehouses').then(setWarehouses); }, []);

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (!newWarehouseId) return;
    setSaving(true);
    try {
      const session = await apiFetch('/v1/inventory/count-sessions', {
        method: 'POST',
        body: JSON.stringify({ warehouseId: newWarehouseId, notes: newNotes.trim() || null }),
      });
      setNewWarehouseId(''); setNewNotes(''); setShowNew(false);
      navigate(`/inventory/counts/${session.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to start this count session.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="inv-page">
      <div className="inv-page-hdr">
        <div>
          <PageHeader
            crumbs={['Inventory', 'Stock Counts']}
            titlePlain="Stock"
            titleEm="counts"
            subtitle="Every variance found in a count posts a real ledger correction — the expected quantity is frozen the moment a count starts, never silently recomputed."
          />
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} /><span>Start Count</span>
        </Button>
      </div>

      {showNew && (
        <form onSubmit={handleStart} className="inv-card" style={{ marginBottom: 20 }}>
          <div className="inv-form-grid-3">
            <div className="inv-field-row">
              <label className="inv-field-label">Warehouse</label>
              <Select value={newWarehouseId} onValueChange={setNewWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="inv-field-row" style={{ gridColumn: 'span 2' }}>
              <label className="inv-field-label">Notes (optional)</label>
              <Input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="e.g. Monthly cycle count" />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newWarehouseId}>{saving ? 'Starting…' : 'Start Count'}</Button>
          </div>
        </form>
      )}

      <div className="inv-card">
        <div className="inv-card-body">
          {loading ? (
            <div className="inv-empty">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="inv-empty">No stock counts yet.</div>
          ) : (
            <table className="inv-table">
              <thead><tr><th>Warehouse</th><th>Status</th><th>Started</th><th>Notes</th></tr></thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} onClick={() => navigate(`/inventory/counts/${s.id}`)}>
                    <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.warehouseName ?? '—'}</td>
                    <td><Badge variant={STATUS_VARIANT[s.status] ?? 'info'}>{s.status}</Badge></td>
                    <td>{new Date(s.startedAt).toLocaleString()}</td>
                    <td>{s.notes ?? '—'}</td>
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
