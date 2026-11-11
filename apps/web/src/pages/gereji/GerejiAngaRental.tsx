import React, { useCallback, useEffect, useState } from 'react';
import { TH, TD, LABEL } from './shared.js';
import { PageHeader } from '../../components/PageHeader.js';
import { SectionCard } from '../../components/SectionCard.js';
import { Badge } from '../../components/ui/badge.js';
import { Button } from '../../components/ui/button.js';
import { Input } from '../../components/ui/input.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SectionLoading } from '../../components/ui/spinner.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '../../components/ui/dialog.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu.js';
import { Icon } from '../../components/Icon.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { formatDate } from '../../lib/tenantLocale.js';

interface RateCard { id: string; name: string; currency: string; daily_rate_minor: number; min_rental_days: number; min_charge_minor: number }
interface Reservation { id: string; stock_unit_id: string; customer_id: string | null; status: string; start_date: string; end_date: string }
interface StockUnit { id: string; pn: string; serial: string | null; availability: string }
interface Customer { id: string; name: string }

const RESERVATION_BADGE: Record<string, 'gray' | 'info' | 'brand' | 'success' | 'error'> = { held: 'gray', confirmed: 'info', out: 'brand', returned: 'success', cancelled: 'error' };
const RESERVATION_TRANSITIONS: Record<string, string[]> = { held: ['confirmed', 'cancelled'], confirmed: ['out', 'cancelled'], out: ['returned'], returned: [], cancelled: [] };

const money = (minor: number) => (minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });


export function GerejiAngaRental() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCard, setShowCard] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cardName, setCardName] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [minDays, setMinDays] = useState('1');
  const [minCharge, setMinCharge] = useState('0');
  const [tier7, setTier7] = useState('0');
  const [tier30, setTier30] = useState('0');
  const [tier90, setTier90] = useState('0');

  const [stockUnitId, setStockUnitId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reload = useCallback(() => {
    Promise.all([
      apiFetch('/v1/gereji/anga/rate-cards').then(d => setCards(d.rateCards ?? [])),
      apiFetch('/v1/gereji/anga/hire-reservations').then(d => setReservations(d.reservations ?? [])),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
    apiFetch('/v1/gereji/anga/stock-units?availability=AVAILABLE').then(d => setUnits(d.stockUnits ?? []));
    apiFetch('/v1/gereji/anga/customers').then(d => setCustomers(d.customers ?? []));
  }, [reload]);

  function resetCardForm() { setCardName(''); setDailyRate(''); setMinDays('1'); setMinCharge('0'); setTier7('0'); setTier30('0'); setTier90('0'); }
  function resetReservationForm() { setStockUnitId(''); setCustomerId(''); setStartDate(''); setEndDate(''); }

  async function createCard() {
    if (!cardName.trim() || !dailyRate) { showAlert('Enter a name and daily rate.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/rate-cards', {
        method: 'POST',
        body: JSON.stringify({
          name: cardName.trim(), daily_rate_minor: Math.round(Number(dailyRate) * 100),
          min_rental_days: Number(minDays) || 1, min_charge_minor: Math.round(Number(minCharge) * 100) || 0,
          tier_7_discount_percent: Number(tier7) || 0, tier_30_discount_percent: Number(tier30) || 0, tier_90_discount_percent: Number(tier90) || 0,
        }),
      });
      setShowCard(false);
      resetCardForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create rate card.'); }
    finally { setSaving(false); }
  }

  async function createReservation() {
    if (!stockUnitId || !startDate || !endDate) { showAlert('Select a unit and both dates.'); return; }
    setSaving(true);
    try {
      await apiFetch('/v1/gereji/anga/hire-reservations', {
        method: 'POST',
        body: JSON.stringify({ stock_unit_id: stockUnitId, customer_id: customerId || undefined, start_date: startDate, end_date: endDate }),
      });
      setShowReservation(false);
      resetReservationForm();
      reload();
    } catch (e: any) { showAlert(e.message || 'Failed to create reservation.'); }
    finally { setSaving(false); }
  }

  async function transition(id: string, status: string) {
    try {
      await apiFetch(`/v1/gereji/anga/hire-reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      reload();
    } catch (e: any) { showAlert(e.message); }
  }

  return (
    <div className="page-layout">
      <PageHeader
        crumbs={['Gereji', 'ANGA PartsOS']}
        titlePlain="Rental"
        titleEm="& exchange"
        subtitle="Rate cards and hire reservations for loaned rotables and exchange units."
        actions={<Button onClick={() => setShowCard(true)}><Icon name="plus" size={14} /> New Rate Card</Button>}
      />

      {loading ? <SectionLoading /> : (
        <>
          <SectionCard title="Rate cards">
            {cards.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No rate cards yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Name', 'Daily rate', 'Min days', 'Min charge'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cards.map(c => (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{c.name}</td>
                        <td style={TD}>{money(c.daily_rate_minor)} {c.currency}/day</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{c.min_rental_days}</td>
                        <td style={{ ...TD, color: 'var(--ink3)' }}>{money(c.min_charge_minor)} {c.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Hire reservations" action={<Button variant="outline" size="sm" onClick={() => setShowReservation(true)}><Icon name="plus" size={14} /> New Reservation</Button>}>
            {reservations.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink3)', fontSize: 13 }}>No reservations yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr>{['Unit', 'Customer', 'Status', 'Start', 'End', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                  <tbody>
                    {reservations.map(r => {
                      const unit = units.find(u => u.id === r.stock_unit_id);
                      const customer = customers.find(c => c.id === r.customer_id);
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ ...TD, fontWeight: 600, fontFamily: 'var(--font)' }}>{unit ? `${unit.pn}${unit.serial ? ` #${unit.serial}` : ''}` : r.stock_unit_id.slice(0, 8)}</td>
                          <td style={TD}>{customer?.name ?? '—'}</td>
                          <td style={TD}><Badge variant={RESERVATION_BADGE[r.status] ?? 'gray'}>{r.status}</Badge></td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.start_date)}</td>
                          <td style={{ ...TD, color: 'var(--ink3)' }}>{formatDate(r.end_date)}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><Icon name="moreHorizontal" size={16} /></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {(RESERVATION_TRANSITIONS[r.status] ?? []).map(s => <DropdownMenuItem key={s} onClick={() => transition(r.id, s)}>Mark {s}</DropdownMenuItem>)}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      <Dialog open={showCard} onOpenChange={v => { setShowCard(v); if (!v) resetCardForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New rate card</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={LABEL}>Name</label><Input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="e.g. Standard rotable loan" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Daily rate</label><Input type="number" min={0} value={dailyRate} onChange={e => setDailyRate(e.target.value)} /></div>
                <div><label style={LABEL}>Min rental days</label><Input type="number" min={1} value={minDays} onChange={e => setMinDays(e.target.value)} /></div>
                <div><label style={LABEL}>Minimum charge</label><Input type="number" min={0} value={minCharge} onChange={e => setMinCharge(e.target.value)} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>7-day discount %</label><Input type="number" min={0} max={100} value={tier7} onChange={e => setTier7(e.target.value)} /></div>
                <div><label style={LABEL}>30-day discount %</label><Input type="number" min={0} max={100} value={tier30} onChange={e => setTier30(e.target.value)} /></div>
                <div><label style={LABEL}>90-day discount %</label><Input type="number" min={0} max={100} value={tier90} onChange={e => setTier90(e.target.value)} /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCard(false)}>Cancel</Button>
            <Button onClick={createCard} disabled={saving}>{saving ? 'Creating...' : 'Create rate card'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReservation} onOpenChange={v => { setShowReservation(v); if (!v) resetReservationForm(); }}>
        <DialogContent size="md">
          <DialogHeader><DialogTitle>New hire reservation</DialogTitle></DialogHeader>
          <DialogBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={LABEL}>Stock unit (available only)</label>
                <Select value={stockUnitId} onValueChange={setStockUnitId}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>{units.map(u => <SelectItem key={u.id} value={u.id}>{u.pn}{u.serial ? ` #${u.serial}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label style={LABEL}>Customer (optional)</label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={LABEL}>Start date</label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
                <div><label style={LABEL}>End date</label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReservation(false)}>Cancel</Button>
            <Button onClick={createReservation} disabled={saving}>{saving ? 'Booking...' : 'Book reservation'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
