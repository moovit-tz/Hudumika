import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.js';
import { Icon } from '../components/Icon.js';
import { apiFetch } from '../lib/api.js';
import { Badge } from '../components/ui/badge.js';
import { Combobox } from '../components/ui/combobox.js';
import { DatePicker, parseDateOnly, toDateOnlyString } from '../components/ui/date-picker.js';

interface Booking {
  id: string; booking_number: string; customer_id: string; customer_name: string | null;
  carrier_id: string | null; carrier_name: string | null; mode: string;
  origin_port: string; destination_port: string; cargo_desc: string | null;
  status: 'REQUESTED' | 'RATE_QUOTED' | 'CONFIRMED' | 'CANCELLED';
  quoted_cost: number | null; quoted_sell: number | null; currency: string;
  vessel_name: string | null; converted_shipment_id: string | null; created_at: string;
}
interface RateCard { id: string; carrier_id: string; carrier_name: string | null; mode: string; origin_port: string; destination_port: string; cost_rate: number; sell_rate: number; currency: string; }
interface Carrier { id: string; name: string; }

const STATUS_VARIANT: Record<string, 'gray' | 'warning' | 'success' | 'error'> = {
  REQUESTED: 'gray', RATE_QUOTED: 'warning', CONFIRMED: 'success', CANCELLED: 'error',
};
const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', RATE_QUOTED: 'Rate Quoted', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled',
};

export function FreightBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quoteForm, setQuoteForm] = useState({ rate_card_id: '', carrier_id: '', quoted_cost: '', quoted_sell: '' });
  const [confirmForm, setConfirmForm] = useState({ vessel_name: '', voyage_number: '', carrier_booking_ref: '', bl_number: '', awb_number: '', eta: '' });

  function load() {
    setLoading(true);
    Promise.all([
      apiFetch('/v1/freight-booking/bookings'),
      apiFetch('/v1/freight-booking/rate-cards'),
      apiFetch('/v1/freight-booking/carriers?active_only=true'),
    ]).then(([b, rc, c]) => { setBookings(b); setRateCards(rc); setCarriers(c); }).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, []);

  function toggleExpand(booking: Booking) {
    if (expanded === booking.id) { setExpanded(null); return; }
    setExpanded(booking.id);
    setError(null);
    if (booking.status === 'REQUESTED') {
      setQuoteForm({ rate_card_id: '', carrier_id: booking.carrier_id || '', quoted_cost: '', quoted_sell: '' });
    } else if (booking.status === 'RATE_QUOTED') {
      setConfirmForm({ vessel_name: '', voyage_number: '', carrier_booking_ref: '', bl_number: '', awb_number: '', eta: '' });
    }
  }

  function applyRateCard(booking: Booking, rateCardId: string) {
    const card = rateCards.find(r => r.id === rateCardId);
    setQuoteForm(p => ({
      ...p, rate_card_id: rateCardId,
      carrier_id: card?.carrier_id || p.carrier_id,
      quoted_cost: card ? String(card.cost_rate) : p.quoted_cost,
      quoted_sell: card ? String(card.sell_rate) : p.quoted_sell,
    }));
  }

  async function submitQuote(booking: Booking) {
    if (!quoteForm.quoted_cost || !quoteForm.quoted_sell) { setError('Cost and sell rate are required.'); return; }
    setBusy(true); setError(null);
    try {
      await apiFetch(`/v1/freight-booking/bookings/${booking.id}/quote`, {
        method: 'PATCH',
        body: JSON.stringify({
          rate_card_id: quoteForm.rate_card_id || undefined,
          carrier_id: quoteForm.carrier_id || undefined,
          quoted_cost: parseFloat(quoteForm.quoted_cost),
          quoted_sell: parseFloat(quoteForm.quoted_sell),
        }),
      });
      setExpanded(null);
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to quote booking');
    } finally { setBusy(false); }
  }

  async function submitConfirm(booking: Booking) {
    if (!confirmForm.vessel_name.trim()) { setError('Vessel / flight name is required.'); return; }
    setBusy(true); setError(null);
    try {
      await apiFetch(`/v1/freight-booking/bookings/${booking.id}/confirm`, { method: 'PATCH', body: JSON.stringify(confirmForm) });
      setExpanded(null);
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to confirm booking');
    } finally { setBusy(false); }
  }

  async function cancelBooking(booking: Booking) {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/v1/freight-booking/bookings/${booking.id}/cancel`, { method: 'PATCH' });
      load();
    } catch (err: any) {
      setError(err?.message || 'Failed to cancel booking');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: '24px 32px', flex: 1, overflowY: 'auto' }}>
      <PageHeader
        crumbs={['Freight Booking', 'Bookings']}
        titlePlain="Freight"
        titleEm="bookings"
        subtitle="Request a rate, confirm the booking, and it becomes a real clearance case automatically"
        actions={
          <Link to="/clearos/freight-booking/new" className="btn btn-primary">
            <Icon name="plus" size={14} /> New Booking
          </Link>
        }
      />

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>Loading bookings…</div>
        ) : bookings.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No freight bookings yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {bookings.map(b => (
              <div key={b.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div
                  onClick={() => b.status !== 'CANCELLED' && b.status !== 'CONFIRMED' ? toggleExpand(b) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', cursor: b.status === 'REQUESTED' || b.status === 'RATE_QUOTED' ? 'pointer' : 'default' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{b.booking_number}</span>
                      <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
                      {b.customer_name || 'Unknown customer'} · {b.origin_port} → {b.destination_port} · {b.mode}
                      {b.carrier_name && ` · ${b.carrier_name}`}
                    </div>
                  </div>
                  {b.quoted_sell != null && (
                    <div style={{ fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--teal)', fontWeight: 700 }}>{b.currency} {b.quoted_sell.toFixed(2)}</div>
                  )}
                  {b.converted_shipment_id && (
                    <Link to={`/clearos/clearance/${b.converted_shipment_id}`} onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: 'var(--teal)', textDecoration: 'none', fontWeight: 600 }}>
                      View shipment →
                    </Link>
                  )}
                  {(b.status === 'REQUESTED') && (
                    <button type="button" title="Cancel booking" onClick={e => { e.stopPropagation(); cancelBooking(b); }} style={{ border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 4 }}>
                      <Icon name="x" size={14} />
                    </button>
                  )}
                  {(b.status === 'REQUESTED' || b.status === 'RATE_QUOTED') && (
                    <Icon name={expanded === b.id ? 'chevronUp' : 'chevronDown'} size={14} color="var(--ink3)" />
                  )}
                </div>

                {expanded === b.id && b.status === 'REQUESTED' && (
                  <div style={{ padding: '0 20px 20px', background: 'var(--bg)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Rate card</label>
                        <Combobox
                          options={rateCards.filter(r => r.origin_port === b.origin_port && r.destination_port === b.destination_port).map(r => ({ value: r.id, label: `${r.carrier_name} — ${r.currency} ${r.sell_rate}` }))}
                          value={quoteForm.rate_card_id}
                          onChange={v => applyRateCard(b, v)}
                          placeholder="Pick a matching rate card…"
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Carrier</label>
                        <Combobox options={carriers.map(c => ({ value: c.id, label: c.name }))} value={quoteForm.carrier_id} onChange={v => setQuoteForm(p => ({ ...p, carrier_id: v }))} placeholder="Choose carrier…" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Cost rate *</label>
                        <input className="input-field" type="number" value={quoteForm.quoted_cost} onChange={e => setQuoteForm(p => ({ ...p, quoted_cost: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Sell rate *</label>
                        <input className="input-field" type="number" value={quoteForm.quoted_sell} onChange={e => setQuoteForm(p => ({ ...p, quoted_sell: e.target.value }))} />
                      </div>
                    </div>
                    {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => submitQuote(b)} disabled={busy}>{busy ? 'Saving…' : 'Save Quote'}</button>
                  </div>
                )}

                {expanded === b.id && b.status === 'RATE_QUOTED' && (
                  <div style={{ padding: '0 20px 20px', background: 'var(--bg)' }}>
                    <p style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>Confirming creates a real clearance case — enter what the carrier gave you.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Vessel / Flight *</label>
                        <input className="input-field" value={confirmForm.vessel_name} onChange={e => setConfirmForm(p => ({ ...p, vessel_name: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Voyage number</label>
                        <input className="input-field" value={confirmForm.voyage_number} onChange={e => setConfirmForm(p => ({ ...p, voyage_number: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>Carrier booking ref</label>
                        <input className="input-field" value={confirmForm.carrier_booking_ref} onChange={e => setConfirmForm(p => ({ ...p, carrier_booking_ref: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>BL number</label>
                        <input className="input-field" value={confirmForm.bl_number} onChange={e => setConfirmForm(p => ({ ...p, bl_number: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>AWB number</label>
                        <input className="input-field" value={confirmForm.awb_number} onChange={e => setConfirmForm(p => ({ ...p, awb_number: e.target.value }))} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink2)', marginBottom: 5 }}>ETA</label>
                        <DatePicker date={parseDateOnly(confirmForm.eta)} onChange={d => setConfirmForm(p => ({ ...p, eta: toDateOnlyString(d) }))} />
                      </div>
                    </div>
                    {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{error}</div>}
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => submitConfirm(b)} disabled={busy}>{busy ? 'Confirming…' : 'Confirm Booking → Create Shipment'}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
