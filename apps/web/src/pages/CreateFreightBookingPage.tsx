import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

interface Customer { id: string; name: string; }

const MODES = [
  { value: 'FCL_20', label: 'Sea — FCL 20ft' },
  { value: 'FCL_40', label: 'Sea — FCL 40ft' },
  { value: 'FCL_40HC', label: 'Sea — FCL 40ft HC' },
  { value: 'LCL', label: 'Sea — LCL' },
  { value: 'AIR', label: 'Air Cargo' },
  { value: 'ROAD', label: 'Road' },
];

export function CreateFreightBookingPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    customer_id: '', mode: 'FCL_20', origin_port: '', destination_port: '',
    cargo_desc: '', quantity: '1', requested_ship_date: '',
  });

  useEffect(() => {
    // GET /v1/customers responds { data: [...] } — reading `.customers` here
    // always fell through to [], so this picker never had anything to show
    // no matter how many real customers the tenant had.
    apiFetch('/v1/customers').then(res => {
      const list = Array.isArray(res) ? res : res.data || [];
      setCustomers(list);
    }).catch(() => {});
  }, []);

  async function submit() {
    if (!form.customer_id || !form.origin_port.trim() || !form.destination_port.trim()) {
      setError('Customer, origin and destination are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const booking = await apiFetch('/v1/freight-booking/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: parseInt(form.quantity, 10) || 1 }),
      });
      navigate('/cargotracker/bookings', { state: { newBookingId: booking.id } });
    } catch (err: any) {
      setError(err?.message || 'Failed to create booking request');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader crumbs={['CargoTracker', 'Freight Booking', 'New']} titlePlain="New booking" titleEm="request" subtitle="Vessel, voyage and BL/AWB are entered later once the carrier confirms — this just captures what the customer wants shipped." />

      <div style={{ maxWidth: 720 }}>
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Customer *</label>
            <Combobox options={customers.map(c => ({ value: c.id, label: c.name }))} value={form.customer_id} onChange={v => setForm(p => ({ ...p, customer_id: v }))} placeholder="Choose customer…" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mode *</label>
            <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
              <SelectTrigger className="input-field" style={{ width: '100%' }}><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Origin port *</label>
            <input className="input-field" value={form.origin_port} onChange={e => setForm(p => ({ ...p, origin_port: e.target.value }))} placeholder="e.g. Shanghai" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Destination port *</label>
            <input className="input-field" value={form.destination_port} onChange={e => setForm(p => ({ ...p, destination_port: e.target.value }))} placeholder="e.g. Dar es Salaam" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Quantity</label>
            <input className="input-field" type="number" min="1" value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Requested ship date</label>
            <DatePicker date={parseDateOnly(form.requested_ship_date)} onChange={d => setForm(p => ({ ...p, requested_ship_date: toDateOnlyString(d) }))} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Cargo description</label>
          <textarea className="input-field" rows={3} value={form.cargo_desc} onChange={e => setForm(p => ({ ...p, cargo_desc: e.target.value }))} style={{ resize: 'vertical', width: '100%' }} />
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 14 }}>{error}</div>}
        <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Booking Request'}</button>
      </SectionCard>
      </div>
    </div>
  );
}
