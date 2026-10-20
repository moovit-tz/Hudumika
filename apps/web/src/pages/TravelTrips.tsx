import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
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
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../components/ui/dropdown-menu.js';
import './Travel.css';

interface Trip {
  id: string;
  title: string;
  destination: string;
  country_code?: string;
  start_date?: string;
  end_date?: string;
  status: string;
  budget_amount?: number;
  budget_currency?: string;
  notes?: string;
  created_at: string;
}

const STATUS_MAP: Record<string, 'success' | 'brand' | 'warning' | 'gray' | 'info' | 'error'> = {
  planning: 'gray', upcoming: 'brand', active: 'success', completed: 'info', cancelled: 'error',
};

const COVER_COLORS = ['var(--teal-l)', 'var(--blue-l)', 'var(--green-l)', 'var(--purple-l)', 'var(--gold-l)'];
const COVER_EMOJI: Record<string, string> = {
  planning: '\u{1F4CB}', upcoming: '\u{2708}\u{FE0F}', active: '\u{1F30D}', completed: '\u{2705}', cancelled: '\u{274C}',
};

function fmtDateRange(start?: string, end?: string) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!e) return fmt(s);
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${fmt(e)}`;
}

function tripDays(start?: string, end?: string) {
  if (!start || !end) return null;
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(diff));
}

function money(n: number | undefined, cur = 'USD') {
  if (n == null) return '—';
  return `${cur} ${Math.round(n).toLocaleString()}`;
}

export const TravelTrips: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/travel/trips');
      setTrips(Array.isArray(res) ? res : []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    const ok = await showConfirm('This will remove the trip and all its data.', { title: 'Delete trip?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/travel/trips/${id}`, { method: 'DELETE' });
      showAlert('Trip deleted.', { variant: 'info' });
      load();
    } catch { showAlert('Could not delete trip.'); }
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="travel-overview">
      <PageHeader
        crumbs={['Travel', 'My Trips']}
        titlePlain="My"
        titleEm="trips"
        subtitle="All your travel plans — past, present, and upcoming."
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} />
            <span>New Trip</span>
          </Button>
        }
      />

      {trips.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px', textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="xl" shape="circle">
            <Icon name="plane" size={28} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>No trips yet</h3>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: 0, maxWidth: 360 }}>
            Start planning your first trip. Add flights, hotels, and activities to keep everything organized.
          </p>
          <Button onClick={() => setShowNew(true)}>
            <Icon name="plus" size={14} />
            <span>Create Trip</span>
          </Button>
        </div>
      ) : (
        <div className="tv-trip-list-grid">
          {trips.map((t, i) => (
            <div key={t.id} className="tv-trip-list-card">
              <div className="tv-trip-list-cover"
                style={{ background: COVER_COLORS[i % COVER_COLORS.length] }}>
                {COVER_EMOJI[t.status] ?? '\u{1F30D}'}
              </div>
              <div className="tv-trip-list-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 className="tv-trip-list-title">{t.title}</h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="xs" style={{ padding: '0 4px' }}>
                        <Icon name="moreHorizontal" size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate('/travel/itinerary')}>
                        <Icon name="calendar" size={13} /> Itinerary
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate('/travel/bookings')}>
                        <Icon name="fileText" size={13} /> Bookings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(t.id)} style={{ color: 'var(--red)' }}>
                        <Icon name="trash" size={13} /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="tv-trip-list-dest">
                  <Icon name="mapPin" size={13} style={{ color: 'var(--teal)' }} />
                  {t.destination}
                </div>
                <div className="tv-trip-list-footer">
                  <span className="tv-trip-list-dates">
                    {fmtDateRange(t.start_date, t.end_date)}
                    {tripDays(t.start_date, t.end_date) ? ` · ${tripDays(t.start_date, t.end_date)} days` : ''}
                  </span>
                  <Badge variant={STATUS_MAP[t.status] ?? 'gray'}>
                    {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                  </Badge>
                </div>
                {t.budget_amount != null && t.budget_amount > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="dollarSign" size={12} />
                    Budget: <strong style={{ color: 'var(--ink)' }}>{money(t.budget_amount, t.budget_currency)}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Trip Dialog */}
      <NewTripDialog open={showNew} onOpenChange={setShowNew} onCreated={load} />
    </div>
  );
};

function NewTripDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !destination.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/v1/travel/trips', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          destination: destination.trim(),
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          budget_amount: budget ? Number(budget) : undefined,
          budget_currency: currency,
          status: startDate ? 'upcoming' : 'planning',
        }),
      });
      showAlert('Trip created.', { variant: 'success' });
      onOpenChange(false);
      setTitle(''); setDestination(''); setStartDate(''); setEndDate(''); setBudget('');
      onCreated();
    } catch (e: any) {
      showAlert(e?.message || 'Could not create trip.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>New Trip</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="tv-form-grid">
            <label className="tv-form-field">
              <span>Trip name</span>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Portugal 2026" autoFocus />
            </label>
            <label className="tv-form-field">
              <span>Destination</span>
              <Input value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Lisbon, Portugal" />
            </label>
            <label className="tv-form-field">
              <span>Start date</span>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <label className="tv-form-field">
              <span>End date</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </label>
            <label className="tv-form-field">
              <span>Budget</span>
              <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" />
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
                  <SelectItem value="KES">KES</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !destination.trim()}>
            {saving ? 'Creating...' : 'Create Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
