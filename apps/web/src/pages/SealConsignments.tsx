import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, toDateOnlyString } from '../components/ui/date-picker.js';
import { apiFetch } from '../lib/api.js';
import { showAlert } from '../lib/alert.js';
import './Seal.css';
import { PageHeader } from '../components/PageHeader.js';

interface Consignment {
  id: string; owner_name?: string; transport_doc_type: string; transport_doc_number: string | null;
  status: string; expected_arrival: string | null; goods_description: string | null;
}
interface Compartment { id: string; code: string; name: string; }
interface Customer { id: string; name: string; category?: string; }

export const STATUS_VARIANT: Record<string, 'brand' | 'success' | 'warning' | 'error' | 'info' | 'gray'> = {
  EXPECTED: 'gray', ARRIVED_AT_GATE: 'info', GATE_IN_COMPLETE: 'info', IN_YARD: 'brand',
  AWAITING_CUSTOMS: 'warning', UNDER_EXAMINATION: 'warning', RELEASED_FOR_DEVANNING: 'brand',
  DEVANNING: 'brand', DEVANNED: 'success', EMPTY_RETURNED: 'success',
  HELD_BY_CUSTOMS: 'error', HELD_BY_AGENCY: 'error', DAMAGED: 'error', SHORT_SHIPPED: 'error', REJECTED_AT_GATE: 'error',
};

const TRANSPORT_DOC_TYPES = ['BL', 'AWB', 'CMR', 'RAIL_WAYBILL'];

export function SealConsignments() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [consignments, setConsignments] = useState<Consignment[]>([]);
  const [compartments, setCompartments] = useState<Compartment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [compartmentId, setCompartmentId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [docType, setDocType] = useState('BL');
  const [docNumber, setDocNumber] = useState('');
  const [expectedArrival, setExpectedArrival] = useState<Date | undefined>(new Date());
  const [goodsDescription, setGoodsDescription] = useState('');

  function reload() {
    setLoading(true);
    apiFetch('/v1/seal/consignments').then(setConsignments).finally(() => setLoading(false));
  }
  useEffect(() => {
    reload();
    apiFetch('/v1/seal/compartments').then(rows => { setCompartments(rows); if (rows.length === 1) setCompartmentId(rows[0].id); });
    apiFetch('/v1/customers').then(res => setCustomers(Array.isArray(res) ? res : res.data || res.customers || []));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!compartmentId || !ownerId) return;
    setSaving(true);
    try {
      const c = await apiFetch('/v1/seal/consignments', {
        method: 'POST',
        body: JSON.stringify({
          compartmentId, ownerId, transportDocType: docType, transportDocNumber: docNumber.trim() || null,
          expectedArrival: expectedArrival ? toDateOnlyString(expectedArrival) : null,
          goodsDescription: goodsDescription.trim() || null,
        }),
      });
      navigate(`/seal/consignments/${c.id}`);
    } catch (err: any) {
      showAlert(err.message || 'Failed to create consignment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="seal-page">
      <PageHeader
        crumbs={['SEAL', 'Consignments']}
        titlePlain="Inbound"
        titleEm="consignments"
        subtitle="Pre-arrival through gate-in to devanning — one consignment per transport document."
      />
      <div className="seal-page-hdr">
        <button type="button" className="seal-btn-primary" onClick={() => setShowNew(v => !v)}>
          <Icon name="plus" size={14} />
          <span>New Consignment</span>
        </button>
      </div>

      {showNew && (
        <form onSubmit={handleCreate} className="seal-card" style={{ marginBottom: 20 }}>
          <div style={{ padding: 20, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
            <div className="seal-field-row">
              <label className="seal-field-label">Compartment</label>
              <Select value={compartmentId} onValueChange={setCompartmentId}>
                <SelectTrigger className="input-field"><SelectValue placeholder="Choose a compartment" /></SelectTrigger>
                <SelectContent>{compartments.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Owner</label>
              <Combobox
                options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.category }))}
                value={ownerId} onChange={setOwnerId} placeholder="Search CRM clients…" emptyText="No matching clients."
              />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Expected Arrival</label>
              <DatePicker date={expectedArrival} onChange={setExpectedArrival} />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Transport Document</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{TRANSPORT_DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Document Number</label>
              <input type="text" className="input-field" value={docNumber} onChange={e => setDocNumber(e.target.value)} placeholder="MEDU1234567" />
            </div>
            <div className="seal-field-row">
              <label className="seal-field-label">Goods Description</label>
              <input type="text" className="input-field" value={goodsDescription} onChange={e => setGoodsDescription(e.target.value)} placeholder="General merchandise" />
            </div>
          </div>
          <div style={{ padding: '0 20px 20px' }}>
            <button type="submit" className="seal-btn-primary" disabled={saving || !compartmentId || !ownerId}>{saving ? 'Creating…' : 'Create Consignment'}</button>
          </div>
        </form>
      )}

      <div className="seal-card">
        <div className="seal-card-body">
          {loading ? (
            <div className="seal-empty">Loading…</div>
          ) : consignments.length === 0 ? (
            <div className="seal-empty">No consignments yet.</div>
          ) : (
            <table className="seal-table">
              <thead>
                <tr>
                  <th>Transport Doc</th>
                  <th>Owner</th>
                  <th>Goods</th>
                  <th>Expected Arrival</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {consignments.map(c => (
                  <tr key={c.id} onClick={() => navigate(`/seal/consignments/${c.id}`)}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.transport_doc_type}</div>
                      {c.transport_doc_number && <div className="seal-mono" style={{ fontSize: 11.5, color: 'var(--ink3)' }}>{c.transport_doc_number}</div>}
                    </td>
                    <td>{c.owner_name ?? '—'}</td>
                    <td>{c.goods_description ?? '—'}</td>
                    <td>{c.expected_arrival ? new Date(c.expected_arrival).toLocaleDateString() : '—'}</td>
                    <td><Badge variant={STATUS_VARIANT[c.status] ?? 'gray'}>{c.status.replace(/_/g, ' ')}</Badge></td>
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
