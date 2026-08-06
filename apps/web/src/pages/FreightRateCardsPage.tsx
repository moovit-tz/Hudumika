import React, { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { Combobox } from '../components/ui/combobox.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';

interface Carrier { id: string; name: string; }
interface RateCard {
  id: string; carrier_id: string; carrier_name: string | null; mode: string;
  origin_port: string; destination_port: string; cost_rate: number; sell_rate: number;
  currency: string; active: boolean;
}

const MODES = [
  { value: 'FCL_20', label: 'FCL — 20ft' },
  { value: 'FCL_40', label: 'FCL — 40ft' },
  { value: 'FCL_40HC', label: 'FCL — 40ft HC' },
  { value: 'LCL', label: 'LCL (per CBM)' },
  { value: 'AIR', label: 'Air (per kg)' },
  { value: 'ROAD', label: 'Road' },
];

export function FreightRateCardsPage() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ carrier_id: '', mode: 'FCL_20', origin_port: '', destination_port: '', cost_rate: '', sell_rate: '', currency: 'USD' });

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/freight-booking/rate-cards'),
      apiFetch('/v1/freight-booking/carriers?active_only=true'),
    ]).then(([rc, c]) => { setCards(rc); setCarriers(c); }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function saveCard() {
    if (!form.carrier_id || !form.origin_port.trim() || !form.destination_port.trim() || !form.cost_rate || !form.sell_rate) {
      setError('Carrier, origin, destination, cost rate and sell rate are all required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/v1/freight-booking/rate-cards', {
        method: 'POST',
        body: JSON.stringify({ ...form, cost_rate: parseFloat(form.cost_rate), sell_rate: parseFloat(form.sell_rate) }),
      });
      setForm({ carrier_id: '', mode: 'FCL_20', origin_port: '', destination_port: '', cost_rate: '', sell_rate: '', currency: 'USD' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rate card');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Freight Booking', 'Rate Cards']}
        titlePlain="Rate"
        titleEm="cards"
        subtitle="Carrier cost vs. customer sell rate by lane — the margin on every booking comes from here"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
            <Icon name="plus" size={14} /> {showForm ? 'Cancel' : 'Add Rate Card'}
          </button>
        }
      />

      {carriers.length === 0 && !loading && (
        <div style={{ padding: '12px 18px', borderRadius: 9, background: 'rgba(184,121,28,0.08)', border: '1px solid rgba(184,121,28,0.25)', marginBottom: 20, fontSize: 12.5, color: 'var(--ink2)' }}>
          Add a carrier first — rate cards belong to a carrier.
        </div>
      )}

      {showForm && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Carrier *</label>
              <Combobox options={carriers.map(c => ({ value: c.id, label: c.name }))} value={form.carrier_id} onChange={v => setForm(p => ({ ...p, carrier_id: v }))} placeholder="Choose carrier…" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Mode</label>
              <Select value={form.mode} onValueChange={v => setForm(p => ({ ...p, mode: v }))}>
                <SelectTrigger className="input-field"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Currency</label>
              <input className="input-field" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Origin port *</label>
              <input className="input-field" value={form.origin_port} onChange={e => setForm(p => ({ ...p, origin_port: e.target.value }))} placeholder="e.g. Shanghai" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Destination port *</label>
              <input className="input-field" value={form.destination_port} onChange={e => setForm(p => ({ ...p, destination_port: e.target.value }))} placeholder="e.g. Dar es Salaam" />
            </div>
            <div />
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Cost rate * <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(carrier charges you)</span></label>
              <input className="input-field" type="number" min="0" value={form.cost_rate} onChange={e => setForm(p => ({ ...p, cost_rate: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Sell rate * <span style={{ fontWeight: 400, color: 'var(--ink3)' }}>(you charge customer)</span></label>
              <input className="input-field" type="number" min="0" value={form.sell_rate} onChange={e => setForm(p => ({ ...p, sell_rate: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 6 }}>Margin</label>
              <div className="input-field" style={{ display: 'flex', alignItems: 'center', color: 'var(--teal)', fontWeight: 700 }}>
                {form.cost_rate && form.sell_rate ? `${form.currency} ${(parseFloat(form.sell_rate) - parseFloat(form.cost_rate)).toFixed(2)}` : '—'}
              </div>
            </div>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
          <button type="button" className="btn btn-primary" onClick={saveCard} disabled={saving}>{saving ? 'Saving…' : 'Save Rate Card'}</button>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading rate cards…</div>
        ) : cards.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No rate cards yet.</div>
        ) : (
          <div className="rtbl-wrap"><table className="rtbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Carrier', 'Mode', 'Lane', 'Cost', 'Sell', 'Margin'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cards.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.carrier_name || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{MODES.find(m => m.value === c.mode)?.label || c.mode}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--ink2)' }}>{c.origin_port} → {c.destination_port}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{c.currency} {c.cost_rate.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink)' }}>{c.currency} {c.sell_rate.toFixed(2)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12.5, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--teal)' }}>{c.currency} {(c.sell_rate - c.cost_rate).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
