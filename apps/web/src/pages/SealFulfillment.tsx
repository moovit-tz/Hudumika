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
import { PageHeader } from '../components/PageHeader.js';

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
  const [pendingLotId, setPendingLotId] = useState('');
  const [pendingQty, setPendingQty] = useState('');
  const [newLines, setNewLines] = useState<{ lotId: string; description: string; qty: string; uom: string }[]>([]);

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

  function handleAddLine() {
    if (!pendingLotId || !pendingQty || Number(pendingQty) <= 0) return;
    const lot = lots.find(l => l.id === pendingLotId);
    if (!lot) return;
    setNewLines(prev => [...prev.filter(l => l.lotId !== pendingLotId), { lotId: lot.id, description: lot.description, qty: pendingQty, uom: lot.uom }]);
    setPendingLotId(''); setPendingQty('');
  }

  function handleRemoveLine(lotId: string) {
    setNewLines(prev => prev.filter(l => l.lotId !== lotId));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!compartmentId || !newCustomerId || newLines.length === 0) return;
    setSaving(true);
    try {
      const order = await apiFetch('/v1/seal/fulfillment-orders', {
        method: 'POST',
        body: JSON.stringify({ compartmentId, customerId: newCustomerId, lines: newLines.map(l => ({ lotId: l.lotId, qty: Number(l.qty) })) }),
      });
      setShowNew(false); setNewCustomerId(''); setNewLines([]); setPendingLotId(''); setPendingQty('');
      navigate(`/seal/fulfillment/${order.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create this fulfillment order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Outbound Fulfillment']}
        titlePlain="Outbound"
        titleEm="fulfillment"
        subtitle="Pick, pack, and dispatch stock out of the warehouse — every picked unit is a real ledger movement, never a separate count."
      />
      <div className="seal-page-hdr">
        <Button type="button" onClick={() => setShowNew(v => !v)} disabled={!compartmentId}>
          <Icon name="plus" size={14} /><span>New Order</span>
        </Button>
      </div>

      {!compartmentId && <div className="seal-empty" style={{ marginBottom: 16 }}>Select a specific warehouse in the switcher above to create a fulfillment order.</div>}

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20 }}>
            <div className="seal-field-row" style={{ marginBottom: 14 }}>
              <label className="seal-field-label">Customer</label>
              <Combobox
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                value={newCustomerId} onChange={v => { setNewCustomerId(v); setNewLines([]); setPendingLotId(''); setPendingQty(''); }}
                placeholder="Search customers…" searchPlaceholder="Search…" emptyText="No matching customers."
              />
            </div>

            {newLines.length > 0 && (
              <table className="seal-table" style={{ marginBottom: 14 }}>
                <thead><tr><th>Lot</th><th>Quantity</th><th></th></tr></thead>
                <tbody>
                  {newLines.map(l => (
                    <tr key={l.lotId}>
                      <td>{l.description}</td>
                      <td>{l.qty} {l.uom}</td>
                      <td><Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveLine(l.lotId)}><Icon name="x" size={13} /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="seal-field-row" style={{ minWidth: 240, flex: 1 }}>
                <label className="seal-field-label">Lot</label>
                <Select value={pendingLotId} onValueChange={setPendingLotId} disabled={!newCustomerId}>
                  <SelectTrigger className="input-field"><SelectValue placeholder={newCustomerId ? 'Choose a lot' : 'Choose a customer first'} /></SelectTrigger>
                  <SelectContent>
                    {lots.filter(l => !newLines.some(nl => nl.lotId === l.id)).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.description} ({l.qtyOnHand} {l.uom} on hand)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="seal-field-row" style={{ width: 140 }}>
                <label className="seal-field-label">Quantity</label>
                <Input type="number" min="0" step="any" value={pendingQty} onChange={e => setPendingQty(e.target.value)} placeholder="0" />
              </div>
              <Button type="button" variant="outline" disabled={!pendingLotId || !pendingQty} onClick={handleAddLine}>
                <Icon name="plus" size={13} /><span>Add Line</span>
              </Button>
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <Button type="submit" disabled={saving || !newCustomerId || newLines.length === 0}>{saving ? 'Creating…' : `Create Order (${newLines.length} line${newLines.length === 1 ? '' : 's'})`}</Button>
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
