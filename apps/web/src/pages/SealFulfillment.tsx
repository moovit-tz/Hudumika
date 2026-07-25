import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import { useSealCompartmentId } from '../hooks/useSealCompartment.js';
import './Seal.css';

interface Order {
  id: string; reference: string; status: string; ownerName?: string; compartmentName?: string; createdAt: string;
}
interface Lot { id: string; description: string; qtyOnHand: number; uom: string; ownerId: string; }
interface Customer { id: string; name: string; }

const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'gray', picking: 'info', picked: 'warning', packed: 'warning', dispatched: 'success', cancelled: 'error',
};

export function SealFulfillment() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [compartmentId] = useSealCompartmentId();
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newLotId, setNewLotId] = useState('');
  const [newQty, setNewQty] = useState('');

  function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/fulfillment-orders?${params.toString()}`).then(setOrders).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [compartmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    apiFetch('/v1/customers').then(res => setCustomers(Array.isArray(res) ? res : res.data || res.customers || []));
  }, []);
  useEffect(() => {
    if (!newCustomerId) { setLots([]); return; }
    const params = new URLSearchParams();
    if (compartmentId) params.set('compartment_id', compartmentId);
    apiFetch(`/v1/seal/lots?${params.toString()}`).then((rows: Lot[]) => setLots(rows.filter(l => l.ownerId === newCustomerId)));
  }, [newCustomerId, compartmentId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!compartmentId || !newCustomerId || !newLotId || !newQty) return;
    setSaving(true);
    try {
      const order = await apiFetch('/v1/seal/fulfillment-orders', {
        method: 'POST',
        body: JSON.stringify({ compartmentId, customerId: newCustomerId, lines: [{ lotId: newLotId, qty: Number(newQty) }] }),
      });
      setShowNew(false); setNewCustomerId(''); setNewLotId(''); setNewQty('');
      navigate(`/seal/fulfillment/${order.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this fulfillment order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <h1 className="seal-page-title">Outbound Fulfillment</h1>
          <p className="seal-page-sub">Pick, pack, and dispatch stock out of the warehouse — every picked unit is a real ledger movement, never a separate count.</p>
        </div>
        <Button type="button" onClick={() => setShowNew(v => !v)} disabled={!compartmentId}>
          <Icon name="plus" size={14} /><span>New Order</span>
        </Button>
      </div>

      {!compartmentId && <div className="seal-empty" style={{ marginBottom: 16 }}>Select a specific warehouse in the switcher above to create a fulfillment order.</div>}

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div className="seal-form-grid-3">
            <div className="seal-field-row">
              <label className="seal-field-label">Customer</label>
              <Combobox
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                value={newCustomerId} onChange={v => { setNewCustomerId(v); setNewLotId(''); }}
                placeholder="Search customers…" searchPlaceholder="Search…" emptyText="No matching customers."
              />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Lot</label>
              <Select value={newLotId} onValueChange={setNewLotId} disabled={!newCustomerId}>
                <SelectTrigger className="input-field"><SelectValue placeholder={newCustomerId ? 'Choose a lot' : 'Choose a customer first'} /></SelectTrigger>
                <SelectContent>
                  {lots.map(l => <SelectItem key={l.id} value={l.id}>{l.description} ({l.qtyOnHand} {l.uom} on hand)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Quantity to Fulfill</label>
              <Input type="number" min="0" step="any" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newCustomerId || !newLotId || !newQty}>{saving ? 'Creating…' : 'Create Order'}</Button>
          </div>
        </form>
      )}

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="seal-empty">No fulfillment orders yet.</div>
          ) : (
            <table className="seal-table">
              <thead><tr><th>Reference</th><th>Customer</th><th>Warehouse</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/seal/fulfillment/${o.id}`)}>
                    <td className="seal-mono" style={{ fontWeight: 700, color: 'var(--ink)' }}>{o.reference}</td>
                    <td>{o.ownerName ?? '—'}</td>
                    <td>{o.compartmentName ?? '—'}</td>
                    <td><Badge variant={STATUS_VARIANT[o.status] ?? 'gray'}>{o.status}</Badge></td>
                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
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
