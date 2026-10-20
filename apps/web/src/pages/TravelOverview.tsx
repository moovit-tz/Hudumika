import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { apiFetch } from '../lib/api.js';
import { PageHeader } from '../components/PageHeader.js';
import { SectionCard } from '../components/SectionCard.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { Icon } from '../components/Icon.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { SkeletonPage, SkeletonText } from '../components/ui/skeleton.js';
import { SectionLoading } from '../components/ui/spinner.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import { showAlert } from '../lib/alert.js';
import { Tip } from '../components/ui/tooltip.js';
import './Travel.css';

/* ── Types ── */
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
  details?: Record<string, any>;
}

interface Expense {
  id: string;
  trip_id?: string;
  category: string;
  description: string;
  amount: number;
  currency?: string;
  expense_date: string;
}

/* ── Helpers ── */
const STATUS_MAP: Record<string, 'success' | 'brand' | 'warning' | 'gray' | 'info' | 'error'> = {
  planning: 'gray', upcoming: 'brand', active: 'success', completed: 'info', cancelled: 'error',
  confirmed: 'success', pending: 'warning',
};

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateRange(start?: string, end?: string) {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!e) return fmt(s);
  return `${s.toLocaleDateString('en-GB', { day: 'numeric' })}-${fmt(e)}`;
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

const BOOKING_ICONS: Record<string, string> = {
  flight: 'plane', hotel: 'home', car: 'truck', train: 'zap',
  bus: 'truck', ferry: 'ship', tour: 'compass', insurance: 'shield', other: 'fileText',
};

const EXPENSE_ICONS: Record<string, string> = {
  flights: 'plane', accommodation: 'home', transport: 'truck', food: 'coffee',
  activities: 'compass', insurance: 'shield', shopping: 'package', other: 'fileText',
};

const WORLD_CLOCKS = [
  { city: 'London',   tz: 'Europe/London',     label: 'GMT' },
  { city: 'Lisbon',   tz: 'Europe/Lisbon',     label: 'WET' },
  { city: 'Dar',      tz: 'Africa/Dar_es_Salaam', label: 'EAT' },
  { city: 'Dubai',    tz: 'Asia/Dubai',        label: 'GST' },
  { city: 'Tokyo',    tz: 'Asia/Tokyo',        label: 'JST' },
];

function useWorldClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  return WORLD_CLOCKS.map(c => ({
    ...c,
    time: now.toLocaleTimeString('en-GB', { timeZone: c.tz, hour: '2-digit', minute: '2-digit' }),
  }));
}

/* ── Greeting ── */
function getGreeting(name?: string) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${g}, ${name?.split(' ')[0] || 'there'}`;
}

/* ══════════════════════════════════════
   TravelOverview
══════════════════════════════════════ */
export const TravelOverview: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const clocks = useWorldClock();

  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showNewTrip, setShowNewTrip] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v1/travel/dashboard');
      setTrips(res.trips ?? []);
      setBookings(res.bookings ?? []);
      setExpenses(res.expenses ?? []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ── Derived data ── */
  const upcomingTrip = useMemo(() =>
    trips.find(t => t.status === 'active') ??
    trips.find(t => t.status === 'upcoming') ??
    trips.find(t => t.status === 'planning'),
  [trips]);

  const upcomingFlight = useMemo(() =>
    bookings.find(b => b.booking_type === 'flight' && b.status === 'confirmed' && b.trip_id === upcomingTrip?.id),
  [bookings, upcomingTrip]);

  const tripExpenses = useMemo(() => {
    if (!upcomingTrip) return { total: 0, byCategory: {} as Record<string, number> };
    const items = expenses.filter(e => e.trip_id === upcomingTrip.id);
    const total = items.reduce((s, e) => s + e.amount, 0);
    const byCategory: Record<string, number> = {};
    for (const e of items) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    return { total, byCategory };
  }, [expenses, upcomingTrip]);

  const budgetPct = upcomingTrip?.budget_amount
    ? Math.min(100, Math.round((tripExpenses.total / upcomingTrip.budget_amount) * 100))
    : 0;

  if (loading) return <SkeletonPage />;

  const cur = upcomingTrip?.budget_currency ?? 'USD';

  return (
    <div className="travel-overview">
      <PageHeader
        crumbs={['Travel', 'Workspace']}
        titlePlain="Travel"
        titleEm="overview"
        subtitle={`${getGreeting(user?.name)}. Everything for your next journey, organized in one place.`}
        actions={
          <Button onClick={() => setShowNewTrip(true)}>
            <Icon name="plus" size={14} />
            <span>New Trip</span>
          </Button>
        }
      />

      {/* ── Main Grid ── */}
      <div className="tv-grid">

        {/* ── Upcoming Trip Card (large) ── */}
        <div className="tv-trip-card">
          <SectionCard
            padded={false}
            title={upcomingTrip ? undefined : 'Upcoming trip'}
          >
            {upcomingTrip ? (
              <div className="tv-trip-inner">
                <div className="tv-trip-header">
                  <div className="tv-trip-header-left">
                    <h3 className="tv-trip-title">{upcomingTrip.title}</h3>
                    <Badge variant={STATUS_MAP[upcomingTrip.status] ?? 'gray'}>
                      {upcomingTrip.status.charAt(0).toUpperCase() + upcomingTrip.status.slice(1)}
                    </Badge>
                  </div>
                  <span className="tv-trip-dates">{fmtDateRange(upcomingTrip.start_date, upcomingTrip.end_date)}</span>
                </div>

                {/* Flight segment */}
                {upcomingFlight ? (
                  <div className="tv-flight-segment">
                    <div className="tv-flight-endpoint">
                      <span className="tv-flight-code">{upcomingFlight.details?.origin_code ?? 'DEP'}</span>
                      <span className="tv-flight-time">
                        {upcomingFlight.details?.departure_time ?? fmtDate(upcomingFlight.start_date)}
                      </span>
                      <span className="tv-flight-city">{upcomingFlight.details?.origin ?? 'Departure'}</span>
                    </div>
                    <div className="tv-flight-line">
                      <div className="tv-flight-line-track">
                        <div className="tv-flight-dot" />
                        <div className="tv-flight-dash" />
                        <Icon name="plane" size={16} style={{ color: 'var(--teal)' }} />
                        <div className="tv-flight-dash" />
                        <div className="tv-flight-dot" />
                      </div>
                      <span className="tv-flight-duration">
                        {upcomingFlight.details?.duration ?? `${upcomingFlight.provider ?? ''} ${upcomingFlight.reference ?? ''}`}
                      </span>
                    </div>
                    <div className="tv-flight-endpoint">
                      <span className="tv-flight-code">{upcomingFlight.details?.dest_code ?? 'ARR'}</span>
                      <span className="tv-flight-time">
                        {upcomingFlight.details?.arrival_time ?? fmtDate(upcomingFlight.end_date)}
                      </span>
                      <span className="tv-flight-city">{upcomingFlight.details?.destination ?? 'Arrival'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="tv-no-flight">
                    <FeaturedIcon variant="gray" size="lg" shape="circle">
                      <Icon name="plane" size={20} />
                    </FeaturedIcon>
                    <p>No flight booked yet for this trip.</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/travel/bookings')}>
                      <Icon name="plus" size={12} />
                      <span>Add Flight</span>
                    </Button>
                  </div>
                )}

                {/* Boarding pass summary */}
                {upcomingFlight && (
                  <div className="tv-boarding-pass">
                    <div className="tv-bp-header">
                      <Icon name="fileText" size={13} style={{ color: 'var(--teal)' }} />
                      <span>BOOKING DETAILS</span>
                    </div>
                    <div className="tv-bp-grid">
                      <div className="tv-bp-field">
                        <span className="tv-bp-label">Passenger</span>
                        <span className="tv-bp-value">{user?.name ?? 'Traveller'}</span>
                      </div>
                      <div className="tv-bp-field">
                        <span className="tv-bp-label">Reference</span>
                        <span className="tv-bp-value">{upcomingFlight.reference ?? '—'}</span>
                      </div>
                      <div className="tv-bp-field">
                        <span className="tv-bp-label">Provider</span>
                        <span className="tv-bp-value">{upcomingFlight.provider ?? '—'}</span>
                      </div>
                      <div className="tv-bp-field">
                        <span className="tv-bp-label">Status</span>
                        <span className="tv-bp-value">
                          <Badge variant={STATUS_MAP[upcomingFlight.status] ?? 'gray'} className="whitespace-nowrap">
                            {upcomingFlight.status}
                          </Badge>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="tv-trip-actions">
                  <Button variant="outline" size="sm" onClick={() => navigate('/travel/bookings')}>
                    <Icon name="eye" size={13} />
                    <span>View booking</span>
                  </Button>
                  <Button size="sm" onClick={() => navigate('/travel/itinerary')}>
                    <Icon name="calendar" size={13} />
                    <span>Open itinerary</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="tv-empty-trip">
                <FeaturedIcon variant="brand" size="xl" shape="circle">
                  <Icon name="plane" size={28} />
                </FeaturedIcon>
                <h3>Plan your next adventure</h3>
                <p>Create a trip to start organizing flights, hotels, and activities.</p>
                <Button onClick={() => setShowNewTrip(true)}>
                  <Icon name="plus" size={14} />
                  <span>New Trip</span>
                </Button>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Trip Budget Card ── */}
        <div className="tv-budget-card">
          <SectionCard padded={false}>
            <div className="tv-budget-inner">
              <div className="tv-budget-header">
                <h3 className="tv-widget-title">Trip budget</h3>
                {upcomingTrip?.budget_amount ? (
                  <Badge variant={budgetPct > 80 ? 'error' : budgetPct > 50 ? 'warning' : 'success'}>
                    {budgetPct}% used
                  </Badge>
                ) : null}
              </div>

              {upcomingTrip?.budget_amount ? (
                <>
                  {/* Donut visual */}
                  <div className="tv-donut-wrap">
                    <svg viewBox="0 0 100 100" className="tv-donut">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
                      <circle cx="50" cy="50" r="40" fill="none"
                        stroke="var(--teal)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${budgetPct * 2.51} ${251 - budgetPct * 2.51}`}
                        strokeDashoffset="62.75"
                        style={{ transition: 'stroke-dasharray 0.6s ease' }}
                      />
                    </svg>
                    <div className="tv-donut-center">
                      <span className="tv-donut-amount">{money(tripExpenses.total, cur)}</span>
                      <span className="tv-donut-sub">of {money(upcomingTrip.budget_amount, cur)}</span>
                    </div>
                  </div>

                  {/* Budget / Remaining */}
                  <div className="tv-budget-row tv-budget-summary">
                    <div>
                      <span className="tv-budget-row-label">Budget</span>
                      <span className="tv-budget-row-val">{money(upcomingTrip.budget_amount, cur)}</span>
                    </div>
                    <div>
                      <span className="tv-budget-row-label">Remaining</span>
                      <span className="tv-budget-row-val" style={{ color: 'var(--green)' }}>
                        {money((upcomingTrip.budget_amount ?? 0) - tripExpenses.total, cur)}
                      </span>
                    </div>
                  </div>

                  {/* Category breakdown */}
                  <div className="tv-budget-breakdown">
                    {Object.entries(tripExpenses.byCategory).map(([cat, amt]) => (
                      <div key={cat} className="tv-budget-cat-row">
                        <div className="tv-budget-cat-left">
                          <Icon name={(EXPENSE_ICONS[cat] ?? 'fileText') as any} size={14} style={{ color: 'var(--ink3)' }} />
                          <span style={{ textTransform: 'capitalize' }}>{cat}</span>
                        </div>
                        <span className="tv-budget-cat-val">{money(amt, cur)}</span>
                      </div>
                    ))}
                    {Object.keys(tripExpenses.byCategory).length === 0 && (
                      <div className="tv-budget-cat-row" style={{ justifyContent: 'center', color: 'var(--ink3)' }}>
                        No expenses tracked yet
                      </div>
                    )}
                  </div>

                  <Button variant="ghost" size="sm" className="tv-expense-link"
                    onClick={() => navigate('/travel/expenses')}>
                    Open expense tracker
                  </Button>
                </>
              ) : (
                <div className="tv-empty-budget">
                  <FeaturedIcon variant="gray" size="md" shape="circle">
                    <Icon name="dollarSign" size={18} />
                  </FeaturedIcon>
                  <p>Set a trip budget to track spending.</p>
                </div>
              )}
            </div>
          </SectionCard>
        </div>

        {/* ── Upcoming Bookings Card ── */}
        <div className="tv-bookings-card">
          <SectionCard padded={false}>
            <div className="tv-bookings-inner">
              <div className="tv-bookings-header">
                <h3 className="tv-widget-title">Upcoming bookings</h3>
                <Button variant="ghost" size="xs" onClick={() => navigate('/travel/bookings')}>
                  View all
                </Button>
              </div>
              {bookings.length === 0 ? (
                <div className="tv-empty-bookings">
                  <FeaturedIcon variant="gray" size="md" shape="circle">
                    <Icon name="fileText" size={18} />
                  </FeaturedIcon>
                  <p>No bookings yet.</p>
                </div>
              ) : (
                <div className="tv-booking-list">
                  {bookings.slice(0, 5).map(b => (
                    <div key={b.id} className="tv-booking-item">
                      <FeaturedIcon variant="brand" size="sm" shape="square">
                        <Icon name={(BOOKING_ICONS[b.booking_type] ?? 'fileText') as any} size={14} />
                      </FeaturedIcon>
                      <div className="tv-booking-info">
                        <span className="tv-booking-title">{b.title}</span>
                        <span className="tv-booking-meta">
                          {b.provider ?? b.booking_type} · {fmtDate(b.start_date)}
                        </span>
                      </div>
                      <div className="tv-booking-right">
                        {b.cost != null && (
                          <span className="tv-booking-cost">{money(b.cost, b.currency)}</span>
                        )}
                        <Badge variant={STATUS_MAP[b.status] ?? 'gray'} className="whitespace-nowrap">
                          {b.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── World Clock Strip ── */}
      <div className="tv-clock-strip">
        {clocks.map(c => (
          <div key={c.city} className="tv-clock-item">
            <span className="tv-clock-city">{c.city}</span>
            <span className="tv-clock-time">{c.time}</span>
            <span className="tv-clock-tz">{c.label}</span>
          </div>
        ))}
      </div>

      {/* ── My Trips Quick List ── */}
      {trips.length > 0 && (
        <SectionCard
          title="My Trips"
          action={
            <Button variant="outline" size="sm" onClick={() => navigate('/travel/trips')}>
              View All ({trips.length})
            </Button>
          }
          padded={false}
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="tv-trips-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Destination</th>
                  <th>Dates</th>
                  <th>Duration</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {trips.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 700, color: 'var(--teal)' }}>{t.title}</td>
                    <td>{t.destination}</td>
                    <td style={{ color: 'var(--ink2)' }}>{fmtDateRange(t.start_date, t.end_date)}</td>
                    <td>{tripDays(t.start_date, t.end_date) ? `${tripDays(t.start_date, t.end_date)} days` : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {t.budget_amount ? money(t.budget_amount, t.budget_currency) : '—'}
                    </td>
                    <td>
                      <Badge variant={STATUS_MAP[t.status] ?? 'gray'}>
                        {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button variant="ghost" size="xs" onClick={() => navigate(`/travel/trips`)}>
                        <Icon name="arrowRight" size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── New Trip Dialog ── */}
      <NewTripDialog open={showNewTrip} onOpenChange={setShowNewTrip} onCreated={load} />
    </div>
  );
};

/* ── New Trip Dialog ── */
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
            {saving ? 'Creating…' : 'Create Trip'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
