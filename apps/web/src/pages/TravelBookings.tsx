import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { showAlert } from '../lib/alert.js';
import { showConfirm } from '../lib/confirm.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import './Travel.css';

interface Booking {
  id: string;
  trip_id?: string;
  booking_type: string;
  provider?: string;
  reference?: string;
  title: string;
  status: string;
  start_date?: string;
  end_date?: string;
  cost?: number;
  currency?: string;
}

const STATUS_MAP: Record<string, 'success' | 'brand' | 'warning' | 'gray' | 'info' | 'error'> = {
  confirmed: 'success', pending: 'warning', cancelled: 'error', completed: 'info',
};
const TYPE_ICONS: Record<string, string> = {
  flight: 'plane', hotel: 'home', car: 'truck', train: 'zap',
  bus: 'truck', ferry: 'ship', tour: 'compass', insurance: 'shield', other: 'fileText',
};

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(n?: number, cur = 'USD') {
  if (n == null) return '—';
  return `${cur} ${Math.round(n).toLocaleString()}`;
}

export const TravelBookings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [trips, setTrips] = useState<{ id: string; title: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bk, tr] = await Promise.all([
        apiFetch('/v1/travel/bookings').catch(() => []),
        apiFetch('/v1/travel/trips').catch(() => []),
      ]);
      setBookings(Array.isArray(bk) ? bk : []);
      setTrips(Array.isArray(tr) ? tr : []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    const ok = await showConfirm('This booking will be removed.', { title: 'Cancel booking?', confirmLabel: 'Remove', variant: 'danger' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/travel/bookings/${id}`, { method: 'DELETE' });
      showAlert('Booking removed.', { variant: 'info' });
      load();
    } catch { showAlert('Could not remove booking.'); }
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="travel-overview">
      <PageHeader
        crumbs={['Travel', 'Bookings']}
        titlePlain="Travel"
        titleEm="bookings"
        subtitle="Flights, hotels, car rentals, and all your reservations."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} />
            <span>Add Booking</span>
          </Button>
        }
      />

      {bookings.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px', textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="xl" shape="circle">
            <Icon name="fileText" size={28} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>No bookings yet</h3>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: 0, maxWidth: 360 }}>
            Add your flight, hotel, and transport bookings to keep all confirmations in one place.
          </p>
          <Button onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} />
            <span>Add Booking</span>
          </Button>
        </div>
      ) : (
        <SectionCard padded={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tv-trips-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Booking</th>
                  <th>Provider</th>
                  <th>Reference</th>
                  <th>Dates</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                  <th>Status</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.id}>
                    <td>
                      <FeaturedIcon variant="brand" size="sm" shape="square">
                        <Icon name={(TYPE_ICONS[b.booking_type] ?? 'fileText') as any} size={13} />
                      </FeaturedIcon>
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{b.title}</td>
                    <td style={{ color: 'var(--ink2)' }}>{b.provider ?? '—'}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--ink2)' }}>{b.reference ?? '—'}</td>
                    <td style={{ color: 'var(--ink2)' }}>{fmtDate(b.start_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>{money(b.cost, b.currency)}</td>
                    <td>
                      <Badge variant={STATUS_MAP[b.status] ?? 'gray'}>{b.status}</Badge>
                    </td>
                    <td>
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(b.id)}>
                        <Icon name="trash" size={12} style={{ color: 'var(--red)' }} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <AddBookingDialog open={showAdd} onOpenChange={setShowAdd} trips={trips} onCreated={load} />
    </div>
  );
};

function AddBookingDialog({ open, onOpenChange, trips, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; trips: { id: string; title: string }[]; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [bookingType, setBookingType] = useState('flight');
  const [provider, setProvider] = useState('');
  const [reference, setReference] = useState('');
  const [tripId, setTripId] = useState('__none__');
  const [startDate, setStartDate] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/travel/bookings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          booking_type: bookingType,
          provider: provider.trim() || undefined,
          reference: reference.trim() || undefined,
          trip_id: tripId !== '__none__' ? tripId : undefined,
          start_date: startDate || undefined,
          cost: cost ? Number(cost) : undefined,
          currency,
        }),
      });
      showAlert('Booking added.', { variant: 'success' });
      onOpenChange(false);
      setTitle(''); setProvider(''); setReference(''); setStartDate(''); setCost('');
      onCreated();
    } catch (e: any) {
      showAlert(e?.message || 'Could not add booking.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add Booking</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="tv-form-grid">
            <label className="tv-form-field">
              <span>Booking title</span>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. LHR to LIS" autoFocus />
            </label>
            <label className="tv-form-field">
              <span>Type</span>
              <Select value={bookingType} onValueChange={setBookingType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TYPE_ICONS).map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="tv-form-field">
              <span>Provider</span>
              <Input value={provider} onChange={e => setProvider(e.target.value)} placeholder="e.g. British Airways" />
            </label>
            <label className="tv-form-field">
              <span>Reference</span>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. BA 502" />
            </label>
            {trips.length > 0 && (
              <label className="tv-form-field">
                <span>Link to trip</span>
                <Select value={tripId} onValueChange={setTripId}>
                  <SelectTrigger><SelectValue placeholder="No trip" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No trip</SelectItem>
                    {trips.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            )}
            <label className="tv-form-field">
              <span>Date</span>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <label className="tv-form-field">
              <span>Cost</span>
              <Input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" />
            </label>
            <label className="tv-form-field">
              <span>Currency</span>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="TZS">TZS</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? 'Adding...' : 'Add Booking'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
