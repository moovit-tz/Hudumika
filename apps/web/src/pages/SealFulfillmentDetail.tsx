import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';

interface Line { id: string; lotId: string; lotDescription?: string; lotUom?: string; requestedQty: number; pickedQty: number; packed: boolean; }
interface Order {
  id: string; reference: string; status: string; ownerName?: string; compartmentName?: string;
  vehicleId: string | null; carrierNote: string | null; notes: string | null;
  createdAt: string; packedAt: string | null; dispatchedAt: string | null; lines: Line[];
}
interface Vehicle { id: string; name: string; plate_number: string | null; }

const STATUS_VARIANT: Record<string, 'gray' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'gray', picking: 'info', picked: 'warning', packed: 'warning', dispatched: 'success', cancelled: 'error',
};

export function SealFulfillmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [pickQty, setPickQty] = useState<Record<string, string>>({});
  const [acting, setActing] = useState(false);
  const [dispatchVehicleId, setDispatchVehicleId] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [showDispatchForm, setShowDispatchForm] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    apiFetch(`/v1/seal/fulfillment-orders/${id}`).then(setOrder).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { apiFetch('/v1/seal/vehicles').then(setVehicles).catch(() => setVehicles([])); }, []);

  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'ful-print-css';
    s.textContent = `@media print { body > * { visibility: hidden !important; } #ful-print-area, #ful-print-area * { visibility: visible !important; } #ful-print-area { position: fixed !important; inset: 0 !important; padding: 24px !important; background: #fff !important; overflow: visible !important; } }`;
    document.head.appendChild(s);
    return () => document.getElementById('ful-print-css')?.remove();
  }, []);

  async function handlePick(line: Line) {
    const qty = Number(pickQty[line.id]);
    if (!id || !qty || qty <= 0) return;
    setActing(true);
    try {
      await apiFetch(`/v1/seal/fulfillment-orders/${id}/pick`, { method: 'POST', body: JSON.stringify({ lineId: line.id, qty }) });
      setPickQty(prev => ({ ...prev, [line.id]: '' }));
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to record this pick.');
    } finally {
      setActing(false);
    }
  }

  async function handlePack() {
    if (!id) return;
    setActing(true);
    try {
      await apiFetch(`/v1/seal/fulfillment-orders/${id}/pack`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to confirm packing.');
    } finally {
      setActing(false);
    }
  }

  async function handleDispatch() {
    if (!id) return;
    setActing(true);
    try {
      await apiFetch(`/v1/seal/fulfillment-orders/${id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ vehicleId: dispatchVehicleId || null, carrierNote: dispatchNote.trim() || null }),
      });
      setShowDispatchForm(false);
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to dispatch this order.');
    } finally {
      setActing(false);
    }
  }

  async function handleCancel() {
    if (!id) return;
    setActing(true);
    try {
      await apiFetch(`/v1/seal/fulfillment-orders/${id}/cancel`, { method: 'POST' });
      load();
    } catch (err: any) {
      showAlert(err.message || 'Failed to cancel this order.');
    } finally {
      setActing(false);
    }
  }

  if (loading || !order) return <div className="seal-page"><div className="seal-empty">Loading…</div></div>;

  const vehicle = vehicles.find(v => v.id === order.vehicleId);

  return (
    <div className="seal-page">
      <div className="seal-page-hdr">
        <div>
          <Button type="button" variant="outline" onClick={() => navigate('/seal/fulfillment')} style={{ marginBottom: 12 }}>
            <Icon name="arrowLeft" size={13} /><span>Back to Fulfillment</span>
          </Button>
          <h1 className="seal-page-title">{order.reference}</h1>
          <p className="seal-page-sub">{order.ownerName ?? '—'} · {order.compartmentName ?? '—'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge variant={STATUS_VARIANT[order.status] ?? 'gray'}>{order.status}</Badge>
          {order.status === 'dispatched' && (
            <Button type="button" variant="outline" onClick={() => window.print()}>
              <Icon name="printer" size={14} /><span>Print Dispatch Note</span>
            </Button>
          )}
          {order.status === 'draft' && (
            <Button type="button" variant="outline" onClick={handleCancel} disabled={acting}>
              <Icon name="x" size={14} /><span>Cancel Order</span>
            </Button>
          )}
        </div>
      </div>

      <div className="seal-card" style={{ marginBottom: 20 }}>
        <div className="seal-card-hdr"><h2 className="seal-card-title">Lines</h2></div>
        <div className="seal-card-body">
          <table className="seal-table">
            <thead><tr><th>Lot</th><th>Requested</th><th>Picked</th><th>Packed</th><th></th></tr></thead>
            <tbody>
              {order.lines.map(line => (
                <tr key={line.id}>
                  <td style={{ fontWeight: 700, color: 'var(--ink)' }}>{line.lotDescription ?? '—'}</td>
                  <td>{line.requestedQty} {line.lotUom}</td>
                  <td className="seal-mono">{line.pickedQty} / {line.requestedQty}</td>
                  <td>{line.packed ? <Badge variant="success">Packed</Badge> : <span style={{ color: 'var(--ink3)' }}>—</span>}</td>
                  <td>
                    {(order.status === 'draft' || order.status === 'picking') && line.pickedQty < line.requestedQty && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Input
                          type="number" min="0" max={line.requestedQty - line.pickedQty} step="any"
                          style={{ width: 90 }}
                          value={pickQty[line.id] ?? ''} onChange={e => setPickQty(prev => ({ ...prev, [line.id]: e.target.value }))}
                          placeholder={`${line.requestedQty - line.pickedQty} left`}
                        />
                        <Button type="button" variant="outline" disabled={acting || !pickQty[line.id]} onClick={() => handlePick(line)}>Pick</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {order.status === 'picked' && (
        <div className="seal-card" style={{ marginBottom: 20, padding: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12 }}>Every line is fully picked. Confirm packing to move to dispatch.</p>
          <Button type="button" disabled={acting} onClick={handlePack}>
            <Icon name="package" size={14} /><span>{acting ? 'Confirming…' : 'Confirm Packing'}</span>
          </Button>
        </div>
      )}

      {order.status === 'packed' && (
        <div className="seal-card" style={{ marginBottom: 20, padding: 20 }}>
          {!showDispatchForm ? (
            <Button type="button" onClick={() => setShowDispatchForm(true)}>
              <Icon name="truck" size={14} /><span>Dispatch</span>
            </Button>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="seal-field-row" style={{ width: 220 }}>
                <label className="seal-field-label">Vehicle (optional)</label>
                <Select value={dispatchVehicleId || '__none__'} onValueChange={v => setDispatchVehicleId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="input-field"><SelectValue placeholder="No vehicle on file" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No vehicle on file</SelectItem>
                    {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}{v.plate_number ? ` (${v.plate_number})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="seal-field-row" style={{ width: 260, flex: 1 }}>
                <label className="seal-field-label">Carrier / Driver Note</label>
                <Input type="text" value={dispatchNote} onChange={e => setDispatchNote(e.target.value)} placeholder="e.g. Driver John, Plate T123ABC" />
              </div>
              <Button type="button" disabled={acting} onClick={handleDispatch}>
                <Icon name="send" size={14} /><span>{acting ? 'Dispatching…' : 'Confirm Dispatch'}</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {order.status === 'dispatched' && (
        <div id="ful-print-area" className="seal-card" style={{ padding: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Dispatch Note</h2>
              <div className="seal-mono" style={{ color: 'var(--ink3)' }}>{order.reference}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div>Dispatched: {order.dispatchedAt ? new Date(order.dispatchedAt).toLocaleString() : '—'}</div>
              <div>Customer: {order.ownerName ?? '—'}</div>
              <div>Warehouse: {order.compartmentName ?? '—'}</div>
              {vehicle && <div>Vehicle: {vehicle.name}{vehicle.plate_number ? ` (${vehicle.plate_number})` : ''}</div>}
              {order.carrierNote && <div>Carrier: {order.carrierNote}</div>}
            </div>
          </div>
          <table className="seal-table">
            <thead><tr><th>Item</th><th>Quantity Dispatched</th></tr></thead>
            <tbody>
              {order.lines.map(line => (
                <tr key={line.id}>
                  <td>{line.lotDescription ?? '—'}</td>
                  <td>{line.pickedQty} {line.lotUom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
