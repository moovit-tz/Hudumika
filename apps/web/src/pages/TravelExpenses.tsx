import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select.js';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '../components/ui/dialog.js';
import { Input } from '../components/ui/input.js';
import './Travel.css';

interface Expense {
  id: string;
  trip_id?: string;
  category: string;
  description: string;
  amount: number;
  currency?: string;
  expense_date: string;
  reimbursable?: boolean;
}

const CAT_ICONS: Record<string, string> = {
  flights: 'plane', accommodation: 'home', transport: 'truck', food: 'coffee',
  activities: 'compass', insurance: 'shield', shopping: 'package', other: 'fileText',
};
const CAT_VARIANTS: Record<string, 'brand' | 'success' | 'warning' | 'info' | 'gray' | 'error'> = {
  flights: 'brand', accommodation: 'info', transport: 'warning', food: 'success',
  activities: 'brand', insurance: 'gray', shopping: 'warning', other: 'gray',
};

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function money(n: number, cur = 'USD') {
  return `${cur} ${Math.round(n).toLocaleString()}`;
}

export const TravelExpenses: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [trips, setTrips] = useState<{ id: string; title: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filterTrip, setFilterTrip] = useState('__none__');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterTrip !== '__none__' ? `?trip_id=${filterTrip}` : '';
      const [ex, tr] = await Promise.all([
        apiFetch(`/v1/travel/expenses${qs}`).catch(() => []),
        apiFetch('/v1/travel/trips').catch(() => []),
      ]);
      setExpenses(Array.isArray(ex) ? ex : []);
      setTrips(Array.isArray(tr) ? tr : []);
    } catch { /* empty */ } finally { setLoading(false); }
  }, [filterTrip]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byCat: Record<string, number> = {};
    for (const e of expenses) byCat[e.category] = (byCat[e.category] ?? 0) + e.amount;
    return { total, byCat };
  }, [expenses]);

  const handleDelete = async (id: string) => {
    const ok = await showConfirm('This expense record will be removed.', { title: 'Delete expense?', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await apiFetch(`/v1/travel/expenses/${id}`, { method: 'DELETE' });
      showAlert('Expense deleted.', { variant: 'info' });
      load();
    } catch { showAlert('Could not delete expense.'); }
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="travel-overview">
      <PageHeader
        crumbs={['Travel', 'Expenses']}
        titlePlain="Trip"
        titleEm="expenses"
        subtitle="Track every cost — flights, hotels, meals, and more."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {trips.length > 0 && (
              <Select value={filterTrip} onValueChange={setFilterTrip}>
                <SelectTrigger style={{ minWidth: 160 }}><SelectValue placeholder="All trips" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">All trips</SelectItem>
                  {trips.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => setShowAdd(true)}>
              <Icon name="plus" size={14} />
              <span>Add Expense</span>
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      {expenses.length > 0 && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px', padding: '16px 20px', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 4 }}>Total Spent</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
              {money(totals.total, expenses[0]?.currency)}
            </div>
          </div>
          {Object.entries(totals.byCat).slice(0, 4).map(([cat, amt]) => (
            <div key={cat} style={{ flex: '1 1 140px', padding: '16px 20px', background: 'var(--card-bg, var(--white))', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name={(CAT_ICONS[cat] ?? 'fileText') as any} size={12} />
                {cat}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
                {money(amt, expenses[0]?.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {expenses.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '48px 24px', textAlign: 'center' }}>
          <FeaturedIcon variant="brand" size="xl" shape="circle">
            <Icon name="dollarSign" size={28} />
          </FeaturedIcon>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>No expenses tracked</h3>
          <p style={{ fontSize: 13.5, color: 'var(--ink3)', margin: 0, maxWidth: 360 }}>
            Start logging your trip expenses to stay on budget.
          </p>
          <Button onClick={() => setShowAdd(true)}>
            <Icon name="plus" size={14} />
            <span>Add Expense</span>
          </Button>
        </div>
      ) : (
        <SectionCard padded={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tv-trips-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: 48 }}></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(e => (
                  <tr key={e.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FeaturedIcon variant={CAT_VARIANTS[e.category] ?? 'gray'} size="sm" shape="square">
                          <Icon name={(CAT_ICONS[e.category] ?? 'fileText') as any} size={13} />
                        </FeaturedIcon>
                        <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{e.category}</span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--ink)' }}>{e.description}</td>
                    <td style={{ color: 'var(--ink2)' }}>{fmtDate(e.expense_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: 'var(--ink)' }}>
                      {money(e.amount, e.currency)}
                    </td>
                    <td>
                      <Button variant="ghost" size="xs" onClick={() => handleDelete(e.id)}>
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

      <AddExpenseDialog open={showAdd} onOpenChange={setShowAdd} trips={trips} onCreated={load} />
    </div>
  );
};

function AddExpenseDialog({ open, onOpenChange, trips, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; trips: { id: string; title: string }[]; onCreated: () => void }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [tripId, setTripId] = useState('__none__');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!description.trim() || !amount) return;
    setSaving(true);
    try {
      await apiFetch('/v1/travel/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: description.trim(),
          category,
          amount: Number(amount),
          currency,
          trip_id: tripId !== '__none__' ? tripId : undefined,
          expense_date: expenseDate,
        }),
      });
      showAlert('Expense added.', { variant: 'success' });
      onOpenChange(false);
      setDescription(''); setAmount('');
      onCreated();
    } catch (e: any) {
      showAlert(e?.message || 'Could not add expense.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="tv-form-grid">
            <label className="tv-form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Description</span>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Airport transfer" autoFocus />
            </label>
            <label className="tv-form-field">
              <span>Category</span>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(CAT_ICONS).map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="tv-form-field">
              <span>Amount</span>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
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
            <label className="tv-form-field">
              <span>Date</span>
              <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
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
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !description.trim() || !amount}>
            {saving ? 'Adding...' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
